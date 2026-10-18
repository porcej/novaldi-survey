import { formatLongDate } from './time';
import type { SurveyDocument } from './questions';

export const TOKEN_NAMES = ['session_title', 'instructor_name', 'class_name', 'event_name', 'session_date'] as const;

export type TokenValues = Partial<Record<(typeof TOKEN_NAMES)[number], string>>;

const TOKEN_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/g;

export function unresolvedTokens(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(TOKEN_PATTERN)) found.add(match[1]);
  return [...found];
}

export function documentTokens(doc: SurveyDocument): string[] {
  return unresolvedTokens(JSON.stringify(doc));
}

export function unknownTokens(doc: SurveyDocument): string[] {
  return documentTokens(doc).filter((token) => !TOKEN_NAMES.includes(token as (typeof TOKEN_NAMES)[number]));
}

export function resolveText(text: string, values: TokenValues): string {
  return text.replace(TOKEN_PATTERN, (match, name: string) => {
    const value = values[name as keyof TokenValues];
    return value ? value : match;
  });
}

export function resolveDocument(doc: SurveyDocument, values: TokenValues): { document: SurveyDocument; unresolved: string[] } {
  const pending = new Set<string>();
  const take = (text: string) => {
    const resolved = resolveText(text, values);
    for (const token of unresolvedTokens(resolved)) pending.add(token);
    return resolved;
  };
  const document: SurveyDocument = {
    sections: doc.sections.map((section) => ({
      ...section,
      title: take(section.title),
      description: take(section.description),
      questions: section.questions.map((question) => resolveQuestion(question, take)),
    })),
  };
  return { document, unresolved: [...pending] };
}

function resolveQuestion(question: SurveyDocument['sections'][number]['questions'][number], take: (text: string) => string) {
  const next = { ...question, title: take(question.title), description: take(question.description) };
  if (next.type === 'single' || next.type === 'dropdown' || next.type === 'multi') {
    return { ...next, choices: next.choices.map((choice) => ({ ...choice, label: take(choice.label) })) };
  }
  if (next.type === 'yes_no') return { ...next, yesLabel: take(next.yesLabel), noLabel: take(next.noLabel) };
  if (next.type === 'matrix') {
    return {
      ...next,
      rows: next.rows.map((row) => ({ ...row, label: take(row.label) })),
      columns: next.columns.map((column) => ({ ...column, label: take(column.label) })),
    };
  }
  if (next.type === 'rating' || next.type === 'likert') {
    const labels: Record<string, string> = {};
    for (const [key, label] of Object.entries(next.scale.labels)) labels[key] = take(label);
    return { ...next, scale: { ...next.scale, labels } };
  }
  if (next.type === 'short_text' || next.type === 'long_text' || next.type === 'email' || next.type === 'phone') {
    return { ...next, placeholder: take(next.placeholder) };
  }
  return next;
}

export function sessionDateLabel(startsAt: string | null, timeZone: string, eventNameFallback: string): string {
  if (!startsAt) return eventNameFallback;
  return formatLongDate(startsAt, timeZone);
}
