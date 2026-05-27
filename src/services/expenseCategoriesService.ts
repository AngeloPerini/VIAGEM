import type { RealtimeChannel } from '@supabase/supabase-js';
import { categories as defaultExpenseCategories, STORAGE_KEY } from '../data/initialExpenses';
import type { CategoryMeta } from '../types';
import { inferExpenseCategoryIconId } from '../utils/expenseCategoryIcons';
import { notifyGroupMembers } from './notificationsService';
import { supabase } from './supabaseClient';

export type ExpenseCategoryInput = {
  name: string;
  label: string;
  accent: string;
  sortOrder: number;
  icon?: string;
};

type ExpenseCategoryRow = {
  id: string;
  group_id: string;
  category_key: string;
  name: string;
  label: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number | null;
  is_protected: boolean | null;
};

export class ExpenseCategoryHasExpensesError extends Error {
  count: number;

  constructor(count: number) {
    super('Esta categoria possui gastos vinculados.');
    this.name = 'ExpenseCategoryHasExpensesError';
    this.count = count;
  }
}

const DEFAULT_ACCENT = '#475569';
const OUTROS_CATEGORY_ID = 'Outros';

const cacheKey = (groupId: string) => `${STORAGE_KEY}-categories-${groupId}`;

const defaultCategories = () =>
  defaultExpenseCategories.map((category, index) => ({
    ...category,
    icon: category.icon ?? inferExpenseCategoryIconId(category),
    sortOrder: (index + 1) * 10,
    isProtected: category.id === OUTROS_CATEGORY_ID,
  }));

const normalizeCategoryMeta = (category: CategoryMeta): CategoryMeta => ({
  ...category,
  icon: category.icon ?? inferExpenseCategoryIconId(category),
  isProtected: category.id === OUTROS_CATEGORY_ID,
});

const toCategory = (row: ExpenseCategoryRow): CategoryMeta => ({
  id: row.category_key,
  rowId: row.id,
  name: row.name,
  label: row.label ?? 'Gasto',
  accent: row.color ?? DEFAULT_ACCENT,
  icon: row.icon ?? inferExpenseCategoryIconId({ id: row.category_key, name: row.name, icon: undefined }),
  sortOrder: row.sort_order ?? 0,
  isProtected: row.category_key === OUTROS_CATEGORY_ID,
});

const sortCategories = (categories: CategoryMeta[]) =>
  [...categories].sort((a, b) => {
    const order = (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999);
    if (order !== 0) return order;
    return a.name.localeCompare(b.name, 'pt-BR');
  });

const cacheCategories = (groupId: string, categories: CategoryMeta[]) => {
  localStorage.setItem(cacheKey(groupId), JSON.stringify(sortCategories(categories.map(normalizeCategoryMeta))));
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

const normalizeColor = (value: string) => (/^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_ACCENT);

const normalizeInput = (input: ExpenseCategoryInput) => ({
  name: input.name.trim(),
  label: input.label.trim() || 'Gasto',
  color: normalizeColor(input.accent),
  icon: input.icon?.trim() || null,
  sort_order: Number.isFinite(input.sortOrder) ? input.sortOrder : 999,
});

const slugifyCategoryName = (name: string) => {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `categoria-${Date.now()}`;
};

async function getUniqueCategoryKey(groupId: string, name: string) {
  const baseKey = slugifyCategoryName(name);
  const { data, error } = await supabase
    .from('expense_categories')
    .select('category_key')
    .eq('group_id', groupId);

  if (error) throw error;

  const existingKeys = new Set((data ?? []).map((row) => String(row.category_key)));
  if (!existingKeys.has(baseKey)) return baseKey;

  let suffix = 2;
  while (existingKeys.has(`${baseKey}-${suffix}`)) suffix += 1;
  return `${baseKey}-${suffix}`;
}

async function notifyExpenseCategoriesChanged(groupId: string, message: string) {
  await notifyGroupMembers({
    groupId,
    type: 'expense_updated',
    title: 'Categorias de gastos atualizadas',
    message,
  }).catch(() => null);
}

async function seedMissingExpenseCategories(groupId: string, knownCategoryKeys: Set<string>) {
  const { data, error } = await supabase
    .from('expenses')
    .select('category')
    .eq('group_id', groupId);

  if (error) throw error;

  const missingCategoryKeys = Array.from(
    new Set(
      (data ?? [])
        .map((row) => String(row.category ?? '').trim())
        .filter((categoryKey) => categoryKey && !knownCategoryKeys.has(categoryKey)),
    ),
  );

  if (!missingCategoryKeys.length) return false;

  const userId = await getCurrentUserId();
  const { error: insertError } = await supabase.from('expense_categories').upsert(
    missingCategoryKeys.map((categoryKey, index) => ({
      group_id: groupId,
      category_key: categoryKey,
      name: categoryKey,
      label: 'Gasto',
      color: DEFAULT_ACCENT,
      icon: inferExpenseCategoryIconId({ id: categoryKey, name: categoryKey, icon: undefined }),
      sort_order: 1000 + index,
      is_protected: false,
      created_by: userId,
    })),
    { onConflict: 'group_id,category_key', ignoreDuplicates: true },
  );

  if (insertError) throw insertError;
  return true;
}

export function getCachedExpenseCategories(groupId?: string) {
  if (!groupId) return defaultCategories();

  const stored = localStorage.getItem(cacheKey(groupId));
  if (!stored) return defaultCategories();

  try {
    const parsed = JSON.parse(stored) as CategoryMeta[];
    return sortCategories(parsed.length ? parsed.map(normalizeCategoryMeta) : defaultCategories());
  } catch {
    return defaultCategories();
  }
}

export function cacheExpenseCategoriesFallback(groupId: string, categories: CategoryMeta[]) {
  cacheCategories(groupId, categories);
}

export async function seedExpenseCategories(groupId: string) {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from('expense_categories').upsert(
    defaultCategories().map((category) => ({
      group_id: groupId,
      category_key: category.id,
      name: category.name,
      label: category.label,
      color: category.accent,
      icon: category.icon ?? inferExpenseCategoryIconId(category),
      sort_order: category.sortOrder ?? 999,
      is_protected: category.isProtected ?? false,
      created_by: userId,
    })),
    { onConflict: 'group_id,category_key', ignoreDuplicates: true },
  );

  if (error) throw error;
}

export async function getExpenseCategories(groupId: string) {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('id, group_id, category_key, name, label, color, icon, sort_order, is_protected')
    .eq('group_id', groupId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;

  if (!data?.length) {
    await seedExpenseCategories(groupId);
    return getExpenseCategories(groupId);
  }

  const knownCategoryKeys = new Set((data as ExpenseCategoryRow[]).map((row) => row.category_key));
  const addedMissingCategories = await seedMissingExpenseCategories(groupId, knownCategoryKeys);
  if (addedMissingCategories) return getExpenseCategories(groupId);

  const categories = sortCategories((data as ExpenseCategoryRow[]).map(toCategory));
  cacheCategories(groupId, categories);
  return categories;
}

export async function createExpenseCategory(groupId: string, input: ExpenseCategoryInput) {
  const normalized = normalizeInput(input);
  if (!normalized.name) throw new Error('Informe o nome da categoria.');

  const userId = await getCurrentUserId();
  const categoryKey = await getUniqueCategoryKey(groupId, normalized.name);
  const { data, error } = await supabase
    .from('expense_categories')
    .insert({
      group_id: groupId,
      category_key: categoryKey,
      name: normalized.name,
      label: normalized.label,
      color: normalized.color,
      icon: normalized.icon,
      sort_order: normalized.sort_order,
      is_protected: false,
      created_by: userId,
    })
    .select('id, group_id, category_key, name, label, color, icon, sort_order, is_protected')
    .single();

  if (error) throw error;
  await notifyExpenseCategoriesChanged(groupId, `Categoria adicionada: ${normalized.name}.`);
  return toCategory(data as ExpenseCategoryRow);
}

export async function updateExpenseCategory(
  groupId: string,
  category: CategoryMeta,
  input: ExpenseCategoryInput,
) {
  const normalized = normalizeInput(input);
  if (!normalized.name) throw new Error('Informe o nome da categoria.');

  let query = supabase
    .from('expense_categories')
    .update({
      name: normalized.name,
      label: normalized.label,
      color: normalized.color,
      icon: normalized.icon,
      sort_order: normalized.sort_order,
    })
    .eq('group_id', groupId);

  query = category.rowId ? query.eq('id', category.rowId) : query.eq('category_key', category.id);

  const { data, error } = await query
    .select('id, group_id, category_key, name, label, color, icon, sort_order, is_protected')
    .single();

  if (error) throw error;
  if (!data) throw new Error('Categoria nao encontrada nesta viagem.');
  await notifyExpenseCategoriesChanged(groupId, `Categoria atualizada: ${normalized.name}.`);
  return toCategory(data as ExpenseCategoryRow);
}

export async function getExpenseCategoryUsage(groupId: string, categoryId: string) {
  const { count, error } = await supabase
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .eq('category', categoryId);

  if (error) throw error;
  return count ?? 0;
}

export async function deleteExpenseCategory(
  groupId: string,
  category: CategoryMeta,
  moveToCategoryId?: string,
) {
  if (category.id === OUTROS_CATEGORY_ID) {
    throw new Error('A categoria Outros precisa existir para receber gastos movidos.');
  }

  const linkedExpenses = await getExpenseCategoryUsage(groupId, category.id);
  if (linkedExpenses > 0) {
    if (!moveToCategoryId) throw new ExpenseCategoryHasExpensesError(linkedExpenses);
    if (moveToCategoryId === category.id) throw new Error('Escolha uma categoria de destino diferente.');

    const { count: targetCount, error: targetError } = await supabase
      .from('expense_categories')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('category_key', moveToCategoryId);

    if (targetError) throw targetError;
    if (!targetCount) throw new Error('Categoria de destino nao encontrada nesta viagem.');

    const { error: moveError } = await supabase
      .from('expenses')
      .update({ category: moveToCategoryId })
      .eq('group_id', groupId)
      .eq('category', category.id);

    if (moveError) throw moveError;
  }

  let query = supabase
    .from('expense_categories')
    .delete()
    .eq('group_id', groupId);

  query = category.rowId ? query.eq('id', category.rowId) : query.eq('category_key', category.id);

  const { error } = await query
    .select('id, name')
    .maybeSingle();

  if (error) throw error;
  await notifyExpenseCategoriesChanged(groupId, `Categoria removida: ${category.name}.`);
}

export function subscribeExpenseCategories(groupId: string, onChange: () => void): RealtimeChannel {
  const topic = `expense-categories-sync-${groupId}`;
  supabase.getChannels()
    .filter((channel) => channel.topic === `realtime:${topic}`)
    .forEach((channel) => {
      void supabase.removeChannel(channel);
    });

  return supabase
    .channel(topic)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expense_categories', filter: `group_id=eq.${groupId}` },
      onChange,
    )
    .subscribe();
}
