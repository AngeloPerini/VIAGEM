import type { RealtimeChannel } from '@supabase/supabase-js';
import { countryLabel, normalizeCountryId } from '../data/countries';
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

const toVisitedCountry = (row: VisitedCountryRow): VisitedCountry => ({
  id: row.id,
  groupId: row.group_id,
  userId: row.user_id,
  countryCode: normalizeCountryId(row.country_code),
  countryName: row.country_name || countryLabel(row.country_code),
  visited: row.visited ?? false,
  visitedAt: row.visited_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

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
  const normalizedCountryCode = normalizeCountryId(countryCode);
  const visitedAt = visited ? new Date().toISOString() : null;

  const { data: updatedCountry, error: updateError } = await supabase
    .from('trip_visited_countries')
    .update({
      user_id: userId,
      country_name: countryName || countryLabel(normalizedCountryCode),
      visited,
      visited_at: visitedAt,
    })
    .eq('group_id', groupId)
    .eq('country_code', normalizedCountryCode)
    .select('id, group_id, user_id, country_code, country_name, visited, visited_at, created_at, updated_at')
    .maybeSingle();

  if (updateError) throw updateError;
  if (updatedCountry) return toVisitedCountry(updatedCountry as VisitedCountryRow);

  const { data: insertedCountry, error: insertError } = await supabase
    .from('trip_visited_countries')
    .insert({
      group_id: groupId,
      user_id: userId,
      country_code: normalizedCountryCode,
      country_name: countryName || countryLabel(normalizedCountryCode),
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
