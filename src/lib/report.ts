import { displayAnswer, type Question, type StoredAnswer } from './questions';

export type Distribution = { key: string; label: string; count: number; percent: number };

export type QuestionReport = {
  questionId: string;
  title: string;
  type: Question['type'];
  metric: string;
  responses: number;
  answered: number;
  na: number;
  skipped: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  favorablePercent: number | null;
  likert: { agreePercent: number; neutralPercent: number; disagreePercent: number } | null;
  distribution: Distribution[];
  comments: string[];
};

export type ResponseGroup = { id: string; submittedOn: string; answers: Record<string, StoredAnswer> };

export function summarizeQuestion(question: Question, groups: ResponseGroup[]): QuestionReport {
  const answers = groups.map((group) => group.answers[question.id]);
  const base: QuestionReport = {
    questionId: question.id,
    title: question.title,
    type: question.type,
    metric: question.reportingMetric,
    responses: groups.length,
    answered: 0,
    na: 0,
    skipped: 0,
    mean: null,
    median: null,
    min: null,
    max: null,
    favorablePercent: null,
    likert: null,
    distribution: [],
    comments: [],
  };
  if (question.type === 'info') return base;
  if (question.type === 'rating' || question.type === 'likert') return summarizeScale(question, answers, base);
  if (question.type === 'matrix') return summarizeMatrix(question, answers, base);
  if (question.type === 'single' || question.type === 'dropdown' || question.type === 'yes_no' || question.type === 'multi') {
    return summarizeChoices(question, answers, base);
  }
  return summarizeText(question, answers, base);
}

function summarizeScale(
  question: Extract<Question, { type: 'rating' | 'likert' }>,
  answers: (StoredAnswer | undefined)[],
  base: QuestionReport,
): QuestionReport {
  const numbers: number[] = [];
  for (const answer of answers) {
    if (!answer) continue;
    if (answer.t === 'na') base.na += 1;
    else if (answer.t === 'num') numbers.push(answer.v);
  }
  base.answered = numbers.length;
  base.skipped = base.responses - numbers.length - base.na;
  if (numbers.length > 0) {
    const sorted = numbers.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    base.min = sorted[0];
    base.max = sorted[sorted.length - 1];
    base.mean = round1(sorted.reduce((sum, value) => sum + value, 0) / sorted.length);
    base.median = sorted.length % 2 === 1 ? sorted[mid] : round1((sorted[mid - 1] + sorted[mid]) / 2);
    const favorable = numbers.filter((value) => value > (question.scale.min + question.scale.max) / 2).length;
    base.favorablePercent = percent(favorable, numbers.length);
  }
  const counts = new Map<number, number>();
  for (let value = question.scale.min; value <= question.scale.max; value += 1) counts.set(value, 0);
  for (const value of numbers) counts.set(value, (counts.get(value) ?? 0) + 1);
  base.distribution = [...counts.entries()].map(([value, count]) => ({
    key: String(value),
    label: question.scale.labels[String(value)] ? `${value} ${question.scale.labels[String(value)]}` : String(value),
    count,
    percent: percent(count, numbers.length),
  }));
  if (question.type === 'likert' && numbers.length > 0) {
    const midpoint = (question.scale.min + question.scale.max) / 2;
    const agree = numbers.filter((value) => value > midpoint).length;
    const disagree = numbers.filter((value) => value < midpoint).length;
    const neutral = numbers.length - agree - disagree;
    base.likert = {
      agreePercent: percent(agree, numbers.length),
      neutralPercent: percent(neutral, numbers.length),
      disagreePercent: percent(disagree, numbers.length),
    };
  }
  return base;
}

function summarizeChoices(question: Question, answers: (StoredAnswer | undefined)[], base: QuestionReport): QuestionReport {
  const counts = new Map<string, { label: string; count: number }>();
  const add = (key: string, label: string) => {
    const current = counts.get(key) ?? { label, count: 0 };
    current.count += 1;
    counts.set(key, current);
  };
  if (question.type === 'yes_no') {
    counts.set('yes', { label: question.yesLabel, count: 0 });
    counts.set('no', { label: question.noLabel, count: 0 });
  }
  if (question.type === 'single' || question.type === 'dropdown' || question.type === 'multi') {
    for (const choice of question.choices) counts.set(choice.id, { label: choice.label, count: 0 });
  }
  for (const answer of answers) {
    if (!answer) continue;
    if (answer.t === 'choice') {
      base.answered += 1;
      add(answer.id, answer.id === '__other__' ? 'Other' : (counts.get(answer.id)?.label ?? answer.id));
    } else if (answer.t === 'multi') {
      base.answered += 1;
      for (const id of answer.ids) add(id, id === '__other__' ? 'Other' : (counts.get(id)?.label ?? id));
    }
  }
  base.skipped = base.responses - base.answered;
  const denominator = base.responses || base.answered;
  base.distribution = [...counts.entries()].map(([key, item]) => ({
    key,
    label: item.label,
    count: item.count,
    percent: percent(item.count, denominator),
  }));
  return base;
}

function summarizeMatrix(
  question: Extract<Question, { type: 'matrix' }>,
  answers: (StoredAnswer | undefined)[],
  base: QuestionReport,
): QuestionReport {
  let responded = 0;
  for (const answer of answers) {
    if (answer?.t === 'matrix') responded += 1;
  }
  base.answered = responded;
  base.skipped = base.responses - responded;
  const lines: Distribution[] = [];
  const means: number[] = [];
  for (const row of question.rows) {
    const numbers: number[] = [];
    let na = 0;
    for (const answer of answers) {
      if (answer?.t !== 'matrix') continue;
      const cell = answer.rows[row.id];
      if (!cell) continue;
      if ('na' in cell) na += 1;
      else {
        const column = question.columns.find((item) => item.id === cell.id);
        if (column) numbers.push(column.value);
      }
    }
    if (na) base.na += na;
    if (numbers.length > 0) means.push(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
    const columnCounts = question.columns.map((column) => ({
      key: `${row.id}:${column.id}`,
      label: `${row.label}: ${column.label}`,
      count: numbers.filter((value) => value === column.value).length,
      percent: percent(numbers.filter((value) => value === column.value).length, numbers.length),
    }));
    lines.push(...columnCounts);
  }
  base.distribution = lines;
  base.mean = means.length ? round1(means.reduce((sum, value) => sum + value, 0) / means.length) : null;
  return base;
}

function summarizeText(question: Question, answers: (StoredAnswer | undefined)[], base: QuestionReport): QuestionReport {
  for (const answer of answers) {
    if (answer?.t === 'text' && answer.v.trim()) {
      base.answered += 1;
      base.comments.push(answer.v.trim());
    }
  }
  base.skipped = base.responses - base.answered;
  if (question.type !== 'email' && question.type !== 'phone') base.comments = base.comments.slice();
  return base;
}

export function responseRows(survey: string, question: Question, groups: ResponseGroup[]): string[][] {
  return groups
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((group, index) => [
      survey,
      `Response ${index + 1}`,
      group.submittedOn,
      question.title,
      displayAnswer(question, group.answers[question.id]),
    ]);
}

export function percent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function isLowParticipation(submitted: number, expected: number | null, availability: string): boolean {
  if (expected === null || expected <= 0) return false;
  if (availability !== 'open' && availability !== 'closed') return false;
  return submitted / expected < 0.5;
}

export function detailsVisibility(count: number, threshold: number, isAdmin: boolean): { show: boolean; warning: boolean } {
  if (count >= threshold) return { show: true, warning: false };
  if (isAdmin) return { show: true, warning: true };
  return { show: false, warning: false };
}
