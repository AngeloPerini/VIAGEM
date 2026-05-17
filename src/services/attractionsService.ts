import type { RealtimeChannel } from '@supabase/supabase-js';
import { defaultAttractions } from '../data/defaultAttractions';
import { ATTRACTION_LIST_STORAGE_KEY, ATTRACTION_STORAGE_KEY } from '../data/attractions';
import type { Attraction, AttractionStateMap, CountryId, LinkItem } from '../types';
import { compressImageToBlob } from '../utils/imageCompression';
import { normalizeLinks } from '../utils/links';
import { supabase } from './supabaseClient';

const PHOTO_BUCKET = 'attraction-photos';

type AttractionRow = {
  id: string;
  name: string;
  country: string;
  city: string | null;
  day: string | null;
  time: string | null;
  description: string | null;
  visited: boolean | null;
  photo_url: string | null;
  links: LinkItem[] | null;
  order_index: number | null;
};

export type AttractionSyncPayload = {
  items: Attraction[];
  states: AttractionStateMap;
};

const cacheAttractions = ({ items, states }: AttractionSyncPayload) => {
  localStorage.setItem(ATTRACTION_LIST_STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(ATTRACTION_STORAGE_KEY, JSON.stringify(states));
};

const toAttraction = (row: AttractionRow): Attraction => ({
  id: row.id,
  name: row.name,
  country: row.country as CountryId,
  city: row.city ?? '',
  day: row.day ?? '',
  time: row.time ?? '',
  description: row.description ?? '',
  links: Array.isArray(row.links) ? row.links : [],
});

const toPayload = (attraction: Attraction, orderIndex?: number) => ({
  name: attraction.name,
  country: attraction.country,
  city: attraction.city || null,
  day: attraction.day || null,
  time: attraction.time || null,
  description: attraction.description || null,
  links: normalizeLinks(attraction.links),
  order_index: orderIndex,
});

const rowsToPayload = (rows: AttractionRow[]): AttractionSyncPayload => {
  const items = rows.map(toAttraction);
  const states = rows.reduce<AttractionStateMap>((map, row) => {
    map[row.id] = {
      visited: row.visited ?? false,
      photo: row.photo_url ?? undefined,
      updatedAt: Date.now(),
    };
    return map;
  }, {});

  return { items, states };
};

export function getCachedAttractions(): AttractionSyncPayload {
  const storedItems = localStorage.getItem(ATTRACTION_LIST_STORAGE_KEY);
  const storedStates = localStorage.getItem(ATTRACTION_STORAGE_KEY);

  try {
    return {
      items: storedItems ? (JSON.parse(storedItems) as Attraction[]) : defaultAttractions,
      states: storedStates ? (JSON.parse(storedStates) as AttractionStateMap) : {},
    };
  } catch {
    return { items: defaultAttractions, states: {} };
  }
}

export async function getAttractions() {
  const { data, error } = await supabase
    .from('attractions')
    .select('*')
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) throw error;

  const payload = rowsToPayload((data ?? []) as AttractionRow[]);
  cacheAttractions(payload);
  return payload;
}

export async function seedAttractionsIfEmpty() {
  const { count, error } = await supabase
    .from('attractions')
    .select('id', { count: 'exact', head: true });

  if (error) throw error;
  if ((count ?? 0) > 0) return;

  const { error: insertError } = await supabase
    .from('attractions')
    .insert(defaultAttractions.map((attraction, index) => toPayload(attraction, index)));

  if (insertError) throw insertError;
}

export async function createAttraction(attraction: Attraction, visited: boolean, orderIndex: number) {
  const { data, error } = await supabase
    .from('attractions')
    .insert({ ...toPayload(attraction, orderIndex), visited })
    .select('*')
    .single();

  if (error) throw error;
  return rowsToPayload([data as AttractionRow]);
}

export async function updateAttraction(attraction: Attraction, visited?: boolean) {
  const { data, error } = await supabase
    .from('attractions')
    .update({ ...toPayload(attraction), ...(visited === undefined ? {} : { visited }) })
    .eq('id', attraction.id)
    .select('*')
    .single();

  if (error) throw error;
  return rowsToPayload([data as AttractionRow]);
}

export async function updateAttractionVisit(id: string, visited: boolean) {
  const { error } = await supabase.from('attractions').update({ visited }).eq('id', id);
  if (error) throw error;
}

export async function deleteAttractionPhoto(attractionId: string) {
  await supabase.storage.from(PHOTO_BUCKET).remove([`attractions/${attractionId}/photo.jpg`]);
  const { error } = await supabase
    .from('attractions')
    .update({ photo_url: null })
    .eq('id', attractionId);

  if (error) throw error;
}

export async function uploadAttractionPhoto(attractionId: string, file: File) {
  const blob = await compressImageToBlob(file);
  const path = `attractions/${attractionId}/photo.jpg`;

  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });

  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);

  const photoUrl = `${publicUrl}?v=${Date.now()}`;
  const { error: updateError } = await supabase
    .from('attractions')
    .update({ photo_url: photoUrl })
    .eq('id', attractionId);

  if (updateError) throw updateError;
  return photoUrl;
}

export async function deleteAttraction(id: string, photoUrl?: string) {
  if (photoUrl) {
    await supabase.storage.from(PHOTO_BUCKET).remove([`attractions/${id}/photo.jpg`]);
  }

  const { error } = await supabase.from('attractions').delete().eq('id', id);
  if (error) throw error;
}

export async function resetAttractionsToDefault() {
  const { data: currentRows } = await supabase.from('attractions').select('id, photo_url');

  if (currentRows?.length) {
    await supabase.storage
      .from(PHOTO_BUCKET)
      .remove(currentRows.map((row) => `attractions/${row.id}/photo.jpg`));
  }

  const { error: deleteError } = await supabase
    .from('attractions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (deleteError) throw deleteError;

  const { data, error } = await supabase
    .from('attractions')
    .insert(defaultAttractions.map((attraction, index) => toPayload(attraction, index)))
    .select('*');

  if (error) throw error;

  const payload = rowsToPayload((data ?? []) as AttractionRow[]);
  cacheAttractions(payload);
  return payload;
}

export function cacheAttractionsFallback(payload: AttractionSyncPayload) {
  cacheAttractions(payload);
}

export function subscribeAttractions(onChange: () => void): RealtimeChannel {
  return supabase
    .channel('attractions-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attractions' }, onChange)
    .subscribe();
}
