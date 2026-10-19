export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function partsInZone(date: Date, timeZone: string): ZonedParts {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of formatted) map[part.type] = part.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = partsInZone(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function zonedToUtc(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) throw new Error('Invalid date or time.');
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = wall - zoneOffsetMs(new Date(wall), timeZone);
  instant = wall - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant).toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function nextCalendarDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export function endOfDayUtc(date: string, timeZone: string): string {
  const startNext = zonedToUtc(nextCalendarDate(date), '00:00', timeZone);
  return new Date(new Date(startNext).getTime() - 1000).toISOString();
}

export function dateInZone(iso: string, timeZone: string): string {
  const parts = partsInZone(new Date(iso), timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function formatInstant(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function formatWeekday(date: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(zonedToUtc(date, '12:00', timeZone)));
}

export function formatDay(isoOrDate: string, timeZone: string): string {
  const iso = isoOrDate.includes('T') ? isoOrDate : zonedToUtc(isoOrDate, '12:00', timeZone);
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export function formatLongDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

export function todayInZone(timeZone: string, now = new Date()): string {
  const parts = partsInZone(now, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function datetimeLocalToUtc(value: string, timeZone: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value.trim());
  if (!match) throw new Error('Enter a date and time.');
  return zonedToUtc(match[1], match[2], timeZone);
}

export function utcToDatetimeLocal(iso: string, timeZone: string): string {
  const parts = partsInZone(new Date(iso), timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}
