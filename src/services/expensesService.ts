import type { RealtimeChannel } from '@supabase/supabase-js';
import { STORAGE_KEY } from '../data/initialExpenses';
import { defaultExpenses } from '../data/defaultExpenses';
import type { CountryId, Expense, LinkItem } from '../types';
import { normalizeLinks } from '../utils/links';
import { supabase } from './supabaseClient';

type ExpenseRow = {
  id: string;
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

const fallbackExpenses = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return defaultExpenses;

  try {
    return JSON.parse(stored) as Expense[];
  } catch {
    return defaultExpenses;
  }
};

const cacheExpenses = (expenses: Expense[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
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

export async function getExpenses() {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;

  const expenses = (data ?? []).map((row) => toExpense(row as ExpenseRow));
  cacheExpenses(expenses);
  return expenses;
}

export async function seedExpensesIfEmpty() {
  const { count, error } = await supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true });

  if (error) throw error;
  if ((count ?? 0) > 0) return;

  const { error: insertError } = await supabase
    .from('expenses')
    .insert(defaultExpenses.map(toExpensePayload));

  if (insertError) throw insertError;
}

export async function createExpense(expense: Expense) {
  const { data, error } = await supabase
    .from('expenses')
    .insert(toExpensePayload(expense))
    .select('*')
    .single();

  if (error) throw error;
  return toExpense(data as ExpenseRow);
}

export async function updateExpense(expense: Expense) {
  const { data, error } = await supabase
    .from('expenses')
    .update(toExpensePayload(expense))
    .eq('id', expense.id)
    .select('*')
    .single();

  if (error) throw error;
  return toExpense(data as ExpenseRow);
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

export async function resetExpensesToDefault() {
  const { error: deleteError } = await supabase
    .from('expenses')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (deleteError) throw deleteError;

  const { data, error } = await supabase
    .from('expenses')
    .insert(defaultExpenses.map(toExpensePayload))
    .select('*');

  if (error) throw error;

  const expenses = (data ?? []).map((row) => toExpense(row as ExpenseRow));
  cacheExpenses(expenses);
  return expenses;
}

export function getCachedExpenses() {
  return fallbackExpenses();
}

export function cacheExpensesFallback(expenses: Expense[]) {
  cacheExpenses(expenses);
}

export function subscribeExpenses(onChange: () => void): RealtimeChannel {
  const channel = supabase
    .channel('expenses-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, onChange)
    .subscribe();

  return channel;
}
