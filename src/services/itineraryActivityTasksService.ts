import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ItineraryActivityTask, ItineraryActivityTaskInput, ItineraryActivityTaskSource } from '../types';
import { supabase } from './supabaseClient';

type ItineraryActivityTaskRow = {
  id: string;
  group_id: string;
  itinerary_item_id: string;
  title: string;
  description: string | null;
  is_completed: boolean | null;
  source: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const validSources: ItineraryActivityTaskSource[] = ['manual', 'ai'];

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error('Usuario nao autenticado.');
  return user.id;
}

const normalizeSource = (value: string | undefined | null): ItineraryActivityTaskSource =>
  validSources.includes(value as ItineraryActivityTaskSource)
    ? value as ItineraryActivityTaskSource
    : 'manual';

const toTask = (row: ItineraryActivityTaskRow): ItineraryActivityTask => ({
  id: row.id,
  groupId: row.group_id,
  itineraryItemId: row.itinerary_item_id,
  title: row.title,
  description: row.description ?? undefined,
  isCompleted: Boolean(row.is_completed),
  source: normalizeSource(row.source),
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toPayload = (input: ItineraryActivityTaskInput, options: { includeSource?: boolean } = {}) => {
  const title = input.title.trim();
  if (!title) throw new Error('Informe o nome da tarefa.');
  if (title.length > 120) throw new Error('A tarefa pode ter no maximo 120 caracteres.');

  const includeSource = options.includeSource ?? true;

  return {
    title,
    description: input.description?.trim() || null,
    ...(input.isCompleted === undefined ? {} : { is_completed: input.isCompleted }),
    ...(includeSource ? { source: normalizeSource(input.source) } : {}),
  };
};

export async function getItineraryActivityTasks(groupId: string) {
  const { data, error } = await supabase
    .from('itinerary_activity_tasks')
    .select('*')
    .eq('group_id', groupId)
    .order('itinerary_item_id', { ascending: true })
    .order('is_completed', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as ItineraryActivityTaskRow[]).map(toTask);
}

export async function createItineraryActivityTask(
  groupId: string,
  itineraryItemId: string,
  input: ItineraryActivityTaskInput,
) {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('itinerary_activity_tasks')
    .insert({
      ...toPayload(input),
      group_id: groupId,
      itinerary_item_id: itineraryItemId,
      created_by: userId,
      is_completed: input.isCompleted ?? false,
    })
    .select('*')
    .single();

  if (error) throw error;
  return toTask(data as ItineraryActivityTaskRow);
}

export async function updateItineraryActivityTask(
  groupId: string,
  taskId: string,
  input: ItineraryActivityTaskInput,
) {
  const { data, error } = await supabase
    .from('itinerary_activity_tasks')
    .update(toPayload(input, { includeSource: false }))
    .eq('group_id', groupId)
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) throw error;
  if (!data) throw new Error('Tarefa nao encontrada nesta viagem.');
  return toTask(data as ItineraryActivityTaskRow);
}

export async function setItineraryActivityTaskCompleted(groupId: string, taskId: string, isCompleted: boolean) {
  const { data, error } = await supabase
    .from('itinerary_activity_tasks')
    .update({ is_completed: isCompleted })
    .eq('group_id', groupId)
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) throw error;
  if (!data) throw new Error('Tarefa nao encontrada nesta viagem.');
  return toTask(data as ItineraryActivityTaskRow);
}

export async function deleteItineraryActivityTask(groupId: string, taskId: string) {
  const { error } = await supabase
    .from('itinerary_activity_tasks')
    .delete()
    .eq('group_id', groupId)
    .eq('id', taskId);

  if (error) throw error;
}

export function subscribeItineraryActivityTasks(groupId: string, onChange: () => void): RealtimeChannel {
  const topic = `itinerary-activity-tasks-sync-${groupId}`;
  supabase.getChannels()
    .filter((channel) => channel.topic === `realtime:${topic}`)
    .forEach((channel) => {
      void supabase.removeChannel(channel);
    });

  return supabase
    .channel(topic)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'itinerary_activity_tasks', filter: `group_id=eq.${groupId}` },
      onChange,
    )
    .subscribe();
}
