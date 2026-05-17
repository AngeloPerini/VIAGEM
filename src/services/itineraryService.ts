import type { RealtimeChannel } from '@supabase/supabase-js';
import { defaultItineraryItems } from '../data/defaultItinerary';
import { ITINERARY_STORAGE_KEY } from '../data/itinerary';
import type { CountryId, ItineraryItem, ItineraryType, LinkItem } from '../types';
import { normalizeLinks } from '../utils/links';
import { supabase } from './supabaseClient';

type ItineraryRow = {
  id: string;
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

const cacheItems = (items: ItineraryItem[]) => {
  localStorage.setItem(ITINERARY_STORAGE_KEY, JSON.stringify(items));
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
  country: item.country,
  city: item.city || null,
  time: item.time || null,
  title: item.title,
  description: item.description || null,
  type: item.type,
  completed: item.completed ?? false,
  links: normalizeLinks(item.links),
  order_index: orderIndex,
});

export function getCachedItineraryItems() {
  const stored = localStorage.getItem(ITINERARY_STORAGE_KEY);
  if (!stored) return defaultItineraryItems;

  try {
    return JSON.parse(stored) as ItineraryItem[];
  } catch {
    return defaultItineraryItems;
  }
}

export async function getItineraryItems() {
  const { data, error } = await supabase
    .from('itinerary_items')
    .select('*')
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) throw error;

  const items = (data ?? []).map((row) => toItem(row as ItineraryRow));
  cacheItems(items);
  return items;
}

export async function seedItineraryItemsIfEmpty() {
  const { count, error } = await supabase
    .from('itinerary_items')
    .select('id', { count: 'exact', head: true });

  if (error) throw error;
  if ((count ?? 0) > 0) return;

  const { error: insertError } = await supabase
    .from('itinerary_items')
    .insert(defaultItineraryItems.map((item, index) => toPayload(item, index)));

  if (insertError) throw insertError;
}

export async function createItineraryItem(item: ItineraryItem, orderIndex: number) {
  const { data, error } = await supabase
    .from('itinerary_items')
    .insert(toPayload(item, orderIndex))
    .select('*')
    .single();

  if (error) throw error;
  return toItem(data as ItineraryRow);
}

export async function updateItineraryItem(item: ItineraryItem) {
  const { data, error } = await supabase
    .from('itinerary_items')
    .update(toPayload(item))
    .eq('id', item.id)
    .select('*')
    .single();

  if (error) throw error;
  return toItem(data as ItineraryRow);
}

export async function updateItineraryItemCompleted(id: string, completed: boolean) {
  const { error } = await supabase.from('itinerary_items').update({ completed }).eq('id', id);
  if (error) throw error;
}

export async function deleteItineraryItem(id: string) {
  const { error } = await supabase.from('itinerary_items').delete().eq('id', id);
  if (error) throw error;
}

export async function resetItineraryToDefault() {
  const { error: deleteError } = await supabase
    .from('itinerary_items')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (deleteError) throw deleteError;

  const { data, error } = await supabase
    .from('itinerary_items')
    .insert(defaultItineraryItems.map((item, index) => toPayload(item, index)))
    .select('*');

  if (error) throw error;

  const items = (data ?? []).map((row) => toItem(row as ItineraryRow));
  cacheItems(items);
  return items;
}

export function cacheItineraryFallback(items: ItineraryItem[]) {
  cacheItems(items);
}

export function subscribeItineraryItems(onChange: () => void): RealtimeChannel {
  return supabase
    .channel('itinerary-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_items' }, onChange)
    .subscribe();
}
