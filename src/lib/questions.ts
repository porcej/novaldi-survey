export const QUESTION_TYPES = [
  'rating',
  'likert',
  'single',
  'multi',
  'short_text',
  'long_text',
  'yes_no',
  'dropdown',
  'matrix',
  'email',
  'phone',
  'info',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];
export type VisibilityOperator = 'equals' | 'not_equals' | 'answered' | 'unanswered';

export type VisibilityRule = {
  questionId: string;
  operator: VisibilityOperator;
  value?: string;
};

export type Choice = { id: string; label: string };
export type MatrixColumn = { id: string; label: string; value: number };
export type MatrixRow = { id: string; label: string };

export type ScaleConfig = {
  min: number;
  max: number;
  allowNa: boolean;
  labels: Record<string, string>;
};

type QuestionBase = {
  id: string;
  title: string;
  description: string;
  required: boolean;
  reportingMetric: string;
  visibility: VisibilityRule[];
};

export type Question =
  | (QuestionBase & { type: 'rating' | 'likert'; scale: ScaleConfig })
  | (QuestionBase & { type: 'single' | 'dropdown'; choices: Choice[]; allowOther: boolean })
  | (QuestionBase & { type: 'multi'; choices: Choice[]; allowOther: boolean; minSelect: number; maxSelect: number | null })
  | (QuestionBase & { type: 'short_text' | 'long_text'; minLength: number; maxLength: number; placeholder: string })
  | (QuestionBase & { type: 'yes_no'; yesLabel: string; noLabel: string })
  | (QuestionBase & { type: 'matrix'; rows: MatrixRow[]; columns: MatrixColumn[]; allowNa: boolean })
  | (QuestionBase & { type: 'email' | 'phone'; placeholder: string })
  | (QuestionBase & { type: 'info' });

export type SurveySection = {
  id: string;
  title: string;
  description: string;
  visibility: VisibilityRule[];
  questions: Question[];
};

export type SurveyDocument = { sections: SurveySection[] };

export type StoredAnswer =
  | { t: 'na' }
  | { t: 'num'; v: number }
  | { t: 'choice'; id: string; other?: string }
  | { t: 'multi'; ids: string[]; other?: string }
  | { t: 'text'; v: string }
  | { t: 'matrix'; rows: Record<string, { id: string } | { na: true }> };

export type AnswerMap = Record<string, StoredAnswer>;

export type FieldError = { id: string; message: string };

export const OTHER_ID = '__other__';

export const RATING_LABELS: Record<string, string> = {
  '1': 'Poor',
  '2': 'Fair',
  '3': 'Good',
  '4': 'Very Good',
  '5': 'Excellent',
};

export const LIKERT_LABELS: Record<string, string> = {
  '1': 'Strongly disagree',
  '2': 'Disagree',
  '3': 'Neutral',
  '4': 'Agree',
  '5': 'Strongly agree',
};

const OPERATORS: VisibilityOperator[] = ['equals', 'not_equals', 'answered', 'unanswered'];

export function fieldName(questionId: string, rowId?: string): string {
  return rowId ? `q_${questionId}__${rowId}` : `q_${questionId}`;
}

export function otherField(questionId: string): string {
  return `q_${questionId}__other`;
}

export function orderedQuestions(doc: SurveyDocument): Question[] {
  return doc.sections.flatMap((section) => section.questions);
}

export function findQuestion(doc: SurveyDocument, id: string): Question | undefined {
  return orderedQuestions(doc).find((question) => question.id === id);
}

export function blankDocument(): SurveyDocument {
  return { sections: [{ id: 'section_main', title: 'Questions', description: '', visibility: [], questions: [] }] };
}

export function standardScale(labels: Record<string, string> = RATING_LABELS): ScaleConfig {
  return { min: 1, max: 5, allowNa: true, labels: { ...labels } };
}

export function newQuestion(type: QuestionType, id: string, title = 'New question'): Question {
  const base = { id, title, description: '', required: type !== 'info', reportingMetric: '', visibility: [] as VisibilityRule[] };
  switch (type) {
    case 'rating':
      return { ...base, type, scale: standardScale() };
    case 'likert':
      return { ...base, type, scale: standardScale(LIKERT_LABELS) };
    case 'single':
    case 'dropdown':
      return { ...base, type, choices: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }], allowOther: false };
    case 'multi':
      return { ...base, type, choices: [{ id: 'option-1', label: 'Option 1' }], allowOther: false, minSelect: 0, maxSelect: null };
    case 'short_text':
      return { ...base, type, minLength: 0, maxLength: 500, placeholder: '' };
    case 'long_text':
      return { ...base, type, required: false, minLength: 0, maxLength: 4000, placeholder: '' };
    case 'yes_no':
      return { ...base, type, yesLabel: 'Yes', noLabel: 'No' };
    case 'matrix':
      return {
        ...base,
        type,
        rows: [{ id: 'row-1', label: 'Item' }],
        columns: scaleColumns(RATING_LABELS),
        allowNa: true,
      };
    case 'email':
    case 'phone':
      return { ...base, type, placeholder: '' };
    case 'info':
      return { ...base, type, required: false };
  }
}

export function scaleColumns(labels: Record<string, string>): MatrixColumn[] {
  return Object.entries(labels)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([value, label]) => ({ id: `c${value}`, label, value: Number(value) }));
}

export function choicesFromLines(text: string): Choice[] {
  const seen = new Map<string, number>();
  const choices: Choice[] = [];
  for (const line of text.split('\n')) {
    const label = line.trim();
    if (!label) continue;
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'option';
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    choices.push({ id: count === 1 ? base : `${base}-${count}`, label });
  }
  return choices;
}

export function scaleFromLines(text: string, fallback: ScaleConfig): ScaleConfig {
  const labels: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^(\d+)\s+(.+)$/.exec(trimmed);
    if (!match) continue;
    labels[match[1]] = match[2].trim();
  }
  const numbers = Object.keys(labels).map(Number);
  if (numbers.length < 2) return fallback;
  return { min: Math.min(...numbers), max: Math.max(...numbers), allowNa: fallback.allowNa, labels };
}

export function matrixColumnsFromLines(text: string): MatrixColumn[] {
  const columns: MatrixColumn[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^(\d+)\s+(.+)$/.exec(trimmed);
    const value = match ? Number(match[1]) : columns.length + 1;
    const label = match ? match[2].trim() : trimmed;
    columns.push({ id: `c${value}`, label, value });
  }
  return columns;
}

export function rowsFromLines(text: string): MatrixRow[] {
  return choicesFromLines(text).map((choice) => ({ id: choice.id, label: choice.label }));
}

export function linesFromScale(scale: ScaleConfig): string {
  const lines: string[] = [];
  for (let value = scale.min; value <= scale.max; value += 1) lines.push(`${value} ${scale.labels[String(value)] ?? ''}`.trim());
  return lines.join('\n');
}

export function validateDocument(doc: SurveyDocument): string[] {
  const errors: string[] = [];
  const questions = orderedQuestions(doc);
  if (questions.length === 0 || questions.every((question) => question.type === 'info')) errors.push('Add at least one question.');
  const seen = new Set<string>();
  const index = new Map(questions.map((question, position) => [question.id, position]));
  if (doc.sections.length === 0) errors.push('Add a section.');
  doc.sections.forEach((section, sectionIndex) => {
    if (!section.title.trim()) errors.push(`Section ${sectionIndex + 1} needs a title.`);
    checkRules(section.visibility, section.title || `Section ${sectionIndex + 1}`, index, -1, errors);
  });
  for (const question of questions) {
    if (!question.id.trim()) errors.push('A question is missing an id.');
    if (seen.has(question.id)) errors.push(`Duplicate question “${question.title || question.id}”.`);
    seen.add(question.id);
    if (!question.title.trim()) errors.push('Every question needs a title.');
    const position = index.get(question.id) ?? 0;
    checkRules(question.visibility, question.title || question.id, index, position, errors);
    errors.push(...questionConfigErrors(question));
  }
  errors.push(...cycleErrors(doc));
  return errors;
}

function checkRules(
  rules: VisibilityRule[],
  label: string,
  index: Map<string, number>,
  position: number,
  errors: string[],
): void {
  for (const rule of rules) {
    if (!OPERATORS.includes(rule.operator)) errors.push(`“${label}” has an unknown condition.`);
    const prior = index.get(rule.questionId);
    if (prior === undefined) errors.push(`“${label}” depends on a missing question.`);
    else if (position >= 0 && prior >= position) errors.push(`“${label}” must depend on an earlier question.`);
    if ((rule.operator === 'equals' || rule.operator === 'not_equals') && !rule.value?.trim()) {
      errors.push(`“${label}” needs a value for its condition.`);
    }
  }
}

function questionConfigErrors(question: Question): string[] {
  const errors: string[] = [];
  if (question.type === 'rating' || question.type === 'likert') {
    if (!(question.scale.min < question.scale.max)) errors.push(`“${question.title}” needs a minimum below its maximum.`);
  }
  if (question.type === 'single' || question.type === 'dropdown' || question.type === 'multi') {
    if (question.choices.length === 0) errors.push(`“${question.title}” needs at least one choice.`);
    const ids = new Set<string>();
    for (const choice of question.choices) {
      if (!choice.label.trim()) errors.push(`“${question.title}” has a blank choice.`);
      if (ids.has(choice.id)) errors.push(`“${question.title}” has duplicate choices.`);
      ids.add(choice.id);
    }
  }
  if (question.type === 'multi' && question.maxSelect !== null && question.minSelect > question.maxSelect) {
    errors.push(`“${question.title}” has a minimum selection above its maximum.`);
  }
  if ((question.type === 'short_text' || question.type === 'long_text') && question.minLength > question.maxLength) {
    errors.push(`“${question.title}” has a minimum length above its maximum.`);
  }
  if (question.type === 'matrix') {
    if (question.rows.length === 0 || question.columns.length === 0) errors.push(`“${question.title}” needs rows and columns.`);
  }
  if (question.type === 'yes_no' && (!question.yesLabel.trim() || !question.noLabel.trim())) {
    errors.push(`“${question.title}” needs both yes and no labels.`);
  }
  return errors;
}

function cycleErrors(doc: SurveyDocument): string[] {
  const questions = orderedQuestions(doc);
  const graph = new Map<string, string[]>();
  for (const question of questions) graph.set(question.id, question.visibility.map((rule) => rule.questionId));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const errors: string[] = [];
  const walk = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      errors.push('Conditions cannot depend on each other in a circle.');
      return;
    }
    visiting.add(id);
    for (const next of graph.get(id) ?? []) walk(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const question of questions) walk(question.id);
  return errors;
}

export function collectAnswers(doc: SurveyDocument, form: FormData): { answers: AnswerMap; errors: FieldError[] } {
  const answers: AnswerMap = {};
  const errors: FieldError[] = [];
  for (const section of doc.sections) {
    const sectionVisible = rulesPass(section.visibility, doc, answers);
    for (const question of section.questions) {
      if (question.type === 'info') continue;
      if (!sectionVisible || !rulesPass(question.visibility, doc, answers)) continue;
      const result = readQuestion(question, form);
      if (result.error) errors.push({ id: question.id, message: result.error });
      if (result.answer) answers[question.id] = result.answer;
    }
  }
  return { answers, errors };
}

function rulesPass(rules: VisibilityRule[], doc: SurveyDocument, answers: AnswerMap): boolean {
  if (rules.length === 0) return true;
  return rules.some((rule) => ruleMatches(rule, doc, answers));
}

function ruleMatches(rule: VisibilityRule, doc: SurveyDocument, answers: AnswerMap): boolean {
  const question = findQuestion(doc, rule.questionId);
  const answer = answers[rule.questionId];
  const tokens = question ? answerTokens(question, answer) : [];
  const wanted = (rule.value ?? '').trim().toLowerCase();
  if (rule.operator === 'answered') return tokens.length > 0;
  if (rule.operator === 'unanswered') return tokens.length === 0;
  const hit = tokens.some((token) => token.toLowerCase() === wanted);
  if (rule.operator === 'equals') return hit;
  return tokens.length > 0 && !hit;
}

function answerTokens(question: Question, answer: StoredAnswer | undefined): string[] {
  if (!answer) return [];
  if (answer.t === 'na') return ['n/a'];
  if (answer.t === 'num') return [String(answer.v), scaleLabel(question, answer.v)].filter((token): token is string => Boolean(token));
  if (answer.t === 'text') return answer.v.trim() ? [answer.v.trim()] : [];
  if (answer.t === 'choice') return [answer.id, choiceLabel(question, answer.id), answer.other ?? ''].filter((token): token is string => Boolean(token));
  if (answer.t === 'multi') return answer.ids.flatMap((id) => [id, choiceLabel(question, id)]).filter((token): token is string => Boolean(token));
  if (answer.t === 'matrix') return Object.keys(answer.rows).length > 0 ? ['answered'] : [];
  return [];
}

function scaleLabel(question: Question, value: number): string {
  if (question.type !== 'rating' && question.type !== 'likert') return '';
  return question.scale.labels[String(value)] ?? '';
}

export function choiceLabel(question: Question, id: string): string {
  if (id === OTHER_ID) return 'Other';
  if (question.type === 'yes_no') {
    if (id === 'yes') return question.yesLabel;
    if (id === 'no') return question.noLabel;
  }
  if (question.type === 'single' || question.type === 'dropdown' || question.type === 'multi') {
    return question.choices.find((choice) => choice.id === id)?.label ?? '';
  }
  return '';
}

function readQuestion(question: Question, form: FormData): { answer?: StoredAnswer; error?: string } {
  if (question.type === 'rating' || question.type === 'likert') return readScale(question, form);
  if (question.type === 'single' || question.type === 'dropdown') return readSingle(question, form);
  if (question.type === 'yes_no') return readYesNo(question, form);
  if (question.type === 'multi') return readMulti(question, form);
  if (question.type === 'short_text' || question.type === 'long_text') return readText(question, form);
  if (question.type === 'email') return readEmail(question, form);
  if (question.type === 'phone') return readPhone(question, form);
  if (question.type === 'matrix') return readMatrix(question, form);
  return {};
}

function values(form: FormData, name: string): string[] {
  return form.getAll(name).filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter((value) => value !== '');
}

function readScale(question: Extract<Question, { type: 'rating' | 'likert' }>, form: FormData): { answer?: StoredAnswer; error?: string } {
  const raw = values(form, fieldName(question.id))[0] ?? '';
  if (!raw) return question.required ? { error: 'Choose a rating.' } : {};
  if (raw.toLowerCase() === 'na') {
    return question.scale.allowNa ? { answer: { t: 'na' } } : { error: 'Not applicable is not allowed.' };
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < question.scale.min || value > question.scale.max) return { error: 'Choose a rating on the scale.' };
  return { answer: { t: 'num', v: value } };
}

function readSingle(question: Extract<Question, { type: 'single' | 'dropdown' }>, form: FormData): { answer?: StoredAnswer; error?: string } {
  const raw = values(form, fieldName(question.id))[0] ?? '';
  if (!raw) return question.required ? { error: 'Choose one option.' } : {};
  if (raw === OTHER_ID) {
    if (!question.allowOther) return { error: 'Choose a valid option.' };
    const other = (values(form, otherField(question.id))[0] ?? '').trim();
    if (!other) return { error: 'Describe your other answer.' };
    if (other.length > 500) return { error: 'That answer is too long.' };
    return { answer: { t: 'choice', id: OTHER_ID, other } };
  }
  if (!question.choices.some((choice) => choice.id === raw)) return { error: 'Choose a valid option.' };
  return { answer: { t: 'choice', id: raw } };
}

function readYesNo(question: Extract<Question, { type: 'yes_no' }>, form: FormData): { answer?: StoredAnswer; error?: string } {
  const raw = values(form, fieldName(question.id))[0] ?? '';
  if (!raw) return question.required ? { error: 'Choose yes or no.' } : {};
  if (raw !== 'yes' && raw !== 'no') return { error: 'Choose yes or no.' };
  return { answer: { t: 'choice', id: raw } };
}

function readMulti(question: Extract<Question, { type: 'multi' }>, form: FormData): { answer?: StoredAnswer; error?: string } {
  const selected = values(form, fieldName(question.id));
  const other = (values(form, otherField(question.id))[0] ?? '').trim();
  const ids = selected.filter((id) => id !== OTHER_ID);
  if (selected.includes(OTHER_ID)) {
    if (!question.allowOther) return { error: 'Choose a valid option.' };
    if (!other) return { error: 'Describe your other answer.' };
    if (other.length > 500) return { error: 'That answer is too long.' };
    ids.push(OTHER_ID);
  }
  if (ids.some((id) => id !== OTHER_ID && !question.choices.some((choice) => choice.id === id))) return { error: 'Choose a valid option.' };
  const count = ids.length;
  if (count === 0) {
    if (question.required || question.minSelect > 0) return { error: 'Select at least one option.' };
    return {};
  }
  if (count < question.minSelect) return { error: `Select at least ${question.minSelect}.` };
  if (question.maxSelect !== null && count > question.maxSelect) return { error: `Select at most ${question.maxSelect}.` };
  return { answer: { t: 'multi', ids, other: other || undefined } };
}

function readText(question: Extract<Question, { type: 'short_text' | 'long_text' }>, form: FormData): { answer?: StoredAnswer; error?: string } {
  const raw = values(form, fieldName(question.id))[0] ?? '';
  if (!raw) return question.required || question.minLength > 0 ? { error: 'Enter a response.' } : {};
  if (raw.length < question.minLength) return { error: `Enter at least ${question.minLength} characters.` };
  if (raw.length > question.maxLength) return { error: `Keep this under ${question.maxLength} characters.` };
  return { answer: { t: 'text', v: raw } };
}

function readEmail(question: { id: string; required: boolean }, form: FormData): { answer?: StoredAnswer; error?: string } {
  const raw = (values(form, fieldName(question.id))[0] ?? '').trim();
  if (!raw) return question.required ? { error: 'Enter an email address.' } : {};
  if (raw.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { error: 'Enter a valid email address.' };
  return { answer: { t: 'text', v: raw } };
}

function readPhone(question: { id: string; required: boolean }, form: FormData): { answer?: StoredAnswer; error?: string } {
  const raw = (values(form, fieldName(question.id))[0] ?? '').trim();
  if (!raw) return question.required ? { error: 'Enter a phone number.' } : {};
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return { error: 'Enter a valid phone number.' };
  return { answer: { t: 'text', v: raw } };
}

function readMatrix(question: Extract<Question, { type: 'matrix' }>, form: FormData): { answer?: StoredAnswer; error?: string } {
  const rows: Record<string, { id: string } | { na: true }> = {};
  let missing = false;
  for (const row of question.rows) {
    const raw = values(form, fieldName(question.id, row.id))[0] ?? '';
    if (!raw) {
      if (question.required) missing = true;
      continue;
    }
    if (raw.toLowerCase() === 'na') {
      if (!question.allowNa) return { error: 'Not applicable is not allowed.' };
      rows[row.id] = { na: true };
      continue;
    }
    if (!question.columns.some((column) => column.id === raw)) return { error: 'Choose a valid rating.' };
    rows[row.id] = { id: raw };
  }
  if (missing) return { error: 'Rate every row.' };
  if (Object.keys(rows).length === 0) return {};
  return { answer: { t: 'matrix', rows } };
}

export function displayAnswer(question: Question, answer: StoredAnswer | undefined): string {
  if (!answer) return '';
  if (answer.t === 'na') return 'N/A';
  if (answer.t === 'num') {
    const label = scaleLabel(question, answer.v);
    return label ? `${answer.v} ${label}` : String(answer.v);
  }
  if (answer.t === 'choice') {
    const label = choiceLabel(question, answer.id);
    return answer.other ? `${label}: ${answer.other}` : label;
  }
  if (answer.t === 'multi') {
    return answer.ids
      .map((id) => (id === OTHER_ID && answer.other ? `Other: ${answer.other}` : choiceLabel(question, id)))
      .filter(Boolean)
      .join('; ');
  }
  if (answer.t === 'text') return answer.v;
  if (answer.t === 'matrix' && question.type === 'matrix') {
    return question.rows
      .map((row) => {
        const cell = answer.rows[row.id];
        if (!cell) return '';
        if ('na' in cell) return `${row.label}: N/A`;
        const column = question.columns.find((item) => item.id === cell.id);
        return `${row.label}: ${column?.label ?? cell.id}`;
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

export function replaceQuestion(doc: SurveyDocument, question: Question): SurveyDocument {
  return {
    sections: doc.sections.map((section) => ({
      ...section,
      questions: section.questions.map((item) => (item.id === question.id ? question : item)),
    })),
  };
}

export function removeQuestion(doc: SurveyDocument, questionId: string): SurveyDocument {
  return {
    sections: doc.sections.map((section) => ({
      ...section,
      visibility: section.visibility.filter((rule) => rule.questionId !== questionId),
      questions: section.questions
        .filter((question) => question.id !== questionId)
        .map((question) => ({ ...question, visibility: question.visibility.filter((rule) => rule.questionId !== questionId) })),
    })),
  };
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return items;
  const copy = items.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

export function parseRules(fields: Record<string, string>, slots = 3): VisibilityRule[] {
  const rules: VisibilityRule[] = [];
  for (let slot = 1; slot <= slots; slot += 1) {
    const questionId = (fields[`vis_q_${slot}`] ?? '').trim();
    const operator = (fields[`vis_op_${slot}`] ?? '').trim() as VisibilityOperator;
    const value = (fields[`vis_value_${slot}`] ?? '').trim();
    if (!questionId) continue;
    if (!OPERATORS.includes(operator)) continue;
    rules.push({ questionId, operator, value: value || undefined });
  }
  return rules;
}

export function questionFromFields(current: Question, fields: Record<string, string>): { question: Question } | { error: string } {
  const title = (fields.title ?? '').trim();
  if (!title) return { error: 'Enter a question title.' };
  const description = (fields.description ?? '').trim();
  const required = fields.required === 'on' && current.type !== 'info';
  const reportingMetric = (fields.metric ?? '').trim();
  const visibility = parseRules(fields);
  const base = { id: current.id, title, description, required, reportingMetric, visibility };

  if (current.type === 'rating' || current.type === 'likert') {
    const scale = scaleFromLines(fields.labels ?? '', { ...current.scale, allowNa: fields.allow_na === 'on' });
    scale.allowNa = fields.allow_na === 'on';
    return { question: { ...base, type: current.type, scale } };
  }
  if (current.type === 'single' || current.type === 'dropdown') {
    const choices = choicesFromLines(fields.choices ?? '');
    if (choices.length === 0) return { error: 'Enter at least one choice.' };
    return { question: { ...base, type: current.type, choices, allowOther: fields.allow_other === 'on' } };
  }
  if (current.type === 'multi') {
    const choices = choicesFromLines(fields.choices ?? '');
    if (choices.length === 0) return { error: 'Enter at least one choice.' };
    const minSelect = clampInt(fields.min_select, 0, 50);
    const maxRaw = (fields.max_select ?? '').trim();
    const maxSelect = maxRaw ? clampInt(maxRaw, 1, 50) : null;
    return { question: { ...base, type: 'multi', choices, allowOther: fields.allow_other === 'on', minSelect, maxSelect } };
  }
  if (current.type === 'short_text' || current.type === 'long_text') {
    const fallback = current.type === 'short_text' ? 500 : 4000;
    return {
      question: {
        ...base,
        type: current.type,
        minLength: clampInt(fields.min_length, 0, fallback),
        maxLength: clampInt(fields.max_length || String(current.maxLength), 1, fallback),
        placeholder: (fields.placeholder ?? '').trim(),
      },
    };
  }
  if (current.type === 'yes_no') {
    return { question: { ...base, type: 'yes_no', yesLabel: (fields.yes_label ?? 'Yes').trim() || 'Yes', noLabel: (fields.no_label ?? 'No').trim() || 'No' } };
  }
  if (current.type === 'matrix') {
    const rows = rowsFromLines(fields.rows ?? '');
    const columns = matrixColumnsFromLines(fields.columns ?? '');
    if (rows.length === 0 || columns.length === 0) return { error: 'Enter matrix rows and columns.' };
    return { question: { ...base, type: 'matrix', rows, columns, allowNa: fields.allow_na === 'on' } };
  }
  if (current.type === 'email' || current.type === 'phone') {
    return { question: { ...base, type: current.type, placeholder: (fields.placeholder ?? '').trim() } };
  }
  return { question: { ...base, type: 'info', required: false } };
}

function clampInt(value: string | undefined, min: number, max: number): number {
  const parsed = Number(value ?? '');
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function formFields(form: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === 'string' && fields[key] === undefined) fields[key] = value;
  });
  return fields;
}

export function formValueMap(form: FormData): Record<string, string[]> {
  const values: Record<string, string[]> = {};
  form.forEach((value, key) => {
    if (typeof value !== 'string') return;
    values[key] ??= [];
    values[key].push(value);
  });
  return values;
}

export function checkedValues(values: Record<string, string[]> | undefined, name: string): string[] {
  return values?.[name] ?? [];
}
