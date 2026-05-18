import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
  error: string | null;
  setActiveGroup: (group: UserTravelGroup | null) => void;
  refreshGroups: () => Promise<UserTravelGroup[]>;
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
  const [userGroups, setUserGroups] = useState<UserTravelGroup[]>([]);
  const [activeGroup, setActiveGroupState] = useState<UserTravelGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setActiveGroup = useCallback(
    (group: UserTravelGroup | null) => {
      setActiveGroupState(group);
      if (user) storeActiveGroupId(user.id, group?.id ?? null);
    },
    [user],
  );

  const refreshGroups = useCallback(async () => {
    if (!user) {
      setUserGroups([]);
      setActiveGroupState(null);
      return [];
    }

    setLoading(true);
    setError(null);

    try {
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
      const storedGroupId = getStoredActiveGroupId(user.id);
      const selectedGroup =
        groups.find((group) => group.id === activeGroup?.id) ??
        groups.find((group) => group.id === storedGroupId) ??
        groups[0] ??
        null;

      setUserGroups(groups);
      setActiveGroupState(selectedGroup);
      if (selectedGroup) storeActiveGroupId(user.id, selectedGroup.id);
      return groups;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Nao foi possivel carregar grupos.');
      setUserGroups([]);
      setActiveGroupState(null);
      return [];
    } finally {
      setLoading(false);
    }
  }, [activeGroup?.id, user]);

  useEffect(() => {
    void refreshGroups();
  }, [refreshGroups]);

  const createGroup = useCallback(
    async (name: string, description?: string) => {
      const group = await createTravelGroup(name.trim(), description);
      const groups = await getUserGroups();
      setUserGroups(groups);
      setActiveGroup(group);
      return group;
    },
    [setActiveGroup],
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
      setActiveGroup(groups.find((item) => item.id === group.id) ?? group);
      return group;
    },
    [setActiveGroup],
  );

  const value = useMemo<GroupContextValue>(
    () => ({
      activeGroup,
      userGroups,
      loading,
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
      inviteMember,
      loading,
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
