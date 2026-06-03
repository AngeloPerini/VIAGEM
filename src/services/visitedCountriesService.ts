import type { RealtimeChannel } from '@supabase/supabase-js';
import { countryLabel, normalizeCountryCode } from '../data/countries';
import type { VisitedCountry } from '../types';
import { supabase } from './supabaseClient';

type VisitedCountryRow = {
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

const toVisitedCountry = (row: VisitedCountryRow): VisitedCountry => {
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

export async function getTripVisitedCountries(groupId: string) {
  const { data, error } = await supabase
    .from('trip_visited_countries')
    .select('id, group_id, user_id, country_code, country_name, visited, visited_at, created_at, updated_at')
    .eq('group_id', groupId)
    .order('visited_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as VisitedCountryRow[]).map(toVisitedCountry);
}

export async function setTripCountryVisited(
  groupId: string,
  countryCode: string,
  countryName: string,
  visited: boolean,
) {
  const userId = await getCurrentUserId();
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  const normalizedCountryName = countryName || countryLabel(normalizedCountryCode);
  const visitedAt = visited ? new Date().toISOString() : null;

  const { data: existingRows, error: existingRowsError } = await supabase
    .from('trip_visited_countries')
    .select('id, group_id, user_id, country_code, country_name, visited, visited_at, created_at, updated_at')
    .eq('group_id', groupId);

  if (existingRowsError) throw existingRowsError;

  const matchingRows = ((existingRows ?? []) as VisitedCountryRow[])
    .filter((row) =>
      normalizeCountryCode(row.country_code) === normalizedCountryCode
      || normalizeCountryCode(row.country_name) === normalizedCountryCode,
    )
    .sort((a, b) => {
      if (a.country_code.trim().toUpperCase() === normalizedCountryCode) return -1;
      if (b.country_code.trim().toUpperCase() === normalizedCountryCode) return 1;
      if ((a.visited ?? false) !== (b.visited ?? false)) return a.visited ? -1 : 1;
      return new Date(b.visited_at ?? b.updated_at ?? 0).getTime() - new Date(a.visited_at ?? a.updated_at ?? 0).getTime();
    });

  const existingCountry = matchingRows[0];

  if (existingCountry) {
    const duplicateIds = matchingRows.slice(1).map((row) => row.id);
    if (duplicateIds.length) {
      const { error: duplicateUpdateError } = await supabase
        .from('trip_visited_countries')
        .update({
          user_id: userId,
          visited: false,
          visited_at: null,
        })
        .in('id', duplicateIds);

      if (duplicateUpdateError) throw duplicateUpdateError;
    }

    const { data: updatedCountry, error: updateError } = await supabase
      .from('trip_visited_countries')
      .update({
        user_id: userId,
        country_code: normalizedCountryCode,
        country_name: normalizedCountryName,
        visited,
        visited_at: visitedAt,
      })
      .eq('id', existingCountry.id)
      .select('id, group_id, user_id, country_code, country_name, visited, visited_at, created_at, updated_at')
      .single();

    if (updateError) throw updateError;
    return toVisitedCountry(updatedCountry as VisitedCountryRow);
  }

  const { data: insertedCountry, error: insertError } = await supabase
    .from('trip_visited_countries')
    .insert({
      group_id: groupId,
      user_id: userId,
      country_code: normalizedCountryCode,
      country_name: normalizedCountryName,
      visited,
      visited_at: visitedAt,
    })
    .select('id, group_id, user_id, country_code, country_name, visited, visited_at, created_at, updated_at')
    .single();

  if (insertError) throw insertError;
  return toVisitedCountry(insertedCountry as VisitedCountryRow);
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
