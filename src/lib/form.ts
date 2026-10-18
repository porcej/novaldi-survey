import type { Context } from 'hono';

export type Fields = Record<string, string | string[]>;

export async function readFields(c: Context): Promise<Fields> {
  const body = await c.req.parseBody({ all: true });
  const fields: Fields = {};
  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      const strings = value.filter((item): item is string => typeof item === 'string');
      if (strings.length > 0) fields[key] = strings;
    } else if (typeof value === 'string') fields[key] = value;
  }
  return fields;
}

export function field(fields: Fields, key: string): string {
  const value = fields[key];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function fieldAll(fields: Fields, key: string): string[] {
  const value = fields[key];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

export function fieldsToForm(fields: Fields): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  }
  return form;
}

export function stringFields(fields: Fields): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) result[key] = Array.isArray(value) ? (value[0] ?? '') : value;
  return result;
}
