import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  acceptInvite as acceptInviteToken,
  claimLegacyTripGroup,
  claimOwnerTripGroup,
  createGroup as createTravelGroup,
  getStoredActiveGroupId,
  getUserGroups,
  type InviteDetails,
  inviteMember as createInvite,
  storeActiveGroupId,
} from '../services/groupsService';
import type { UserTravelGroup } from '../types';
import { useAuth } from './AuthContext';

type GroupContextValue = {
  activeGroup: UserTravelGroup | null;
  userGroups: UserTravelGroup[];
  loading: boolean;
  initialLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  setActiveGroup: (group: UserTravelGroup | null) => void;
  refreshGroups: (options?: { silent?: boolean }) => Promise<UserTravelGroup[]>;
  createGroup: (name: string, description?: string) => Promise<UserTravelGroup>;
  inviteMember: (email?: string, singleUse?: boolean) => Promise<InviteDetails>;
  acceptInvite: (token: string) => Promise<UserTravelGroup>;
};

const GroupContext = createContext<GroupContextValue | undefined>(undefined);

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'Supabase demorou para responder.',
): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);

export function GroupProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [userGroups, setUserGroups] = useState<UserTravelGroup[]>([]);
  const [activeGroup, setActiveGroupState] = useState<UserTravelGroup | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeGroupRef = useRef<UserTravelGroup | null>(null);
  const userGroupsRef = useRef<UserTravelGroup[]>([]);
  const loadedUserIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(userId);
  const refreshInFlightRef = useRef<Promise<UserTravelGroup[]> | null>(null);

  useEffect(() => {
    currentUserIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    activeGroupRef.current = activeGroup;
  }, [activeGroup]);

  useEffect(() => {
    userGroupsRef.current = userGroups;
  }, [userGroups]);

  const setActiveGroup = useCallback(
    (group: UserTravelGroup | null) => {
      setActiveGroupState(group);
      activeGroupRef.current = group;
      if (userId) storeActiveGroupId(userId, group?.id ?? null);
    },
    [userId],
  );

  const refreshGroups = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) {
      refreshInFlightRef.current = null;
      setUserGroups([]);
      userGroupsRef.current = [];
      setActiveGroupState(null);
      activeGroupRef.current = null;
      loadedUserIdRef.current = null;
      setInitialLoading(false);
      setIsRefreshing(false);
      setError(null);
      return [];
    }

    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const hasLoadedForUser = loadedUserIdRef.current === userId;
    const hasVisibleState = userGroupsRef.current.length > 0 || activeGroupRef.current !== null;
    const shouldBlockUi = !options?.silent && !hasLoadedForUser && !hasVisibleState;

    if (shouldBlockUi) {
      setInitialLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    const refreshTask = (async () => {
      try {
        await withTimeout(claimOwnerTripGroup(), 8000);
      } catch {
        // The SQL migration may not be applied yet. Loading memberships still gives a useful UI state.
      }

      try {
        await withTimeout(claimLegacyTripGroup(), 8000);
      } catch {
        // The SQL migration may not be applied yet. Loading memberships still gives a useful UI state.
      }

      const groups = await withTimeout(
        getUserGroups(),
        10000,
        'Nao foi possivel carregar suas viagens agora. Tente novamente em instantes.',
      );
      if (currentUserIdRef.current !== userId) return userGroupsRef.current;

      const storedGroupId = getStoredActiveGroupId(userId);
      const selectedGroup =
        groups.find((group) => group.id === activeGroupRef.current?.id) ??
        groups.find((group) => group.id === storedGroupId) ??
        groups[0] ??
        null;

      setUserGroups(groups);
      userGroupsRef.current = groups;
      setActiveGroupState(selectedGroup);
      activeGroupRef.current = selectedGroup;
      loadedUserIdRef.current = userId;
      if (selectedGroup) storeActiveGroupId(userId, selectedGroup.id);
      return groups;
    })();

    refreshInFlightRef.current = refreshTask;

    try {
      return await refreshTask;
    } catch (caughtError) {
      const fallbackGroups = userGroupsRef.current;
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel carregar grupos.');

      if (!hasVisibleState) {
        setUserGroups([]);
        userGroupsRef.current = [];
        setActiveGroupState(null);
        activeGroupRef.current = null;
      }

      return fallbackGroups;
    } finally {
      refreshInFlightRef.current = null;
      if (shouldBlockUi) {
        setInitialLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    void refreshGroups();
  }, [refreshGroups]);

  useEffect(() => {
    if (!userId) return undefined;

    const refreshSilently = () => {
      void refreshGroups({ silent: true });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshSilently();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refreshSilently);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refreshSilently);
    };
  }, [refreshGroups, userId]);

  const createGroup = useCallback(
    async (name: string, description?: string) => {
      const group = await createTravelGroup(name.trim(), description);
      const groups = await getUserGroups();
      setUserGroups(groups);
      userGroupsRef.current = groups;
      loadedUserIdRef.current = userId;
      setActiveGroup(group);
      return group;
    },
    [setActiveGroup, userId],
  );

  const inviteMember = useCallback(
    async (email?: string, singleUse = false) => {
      if (!activeGroup) throw new Error('Selecione uma viagem antes de convidar.');
      return createInvite(activeGroup.id, email, singleUse);
    },
    [activeGroup],
  );

  const acceptInvite = useCallback(
    async (token: string) => {
      const group = await acceptInviteToken(token);
      const groups = await getUserGroups();
      setUserGroups(groups);
      userGroupsRef.current = groups;
      loadedUserIdRef.current = userId;
      setActiveGroup(groups.find((item) => item.id === group.id) ?? group);
      return group;
    },
    [setActiveGroup, userId],
  );

  const value = useMemo<GroupContextValue>(
    () => ({
      activeGroup,
      userGroups,
      loading: initialLoading,
      initialLoading,
      isRefreshing,
      error,
      setActiveGroup,
      refreshGroups,
      createGroup,
      inviteMember,
      acceptInvite,
    }),
    [
      acceptInvite,
      activeGroup,
      createGroup,
      error,
      initialLoading,
      inviteMember,
      isRefreshing,
      refreshGroups,
      setActiveGroup,
      userGroups,
    ],
  );

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroup() {
  const context = useContext(GroupContext);
  if (!context) throw new Error('useGroup deve ser usado dentro de GroupProvider.');
  return context;
}
