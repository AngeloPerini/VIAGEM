import type { CategoryMeta, Expense } from '../types';

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, '0');

const normalizeText = (value?: string | number | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const toLocalDate = (value?: string | null) => {
  if (!value) return null;
  if (DATE_INPUT_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getTodayDateInputValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const toDateInputValue = (value?: string | null) => {
  if (!value) return '';
  if (DATE_INPUT_PATTERN.test(value)) return value;

  const date = toLocalDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const isValidDateInput = (value?: string | null) =>
  Boolean(value && DATE_INPUT_PATTERN.test(value));

const toUtcDay = (value?: string | null) => {
  const normalized = toDateInputValue(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_IN_MS;
};

export const getStayNightCount = (checkInDate?: string | null, checkOutDate?: string | null) => {
  const start = toUtcDay(checkInDate);
  const end = toUtcDay(checkOutDate);
  if (start === null || end === null) return null;

  const nights = Math.round(end - start);
  return nights > 0 ? nights : null;
};

const ACCOMMODATION_KEYWORDS = [
  'lodging',
  'hosped',
  'hotel',
  'airbnb',
  'acomod',
  'accommodation',
  'hostel',
  'pousada',
];

export const isAccommodationCategory = (
  categoryId?: string | null,
  categories: CategoryMeta[] = [],
) => {
  const category = categories.find((item) => item.id === categoryId);
  const haystack = normalizeText([
    categoryId,
    category?.name,
    category?.label,
  ].filter(Boolean).join(' '));

  return ACCOMMODATION_KEYWORDS.some((keyword) => haystack.includes(keyword));
};

export const isAccommodationExpense = (
  expense: Pick<Expense, 'category'>,
  categories: CategoryMeta[] = [],
) => isAccommodationCategory(expense.category, categories);

export const getExpensePrimaryDate = (expense: Expense, categories: CategoryMeta[] = []) => {
  if (isAccommodationExpense(expense, categories)) {
    const checkInDate = toDateInputValue(expense.checkInDate);
    if (checkInDate) return checkInDate;
  }

  return toDateInputValue(expense.expenseDate) || toDateInputValue(expense.createdAt);
};

export const getExpensePrimaryTimestamp = (expense: Expense, categories: CategoryMeta[] = []) => {
  const date = getExpensePrimaryDate(expense, categories);
  if (!date) return 0;

  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
};

export const getDateInputTimestamp = (value: string, endOfDay = false) => {
  if (!value) return null;
  const normalized = toDateInputValue(value);
  if (!normalized) return null;

  const [year, month, day] = normalized.split('-').map(Number);
  const timestamp = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  ).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const formatExpenseDateLabel = (
  value?: string | null,
  style: 'short' | 'numeric' = 'numeric',
) => {
  const date = toLocalDate(value);
  if (!date) return 'Sem data';

  const options: Intl.DateTimeFormatOptions = style === 'short'
    ? { day: '2-digit', month: 'short' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' };

  return new Intl.DateTimeFormat('pt-BR', options).format(date);
};

export const getExpenseDateDisplay = (expense: Expense, categories: CategoryMeta[] = []) => {
  if (isAccommodationExpense(expense, categories)) {
    const checkInDate = toDateInputValue(expense.checkInDate);
    const checkOutDate = toDateInputValue(expense.checkOutDate);
    const nights = getStayNightCount(checkInDate, checkOutDate);

    if (checkInDate && checkOutDate) {
      return {
        label: `${formatExpenseDateLabel(checkInDate, 'short')} -> ${formatExpenseDateLabel(checkOutDate, 'short')}`,
        detail: nights ? `${nights} ${nights === 1 ? 'noite' : 'noites'}` : 'Hospedagem',
      };
    }

    if (checkInDate) {
      return {
        label: formatExpenseDateLabel(checkInDate, 'short'),
        detail: 'Check-in',
      };
    }
  }

  const primaryDate = getExpensePrimaryDate(expense, categories);
  return {
    label: formatExpenseDateLabel(primaryDate, 'short'),
    detail: 'Data do gasto',
  };
};

export const getExpenseDateExportLabel = (expense: Expense, categories: CategoryMeta[] = []) => {
  if (isAccommodationExpense(expense, categories)) {
    const checkInDate = toDateInputValue(expense.checkInDate);
    const checkOutDate = toDateInputValue(expense.checkOutDate);
    const nights = getStayNightCount(checkInDate, checkOutDate);

    if (checkInDate && checkOutDate) {
      return `${formatExpenseDateLabel(checkInDate)} - ${formatExpenseDateLabel(checkOutDate)}${nights ? ` (${nights} ${nights === 1 ? 'noite' : 'noites'})` : ''}`;
    }
  }

  return formatExpenseDateLabel(getExpensePrimaryDate(expense, categories));
};
