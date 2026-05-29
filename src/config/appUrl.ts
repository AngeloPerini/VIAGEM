export const PRIMARY_APP_URL = 'https://tripflow.online';

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const isLocalHost = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

export const getPublicAppBaseUrl = () => {
  const configuredUrl = import.meta.env.VITE_APP_URL || import.meta.env.VITE_PUBLIC_APP_URL;
  if (configuredUrl) return trimTrailingSlash(configuredUrl);

  if (typeof window === 'undefined') return PRIMARY_APP_URL;
  if (isLocalHost(window.location.hostname)) return window.location.origin;

  return PRIMARY_APP_URL;
};

export const buildPublicAppUrl = (path = '/') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getPublicAppBaseUrl()}${normalizedPath}`;
};
