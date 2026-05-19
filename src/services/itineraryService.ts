import type { RealtimeChannel } from '@supabase/supabase-js';
import { defaultItineraryItems } from '../data/defaultItinerary';
import { ITINERARY_STORAGE_KEY } from '../data/itinerary';
import { normalizeCountryId } from '../data/countries';
import type { CountryId, ItineraryItem, ItineraryType, LinkItem } from '../types';
import { normalizeLinks } from '../utils/links';
import { supabase } from './supabaseClient';

type ItineraryRow = {
  id: string;
  group_id: string;
  created_by: string | null;
  day: string;
  country: string;
  city: string | null;
  time: string | null;
  title: string;
  description: string | null;
  type: string | null;
  completed: boolean | null;
  links: LinkItem[] | null;
  order_index: number | null;
};

const cacheKey = (groupId: string) => `${ITINERARY_STORAGE_KEY}-${groupId}`;

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error('Usuario nao autenticado.');
  return user.id;
}

const cacheItems = (groupId: string, items: ItineraryItem[]) => {
  localStorage.setItem(cacheKey(groupId), JSON.stringify(items));
};

const toItem = (row: ItineraryRow): ItineraryItem => ({
  id: row.id,
  day: row.day,
  country: row.country as CountryId,
  city: row.city ?? '',
  time: row.time ?? '',
  title: row.title,
  description: row.description ?? '',
  type: (row.type ?? 'tour') as ItineraryType,
  completed: row.completed ?? false,
  links: Array.isArray(row.links) ? row.links : [],
});

const toPayload = (item: ItineraryItem, orderIndex?: number) => ({
  day: item.day,
  country: normalizeCountryId(item.country),
  city: item.city || null,
  time: item.time || null,
  title: item.title,
  description: item.description || null,
  type: item.type,
  completed: item.completed ?? false,
  links: normalizeLinks(item.links),
  ...(orderIndex === undefined ? {} : { order_index: orderIndex }),
});

export function getCachedItineraryItems(groupId?: string) {
  if (!groupId) return [];
  const stored = localStorage.getItem(cacheKey(groupId));
  if (!stored) return [];

  try {
    return JSON.parse(stored) as ItineraryItem[];
  } catch {
    return [];
  }
}

export async function getItineraryItems(groupId: string) {
  const { data, error } = await supabase
    .from('itinerary_items')
    .select('*')
    .eq('group_id', groupId)
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) throw error;

  const items = (data ?? []).map((row) => toItem(row as ItineraryRow));
  cacheItems(groupId, items);
  return items;
}

export async function seedItineraryItemsIfEmpty(groupId: string) {
  const userId = await getCurrentUserId();
  const { count, error } = await supabase
    .from('itinerary_items')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId);

  if (error) throw error;
  if ((count ?? 0) > 0) return;

  const { error: insertError } = await supabase.from('itinerary_items').insert(
    defaultItineraryItems.map((item, index) => ({
      ...toPayload(item, index),
      group_id: groupId,
      created_by: userId,
    })),
  );

  if (insertError) throw insertError;
}

export async function createItineraryItem(groupId: string, item: ItineraryItem, orderIndex: number) {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('itinerary_items')
    .insert({
      ...toPayload(item, orderIndex),
      group_id: groupId,
      created_by: userId,
    })
    .select('*')
    .single();

  if (error) throw error;
  return toItem(data as ItineraryRow);
}

export async function updateItineraryItem(groupId: string, id: string, item: ItineraryItem) {
  const { data, error } = await supabase
    .from('itinerary_items')
    .update(toPayload(item))
    .eq('group_id', groupId)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return toItem(data as ItineraryRow);
}

export async function updateItineraryItemCompleted(groupId: string, id: string, completed: boolean) {
  const { error } = await supabase
    .from('itinerary_items')
    .update({ completed })
    .eq('group_id', groupId)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteItineraryItem(groupId: string, id: string) {
  const { error } = await supabase
    .from('itinerary_items')
    .delete()
    .eq('group_id', groupId)
    .eq('id', id);

  if (error) throw error;
}

export async function resetItineraryToDefault(groupId: string) {
  const userId = await getCurrentUserId();
  const { error: deleteError } = await supabase
    .from('itinerary_items')
    .delete()
    .eq('group_id', groupId);

  if (deleteError) throw deleteError;

  const { data, error } = await supabase
    .from('itinerary_items')
    .insert(
      defaultItineraryItems.map((item, index) => ({
        ...toPayload(item, index),
        group_id: groupId,
        created_by: userId,
      })),
    )
    .select('*');

  if (error) throw error;

  const items = (data ?? []).map((row) => toItem(row as ItineraryRow));
  cacheItems(groupId, items);
  return items;
}

export function cacheItineraryFallback(groupId: string, items: ItineraryItem[]) {
  cacheItems(groupId, items);
}

export function subscribeItineraryItems(groupId: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`itinerary-sync-${groupId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'itinerary_items', filter: `group_id=eq.${groupId}` },
      onChange,
    )
    .subscribe();
}
