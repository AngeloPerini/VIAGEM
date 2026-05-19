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

type GroupInviteRow = {
  token: string;
  expires_at: string | null;
  single_use: boolean | null;
};

type MembershipWithGroupRow = {
  role: string;
  travel_groups: TravelGroupRow | TravelGroupRow[] | null;
};

const ACTIVE_GROUP_KEY_PREFIX = 'europa-budget-active-group-v1';
const PENDING_INVITE_KEY = 'europa-budget-pending-invite-v1';
const INVITE_PREFIX = 'EUROPA2026';

export type InviteDetails = {
  code: string;
  link: string;
  expiresAt: string;
  singleUse: boolean;
};

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

export function normalizeInviteToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    return (url.pathname.split('/').filter(Boolean).at(-1) ?? '').trim().toUpperCase();
  } catch {
    return trimmed.split('/').filter(Boolean).at(-1)?.trim().toUpperCase() ?? trimmed.toUpperCase();
  }
}

export function storePendingInviteToken(token: string) {
  const normalizedToken = normalizeInviteToken(token);
  if (normalizedToken) sessionStorage.setItem(PENDING_INVITE_KEY, normalizedToken);
}

export function getPendingInviteToken() {
  return sessionStorage.getItem(PENDING_INVITE_KEY);
}

export function clearPendingInviteToken() {
  sessionStorage.removeItem(PENDING_INVITE_KEY);
}

function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${INVITE_PREFIX}-${suffix}`;
}

export async function claimLegacyTripGroup() {
  const { error } = await supabase.rpc('claim_legacy_trip_group', {
    default_group_name: 'Viagem Europa',
    owner_email: 'aperini351@gmail.com',
  });

  if (error) throw error;
}

export async function claimOwnerTripGroup() {
  const { error } = await supabase.rpc('claim_owner_trip_group', {
    owner_email: 'aperini351@gmail.com',
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

  return { ...toGroup(data as TravelGroupRow), role: 'owner' };
}

export async function inviteMember(groupId: string, email?: string, singleUse = false): Promise<InviteDetails> {
  const userId = await requireUserId();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode();
    const { error } = await supabase.from('group_invites').insert({
      group_id: groupId,
      email: email?.trim() || null,
      token: code,
      role: 'member',
      single_use: singleUse,
      used: false,
      used_count: 0,
      created_by: userId,
      expires_at: expiresAt,
    });

    if (!error) {
      return {
        code,
        link: `${window.location.origin}/invite/${code}`,
        expiresAt,
        singleUse,
      };
    }

    if (error.code !== '23505') throw error;
  }

  throw new Error('Nao foi possivel gerar um codigo unico. Tente novamente.');
}

export const createInvite = inviteMember;

export async function getInvites(groupId: string): Promise<InviteDetails[]> {
  const { data, error } = await supabase
    .from('group_invites')
    .select('token, expires_at, single_use')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(8);

  if (error) throw error;

  return ((data ?? []) as GroupInviteRow[]).map((invite) => ({
    code: invite.token,
    link: `${window.location.origin}/invite/${invite.token}`,
    expiresAt: invite.expires_at ?? '',
    singleUse: invite.single_use ?? false,
  }));
}

export async function acceptInvite(token: string): Promise<UserTravelGroup> {
  const { data, error } = await supabase.rpc('accept_group_invite', {
    invite_token: normalizeInviteToken(token),
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

export const removeMember = removeGroupMember;
