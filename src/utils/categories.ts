import type { CategoryMeta, Expense } from '../types';
import { categories as defaultCategories } from '../data/initialExpenses';

const accents = ['#0f766e', '#2563eb', '#db2777', '#7c3aed', '#ea580c', '#0891b2', '#16a34a', '#475569'];

const humanizeCategory = (category: string) =>
  category
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const getCategoryName = (category: string) =>
  defaultCategories.find((item) => item.id === category)?.name ?? humanizeCategory(category);

export const getCategoryLabel = (category: string) =>
  defaultCategories.find((item) => item.id === category)?.label ?? 'Gasto';

export const buildExpenseCategories = (expenses: Expense[]): CategoryMeta[] => {
  const seen = new Set<string>();
  const orderedIds = [
    ...defaultCategories.map((category) => category.id),
    ...expenses.map((expense) => expense.category).filter(Boolean),
  ].filter((category) => {
    if (seen.has(category)) return false;
    seen.add(category);
    return true;
  });

  return orderedIds.map((id, index) => {
    const defaultCategory = defaultCategories.find((category) => category.id === id);
    return {
      id,
      name: defaultCategory?.name ?? humanizeCategory(id),
      label: defaultCategory?.label ?? 'Gasto',
      accent: defaultCategory?.accent ?? accents[index % accents.length],
    };
  });
};
