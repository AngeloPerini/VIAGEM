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
  group_id: string;
  created_by: string | null;
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

const listCacheKey = (groupId: string) => `${ATTRACTION_LIST_STORAGE_KEY}-${groupId}`;
const stateCacheKey = (groupId: string) => `${ATTRACTION_STORAGE_KEY}-${groupId}`;

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error('Usuario nao autenticado.');
  return user.id;
}

const cacheAttractions = (groupId: string, { items, states }: AttractionSyncPayload) => {
  localStorage.setItem(listCacheKey(groupId), JSON.stringify(items));
  localStorage.setItem(stateCacheKey(groupId), JSON.stringify(states));
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
  ...(orderIndex === undefined ? {} : { order_index: orderIndex }),
});

const extractStoragePath = (value: string | null | undefined, groupId: string, attractionId: string) => {
  if (!value) return null;

  if (!value.startsWith('http')) {
    return value;
  }

  try {
    const url = new URL(value);
    const markers = [
      `/object/public/${PHOTO_BUCKET}/`,
      `/object/sign/${PHOTO_BUCKET}/`,
    ];
    const marker = markers.find((item) => url.pathname.includes(item));
    if (!marker) return `${groupId}/${attractionId}/photo.jpg`;
    const [, rawPath = ''] = url.pathname.split(marker);
    return decodeURIComponent(rawPath);
  } catch {
    return null;
  }
};

const buildSignedPhotoUrl = async (photoValue: string | null, groupId: string, attractionId: string) => {
  const path = extractStoragePath(photoValue, groupId, attractionId);
  if (!path) return undefined;

  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) {
    return photoValue?.startsWith('http') ? photoValue : undefined;
  }

  return `${data.signedUrl}${data.signedUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
};

const rowsToPayload = async (rows: AttractionRow[], groupId: string): Promise<AttractionSyncPayload> => {
  const items = rows.map(toAttraction);
  const stateEntries = await Promise.all(
    rows.map(async (row) => [
      row.id,
      {
        visited: row.visited ?? false,
        photo: await buildSignedPhotoUrl(row.photo_url, groupId, row.id),
        updatedAt: Date.now(),
      },
    ] as const),
  );

  return { items, states: Object.fromEntries(stateEntries) };
};

export function getCachedAttractions(groupId?: string): AttractionSyncPayload {
  if (!groupId) return { items: [], states: {} };
  const storedItems = localStorage.getItem(listCacheKey(groupId));
  const storedStates = localStorage.getItem(stateCacheKey(groupId));

  try {
    return {
      items: storedItems ? (JSON.parse(storedItems) as Attraction[]) : [],
      states: storedStates ? (JSON.parse(storedStates) as AttractionStateMap) : {},
    };
  } catch {
    return { items: [], states: {} };
  }
}

export async function getAttractions(groupId: string) {
  const { data, error } = await supabase
    .from('attractions')
    .select('*')
    .eq('group_id', groupId)
    .order('order_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) throw error;

  const payload = await rowsToPayload((data ?? []) as AttractionRow[], groupId);
  cacheAttractions(groupId, payload);
  return payload;
}

export async function seedAttractionsIfEmpty(groupId: string) {
  const userId = await getCurrentUserId();
  const { count, error } = await supabase
    .from('attractions')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId);

  if (error) throw error;
  if ((count ?? 0) > 0) return;

  const { error: insertError } = await supabase.from('attractions').insert(
    defaultAttractions.map((attraction, index) => ({
      ...toPayload(attraction, index),
      group_id: groupId,
      created_by: userId,
    })),
  );

  if (insertError) throw insertError;
}

export async function createAttraction(
  groupId: string,
  attraction: Attraction,
  visited: boolean,
  orderIndex: number,
) {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('attractions')
    .insert({
      ...toPayload(attraction, orderIndex),
      visited,
      group_id: groupId,
      created_by: userId,
    })
    .select('*')
    .single();

  if (error) throw error;
  return rowsToPayload([data as AttractionRow], groupId);
}

export async function updateAttraction(groupId: string, id: string, attraction: Attraction, visited?: boolean) {
  const { data, error } = await supabase
    .from('attractions')
    .update({ ...toPayload(attraction), ...(visited === undefined ? {} : { visited }) })
    .eq('group_id', groupId)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return rowsToPayload([data as AttractionRow], groupId);
}

export async function updateAttractionVisit(groupId: string, id: string, visited: boolean) {
  const { error } = await supabase
    .from('attractions')
    .update({ visited })
    .eq('group_id', groupId)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteAttractionPhoto(groupId: string, attractionId: string) {
  const { data } = await supabase
    .from('attractions')
    .select('photo_url')
    .eq('group_id', groupId)
    .eq('id', attractionId)
    .maybeSingle();

  const currentPath = extractStoragePath(data?.photo_url, groupId, attractionId);
  const paths = Array.from(
    new Set([currentPath, `${groupId}/${attractionId}/photo.jpg`].filter((path): path is string => Boolean(path))),
  );

  if (paths.length) {
    await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  }

  const { error } = await supabase
    .from('attractions')
    .update({ photo_url: null })
    .eq('group_id', groupId)
    .eq('id', attractionId);

  if (error) throw error;
}

export async function uploadAttractionPhoto(groupId: string, attractionId: string, file: File) {
  const blob = await compressImageToBlob(file);
  const path = `${groupId}/${attractionId}/photo.jpg`;

  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });

  if (error) throw error;

  const { error: updateError } = await supabase
    .from('attractions')
    .update({ photo_url: path })
    .eq('group_id', groupId)
    .eq('id', attractionId);

  if (updateError) throw updateError;
  return buildSignedPhotoUrl(path, groupId, attractionId);
}

export async function deleteAttraction(groupId: string, id: string, photoUrl?: string) {
  const { data } = await supabase
    .from('attractions')
    .select('photo_url')
    .eq('group_id', groupId)
    .eq('id', id)
    .maybeSingle();
  const currentPath = extractStoragePath(data?.photo_url ?? photoUrl, groupId, id);

  if (currentPath) {
    await supabase.storage.from(PHOTO_BUCKET).remove([currentPath]);
  }

  const { error } = await supabase.from('attractions').delete().eq('group_id', groupId).eq('id', id);
  if (error) throw error;
}

export async function resetAttractionsToDefault(groupId: string) {
  const userId = await getCurrentUserId();
  const { data: currentRows } = await supabase
    .from('attractions')
    .select('id, photo_url')
    .eq('group_id', groupId);

  const paths =
    currentRows
      ?.map((row) => extractStoragePath(row.photo_url, groupId, row.id))
      .filter((path): path is string => Boolean(path)) ?? [];

  if (paths.length) {
    await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  }

  const { error: deleteError } = await supabase
    .from('attractions')
    .delete()
    .eq('group_id', groupId);

  if (deleteError) throw deleteError;

  const { data, error } = await supabase
    .from('attractions')
    .insert(
      defaultAttractions.map((attraction, index) => ({
        ...toPayload(attraction, index),
        group_id: groupId,
        created_by: userId,
      })),
    )
    .select('*');

  if (error) throw error;

  const payload = await rowsToPayload((data ?? []) as AttractionRow[], groupId);
  cacheAttractions(groupId, payload);
  return payload;
}

export function cacheAttractionsFallback(groupId: string, payload: AttractionSyncPayload) {
  cacheAttractions(groupId, payload);
}

export function subscribeAttractions(groupId: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`attractions-sync-${groupId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'attractions', filter: `group_id=eq.${groupId}` },
      onChange,
    )
    .subscribe();
}
