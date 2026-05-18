import type { GroupMember, GroupRole, TravelGroup, UserTravelGroup } from '../types';
import { supabase } from './supabaseClient';

type TravelGroupRow = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at?: string;
  updated_at?: string;
};

type GroupMemberRow = {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  created_at?: string;
};

type MembershipWithGroupRow = {
  role: string;
  travel_groups: TravelGroupRow | TravelGroupRow[] | null;
};

const ACTIVE_GROUP_KEY_PREFIX = 'europa-budget-active-group-v1';

const toGroup = (row: TravelGroupRow): TravelGroup => ({
  id: row.id,
  name: row.name,
  description: row.description ?? '',
  ownerId: row.owner_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toMember = (row: GroupMemberRow): GroupMember => ({
  id: row.id,
  groupId: row.group_id,
  userId: row.user_id,
  role: row.role as GroupRole,
  createdAt: row.created_at,
});

const activeGroupKey = (userId: string) => `${ACTIVE_GROUP_KEY_PREFIX}-${userId}`;

async function requireUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error('Usuario nao autenticado.');
  return user.id;
}

export function getStoredActiveGroupId(userId: string) {
  return localStorage.getItem(activeGroupKey(userId));
}

export function storeActiveGroupId(userId: string, groupId: string | null) {
  if (groupId) {
    localStorage.setItem(activeGroupKey(userId), groupId);
  } else {
    localStorage.removeItem(activeGroupKey(userId));
  }
}

export async function claimLegacyTripGroup() {
  const { error } = await supabase.rpc('claim_legacy_trip_group', {
    default_group_name: 'Viagem Europa',
  });

  if (error) throw error;
}

export async function getUserGroups(): Promise<UserTravelGroup[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('group_members')
    .select('role, travel_groups(id, name, description, owner_id, created_at, updated_at)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as MembershipWithGroupRow[])
    .map((membership) => {
      const group = Array.isArray(membership.travel_groups)
        ? membership.travel_groups[0]
        : membership.travel_groups;

      if (!group) return null;
      return { ...toGroup(group), role: membership.role as GroupRole };
    })
    .filter((group): group is UserTravelGroup => Boolean(group));
}

export async function createGroup(name: string, description?: string): Promise<UserTravelGroup> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('travel_groups')
    .insert({
      name,
      description: description?.trim() || null,
      owner_id: userId,
    })
    .select('id, name, description, owner_id, created_at, updated_at')
    .single();

  if (error) throw error;

  await supabase.from('group_members').upsert(
    {
      group_id: data.id,
      user_id: userId,
      role: 'owner',
    },
    { onConflict: 'group_id,user_id' },
  );

  return { ...toGroup(data as TravelGroupRow), role: 'owner' };
}

export async function inviteMember(groupId: string, email?: string) {
  const userId = await requireUserId();
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

  const { error } = await supabase.from('group_invites').insert({
    group_id: groupId,
    email: email?.trim() || null,
    token,
    role: 'member',
    created_by: userId,
    expires_at: expiresAt,
  });

  if (error) throw error;

  return `${window.location.origin}/invite/${token}`;
}

export async function acceptInvite(token: string): Promise<UserTravelGroup> {
  const { data, error } = await supabase.rpc('accept_group_invite', {
    invite_token: token,
  });

  if (error) throw error;
  const acceptedGroup = Array.isArray(data) ? data[0] : data;
  if (!acceptedGroup) throw new Error('Convite invalido ou expirado.');

  return {
    id: acceptedGroup.id,
    name: acceptedGroup.name,
    description: acceptedGroup.description ?? '',
    ownerId: acceptedGroup.owner_id,
    createdAt: acceptedGroup.created_at,
    updatedAt: acceptedGroup.updated_at,
    role: acceptedGroup.role as GroupRole,
  };
}

export async function getGroupMembers(groupId: string) {
  const { data, error } = await supabase
    .from('group_members')
    .select('id, group_id, user_id, role, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as GroupMemberRow[]).map(toMember);
}

export async function removeGroupMember(groupId: string, userId: string) {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) throw error;
}
