export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ',') {
      row.push(cell.trim());
      cell = '';
      continue;
    }
    if (char === '\n') {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (char !== '\r') cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value !== ''));
}

export function toCsv(rows: string[][]): string {
  return `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}`;
}

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export type SessionCsvRow = {
  date: string;
  start: string;
  end: string;
  program: string;
  title: string;
  instructors: string[];
  location: string;
  activityType: string;
};

export function parseSessionCsv(text: string): { rows: SessionCsvRow[]; errors: { line: number; message: string }[] } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: 'The file is empty.' }] };
  const header = table[0].map((cell) => cell.toLowerCase());
  const required = ['date', 'start', 'end', 'program', 'title', 'instructors', 'location', 'type'];
  const missing = required.filter((name) => !header.includes(name));
  if (missing.length > 0) return { rows: [], errors: [{ line: 1, message: `Missing columns: ${missing.join(', ')}.` }] };
  const index = new Map(header.map((name, position) => [name, position]));
  const rows: SessionCsvRow[] = [];
  const errors: { line: number; message: string }[] = [];
  table.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    const date = cells[index.get('date') ?? 0] ?? '';
    const start = cells[index.get('start') ?? 0] ?? '';
    const end = cells[index.get('end') ?? 0] ?? '';
    const title = cells[index.get('title') ?? 0] ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push({ line, message: 'Use a YYYY-MM-DD date.' });
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      errors.push({ line, message: 'Use HH:MM for start and end.' });
      return;
    }
    if (!title) {
      errors.push({ line, message: 'Enter a session title.' });
      return;
    }
    const instructors = (cells[index.get('instructors') ?? 0] ?? '')
      .split(';')
      .map((name) => name.trim())
      .filter(Boolean);
    rows.push({
      date,
      start,
      end,
      program: cells[index.get('program') ?? 0] ?? '',
      title,
      instructors,
      location: cells[index.get('location') ?? 0] ?? '',
      activityType: cells[index.get('type') ?? 0] ?? '',
    });
  });
  return { rows, errors };
}

export const SESSION_CSV_TEMPLATE = 'date,start,end,program,title,instructors,location,type\n2026-10-19,09:00,10:30,Company,Leadership Fundamentals,Alex Morgan,Classroom A,instruction\n';
