export const INVALID_DATE_RANGE_MESSAGE = 'A data final não pode ser anterior à data inicial.';

export const parseDateOnlyTimestamp = (value?: string | null) => {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    Number.isNaN(timestamp) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
};

export const isDateRangeInvalid = (startDate?: string | null, endDate?: string | null) => {
  const start = parseDateOnlyTimestamp(startDate);
  const end = parseDateOnlyTimestamp(endDate);

  return start !== null && end !== null && end < start;
};

export const assertValidDateRange = (startDate?: string | null, endDate?: string | null) => {
  if (isDateRangeInvalid(startDate, endDate)) {
    throw new Error(INVALID_DATE_RANGE_MESSAGE);
  }
};

export const parseDateOnlyLocal = (value?: string | null) => {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

export const formatDateOnlyKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const addDateOnlyDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export const daysBetweenDateOnlyInclusive = (startDate: Date, endDate: Date) => {
  const start = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.round((end - start) / 86_400_000) + 1;
};

export const getItineraryDate = (startDate: string | Date | null | undefined, dayNumber: number) => {
  const parsedStartDate = typeof startDate === 'string' ? parseDateOnlyLocal(startDate) : startDate ?? null;
  if (!parsedStartDate || !Number.isFinite(dayNumber) || dayNumber < 1) return null;
  return addDateOnlyDays(parsedStartDate, dayNumber - 1);
};

const dateDayFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit' });
const dateMonthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
const dateWeekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const dateFullFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const formatShortMonth = (date: Date) =>
  dateMonthFormatter.format(date).replace('.', '').toLocaleLowerCase('pt-BR');

export const formatItineraryDayLabel = (date: Date) => {
  const day = dateDayFormatter.format(date);
  const month = formatShortMonth(date);
  const weekday = dateWeekdayFormatter.format(date).replace('.', '').toLocaleLowerCase('pt-BR');

  return {
    day,
    month,
    weekday,
    compact: `${day} ${month}`,
    full: dateFullFormatter.format(date),
  };
};

export const formatItineraryDateShort = (date: Date) => {
  const label = formatItineraryDayLabel(date);
  return label.compact;
};

export const formatItineraryDateWithYear = (date: Date) =>
  `${formatItineraryDateShort(date)} de ${date.getFullYear()}`;

export const formatItineraryPeriodLabel = (startDate: Date, endDate: Date) => {
  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `Roteiro de ${formatItineraryDateShort(startDate)} a ${formatItineraryDateWithYear(endDate)}`;
  }

  return `Roteiro de ${formatItineraryDateWithYear(startDate)} a ${formatItineraryDateWithYear(endDate)}`;
};
