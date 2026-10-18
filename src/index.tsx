import { Hono } from 'hono';
import { ensureSeeded } from './lib/db';
import { assignmentRoutes } from './routes/assignments';
import { authRoutes } from './routes/auth';
import { publicRoutes } from './routes/public';
import { reportRoutes } from './routes/reports';
import { scheduleRoutes } from './routes/schedule';
import { templateRoutes } from './routes/templates';
import { Hero, Layout, Section, renderPage } from './views/Layout';

const app = new Hono<{ Bindings: Env }>();
let seeded = false;

app.use('*', async (c, next) => {
  if (!seeded) {
    await ensureSeeded(c.env.DB);
    seeded = true;
  }
  await next();
});

app.get('/health', (c) => c.json({ ok: true }));

app.route('/', publicRoutes);
app.route('/', authRoutes);
app.route('/', assignmentRoutes);
app.route('/', scheduleRoutes);
app.route('/', templateRoutes);
app.route('/', reportRoutes);

app.notFound((c) =>
  renderPage(
    c,
    <Layout title="Not found">
      <Hero title="Page not found" lead="That page is not part of LDI evaluations." />
      <Section title="Continue" narrow>
        <a href="/" class="btn btn-primary">
          Evaluation home
        </a>
      </Section>
    </Layout>,
    404,
  ),
);

app.onError((err, c) => {
  const path = new URL(c.req.url).pathname;
  const surveyPath = path.startsWith('/s/');
  console.error(JSON.stringify({ event: 'request_failed', path: surveyPath ? '/s/:id' : path, message: surveyPath ? 'request failed' : err instanceof Error ? err.message : 'request failed' }));
  return renderPage(
    c,
    <Layout title="Error">
      <Hero title="Something went wrong" lead="Please try again. If this keeps happening, email the LDI team." />
      <Section title="Continue" narrow>
        <a href="/" class="btn btn-primary">
          Evaluation home
        </a>
      </Section>
    </Layout>,
    500,
  );
});

export default app;
