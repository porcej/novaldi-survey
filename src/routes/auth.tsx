import { Hono } from 'hono';
import { timingSafeEqualString } from '../lib/crypto';
import { clearSessions, isAdminEmail, readAccess, setAdminSession, setStaffSession } from '../lib/session';
import { field, readFields } from '../lib/form';
import { AdminLoginPage, StaffLoginPage } from '../views/Login';
import { page } from './guard';

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.get('/login', async (c) => {
  if ((await readAccess(c)).staff) return c.redirect('/admin/today');
  return page(c, {}, 'Staff sign in', <StaffLoginPage />);
});

authRoutes.post('/login', async (c) => {
  const password = field(await readFields(c), 'password');
  if (!c.env.STAFF_PASSWORD || !c.env.SESSION_SECRET) {
    return page(c, {}, 'Staff sign in', <StaffLoginPage error="Staff sign-in is not configured." />, 500);
  }
  if (!(await timingSafeEqualString(password, c.env.STAFF_PASSWORD))) {
    return page(c, {}, 'Staff sign in', <StaffLoginPage error="That password is not correct." />, 401);
  }
  await setStaffSession(c);
  return c.redirect('/admin/today');
});

authRoutes.get('/admin/login', async (c) => {
  if ((await readAccess(c)).admin) return c.redirect('/admin');
  return page(c, await readAccess(c), 'Admin sign in', <AdminLoginPage />);
});

authRoutes.post('/admin/login', async (c) => {
  const fields = await readFields(c);
  const email = field(fields, 'email').trim().toLowerCase();
  const password = field(fields, 'password');
  const access = await readAccess(c);
  if (!c.env.ADMIN_EMAILS || !c.env.ADMIN_PASSWORD || !c.env.SESSION_SECRET) {
    return page(c, access, 'Admin sign in', <AdminLoginPage error="Admin sign-in is not configured." />, 500);
  }
  const allowed = isAdminEmail(c.env.ADMIN_EMAILS, email);
  const passwordOk = await timingSafeEqualString(password, c.env.ADMIN_PASSWORD);
  if (!allowed || !passwordOk) return page(c, access, 'Admin sign in', <AdminLoginPage error="Invalid email or password." />, 401);
  await setAdminSession(c, email);
  return c.redirect('/admin');
});

authRoutes.post('/logout', (c) => {
  clearSessions(c);
  return c.redirect('/');
});
