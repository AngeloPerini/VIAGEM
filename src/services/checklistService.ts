import type { RealtimeChannel } from '@supabase/supabase-js';
import type { TripChecklistItem, TripChecklistItemCategory } from '../types';
import { supabase } from './supabaseClient';

export const checklistCategories: TripChecklistItemCategory[] = [
  'Documentos',
  'Roupas',
  'Higiene',
  'Eletronicos',
  'Remedios',
  'Utensilios',
  'Acessorios',
  'Outros',
];

export const checklistCategoryLabels: Record<TripChecklistItemCategory, string> = {
  Documentos: 'Documentos',
  Roupas: 'Roupas',
  Higiene: 'Higiene',
  Eletronicos: 'Eletrônicos',
  Remedios: 'Remédios',
  Utensilios: 'Utensílios',
  Acessorios: 'Acessórios',
  Outros: 'Outros',
};

export type TripChecklistItemInput = {
  title: string;
  category: TripChecklistItemCategory;
  notes?: string;
  quantity: number;
  assignedTo?: string;
  checked?: boolean;
};

type TripChecklistItemRow = {
  id: string;
  group_id: string;
  created_by: string;
  assigned_to: string | null;
  title: string;
  category: string;
  notes: string | null;
  quantity: number | null;
  checked: boolean | null;
  created_at: string;
  updated_at: string;
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

const normalizeCategory = (value: string | undefined): TripChecklistItemCategory =>
  checklistCategories.includes(value as TripChecklistItemCategory)
    ? value as TripChecklistItemCategory
    : 'Outros';

const toChecklistItem = (row: TripChecklistItemRow): TripChecklistItem => ({
  id: row.id,
  groupId: row.group_id,
  createdBy: row.created_by,
  assignedTo: row.assigned_to ?? undefined,
  title: row.title,
  category: normalizeCategory(row.category),
  notes: row.notes ?? undefined,
  quantity: Number(row.quantity ?? 1),
  checked: Boolean(row.checked),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toPayload = (input: TripChecklistItemInput) => ({
  assigned_to: input.assignedTo || null,
  title: input.title.trim(),
  category: normalizeCategory(input.category),
  notes: input.notes?.trim() || null,
  quantity: Math.max(1, Math.trunc(Number(input.quantity) || 1)),
  ...(input.checked === undefined ? {} : { checked: input.checked }),
});

export async function getTripChecklistItems(groupId: string) {
  const { data, error } = await supabase
    .from('trip_checklist_items')
    .select('*')
    .eq('group_id', groupId)
    .order('checked', { ascending: true })
    .order('category', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as TripChecklistItemRow[]).map(toChecklistItem);
}

export async function createTripChecklistItem(groupId: string, input: TripChecklistItemInput) {
  const userId = await getCurrentUserId();
  const payload = toPayload(input);
  if (!payload.title) throw new Error('Informe o item do checklist.');

  const { data, error } = await supabase
    .from('trip_checklist_items')
    .insert({
      ...payload,
      group_id: groupId,
      created_by: userId,
      checked: input.checked ?? false,
    })
    .select('*')
    .single();

  if (error) throw error;
  return toChecklistItem(data as TripChecklistItemRow);
}

export async function updateTripChecklistItem(groupId: string, itemId: string, input: TripChecklistItemInput) {
  const payload = toPayload(input);
  if (!payload.title) throw new Error('Informe o item do checklist.');

  const { data, error } = await supabase
    .from('trip_checklist_items')
    .update(payload)
    .eq('group_id', groupId)
    .eq('id', itemId)
    .select('*')
    .single();

  if (error) throw error;
  if (!data) throw new Error('Item nao encontrado nesta viagem.');
  return toChecklistItem(data as TripChecklistItemRow);
}

export async function setTripChecklistItemChecked(groupId: string, itemId: string, checked: boolean) {
  const { data, error } = await supabase
    .from('trip_checklist_items')
    .update({ checked })
    .eq('group_id', groupId)
    .eq('id', itemId)
    .select('*')
    .single();

  if (error) throw error;
  if (!data) throw new Error('Item nao encontrado nesta viagem.');
  return toChecklistItem(data as TripChecklistItemRow);
}

export async function deleteTripChecklistItem(groupId: string, itemId: string) {
  const { error } = await supabase
    .from('trip_checklist_items')
    .delete()
    .eq('group_id', groupId)
    .eq('id', itemId);

  if (error) throw error;
}

export function subscribeTripChecklistItems(groupId: string, onChange: () => void): RealtimeChannel {
  const topic = `trip-checklist-sync-${groupId}`;
  supabase.getChannels()
    .filter((channel) => channel.topic === `realtime:${topic}`)
    .forEach((channel) => {
      void supabase.removeChannel(channel);
    });

  return supabase
    .channel(topic)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trip_checklist_items', filter: `group_id=eq.${groupId}` },
      onChange,
    )
    .subscribe();
}
