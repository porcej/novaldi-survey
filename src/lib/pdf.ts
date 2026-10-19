import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Bar, ComparisonBar, DrawnChart, ReportBlock, Slice, Tone, Trend } from './charts';

export type SurveyPdf = {
  title: string;
  context: string;
  responseCount: number;
  expected: number | null;
  warning: string | null;
  blocks: ReportBlock[];
  rows: string[][];
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const NAVY = rgb(0, 32 / 255, 91 / 255);
const GOLD = rgb(1, 199 / 255, 44 / 255);
const INK = rgb(12 / 255, 22 / 255, 48 / 255);
const MUTED = rgb(90 / 255, 101 / 255, 120 / 255);
const SURFACE = rgb(242 / 255, 244 / 255, 248 / 255);
const WHITE = rgb(1, 1, 1);

const TONE: Record<Tone, ReturnType<typeof rgb>> = {
  'outer-neg': rgb(107 / 255, 45 / 255, 60 / 255),
  'inner-neg': rgb(196 / 255, 164 / 255, 164 / 255),
  neutral: rgb(213 / 255, 216 / 255, 224 / 255),
  'inner-pos': rgb(142 / 255, 160 / 255, 200 / 255),
  'outer-pos': NAVY,
  yes: NAVY,
  no: rgb(107 / 255, 45 / 255, 60 / 255),
};

export async function buildSurveyPdf(input: SurveyPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cursor = {
    doc,
    font,
    bold,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
    title: input.title,
  };
  drawCover(cursor, input);
  for (const block of input.blocks) drawQuestion(cursor, block);
  drawTable(cursor, input.rows);
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawText(pdfText(`${index + 1} of ${pages.length}`), { x: PAGE_WIDTH - MARGIN - 48, y: 24, size: 9, font, color: MUTED });
  });
  return doc.save();
}

type Cursor = { doc: PDFDocument; font: PDFFont; bold: PDFFont; page: PDFPage; y: number; title: string };

function drawCover(cursor: Cursor, input: SurveyPdf) {
  cursor.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 8, width: PAGE_WIDTH, height: 8, color: GOLD });
  const title = wrap(cursor.bold, input.title, 22, PAGE_WIDTH - MARGIN * 2);
  for (const line of title) {
    text(cursor, line, 22, NAVY, cursor.bold);
  }
  if (input.context) text(cursor, input.context, 11, MUTED);
  const expected = input.expected ? ` of ${input.expected} expected` : '';
  text(cursor, `${input.responseCount}${expected} responses`, 11, INK);
  if (input.warning) text(cursor, input.warning, 10, MUTED);
  cursor.y -= 8;
}

function drawQuestion(cursor: Cursor, block: ReportBlock) {
  ensure(cursor, 72);
  cursor.y -= 8;
  for (const line of wrap(cursor.bold, block.report.title, 14, PAGE_WIDTH - MARGIN * 2)) text(cursor, line, 14, NAVY, cursor.bold);
  const stats = [
    `${block.report.answered} answered`,
    `${block.report.na} N/A`,
    `${block.report.skipped} skipped`,
    block.report.mean !== null ? `mean ${block.report.mean}` : '',
    block.report.median !== null ? `median ${block.report.median}` : '',
    block.report.favorablePercent !== null ? `favorable ${block.report.favorablePercent}%` : '',
  ].filter(Boolean);
  text(cursor, stats.join('  ·  '), 9, MUTED);
  for (const chart of block.charts) drawChart(cursor, chart);
  if (block.trend) drawTrend(cursor, block.trend);
  if (block.comparison) drawComparison(cursor, block.comparison);
  if (block.charts.length === 0 && block.report.comments.length > 0) text(cursor, `${block.report.comments.length} written responses are listed in the table below.`, 9, MUTED);
}

function drawChart(cursor: Cursor, chart: DrawnChart) {
  if (chart.title) text(cursor, chart.title, 11, INK, cursor.bold);
  if (chart.kind === 'diverging' || chart.kind === 'stacked') {
    drawStack(cursor, chart.slices);
    drawLegend(cursor, chart.kind === 'diverging' ? chart.legend : chart.slices);
  } else if (chart.kind === 'bars') drawHorizontal(cursor, chart.bars, (bar) => `${bar.count} (${bar.percent}%)`);
  else drawHistogram(cursor, chart.bars);
}

function drawStack(cursor: Cursor, slices: Slice[]) {
  ensure(cursor, 22);
  const width = PAGE_WIDTH - MARGIN * 2;
  const heights = segmentWidths(slices.map((slice) => slice.percent), width);
  let x = MARGIN;
  slices.forEach((slice, index) => {
    const span = heights[index] ?? 0;
    cursor.page.drawRectangle({ x, y: cursor.y - 16, width: Math.max(span, 0), height: 16, color: TONE[slice.tone] });
    if (span >= 28) {
      const light = slice.tone === 'neutral' || slice.tone === 'inner-neg' || slice.tone === 'inner-pos';
      cursor.page.drawText(String(slice.count), { x: x + 3, y: cursor.y - 12, size: 8, font: cursor.bold, color: light ? INK : WHITE });
    }
    x += span;
  });
  cursor.y -= 22;
}

function drawLegend(cursor: Cursor, slices: Slice[]) {
  for (const slice of slices) {
    ensure(cursor, 12);
    cursor.page.drawRectangle({ x: MARGIN, y: cursor.y - 8, width: 8, height: 8, color: TONE[slice.tone] });
    text(cursor, `${slice.label}    ${slice.count} (${slice.percent}%)`, 9, INK, cursor.font, MARGIN + 14);
  }
}

function drawHorizontal(cursor: Cursor, bars: Bar[], caption: (bar: Bar) => string) {
  const track = 220;
  for (const bar of bars) {
    const lines = wrap(cursor.font, bar.label, 9, 180);
    ensure(cursor, Math.max(16, lines.length * 11));
    lines.forEach((line, index) => {
      cursor.page.drawText(line, { x: MARGIN, y: cursor.y - 9, size: 9, font: cursor.font, color: INK });
      if (index < lines.length - 1) cursor.y -= 11;
    });
    const span = (bar.width / 100) * track;
    cursor.page.drawRectangle({ x: MARGIN + 190, y: cursor.y - 10, width: track, height: 8, color: SURFACE });
    cursor.page.drawRectangle({ x: MARGIN + 190, y: cursor.y - 10, width: span, height: 8, color: NAVY });
    const note = caption(bar);
    if (note) cursor.page.drawText(pdfText(note), { x: MARGIN + 190 + track + 6, y: cursor.y - 9, size: 8, font: cursor.font, color: MUTED });
    cursor.y -= 16;
  }
}

function drawHistogram(cursor: Cursor, bars: Bar[]) {
  const height = 70;
  ensure(cursor, height + 28);
  const gap = 4;
  const slot = (PAGE_WIDTH - MARGIN * 2) / Math.max(bars.length, 1);
  bars.forEach((bar, index) => {
    const barHeight = (bar.width / 100) * height;
    const x = MARGIN + index * slot + gap / 2;
    cursor.page.drawRectangle({ x, y: cursor.y - height, width: Math.max(slot - gap, 2), height: barHeight, color: NAVY });
    const label = pdfText(bar.label).slice(0, 10);
    cursor.page.drawText(label, { x, y: cursor.y - height - 12, size: 7, font: cursor.font, color: MUTED });
  });
  cursor.y -= height + 18;
}

function drawTrend(cursor: Cursor, trend: Trend) {
  text(cursor, 'Daily mean', 9, MUTED);
  const width = 360;
  const height = 70;
  ensure(cursor, height + 16);
  const left = MARGIN;
  const bottom = cursor.y - height;
  cursor.page.drawRectangle({ x: left, y: bottom, width, height, borderColor: SURFACE, borderWidth: 1 });
  const span = trend.max - trend.min || 1;
  const coords = trend.points.map((point, index) => ({
    x: left + (index / (trend.points.length - 1)) * width,
    y: bottom + ((point.mean - trend.min) / span) * height,
  }));
  for (let index = 1; index < coords.length; index += 1) {
    const from = coords[index - 1];
    const to = coords[index];
    if (from && to) cursor.page.drawLine({ start: from, end: to, thickness: 1.5, color: NAVY });
  }
  cursor.y -= height + 14;
  text(cursor, trend.points.map((point) => `${point.label} ${point.mean}`).join('   '), 8, MUTED);
}

function drawComparison(cursor: Cursor, bars: ComparisonBar[]) {
  text(cursor, 'Same metric in other sessions', 9, MUTED);
  const max = Math.max(...bars.map((bar) => bar.mean), 0);
  drawHorizontal(
    cursor,
    bars.map((bar) => ({
      label: bar.current ? `${bar.label} (this survey)` : bar.label,
      count: 0,
      percent: 0,
      width: max === 0 ? 0 : Math.round((bar.mean / max) * 100),
    })),
    (bar) => {
      const source = bars.find((item) => (item.current ? `${item.label} (this survey)` : item.label) === bar.label);
      return source ? String(source.mean) : '';
    },
  );
}

function drawTable(cursor: Cursor, rows: string[][]) {
  cursor.y -= 12;
  text(cursor, 'Responses', 16, NAVY, cursor.bold);
  if (rows.length <= 1) {
    text(cursor, 'No answers were submitted.', 10, MUTED);
    return;
  }
  const columns = [78, 72, 160, PAGE_WIDTH - MARGIN * 2 - 78 - 72 - 160];
  const drawHeader = () => {
    ensure(cursor, 18);
    cursor.page.drawRectangle({ x: MARGIN, y: cursor.y - 14, width: PAGE_WIDTH - MARGIN * 2, height: 16, color: NAVY });
    let x = MARGIN + 4;
    ['Response', 'Submitted', 'Question', 'Answer'].forEach((label, index) => {
      cursor.page.drawText(label, { x, y: cursor.y - 10, size: 8, font: cursor.bold, color: WHITE });
      x += columns[index] ?? 0;
    });
    cursor.y -= 20;
  };
  drawHeader();
  for (const row of rows.slice(1)) {
    const body = [1, 2, 3, 4].map((index, position) => wrap(cursor.font, row[index] ?? '', 8, (columns[position] ?? 40) - 8));
    const height = Math.max(...body.map((lines) => lines.length), 1) * 11 + 6;
    if (cursor.y - height < MARGIN) {
      newPage(cursor);
      drawHeader();
    }
    let x = MARGIN;
    body.forEach((lines, position) => {
      lines.forEach((line, lineIndex) => {
        cursor.page.drawText(line, { x: x + 2, y: cursor.y - 10 - lineIndex * 11, size: 8, font: cursor.font, color: INK });
      });
      x += columns[position] ?? 0;
    });
    cursor.y -= height;
  }
}

function text(cursor: Cursor, value: string, size: number, color: ReturnType<typeof rgb>, font = cursor.font, x = MARGIN) {
  ensure(cursor, size + 6);
  cursor.page.drawText(pdfText(value), { x, y: cursor.y - size, size, font, color });
  cursor.y -= size + 4;
}

function ensure(cursor: Cursor, height: number) {
  if (cursor.y - height < MARGIN) newPage(cursor);
}

function newPage(cursor: Cursor) {
  cursor.page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  cursor.y = PAGE_HEIGHT - MARGIN;
  cursor.page.drawText(pdfText(cursor.title), { x: MARGIN, y: cursor.y - 10, size: 9, font: cursor.font, color: MUTED });
  cursor.y -= 22;
}

function segmentWidths(percents: number[], total: number): number[] {
  const raw = percents.map((percent) => (percent / 100) * total);
  const used = raw.reduce((sum, value) => sum + value, 0);
  if (raw.length > 0) raw[raw.length - 1] += total - used;
  return raw;
}

function wrap(font: PDFFont, value: string, size: number, width: number): string[] {
  const clean = pdfText(value).replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of clean.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, size) <= width) {
      line = word;
      continue;
    }
    let chunk = '';
    for (const char of word) {
      const next = chunk + char;
      if (font.widthOfTextAtSize(next, size) <= width) chunk = next;
      else {
        if (chunk) lines.push(chunk);
        chunk = char;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines;
}

export function pdfText(value: string): string {
  return [...value]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code === 0x2018 || code === 0x2019) return "'";
      if (code === 0x201c || code === 0x201d) return '"';
      if (code === 0x2013 || code === 0x2014) return '-';
      if (code === 0x2026) return '...';
      if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) return char;
      return '';
    })
    .join('');
}
