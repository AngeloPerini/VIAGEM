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
