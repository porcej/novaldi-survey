import type { FC } from 'hono/jsx';
import { site } from '../content/site';
import { Banner, Hero, Section } from './Layout';

export const StaffLoginPage: FC<{ error?: string }> = (props) => (
  <>
    <Hero title="Staff" lead={`Day-of survey operations for ${site.session.dates}.`} />
    <Section title="Staff sign in" narrow>
      {props.error ? <Banner kind="error">{props.error}</Banner> : null}
      <form method="post" action="/login" class="space-y-5">
        <label class="block">
          <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Staff password</span>
          <input class="input mt-1.5" type="password" name="password" required autocomplete="current-password" />
        </label>
        <button type="submit" class="btn btn-primary">
          Sign in
        </button>
      </form>
    </Section>
  </>
);

export const AdminLoginPage: FC<{ error?: string }> = (props) => (
  <>
    <Hero title="Admin" lead="Build surveys, manage the schedule, and export results." />
    <Section title="Admin sign in" narrow>
      {props.error ? <Banner kind="error">{props.error}</Banner> : null}
      <form method="post" action="/admin/login" class="space-y-5">
        <label class="block">
          <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Email</span>
          <input class="input mt-1.5" type="email" name="email" required autocomplete="username" />
        </label>
        <label class="block">
          <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Password</span>
          <input class="input mt-1.5" type="password" name="password" required autocomplete="current-password" />
        </label>
        <button type="submit" class="btn btn-primary">
          Sign in
        </button>
      </form>
    </Section>
  </>
);
