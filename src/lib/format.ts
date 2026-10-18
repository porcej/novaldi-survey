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
