import type { User } from '@supabase/supabase-js';
import type {
  CountryId,
  CurrencyRange,
  GroupMemberProfile,
  GroupRole,
  TripSummary,
  UserProfile,
  UserStats,
  UserTravelGroup,
} from '../types';
import { normalizeCountryId } from '../data/countries';
import { addRanges } from '../utils/money';
import { getUserGroups as getCurrentUserGroups } from './groupsService';
import { supabase } from './supabaseClient';

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  ai_generations_used?: number | null;
  ai_generations_limit?: number | null;
  last_ai_generation_at?: string | null;
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

type ExpenseStatsRow = {
  group_id: string;
  country: string | null;
  euro_min: number | null;
  euro_max: number | null;
  brl_min: number | null;
  brl_max: number | null;
};

type CountryRow = {
  group_id: string;
  country: string | null;
};

type AttractionSummaryRow = {
  id: string;
  visited: boolean | null;
};

const emptyRange = (): CurrencyRange => ({ min: 0, max: 0 });

const toProfile = (row: ProfileRow): UserProfile => ({
  id: row.id,
  email: row.email ?? undefined,
  fullName: row.full_name ?? undefined,
  avatarUrl: row.avatar_url ?? undefined,
  aiGenerationsUsed: Number(row.ai_generations_used ?? 0),
  aiGenerationsLimit: Number(row.ai_generations_limit ?? 3),
  lastAiGenerationAt: row.last_ai_generation_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toMember = (row: GroupMemberRow, profile?: UserProfile | null): GroupMemberProfile => ({
  id: row.id,
  groupId: row.group_id,
  userId: row.user_id,
  role: row.role as GroupRole,
  createdAt: row.created_at,
  profile,
});

const getMetadataValue = (user: User, keys: string[]) => {
  for (const key of keys) {
    const value = user.user_metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return undefined;
};

async function requireUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error('Usuario nao autenticado.');
  return user;
}

export async function upsertCurrentProfile(userFromContext?: User | null) {
  const user = userFromContext ?? (await requireUser());
  if (!user) return null;

  const profilePayload = {
    id: user.id,
    email: user.email ?? null,
    full_name: getMetadataValue(user, ['full_name', 'name']),
    avatar_url: getMetadataValue(user, ['avatar_url', 'picture']),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' })
    .select('id, email, full_name, avatar_url, ai_generations_used, ai_generations_limit, last_ai_generation_at, created_at, updated_at')
    .single();

  if (error) throw error;
  return toProfile(data as ProfileRow);
}

export async function getCurrentProfile() {
  const user = await requireUser();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, ai_generations_used, ai_generations_limit, last_ai_generation_at, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return upsertCurrentProfile(user);
  return toProfile(data as ProfileRow);
}

export async function getGroupMembers(groupId: string) {
  const { data, error } = await supabase
    .from('group_members')
    .select('id, group_id, user_id, role, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as GroupMemberRow[];
  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const profileMap = new Map<string, UserProfile>();

  if (userIds.length) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, created_at, updated_at')
      .in('id', userIds);

    if (!profilesError) {
      for (const profile of (profiles ?? []) as ProfileRow[]) {
        profileMap.set(profile.id, toProfile(profile));
      }
    }
  }

  return rows.map((row) => toMember(row, profileMap.get(row.user_id) ?? null));
}

export async function removeGroupMember(groupId: string, userId: string) {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) throw error;
}

const sumExpenses = (rows: ExpenseStatsRow[], groupId?: string) => {
  const filteredRows = groupId ? rows.filter((row) => row.group_id === groupId) : rows;

  return {
    real: addRanges(
      filteredRows.map((row) => ({
        min: Number(row.brl_min ?? 0),
        max: Number(row.brl_max ?? row.brl_min ?? 0),
      })),
    ),
    euro: addRanges(
      filteredRows.map((row) => ({
        min: Number(row.euro_min ?? 0),
        max: Number(row.euro_max ?? row.euro_min ?? 0),
      })),
    ),
  };
};

const addCountry = (countries: Set<CountryId>, country: string | null | undefined) => {
  const normalizedCountry = country?.trim();
  if (normalizedCountry) countries.add(normalizeCountryId(normalizedCountry));
};

export async function getUserStats(userId?: string, activeGroupId?: string | null): Promise<UserStats> {
  const currentUser = userId ? null : await requireUser();
  const resolvedUserId = userId ?? currentUser?.id;
  if (!resolvedUserId) throw new Error('Usuario nao autenticado.');

  const groups = await getCurrentUserGroups();
  const groupIds = groups.map((group) => group.id);

  if (!groupIds.length) {
    return {
      countriesCount: 0,
      travelCount: 0,
      hasActiveTrip: false,
      totalAllReal: emptyRange(),
      totalAllEuro: emptyRange(),
      totalActiveReal: emptyRange(),
      totalActiveEuro: emptyRange(),
    };
  }

  const [
    expensesResult,
    itineraryResult,
    attractionsResult,
  ] = await Promise.all([
    supabase
      .from('expenses')
      .select('group_id, country, euro_min, euro_max, brl_min, brl_max')
      .in('group_id', groupIds),
    supabase
      .from('itinerary_items')
      .select('group_id, country')
      .in('group_id', groupIds)
      .eq('completed', true),
    supabase
      .from('attractions')
      .select('group_id, country')
      .in('group_id', groupIds)
      .eq('visited', true),
  ]);

  if (expensesResult.error) throw expensesResult.error;

  const expenses = (expensesResult.data ?? []) as ExpenseStatsRow[];
  const countries = new Set<CountryId>();

  for (const row of expenses) addCountry(countries, row.country);
  if (!itineraryResult.error) {
    for (const row of (itineraryResult.data ?? []) as CountryRow[]) addCountry(countries, row.country);
  }
  if (!attractionsResult.error) {
    for (const row of (attractionsResult.data ?? []) as CountryRow[]) addCountry(countries, row.country);
  }

  const allTotals = sumExpenses(expenses);
  const activeTotals = activeGroupId ? sumExpenses(expenses, activeGroupId) : { real: emptyRange(), euro: emptyRange() };

  return {
    countriesCount: countries.size,
    travelCount: groups.length,
    hasActiveTrip: Boolean(activeGroupId && groups.some((group) => group.id === activeGroupId)),
    totalAllReal: allTotals.real,
    totalAllEuro: allTotals.euro,
    totalActiveReal: activeTotals.real,
    totalActiveEuro: activeTotals.euro,
  };
}

export async function getUserGroups(_userId?: string): Promise<UserTravelGroup[]> {
  return getCurrentUserGroups();
}

export async function getTripSummary(tripId: string): Promise<TripSummary> {
  const [
    expensesResult,
    membersResult,
    attractionsResult,
  ] = await Promise.all([
    supabase
      .from('expenses')
      .select('group_id, country, euro_min, euro_max, brl_min, brl_max')
      .eq('group_id', tripId),
    supabase
      .from('group_members')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', tripId),
    supabase
      .from('attractions')
      .select('id, visited')
      .eq('group_id', tripId),
  ]);

  if (expensesResult.error) throw expensesResult.error;

  const expenses = (expensesResult.data ?? []) as ExpenseStatsRow[];
  const totals = sumExpenses(expenses);
  const attractions = (attractionsResult.data ?? []) as AttractionSummaryRow[];

  return {
    groupId: tripId,
    totalReal: totals.real,
    totalEuro: totals.euro,
    participantsCount: membersResult.error ? 0 : membersResult.count ?? 0,
    visitedAttractionsCount: attractionsResult.error
      ? 0
      : attractions.filter((attraction) => attraction.visited).length,
  };
}

export async function getProfileTripStats(groups?: UserTravelGroup[]): Promise<TripSummary[]> {
  const resolvedGroups = groups ?? await getCurrentUserGroups();
  return Promise.all(resolvedGroups.map((group) => getTripSummary(group.id)));
}
