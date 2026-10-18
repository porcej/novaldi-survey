import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { base64UrlToUtf8, hmacSign, hmacVerify, utf8ToBase64Url } from './crypto';

const STAFF_COOKIE = 'ldi_survey_staff';
const ADMIN_COOKIE = 'ldi_survey_admin';

export type StaffSession = { type: 'staff' };
export type AdminSession = { type: 'admin'; email: string };
export type Access = { staff: boolean; admin: AdminSession | null; actor: string | null };

type StaffPayload = StaffSession & { exp: number };
type AdminPayload = AdminSession & { exp: number };

const TTL = 60 * 60 * 12;

function cookieOpts(c: Context, maxAge: number) {
  const secure = new URL(c.req.url).protocol === 'https:';
  return { httpOnly: true, secure, sameSite: 'Lax' as const, path: '/', maxAge };
}

async function encodeToken(secret: string, payload: StaffPayload | AdminPayload): Promise<string> {
  const body = utf8ToBase64Url(JSON.stringify(payload));
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

async function decodeToken(secret: string, token: string): Promise<StaffPayload | AdminPayload | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!(await hmacVerify(secret, body, sig))) return null;
  try {
    const payload = JSON.parse(base64UrlToUtf8(body)) as StaffPayload | AdminPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.type === 'staff') return payload;
    if (payload.type === 'admin' && typeof payload.email === 'string') return payload;
    return null;
  } catch {
    return null;
  }
}

export async function setStaffSession(c: Context<{ Bindings: Env }>) {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const token = await encodeToken(c.env.SESSION_SECRET, { type: 'staff', exp });
  setCookie(c, STAFF_COOKIE, token, cookieOpts(c, TTL));
}

export async function setAdminSession(c: Context<{ Bindings: Env }>, email: string) {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const token = await encodeToken(c.env.SESSION_SECRET, { type: 'admin', email, exp });
  setCookie(c, ADMIN_COOKIE, token, cookieOpts(c, TTL));
}

export function clearStaffSession(c: Context) {
  deleteCookie(c, STAFF_COOKIE, { path: '/' });
}

export function clearAdminSession(c: Context) {
  deleteCookie(c, ADMIN_COOKIE, { path: '/' });
}

export function clearSessions(c: Context) {
  clearStaffSession(c);
  clearAdminSession(c);
}

export async function readStaffSession(c: Context<{ Bindings: Env }>): Promise<StaffSession | null> {
  const token = getCookie(c, STAFF_COOKIE);
  if (!token || !c.env.SESSION_SECRET) return null;
  const payload = await decodeToken(c.env.SESSION_SECRET, token);
  if (!payload || payload.type !== 'staff') return null;
  return { type: 'staff' };
}

export async function readAdminSession(c: Context<{ Bindings: Env }>): Promise<AdminSession | null> {
  const token = getCookie(c, ADMIN_COOKIE);
  if (!token || !c.env.SESSION_SECRET) return null;
  const payload = await decodeToken(c.env.SESSION_SECRET, token);
  if (!payload || payload.type !== 'admin') return null;
  return { type: 'admin', email: payload.email };
}

export async function readAccess(c: Context<{ Bindings: Env }>): Promise<Access> {
  const [staff, admin] = await Promise.all([readStaffSession(c), readAdminSession(c)]);
  const signedIn = Boolean(staff) || Boolean(admin);
  return { staff: signedIn, admin, actor: admin?.email ?? (signedIn ? 'staff' : null) };
}

export function isAdminEmail(allowlist: string | undefined, email: string): boolean {
  if (!allowlist) return false;
  const wanted = email.trim().toLowerCase();
  return allowlist
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(wanted);
}
