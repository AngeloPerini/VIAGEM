import type { RealtimeChannel } from '@supabase/supabase-js';
import { defaultExpenses } from '../data/defaultExpenses';
import { STORAGE_KEY } from '../data/initialExpenses';
import type { CountryId, Expense, LinkItem } from '../types';
import { normalizeLinks } from '../utils/links';
import { supabase } from './supabaseClient';

type ExpenseRow = {
  id: string;
  group_id: string;
  created_by: string | null;
  category: string;
  country: string;
  description: string;
  details: string | null;
  euro_min: number | null;
  euro_max: number | null;
  brl_min: number | null;
  brl_max: number | null;
  links: LinkItem[] | null;
  created_at?: string;
};

const cacheKey = (groupId: string) => `${STORAGE_KEY}-${groupId}`;

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error('Usuario nao autenticado.');
  return user.id;
}

const fallbackExpenses = (groupId?: string) => {
  if (!groupId) return [];
  const stored = localStorage.getItem(cacheKey(groupId));
  if (!stored) return [];

  try {
    return JSON.parse(stored) as Expense[];
  } catch {
    return [];
  }
};

const cacheExpenses = (groupId: string, expenses: Expense[]) => {
  localStorage.setItem(cacheKey(groupId), JSON.stringify(expenses));
};

const toExpense = (row: ExpenseRow): Expense => ({
  id: row.id,
  category: row.category,
  country: row.country as CountryId,
  title: row.description,
  detail: row.details ?? '',
  euro: { min: Number(row.euro_min ?? 0), max: Number(row.euro_max ?? row.euro_min ?? 0) },
  real: { min: Number(row.brl_min ?? 0), max: Number(row.brl_max ?? row.brl_min ?? 0) },
  links: Array.isArray(row.links) ? row.links : [],
});

const toExpensePayload = (expense: Expense) => ({
  category: expense.category,
  country: expense.country ?? 'italy',
  description: expense.title,
  details: expense.detail || null,
  euro_min: expense.euro.min,
  euro_max: expense.euro.max,
  brl_min: expense.real.min,
  brl_max: expense.real.max,
  links: normalizeLinks(expense.links),
});

export async function getExpenses(groupId: string) {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const expenses = (data ?? []).map((row) => toExpense(row as ExpenseRow));
  cacheExpenses(groupId, expenses);
  return expenses;
}

export async function seedExpensesIfEmpty(groupId: string) {
  const userId = await getCurrentUserId();
  const { count, error } = await supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId);

  if (error) throw error;
  if ((count ?? 0) > 0) return;

  const { error: insertError } = await supabase.from('expenses').insert(
    defaultExpenses.map((expense) => ({
      ...toExpensePayload(expense),
      group_id: groupId,
      created_by: userId,
    })),
  );

  if (insertError) throw insertError;
}

export async function createExpense(groupId: string, expense: Expense) {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      ...toExpensePayload(expense),
      group_id: groupId,
      created_by: userId,
    })
    .select('*')
    .single();

  if (error) throw error;
  return toExpense(data as ExpenseRow);
}

export async function updateExpense(groupId: string, id: string, expense: Expense) {
  const { data, error } = await supabase
    .from('expenses')
    .update(toExpensePayload(expense))
    .eq('group_id', groupId)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return toExpense(data as ExpenseRow);
}

export async function deleteExpense(groupId: string, id: string) {
  const { error } = await supabase.from('expenses').delete().eq('group_id', groupId).eq('id', id);
  if (error) throw error;
}

export async function resetExpensesToDefault(groupId: string) {
  const userId = await getCurrentUserId();
  const { error: deleteError } = await supabase.from('expenses').delete().eq('group_id', groupId);

  if (deleteError) throw deleteError;

  const { data, error } = await supabase
    .from('expenses')
    .insert(
      defaultExpenses.map((expense) => ({
        ...toExpensePayload(expense),
        group_id: groupId,
        created_by: userId,
      })),
    )
    .select('*');

  if (error) throw error;

  const expenses = (data ?? []).map((row) => toExpense(row as ExpenseRow));
  cacheExpenses(groupId, expenses);
  return expenses;
}

export function getCachedExpenses(groupId?: string) {
  return fallbackExpenses(groupId);
}

export function cacheExpensesFallback(groupId: string, expenses: Expense[]) {
  cacheExpenses(groupId, expenses);
}

export function subscribeExpenses(groupId: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`expenses-sync-${groupId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expenses', filter: `group_id=eq.${groupId}` },
      onChange,
    )
    .subscribe();
}
