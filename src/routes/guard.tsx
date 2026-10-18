import type { Context } from 'hono';
import type { Child } from 'hono/jsx';
import { readAccess, type Access, type AdminSession } from '../lib/session';
import { Hero, Layout, Section, renderPage } from '../views/Layout';

export type AppContext = Context<{ Bindings: Env }>;

export function page(c: AppContext, access: { staff?: boolean; admin?: { email: string } | null }, title: string, node: Child, status: 200 | 400 | 401 | 403 | 404 | 429 | 500 = 200, survey = false) {
  return renderPage(
    c,
    <Layout title={title} staff={access.staff} admin={Boolean(access.admin)} survey={survey}>
      {node}
    </Layout>,
    status,
  );
}

export async function requireStaff(c: AppContext): Promise<Access | Response> {
  const access = await readAccess(c);
  if (!access.staff) return c.redirect('/login');
  return access;
}

export async function requireAdmin(c: AppContext): Promise<(Access & { admin: AdminSession }) | Response> {
  const access = await readAccess(c);
  if (access.admin) return { ...access, admin: access.admin };
  if (access.staff) {
    return page(
      c,
      access,
      'Administrators only',
      <>
        <Hero title="Administrators only" lead="Day-of staff can monitor surveys. Templates, the schedule, and exports need an administrator." />
        <Section narrow>
          <a href="/admin/today" class="btn btn-primary">
            Back to today
          </a>
        </Section>
      </>,
      403,
    );
  }
  return c.redirect('/admin/login');
}
