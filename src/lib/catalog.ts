import {
  getEvent,
  instructorMap,
  listAssignments,
  listCategories,
  listPrograms,
  listSessions,
  listTemplates,
  responseCounts,
  type AssignmentRow,
  type CategoryRow,
  type EventRow,
  type ProgramRow,
  type SessionRow,
  type TemplateRow,
} from './db';
import { programKey } from './format';
import type { SurveyDocument } from './questions';
import { computeWindow, parseRules, type WindowResult } from './schedule';
import { dateInZone } from './time';

export type Catalog = {
  event: EventRow;
  programs: ProgramRow[];
  categories: CategoryRow[];
  sessions: SessionRow[];
  assignments: AssignmentRow[];
  templates: TemplateRow[];
  instructors: Map<number, string[]>;
  counts: Map<number, number>;
};

export type AssignmentCard = {
  assignment: AssignmentRow;
  session: SessionRow | null;
  instructors: string[];
  programLabel: string;
  audienceKey: 'company' | 'command' | 'shared';
  day: string | null;
  count: number;
  window: WindowResult;
  document: SurveyDocument;
  sortAt: string;
};

export async function loadCatalog(db: D1Database): Promise<Catalog> {
  const event = await getEvent(db);
  const [programs, categories, sessions, assignments, templates, counts] = await Promise.all([
    listPrograms(db, event.id),
    listCategories(db, event.id),
    listSessions(db, event.id),
    listAssignments(db, event.id),
    listTemplates(db),
    responseCounts(db, event.id),
  ]);
  const instructors = await instructorMap(db, sessions.map((session) => session.id));
  return { event, programs, categories, sessions, assignments, templates, instructors, counts };
}

export function publicCards(catalog: Catalog, now = new Date().toISOString()): AssignmentCard[] {
  return toCards(catalog, now).filter((card) => card.assignment.publication === 'published');
}

export function cardProgram(card: AssignmentCard, catalog: Catalog): 'company' | 'command' | 'shared' {
  const sessionProgram = card.session ? catalog.programs.find((item) => item.id === card.session?.program_id) : null;
  const sessionKey = sessionProgram ? programKey(sessionProgram.name) : null;
  if (sessionKey === 'company' || sessionKey === 'command') return sessionKey;
  if (card.audienceKey === 'company' || card.audienceKey === 'command') return card.audienceKey;
  return 'shared';
}

export function openProgramCards(cards: AssignmentCard[], catalog: Catalog, program: 'company' | 'command'): AssignmentCard[] {
  return cards.filter((card) => card.window.availability === 'open' && cardProgram(card, catalog) === program);
}

export function toCards(catalog: Catalog, now = new Date().toISOString()): AssignmentCard[] {
  return catalog.assignments
    .map((assignment) => toCard(catalog, assignment, now))
    .sort((a, b) => a.sortAt.localeCompare(b.sortAt) || a.assignment.title.localeCompare(b.assignment.title));
}

export function toCard(catalog: Catalog, assignment: AssignmentRow, now = new Date().toISOString()): AssignmentCard {
  const session = catalog.sessions.find((item) => item.id === assignment.session_id) ?? null;
  const program = catalog.programs.find((item) => item.id === assignment.program_id) ?? null;
  const window = computeWindow({
    publication: assignment.publication,
    manualState: assignment.manual_state,
    scheduleOverride: assignment.schedule_override === 1,
    overrideOpenAt: assignment.override_open_at,
    overrideCloseAt: assignment.override_close_at,
    rules: parseRules(assignment.open_rule_json),
    session: session ? { startsAt: session.starts_at, endsAt: session.ends_at } : null,
    eventEndsOn: catalog.event.ends_on,
    timeZone: catalog.event.timezone,
    now,
  });
  const day = session ? dateInZone(session.starts_at, catalog.event.timezone) : window.openAt ? dateInZone(window.openAt, catalog.event.timezone) : null;
  return {
    assignment,
    session,
    instructors: session ? (catalog.instructors.get(session.id) ?? []) : [],
    programLabel: program?.short_name ?? 'Shared',
    audienceKey: program ? (programKey(program.name) ?? 'shared') : 'shared',
    day,
    count: catalog.counts.get(assignment.id) ?? 0,
    window,
    document: JSON.parse(assignment.rendered_json) as SurveyDocument,
    sortAt: session?.starts_at ?? window.openAt ?? assignment.public_id,
  };
}

export type Filters = { q: string; program: string; day: string; category: string; status: string; page: number };

export function readFilters(url: URL): Filters {
  const page = Number(url.searchParams.get('page') ?? '1');
  return {
    q: (url.searchParams.get('q') ?? '').trim(),
    program: url.searchParams.get('program') ?? '',
    day: url.searchParams.get('day') ?? '',
    category: url.searchParams.get('category') ?? '',
    status: url.searchParams.get('status') ?? '',
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

export function filterCards(cards: AssignmentCard[], filters: Filters): AssignmentCard[] {
  const needle = filters.q.toLowerCase();
  return cards.filter((card) => {
    if (filters.program && card.audienceKey !== filters.program) return false;
    if (filters.day && card.day !== filters.day) return false;
    if (filters.category && card.assignment.category_name !== filters.category) return false;
    if (filters.status && card.window.availability !== filters.status) return false;
    if (!needle) return true;
    const hay = [card.assignment.title, card.session?.title ?? '', card.assignment.category_name, card.programLabel, card.instructors.join(' ')]
      .join(' ')
      .toLowerCase();
    return hay.includes(needle);
  });
}

export function pageHref(filters: Filters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.program) params.set('program', filters.program);
  if (filters.day) params.set('day', filters.day);
  if (filters.category) params.set('category', filters.category);
  if (filters.status) params.set('status', filters.status);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/admin?${query}` : '/admin';
}
