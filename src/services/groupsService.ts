import type { CreateTravelGroupInput, GroupMember, GroupRole, TravelGroup, TripStatus, UserTravelGroup } from '../types';
import { buildPublicAppUrl } from '../config/appUrl';
import { parseCountryInput } from '../utils/countryInput';
import { supabase } from './supabaseClient';

type TravelGroupRow = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  status?: string | null;
  countries?: string[] | null;
  start_date?: string | null;
  end_date?: string | null;
  travel_style?: string | null;
  notes?: string | null;
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
  id?: string;
  group_id?: string;
  email?: string | null;
  token: string;
  expires_at: string | null;
  single_use: boolean | null;
  created_at?: string | null;
};

type PendingInviteRow = {
  id: string;
  group_id: string;
  group_name: string;
  group_description: string | null;
  token: string;
  email: string;
  role: string;
  expires_at: string | null;
  created_at: string | null;
  created_by: string | null;
  inviter_name: string | null;
  inviter_email: string | null;
};

type MembershipWithGroupRow = {
  role: string;
  travel_groups: TravelGroupRow | TravelGroupRow[] | null;
};

type TravelGroupRpcRow = TravelGroupRow & {
  role?: string | null;
};

const ACTIVE_GROUP_KEY_PREFIX = 'europa-budget-active-group-v1';
const PENDING_INVITE_KEY = 'europa-budget-pending-invite-v1';
const INVITE_PREFIXES = ['EUROPA', 'VIAGEM'];
const GROUP_SELECT =
  'id, name, description, owner_id, status, countries, start_date, end_date, travel_style, notes, created_at, updated_at';
const PHOTO_BUCKET = 'attraction-photos';
const tripStatuses: TripStatus[] = ['planned', 'active', 'completed', 'canceled'];

export type InviteDetails = {
  code: string;
  link: string;
  email?: string;
  expiresAt: string;
  singleUse: boolean;
  emailSent?: boolean;
  emailError?: string;
};

export type PendingInvite = {
  id: string;
  token: string;
  code: string;
  link: string;
  email: string;
  role: GroupRole;
  expiresAt?: string;
  createdAt?: string;
  group: {
    id: string;
    name: string;
    description?: string;
  };
  inviterName: string;
  inviterEmail?: string;
};

const toGroup = (row: TravelGroupRow): TravelGroup => ({
  id: row.id,
  name: row.name,
  description: row.description ?? '',
  ownerId: row.owner_id,
  status: tripStatuses.includes(row.status as TripStatus) ? row.status as TripStatus : 'planned',
  countries: Array.isArray(row.countries) ? row.countries.flatMap((country) => parseCountryInput(country)) : [],
  startDate: row.start_date ?? undefined,
  endDate: row.end_date ?? undefined,
  travelStyle: row.travel_style ?? undefined,
  notes: row.notes ?? undefined,
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
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const prefix = INVITE_PREFIXES[bytes[0] % INVITE_PREFIXES.length];
  const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `${prefix}-${suffix.slice(1)}`;
}

const normalizeInviteEmail = (value?: string) => value?.trim().toLowerCase() ?? '';

const isValidInviteEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const getFunctionErrorMessage = (data: unknown, fallback: string) => {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (typeof record.message === 'string' && record.message.trim()) return record.message;
    if (typeof record.error === 'string' && record.error.trim()) return record.error;
  }
  return fallback;
};

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
    .select(`role, travel_groups(${GROUP_SELECT})`)
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

export async function getUserTrips(): Promise<UserTravelGroup[]> {
  return getUserGroups();
}

export async function getCreatedTrips(): Promise<UserTravelGroup[]> {
  const userId = await requireUserId();
  const groups = await getUserGroups();
  return groups.filter((group) => group.ownerId === userId);
}

export async function getCompletedTrips(): Promise<UserTravelGroup[]> {
  const groups = await getUserGroups();
  return groups.filter((group) => group.status === 'completed');
}

const normalizeCreateGroupInput = (
  input: string | CreateTravelGroupInput,
  description?: string,
): CreateTravelGroupInput =>
  typeof input === 'string'
    ? { name: input, description }
    : input;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isMissingCreateGroupRpc = (error: { code?: string; message?: string } | null) =>
  Boolean(
    error &&
      (error.code === 'PGRST202' ||
        error.message?.includes('create_travel_group_with_owner') ||
        error.message?.includes('Could not find the function')),
  );

const formatCreateGroupError = (error: { code?: string; message?: string } | null) => {
  const message = error?.message ?? '';
  if (error?.code === '42501' || /row-level security|permission denied/i.test(message)) {
    return 'Nao foi possivel criar a viagem por permissao/RLS. Verifique se seu perfil foi criado e tente novamente.';
  }
  if (/Usuario nao autenticado/i.test(message)) return 'Usuario nao autenticado.';
  if (/Informe o nome da viagem/i.test(message)) return 'Informe o nome da viagem.';
  return message || 'Nao foi possivel criar sua viagem.';
};

async function findLatestOwnedGroup(userId: string, groupName: string): Promise<UserTravelGroup | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from('travel_groups')
      .select(GROUP_SELECT)
      .eq('owner_id', userId)
      .eq('name', groupName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return { ...toGroup(data as TravelGroupRow), role: 'owner' };

    await wait(200);
  }

  const groups = await getUserGroups();
  return groups
    .filter((group) => group.ownerId === userId && group.name === groupName)
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0] ?? null;
}

export async function createGroup(
  input: string | CreateTravelGroupInput,
  description?: string,
): Promise<UserTravelGroup> {
  const userId = await requireUserId();
  const groupInput = normalizeCreateGroupInput(input, description);
  const trimmedName = groupInput.name.trim();

  if (!trimmedName) throw new Error('Informe o nome da viagem.');

  const extendedPayload = {
    name: trimmedName,
    description: groupInput.description?.trim() || null,
    owner_id: userId,
    countries: groupInput.countries ?? [],
    start_date: groupInput.startDate || null,
    end_date: groupInput.endDate || null,
    travel_style: groupInput.travelStyle || null,
    notes: groupInput.notes?.trim() || null,
  };

  const { data: rpcData, error: rpcError } = await supabase
    .rpc('create_travel_group_with_owner', {
      group_name: extendedPayload.name,
      group_description: extendedPayload.description,
      group_countries: extendedPayload.countries,
      group_start_date: extendedPayload.start_date,
      group_end_date: extendedPayload.end_date,
      group_travel_style: extendedPayload.travel_style,
      group_notes: extendedPayload.notes,
    })
    .maybeSingle();

  if (!rpcError && rpcData) {
    const createdGroup = rpcData as TravelGroupRpcRow;
    return {
      ...toGroup(createdGroup),
      role: createdGroup.role === 'member' ? 'member' : 'owner',
    };
  }

  if (rpcError && !isMissingCreateGroupRpc(rpcError)) {
    throw new Error(formatCreateGroupError(rpcError));
  }

  const { error } = await supabase.from('travel_groups').insert(extendedPayload);

  if (error) {
    const missingExtendedColumns =
      error.message.includes('countries') ||
      error.message.includes('start_date') ||
      error.message.includes('end_date') ||
      error.message.includes('travel_style') ||
      error.message.includes('notes');

    if (!missingExtendedColumns) throw new Error(formatCreateGroupError(error));

    const { error: fallbackError } = await supabase.from('travel_groups').insert({
      name: trimmedName,
      description: groupInput.description?.trim() || null,
      owner_id: userId,
    });

    if (fallbackError) throw new Error(formatCreateGroupError(fallbackError));
  }

  const group = await findLatestOwnedGroup(userId, trimmedName);
  if (!group) {
    throw new Error('A viagem foi criada, mas nao foi possivel carrega-la. Recarregue a pagina e tente novamente.');
  }

  return group;
}

const isTripStatus = (value: string): value is TripStatus =>
  tripStatuses.includes(value as TripStatus);

export async function updateTripStatus(groupId: string, status: TripStatus): Promise<UserTravelGroup> {
  if (!isTripStatus(status)) throw new Error('Status da viagem invalido.');

  const { data, error } = await supabase
    .from('travel_groups')
    .update({ status })
    .eq('id', groupId)
    .select(GROUP_SELECT)
    .single();

  if (error) throw error;
  return { ...toGroup(data as TravelGroupRow), role: 'owner' };
}

export async function setActiveTrip(groupId: string): Promise<UserTravelGroup> {
  const userId = await requireUserId();
  const group = (await getUserGroups()).find((item) => item.id === groupId);

  if (!group) throw new Error('Voce nao participa desta viagem.');
  storeActiveGroupId(userId, group.id);
  return group;
}

const extractStoragePath = (value: string | null | undefined, groupId: string, attractionId?: string) => {
  if (!value && attractionId) return `${groupId}/${attractionId}/photo.jpg`;
  if (!value) return null;
  if (!value.startsWith('http')) return value;

  try {
    const url = new URL(value);
    const markers = [
      `/object/public/${PHOTO_BUCKET}/`,
      `/object/sign/${PHOTO_BUCKET}/`,
    ];
    const marker = markers.find((item) => url.pathname.includes(item));
    if (!marker) return attractionId ? `${groupId}/${attractionId}/photo.jpg` : null;
    const [, rawPath = ''] = url.pathname.split(marker);
    return decodeURIComponent(rawPath);
  } catch {
    return attractionId ? `${groupId}/${attractionId}/photo.jpg` : null;
  }
};

const collectStoragePaths = async (prefix: string): Promise<string[]> => {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).list(prefix, { limit: 1000 });
  if (error || !data) return [];

  const nestedPaths = await Promise.all(
    data.map(async (item) => {
      const fullPath = `${prefix}/${item.name}`;
      if (item.id) return [fullPath];
      return collectStoragePaths(fullPath);
    }),
  );

  return nestedPaths.flat();
};

export async function deleteTrip(groupId: string) {
  const userId = await requireUserId();
  const group = (await getUserGroups()).find((item) => item.id === groupId);

  if (!group) throw new Error('Voce nao participa desta viagem.');
  if (group.ownerId !== userId) throw new Error('Apenas o owner pode apagar esta viagem.');

  const { data: attractionRows } = await supabase
    .from('attractions')
    .select('id, photo_url')
    .eq('group_id', groupId);

  const explicitPaths = ((attractionRows ?? []) as Array<{ id: string; photo_url: string | null }>)
    .flatMap((row) => [
      extractStoragePath(row.photo_url, groupId, row.id),
      `${groupId}/${row.id}/photo.jpg`,
    ])
    .filter((path): path is string => Boolean(path));

  const listedPaths = await collectStoragePaths(groupId);
  const paths = Array.from(new Set([...explicitPaths, ...listedPaths]));

  for (let index = 0; index < paths.length; index += 100) {
    await supabase.storage.from(PHOTO_BUCKET).remove(paths.slice(index, index + 100));
  }

  const { error } = await supabase.from('travel_groups').delete().eq('id', groupId);
  if (error) throw error;

  storeActiveGroupId(userId, null);
}

export async function inviteMember(groupId: string, email?: string, _singleUse = true): Promise<InviteDetails> {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const normalizedEmail = normalizeInviteEmail(email);

  if (!normalizedEmail) throw new Error('Informe o e-mail do convidado.');
  if (!isValidInviteEmail(normalizedEmail)) throw new Error('Informe um e-mail valido.');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode();
    const { data, error } = await supabase
      .rpc('create_group_invite', {
        target_group_id: groupId,
        invite_email: normalizedEmail,
        invite_token: code,
        invite_role: 'member',
        invite_expires_at: expiresAt,
      })
      .maybeSingle();

    if (!error) {
      const createdInvite = data as GroupInviteRow | null;
      let emailSent = false;
      let emailError: string | undefined;

      const { data: emailData, error: functionError } = await supabase.functions.invoke('send-trip-invite', {
        body: {
          groupId,
          token: createdInvite?.token ?? code,
        },
      });

      if (functionError) {
        emailError = functionError.message || 'Convite salvo, mas o e-mail nao foi enviado.';
      } else if (emailData && typeof emailData === 'object' && 'error' in emailData) {
        emailError = getFunctionErrorMessage(emailData, 'Convite salvo, mas o e-mail nao foi enviado.');
      } else {
        emailSent = true;
      }

      return {
        code: createdInvite?.token ?? code,
        link: buildPublicAppUrl(`/invite/${createdInvite?.token ?? code}`),
        email: createdInvite?.email ?? normalizedEmail,
        expiresAt: createdInvite?.expires_at ?? expiresAt,
        singleUse: true,
        emailSent,
        emailError,
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
    .select('id, email, token, expires_at, single_use, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(8);

  if (error) throw error;

  return ((data ?? []) as GroupInviteRow[]).map((invite) => ({
    code: invite.token,
    link: buildPublicAppUrl(`/invite/${invite.token}`),
    email: invite.email ?? undefined,
    expiresAt: invite.expires_at ?? '',
    singleUse: invite.single_use ?? false,
  }));
}

export async function getPendingInvites(): Promise<PendingInvite[]> {
  const { data, error } = await supabase.rpc('get_pending_group_invites');
  if (error) throw error;

  return ((data ?? []) as PendingInviteRow[]).map((invite) => ({
    id: invite.id,
    token: invite.token,
    code: invite.token,
    link: buildPublicAppUrl(`/invite/${invite.token}`),
    email: invite.email,
    role: invite.role === 'owner' ? 'owner' : 'member',
    expiresAt: invite.expires_at ?? undefined,
    createdAt: invite.created_at ?? undefined,
    group: {
      id: invite.group_id,
      name: invite.group_name,
      description: invite.group_description ?? undefined,
    },
    inviterName: invite.inviter_name ?? invite.inviter_email ?? 'TripFlow',
    inviterEmail: invite.inviter_email ?? undefined,
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
    status: tripStatuses.includes(acceptedGroup.status as TripStatus) ? acceptedGroup.status as TripStatus : 'planned',
    countries: Array.isArray(acceptedGroup.countries)
      ? acceptedGroup.countries.flatMap((country: string) => parseCountryInput(country))
      : [],
    startDate: acceptedGroup.start_date ?? undefined,
    endDate: acceptedGroup.end_date ?? undefined,
    travelStyle: acceptedGroup.travel_style ?? undefined,
    notes: acceptedGroup.notes ?? undefined,
    createdAt: acceptedGroup.created_at,
    updatedAt: acceptedGroup.updated_at,
    role: acceptedGroup.role as GroupRole,
  };
}

export async function rejectInvite(token: string) {
  const { error } = await supabase.rpc('reject_group_invite', {
    invite_token: normalizeInviteToken(token),
  });

  if (error) throw error;
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
