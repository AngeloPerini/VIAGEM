export const parseCountryInput = (value: string) =>
  value
    .split(/[,\n;/|]+/)
    .map((country) => country.trim())
    .filter(Boolean);
