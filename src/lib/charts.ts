import { summarizeQuestion, type QuestionReport, type ResponseGroup } from './report';
import type { Question, StoredAnswer } from './questions';

export type Tone = 'outer-neg' | 'inner-neg' | 'neutral' | 'inner-pos' | 'outer-pos' | 'yes' | 'no';

export type Slice = { label: string; count: number; percent: number; tone: Tone };

export type Bar = { label: string; count: number; percent: number; width: number };

export type DivergingChart = {
  kind: 'diverging';
  title: string;
  left: number;
  center: number;
  right: number;
  slices: Slice[];
  legend: Slice[];
};

export type HistogramChart = { kind: 'histogram'; title: string; bars: Bar[] };

export type HorizontalChart = { kind: 'bars'; title: string; bars: Bar[] };

export type StackedChart = { kind: 'stacked'; title: string; slices: Slice[] };

export type DrawnChart = DivergingChart | HistogramChart | HorizontalChart | StackedChart;

export type Trend = { points: { date: string; label: string; mean: number }[]; min: number; max: number };

export type ComparisonBar = { label: string; mean: number; current: boolean };

export type ReportBlock = {
  report: QuestionReport;
  charts: DrawnChart[];
  trend: Trend | null;
  comparison: ComparisonBar[] | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function percentShares(counts: number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total <= 0) return counts.map(() => 0);
  const raw = counts.map((count) => Math.round((count / total) * 100));
  const drift = 100 - raw.reduce((sum, value) => sum + value, 0);
  let index = 0;
  raw.forEach((value, position) => {
    if (value > raw[index]) index = position;
  });
  raw[index] += drift;
  return raw;
}

export function divergingBar(points: { value: number; label: string; count: number }[]): Pick<DivergingChart, 'left' | 'center' | 'right' | 'slices' | 'legend'> {
  if (points.length === 0) return { left: 0, center: 0, right: 0, slices: [], legend: [] };
  const mid = (Math.min(...points.map((point) => point.value)) + Math.max(...points.map((point) => point.value))) / 2;
  const below = points.filter((point) => point.value < mid).sort((a, b) => a.value - b.value);
  const above = points.filter((point) => point.value > mid).sort((a, b) => a.value - b.value);
  const center = points.filter((point) => point.value === mid);
  const tone = new Map<number, Tone>();
  below.forEach((point, index) => tone.set(point.value, index === 0 ? 'outer-neg' : 'inner-neg'));
  above.forEach((point, index) => tone.set(point.value, index === above.length - 1 ? 'outer-pos' : 'inner-pos'));
  center.forEach((point) => tone.set(point.value, 'neutral'));
  const ordered = points.slice().sort((a, b) => a.value - b.value);
  const drawn = ordered.filter((point) => point.count > 0);
  const widths = percentShares(drawn.map((point) => point.count));
  const widthOf = new Map(drawn.map((point, index) => [point.value, widths[index] ?? 0]));
  const legend = ordered.map((point) => ({
    label: point.label,
    count: point.count,
    percent: widthOf.get(point.value) ?? 0,
    tone: tone.get(point.value) ?? 'neutral',
  }));
  return {
    left: below.reduce((sum, point) => sum + point.count, 0),
    center: center.reduce((sum, point) => sum + point.count, 0),
    right: above.reduce((sum, point) => sum + point.count, 0),
    slices: legend.filter((slice) => slice.count > 0),
    legend,
  };
}

export function chartsForQuestion(question: Question, report: QuestionReport): DrawnChart[] {
  if (question.type === 'rating' || question.type === 'likert') {
    const points = scalePoints(question.scale.min, question.scale.max, report);
    if (points.every((point) => point.count === 0)) return [];
    if (question.type === 'rating' && question.scale.max - question.scale.min + 1 > 5) {
      return [{ kind: 'histogram', title: '', bars: histogramBars(points) }];
    }
    return [{ kind: 'diverging', title: '', ...divergingBar(points) }];
  }
  if (question.type === 'matrix') {
    const wide = question.columns.length > 5;
    const charts: DrawnChart[] = [];
    for (const row of question.rows) {
      const points = question.columns.map((column) => {
        const item = report.distribution.find((entry) => entry.key === `${row.id}:${column.id}`);
        return { value: column.value, label: column.label, count: item?.count ?? 0 };
      });
      if (points.every((point) => point.count === 0)) continue;
      charts.push(wide ? { kind: 'histogram', title: row.label, bars: histogramBars(points) } : { kind: 'diverging', title: row.label, ...divergingBar(points) });
    }
    return charts;
  }
  if (question.type === 'yes_no') {
    const yes = report.distribution.find((entry) => entry.key === 'yes');
    const no = report.distribution.find((entry) => entry.key === 'no');
    const counts = [yes?.count ?? 0, no?.count ?? 0];
    if (counts[0] + counts[1] === 0) return [];
    const [yesPercent, noPercent] = percentShares(counts);
    return [{
      kind: 'stacked',
      title: '',
      slices: [
        { label: yes?.label ?? 'Yes', count: counts[0], percent: yesPercent, tone: 'yes' },
        { label: no?.label ?? 'No', count: counts[1], percent: noPercent, tone: 'no' },
      ],
    }];
  }
  if (question.type === 'single' || question.type === 'dropdown' || question.type === 'multi') {
    const ranked = report.distribution
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    if (ranked.length === 0) return [];
    const max = ranked[0]?.count ?? 0;
    return [{
      kind: 'bars',
      title: '',
      bars: ranked.map((entry) => ({
        label: entry.label,
        count: entry.count,
        percent: entry.percent,
        width: max === 0 ? 0 : Math.round((entry.count / max) * 100),
      })),
    }];
  }
  return [];
}

export function dailyMeans(question: Question, groups: ResponseGroup[]): Trend | null {
  const scale = scaleOf(question);
  if (!scale) return null;
  const byDay = new Map<string, number[]>();
  for (const group of groups) {
    const values = numericValues(question, group.answers[question.id]);
    if (values.length === 0) continue;
    const list = byDay.get(group.submittedOn) ?? [];
    list.push(...values);
    byDay.set(group.submittedOn, list);
  }
  const points = [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({
      date,
      label: shortDate(date),
      mean: round1(values.reduce((sum, value) => sum + value, 0) / values.length),
    }));
  if (points.length < 2) return null;
  return { points, min: scale.min, max: scale.max };
}

export function sessionBars(current: { label: string; mean: number | null }, peers: { label: string; mean: number | null }[]): ComparisonBar[] | null {
  const bars: ComparisonBar[] = [];
  if (current.mean !== null) bars.push({ label: current.label, mean: current.mean, current: true });
  for (const peer of peers) {
    if (peer.mean !== null) bars.push({ label: peer.label, mean: peer.mean, current: false });
  }
  if (!bars.some((bar) => bar.current) || !bars.some((bar) => !bar.current)) return null;
  return bars.sort((a, b) => b.mean - a.mean || a.label.localeCompare(b.label));
}

export function reportBlock(question: Question, groups: ResponseGroup[], comparison: ComparisonBar[] | null): ReportBlock {
  const report = summarizeQuestion(question, groups);
  return {
    report,
    charts: chartsForQuestion(question, report),
    trend: dailyMeans(question, groups),
    comparison,
  };
}

function histogramBars(points: { label: string; count: number }[]): Bar[] {
  const max = Math.max(...points.map((point) => point.count), 0);
  const shares = percentShares(points.map((point) => point.count));
  return points.map((point, index) => ({
    label: point.label,
    count: point.count,
    percent: shares[index] ?? 0,
    width: max === 0 ? 0 : Math.round((point.count / max) * 100),
  }));
}

function scalePoints(min: number, max: number, report: QuestionReport): { value: number; label: string; count: number }[] {
  const points = [];
  for (let value = min; value <= max; value += 1) {
    const item = report.distribution.find((entry) => entry.key === String(value));
    points.push({ value, label: item?.label ?? String(value), count: item?.count ?? 0 });
  }
  return points;
}

function scaleOf(question: Question): { min: number; max: number } | null {
  if (question.type === 'rating' || question.type === 'likert') return { min: question.scale.min, max: question.scale.max };
  if (question.type === 'matrix' && question.columns.length > 0) {
    const values = question.columns.map((column) => column.value);
    return { min: Math.min(...values), max: Math.max(...values) };
  }
  return null;
}

function numericValues(question: Question, answer: StoredAnswer | undefined): number[] {
  if (!answer) return [];
  if ((question.type === 'rating' || question.type === 'likert') && answer.t === 'num') return [answer.v];
  if (question.type === 'matrix' && answer.t === 'matrix') {
    const values: number[] = [];
    for (const row of question.rows) {
      const cell = answer.rows[row.id];
      if (!cell || 'na' in cell) continue;
      const column = question.columns.find((item) => item.id === cell.id);
      if (column) values.push(column.value);
    }
    return values;
  }
  return [];
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${MONTHS[Number(month) - 1] ?? month} ${Number(day)}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
