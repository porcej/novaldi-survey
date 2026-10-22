import type { Availability } from './schedule';

export function instructorList(names: string[]): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
}

export const STATUS_LABEL: Record<Availability, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  open: 'Open',
  closed: 'Closed',
  archived: 'Archived',
};

export function templateSlug(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return slug || 'template';
}

export function templateHref(template: { id: number; name: string }, templates: { id: number; name: string }[]): string {
  const slug = templateSlug(template.name);
  const same = templates.filter((item) => templateSlug(item.name) === slug).sort((a, b) => a.id - b.id);
  const suffix = same.length > 1 && same[0]?.id !== template.id;
  return `/templates/${suffix ? `${slug}-${template.id}` : slug}`;
}

export function templateFromSlug<T extends { id: number; name: string }>(templates: T[], param: string): T | undefined {
  const slug = param.trim().toLowerCase();
  const exact = templates.filter((item) => templateSlug(item.name) === slug).sort((a, b) => a.id - b.id);
  if (exact.length > 0) return exact[0];
  const suffixed = /^(.+)-(\d+)$/.exec(slug);
  if (!suffixed) return undefined;
  const id = Number(suffixed[2]);
  return templates.find((item) => item.id === id && `${templateSlug(item.name)}-${item.id}` === slug);
}

export function programKey(name: string): 'company' | 'command' | 'shared' | null {
  const value = name.trim().toLowerCase();
  if (!value || value === 'shared' || value === 'all' || value === 'both') return 'shared';
  if (value.includes('command') || value === 'colmp') return 'command';
  if (value.includes('company') || value === 'colp') return 'company';
  return null;
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function intOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10000) return null;
  return parsed;
}
