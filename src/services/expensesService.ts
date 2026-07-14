import type { RealtimeChannel } from '@supabase/supabase-js';
import { defaultExpenses } from '../data/defaultExpenses';
import { STORAGE_KEY } from '../data/initialExpenses';
import { normalizeCountryId } from '../data/countries';
import type { CountryId, Expense, LinkItem, TravelCurrencyCode } from '../types';
import { normalizeLinks } from '../utils/links';
import { notifyGroupMembers } from './notificationsService';
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
  currency: string | null;
  amount: number | null;
  links: LinkItem[] | null;
  created_at?: string;
};

const normalizeCurrency = (value: unknown): TravelCurrencyCode => {
  const currency = String(value ?? 'EUR').toUpperCase();
  return ['BRL', 'EUR', 'USD', 'JPY', 'CHF', 'GBP'].includes(currency)
    ? currency as TravelCurrencyCode
    : 'EUR';
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  currency: normalizeCurrency(row.currency),
  amount: Number(row.amount ?? row.euro_min ?? row.brl_min ?? 0),
  euro: { min: Number(row.euro_min ?? 0), max: Number(row.euro_max ?? row.euro_min ?? 0) },
  real: { min: Number(row.brl_min ?? 0), max: Number(row.brl_max ?? row.brl_min ?? 0) },
  links: Array.isArray(row.links) ? row.links : [],
  createdAt: row.created_at,
});

const toExpensePayload = (expense: Expense) => {
  const euroMin = toFiniteNumber(expense.euro?.min);
  const euroMax = toFiniteNumber(expense.euro?.max, euroMin);
  const brlMin = toFiniteNumber(expense.real?.min);
  const brlMax = toFiniteNumber(expense.real?.max, brlMin);
  const currency = normalizeCurrency(expense.currency);
  const amountFallback = currency === 'BRL' ? brlMin : euroMin;

  return {
    category: expense.category,
    country: normalizeCountryId(expense.country ?? 'international'),
    description: expense.title,
    details: expense.detail || null,
    currency,
    amount: toFiniteNumber(expense.amount, amountFallback),
    euro_min: euroMin,
    euro_max: euroMax,
    brl_min: brlMin,
    brl_max: brlMax,
    links: normalizeLinks(expense.links),
  };
};

const notifyExpensesChanged = async (groupId: string, detail = 'Os gastos da viagem foram atualizados.') => {
  await notifyGroupMembers({
    groupId,
    type: 'expense_updated',
    title: 'Gastos atualizados',
    message: detail,
  }).catch(() => null);
};

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
  await notifyExpensesChanged(groupId, `Novo gasto adicionado: ${expense.title}.`);
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
  if (!data) throw new Error('Gasto nao encontrado nesta viagem.');
  await notifyExpensesChanged(groupId, `Gasto atualizado: ${expense.title}.`);
  return toExpense(data as ExpenseRow);
}

export async function deleteExpense(groupId: string, id: string) {
  const { data, error } = await supabase
    .from('expenses')
    .delete()
    .eq('group_id', groupId)
    .eq('id', id)
    .select('id, description')
    .single();

  if (error) throw error;
  if (!data) throw new Error('Gasto nao encontrado nesta viagem.');
  const deletedTitle = typeof data.description === 'string' && data.description.trim()
    ? data.description.trim()
    : 'Um gasto';
  await notifyExpensesChanged(groupId, `Gasto removido: ${deletedTitle}.`);
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
  await notifyExpensesChanged(groupId, 'Os gastos da viagem foram redefinidos.');
  return expenses;
}

export function getCachedExpenses(groupId?: string) {
  return fallbackExpenses(groupId);
}

export function cacheExpensesFallback(groupId: string, expenses: Expense[]) {
  cacheExpenses(groupId, expenses);
}

export function subscribeExpenses(groupId: string, onChange: () => void): RealtimeChannel {
  const topic = `expenses-sync-${groupId}`;
  supabase.getChannels()
    .filter((channel) => channel.topic === `realtime:${topic}`)
    .forEach((channel) => {
      void supabase.removeChannel(channel);
    });

  return supabase
    .channel(topic)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expenses', filter: `group_id=eq.${groupId}` },
      onChange,
    )
    .subscribe();
}
