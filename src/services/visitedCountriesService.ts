import type { RealtimeChannel } from '@supabase/supabase-js';
import { countryLabel, normalizeCountry, normalizeCountryCode } from '../data/countries';
import type { VisitedCountry } from '../types';
import { supabase } from './supabaseClient';

type UserVisitedCountryRow = {
  id: string;
  user_id: string;
  country_code: string;
  country_name: string;
  visited_at: string | null;
  source?: string | null;
  source_group_id?: string | null;
  source_trip_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

type LegacyVisitedCountryRow = {
  id: string;
  group_id: string;
  user_id: string;
  country_code: string;
  country_name: string;
  visited: boolean | null;
  visited_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type VisitedCountrySource = {
  source?: string;
  sourceGroupId?: string | null;
  sourceTripId?: string | null;
};

const USER_VISITED_COUNTRY_SELECT =
  'id, user_id, country_code, country_name, visited_at, source, source_group_id, source_trip_id, created_at, updated_at';

const LEGACY_VISITED_COUNTRY_SELECT =
  'id, group_id, user_id, country_code, country_name, visited, visited_at, created_at, updated_at';

const isPersistableCountry = (countryCode: string) => {
  const normalized = countryCode.trim().toLowerCase();
  return Boolean(normalized) && normalized !== 'all' && normalized !== 'international';
};

const normalizeVisitedCountryInput = (countryCode: string, countryName?: string) => {
  const normalized = normalizeCountry(countryCode || countryName);

  if (!isPersistableCountry(normalized.countryCode)) {
    throw new Error('Pais invalido para marcar como visitado.');
  }

  return {
    countryCode: normalized.countryCode,
    countryName: countryLabel(normalized.countryCode) || countryName?.trim() || normalized.countryName,
  };
};

const toVisitedCountry = (row: UserVisitedCountryRow): VisitedCountry => {
  const countryCode = normalizeCountryCode(row.country_code);

  return {
    id: row.id,
    groupId: row.source_group_id ?? row.source_trip_id ?? '',
    userId: row.user_id,
    countryCode,
    countryName: countryLabel(countryCode) || row.country_name,
    visited: true,
    visitedAt: row.visited_at,
    source: row.source ?? undefined,
    sourceGroupId: row.source_group_id ?? undefined,
    sourceTripId: row.source_trip_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toLegacyVisitedCountry = (row: LegacyVisitedCountryRow): VisitedCountry => {
  const countryCode = normalizeCountryCode(row.country_code);

  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    countryCode,
    countryName: countryLabel(countryCode) || row.country_name,
    visited: row.visited ?? false,
    visitedAt: row.visited_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error('Usuario nao autenticado.');
  return user.id;
}

const dedupeVisitedCountries = (countries: VisitedCountry[]) => {
  const byCountry = new Map<string, VisitedCountry>();

  countries
    .filter((country) => country.visited)
    .sort((a, b) =>
      new Date(b.visitedAt ?? b.updatedAt ?? 0).getTime() -
      new Date(a.visitedAt ?? a.updatedAt ?? 0).getTime(),
    )
    .forEach((country) => {
      const countryCode = normalizeCountryCode(country.countryCode);
      if (!byCountry.has(countryCode)) {
        byCountry.set(countryCode, { ...country, countryCode, countryName: countryLabel(countryCode) });
      }
    });

  return [...byCountry.values()];
};

async function getLegacyVisitedCountriesForCurrentUser(userId: string) {
  const { data, error } = await supabase
    .from('trip_visited_countries')
    .select(LEGACY_VISITED_COUNTRY_SELECT)
    .eq('user_id', userId)
    .eq('visited', true)
    .order('visited_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return dedupeVisitedCountries(((data ?? []) as LegacyVisitedCountryRow[]).map(toLegacyVisitedCountry));
}

export async function getUserVisitedCountries() {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('user_visited_countries')
    .select(USER_VISITED_COUNTRY_SELECT)
    .eq('user_id', userId)
    .order('visited_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });

  if (!error) {
    return dedupeVisitedCountries(((data ?? []) as UserVisitedCountryRow[]).map(toVisitedCountry));
  }

  const message = error.message ?? '';
  if (error.code === '42P01' || message.includes('user_visited_countries')) {
    return getLegacyVisitedCountriesForCurrentUser(userId);
  }

  throw error;
}

export async function getTripVisitedCountries(groupId: string) {
  const { data, error } = await supabase
    .from('trip_visited_countries')
    .select(LEGACY_VISITED_COUNTRY_SELECT)
    .eq('group_id', groupId)
    .order('visited_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as LegacyVisitedCountryRow[]).map(toLegacyVisitedCountry);
}

export async function getVisitedCountriesForGroups(_groupIds: string[]) {
  return getUserVisitedCountries();
}

export async function setUserCountryVisited(
  countryCode: string,
  countryName: string,
  visited: boolean,
  metadata: VisitedCountrySource = {},
) {
  const userId = await getCurrentUserId();
  const normalizedCountry = normalizeVisitedCountryInput(countryCode, countryName);

  if (!visited) {
    const { error } = await supabase
      .from('user_visited_countries')
      .delete()
      .eq('user_id', userId)
      .eq('country_code', normalizedCountry.countryCode);

    if (error) throw error;

    return {
      id: `removed-${normalizedCountry.countryCode}`,
      groupId: metadata.sourceGroupId ?? metadata.sourceTripId ?? '',
      userId,
      countryCode: normalizedCountry.countryCode,
      countryName: normalizedCountry.countryName,
      visited: false,
      visitedAt: null,
      updatedAt: new Date().toISOString(),
    } satisfies VisitedCountry;
  }

  const { data: existingCountry, error: existingCountryError } = await supabase
    .from('user_visited_countries')
    .select(USER_VISITED_COUNTRY_SELECT)
    .eq('user_id', userId)
    .eq('country_code', normalizedCountry.countryCode)
    .maybeSingle();

  if (existingCountryError) throw existingCountryError;

  const now = new Date().toISOString();
  const sourcePatch = {
    ...(metadata.source ? { source: metadata.source } : {}),
    ...(metadata.sourceGroupId ? { source_group_id: metadata.sourceGroupId } : {}),
    ...(metadata.sourceTripId ? { source_trip_id: metadata.sourceTripId } : {}),
  };

  if (existingCountry) {
    const { data, error } = await supabase
      .from('user_visited_countries')
      .update({
        country_name: normalizedCountry.countryName,
        updated_at: now,
        ...sourcePatch,
      })
      .eq('id', (existingCountry as UserVisitedCountryRow).id)
      .select(USER_VISITED_COUNTRY_SELECT)
      .single();

    if (error) throw error;
    return toVisitedCountry(data as UserVisitedCountryRow);
  }

  const { data, error } = await supabase
    .from('user_visited_countries')
    .insert({
      user_id: userId,
      country_code: normalizedCountry.countryCode,
      country_name: normalizedCountry.countryName,
      visited_at: now,
      source: metadata.source ?? 'manual',
      source_group_id: metadata.sourceGroupId ?? null,
      source_trip_id: metadata.sourceTripId ?? null,
    })
    .select(USER_VISITED_COUNTRY_SELECT)
    .single();

  if (error) throw error;
  return toVisitedCountry(data as UserVisitedCountryRow);
}

export async function setTripCountryVisited(
  groupId: string,
  countryCode: string,
  countryName: string,
  visited: boolean,
) {
  return setUserCountryVisited(countryCode, countryName, visited, {
    source: 'manual',
    sourceGroupId: groupId,
    sourceTripId: groupId,
  });
}

export async function markTripCountriesVisited(
  groupId: string,
  countries: string[],
  source = 'trip_completed',
) {
  const userId = await getCurrentUserId();
  const normalizedCountries = Array.from(
    countries.reduce<Map<string, { countryCode: string; countryName: string }>>((items, country) => {
      try {
        const normalizedCountry = normalizeVisitedCountryInput(country, country);
        items.set(normalizedCountry.countryCode, normalizedCountry);
      } catch {
        // Ignore non-country filters such as "all" or "international".
      }
      return items;
    }, new Map()).values(),
  );

  if (!normalizedCountries.length) return getUserVisitedCountries();

  const countryCodes = normalizedCountries.map((country) => country.countryCode);
  const { data: existingRows, error: existingRowsError } = await supabase
    .from('user_visited_countries')
    .select('country_code')
    .eq('user_id', userId)
    .in('country_code', countryCodes);

  if (existingRowsError) throw existingRowsError;

  const existingCodes = new Set(((existingRows ?? []) as Array<{ country_code: string }>).map((row) => row.country_code));
  const now = new Date().toISOString();
  const rowsToInsert = normalizedCountries
    .filter((country) => !existingCodes.has(country.countryCode))
    .map((country) => ({
      user_id: userId,
      country_code: country.countryCode,
      country_name: country.countryName,
      visited_at: now,
      source,
      source_group_id: groupId,
      source_trip_id: groupId,
    }));

  if (rowsToInsert.length) {
    const { error } = await supabase
      .from('user_visited_countries')
      .insert(rowsToInsert);

    if (error) throw error;
  }

  return getUserVisitedCountries();
}

export function subscribeUserVisitedCountries(userId: string, onChange: () => void): RealtimeChannel {
  const topic = `user-visited-countries-${userId}`;
  supabase.getChannels()
    .filter((channel) => channel.topic === `realtime:${topic}`)
    .forEach((channel) => {
      void supabase.removeChannel(channel);
    });

  return supabase
    .channel(topic)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_visited_countries', filter: `user_id=eq.${userId}` },
      onChange,
    )
    .subscribe();
}

export function subscribeTripVisitedCountries(groupId: string, onChange: () => void): RealtimeChannel {
  const topic = `trip-visited-countries-${groupId}`;
  supabase.getChannels()
    .filter((channel) => channel.topic === `realtime:${topic}`)
    .forEach((channel) => {
      void supabase.removeChannel(channel);
    });

  return supabase
    .channel(topic)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trip_visited_countries', filter: `group_id=eq.${groupId}` },
      onChange,
    )
    .subscribe();
}
