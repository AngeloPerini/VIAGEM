import type { LinkItem } from '../types';

const ALLOWED_LINK_PREFIXES = ['http://', 'https://', 'maps://', 'geo:'];

export const isAllowedLinkUrl = (url: string) =>
  ALLOWED_LINK_PREFIXES.some((prefix) => url.trim().toLowerCase().startsWith(prefix));

export const normalizeLinks = (links?: LinkItem[]) =>
  (links ?? [])
    .map((link) => ({
      label: link.label.trim(),
      url: link.url.trim(),
    }))
    .filter((link) => link.label && link.url && isAllowedLinkUrl(link.url));

export const hasInvalidLinks = (links?: LinkItem[]) =>
  (links ?? []).some((link) => {
    const label = link.label.trim();
    const url = link.url.trim();
    return Boolean(label || url) && (!label || !url || !isAllowedLinkUrl(url));
  });
