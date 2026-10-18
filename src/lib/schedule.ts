import { addMinutes, endOfDayUtc } from './time';

export type RulePoint =
  | { type: 'absolute'; at: string }
  | { type: 'session_start' }
  | { type: 'session_end' }
  | { type: 'offset_after_end'; minutes: number }
  | { type: 'offset_after_open'; minutes: number }
  | { type: 'event_end' }
  | { type: 'manual' };

export type OpenCloseRules = { open: RulePoint; close: RulePoint };

export type Availability = 'draft' | 'scheduled' | 'open' | 'closed' | 'archived';

export type WindowContext = {
  publication: 'draft' | 'published' | 'archived';
  manualState: 'open' | 'closed' | null;
  scheduleOverride: boolean;
  overrideOpenAt: string | null;
  overrideCloseAt: string | null;
  rules: OpenCloseRules;
  session: { startsAt: string; endsAt: string } | null;
  eventEndsOn: string;
  timeZone: string;
  now: string;
};

export type WindowResult = {
  openAt: string | null;
  closeAt: string | null;
  error: string | null;
  availability: Availability;
};

const NEEDS_SESSION = new Set<RulePoint['type']>(['session_start', 'session_end', 'offset_after_end']);

export function describeRule(rule: RulePoint): string {
  switch (rule.type) {
    case 'absolute':
      return 'A set date and time';
    case 'session_start':
      return 'When the session starts';
    case 'session_end':
      return 'When the session ends';
    case 'offset_after_end':
      return `${rule.minutes} minutes after the session ends`;
    case 'offset_after_open':
      return `${rule.minutes} minutes after it opens`;
    case 'event_end':
      return 'When the institute ends';
    case 'manual':
      return 'When an administrator opens it';
  }
}

export function parseRules(raw: string): OpenCloseRules {
  const parsed = JSON.parse(raw) as OpenCloseRules;
  return { open: parsed.open, close: parsed.close };
}

export function defaultSessionRules(): OpenCloseRules {
  return { open: { type: 'session_end' }, close: { type: 'event_end' } };
}

export function defaultSharedRules(openAt: string): OpenCloseRules {
  return { open: { type: 'absolute', at: openAt }, close: { type: 'event_end' } };
}

export function computeWindow(input: WindowContext): WindowResult {
  if (input.publication === 'archived') {
    return { openAt: null, closeAt: null, error: null, availability: 'archived' };
  }
  if (input.publication === 'draft') {
    return { openAt: null, closeAt: null, error: null, availability: 'draft' };
  }

  const resolved = input.scheduleOverride
    ? { openAt: input.overrideOpenAt, closeAt: input.overrideCloseAt, error: null }
    : resolveRules(input);
  const openAt = resolved.openAt;
  const closeAt = resolved.closeAt;
  const error = resolved.error ?? impossible(openAt, closeAt);

  if (input.manualState === 'closed') {
    return { openAt, closeAt, error, availability: 'closed' };
  }
  if (error) return { openAt, closeAt, error, availability: 'scheduled' };

  const now = new Date(input.now).getTime();
  const opens = openAt ? new Date(openAt).getTime() : null;
  const closes = closeAt ? new Date(closeAt).getTime() : null;

  if (input.manualState === 'open') {
    if (closes !== null && now >= closes) return { openAt, closeAt, error: null, availability: 'closed' };
    return { openAt, closeAt, error: null, availability: 'open' };
  }
  if (opens === null) return { openAt, closeAt, error: null, availability: 'scheduled' };
  if (now < opens) return { openAt, closeAt, error: null, availability: 'scheduled' };
  if (closes !== null && now >= closes) return { openAt, closeAt, error: null, availability: 'closed' };
  return { openAt, closeAt, error: null, availability: 'open' };
}

function impossible(openAt: string | null, closeAt: string | null): string | null {
  if (openAt && closeAt && new Date(openAt).getTime() >= new Date(closeAt).getTime()) {
    return 'The close time is not after the open time.';
  }
  return null;
}

function resolveRules(input: WindowContext): { openAt: string | null; closeAt: string | null; error: string | null } {
  const open = resolvePoint(input.rules.open, input, null);
  if (open.error) return { openAt: null, closeAt: null, error: open.error };
  const close = resolvePoint(input.rules.close, input, open.at);
  if (close.error) return { openAt: open.at, closeAt: null, error: close.error };
  return { openAt: open.at, closeAt: close.at, error: null };
}

function resolvePoint(
  rule: RulePoint,
  input: WindowContext,
  openAt: string | null,
): { at: string | null; error: string | null } {
  if (NEEDS_SESSION.has(rule.type) && !input.session) return { at: null, error: 'This schedule needs a session.' };
  switch (rule.type) {
    case 'absolute':
      return rule.at ? { at: rule.at, error: null } : { at: null, error: 'Enter an open or close time.' };
    case 'session_start':
      return { at: input.session?.startsAt ?? null, error: null };
    case 'session_end':
      return { at: input.session?.endsAt ?? null, error: null };
    case 'offset_after_end':
      return { at: input.session ? addMinutes(input.session.endsAt, rule.minutes) : null, error: null };
    case 'offset_after_open':
      return openAt ? { at: addMinutes(openAt, rule.minutes), error: null } : { at: null, error: 'The close time depends on an open time.' };
    case 'event_end':
      return { at: endOfDayUtc(input.eventEndsOn, input.timeZone), error: null };
    case 'manual':
      return { at: null, error: null };
  }
}

export function rulesFromForm(fields: Record<string, string>, timeZone: string, toUtc: (local: string, zone: string) => string): OpenCloseRules | { error: string } {
  const open = pointFromForm('open', fields, timeZone, toUtc);
  if ('error' in open) return open;
  const close = pointFromForm('close', fields, timeZone, toUtc);
  if ('error' in close) return close;
  return { open, close };
}

function pointFromForm(
  which: 'open' | 'close',
  fields: Record<string, string>,
  timeZone: string,
  toUtc: (local: string, zone: string) => string,
): RulePoint | { error: string } {
  const type = fields[`${which}_type`] ?? 'manual';
  if (type === 'absolute') {
    try {
      return { type: 'absolute', at: toUtc(fields[`${which}_at`] ?? '', timeZone) };
    } catch {
      return { error: which === 'open' ? 'Enter when the survey opens.' : 'Enter when the survey closes.' };
    }
  }
  if (type === 'session_start' || type === 'session_end' || type === 'event_end' || type === 'manual') return { type };
  if (type === 'offset_after_end' || type === 'offset_after_open') {
    const minutes = Number(fields[`${which}_minutes`] ?? '');
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 60 * 24 * 14) return { error: 'Enter a valid number of minutes.' };
    return { type, minutes: Math.trunc(minutes) };
  }
  return { error: 'Choose a valid schedule.' };
}
