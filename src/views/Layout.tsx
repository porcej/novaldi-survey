import type { Child, FC } from 'hono/jsx';
import { html } from 'hono/html';
import type { Context } from 'hono';
import { site } from '../content/site';
import { STATUS_LABEL } from '../lib/format';
import type { Availability } from '../lib/schedule';

type LayoutProps = {
  title: string;
  description?: string;
  staff?: boolean;
  admin?: boolean;
  survey?: boolean;
  children?: Child;
};

export const Layout: FC<LayoutProps> = (props) => {
  const fullTitle = props.title === site.shortName ? site.name : `${props.title} | ${site.shortName}`;
  const description = props.description ?? 'Evaluations for the Northern Virginia Fire & Rescue Leadership Development Institute.';
  const signedIn = Boolean(props.staff || props.admin);

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#00205b" />
        <meta name="robots" content="noindex" />
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <link rel="icon" type="image/jpeg" href="/favicon.jpg" />
        <link rel="apple-touch-icon" href="/images/ldi-logo.jpg" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body class="flex min-h-screen flex-col">
        <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-gold focus:px-4 focus:py-2 focus:text-navy">
          Skip to content
        </a>
        <Header staff={props.staff} admin={props.admin} signedIn={signedIn} />
        <main id="main" class="flex-1">
          {props.children}
        </main>
        <Footer signedIn={signedIn} />
        {props.survey ? <script src="/survey.js" defer></script> : null}
      </body>
    </html>
  );
};

const Header: FC<{ staff?: boolean; admin?: boolean; signedIn: boolean }> = (props) => (
  <header class="animate-settle sticky top-0 z-50 border-b border-white/10 bg-navy">
    <div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 md:h-[4.25rem] md:px-8">
      <a href={props.signedIn ? '/admin/today' : '/'} class="flex items-center gap-3 text-white">
        <img src="/images/ldi-logo.jpg" alt="" width="40" height="40" class="h-9 w-9 rounded-full ring-2 ring-gold/80 md:h-10 md:w-10" />
        <span class="font-display text-lg font-bold uppercase tracking-wide md:text-xl">{site.shortName}</span>
      </a>
      <nav class="hidden items-center gap-6 lg:flex" aria-label="Primary">
        <NavLinks staff={props.staff} admin={props.admin} signedIn={props.signedIn} />
      </nav>
      <details class="relative lg:hidden">
        <summary class="cursor-pointer list-none rounded border border-white/30 px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-white marker:content-none [&::-webkit-details-marker]:hidden">
          Menu
        </summary>
        <div class="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded border border-navy/10 bg-white py-1 shadow-xl">
          <NavLinks staff={props.staff} admin={props.admin} signedIn={props.signedIn} mobile />
        </div>
      </details>
    </div>
  </header>
);

const NavLinks: FC<{ staff?: boolean; admin?: boolean; signedIn: boolean; mobile?: boolean }> = (props) => {
  const itemClass = props.mobile
    ? 'block px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-wide text-navy hover:bg-surface'
    : 'font-display text-[0.95rem] font-semibold uppercase tracking-[0.12em] text-white/80 transition hover:text-gold';
  if (!props.signedIn) {
    return (
      <>
        {site.nav.map((item) => (
          <a href={item.href} class={itemClass}>
            {item.label}
          </a>
        ))}
        <a href="/login" class={itemClass}>
          Staff
        </a>
        <a href="/admin/login" class={props.mobile ? 'mx-3 my-2 block rounded bg-gold px-4 py-2 text-center font-display text-sm font-semibold uppercase tracking-wide text-navy' : 'btn btn-primary btn-sm !px-5 !py-2 !text-[0.95rem]'}>
          Admin
        </a>
      </>
    );
  }
  return (
    <>
      <a href="/admin/today" class={itemClass}>
        Today
      </a>
      <a href="/admin" class={itemClass}>
        Surveys
      </a>
      {props.admin ? (
        <>
          <a href="/admin/schedule" class={itemClass}>
            Schedule
          </a>
          <a href="/admin/templates" class={itemClass}>
            Templates
          </a>
        </>
      ) : null}
      <form method="post" action="/logout" class={props.mobile ? 'px-3 py-2' : ''}>
        <button type="submit" class={props.mobile ? 'btn btn-secondary w-full !text-sm' : 'btn btn-ghost btn-sm'}>
          Sign out
        </button>
      </form>
    </>
  );
};

const Footer: FC<{ signedIn: boolean }> = (props) => (
  <footer class="bg-navy-deep text-white">
    <div class="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-12 md:flex-row md:justify-between md:px-8">
      <div class="max-w-sm">
        <div class="flex items-center gap-3">
          <img src="/images/ldi-logo.jpg" alt="" width="40" height="40" class="h-10 w-10 rounded-full ring-2 ring-gold/70" />
          <p class="font-display text-xl font-bold uppercase tracking-wide">{site.shortName}</p>
        </div>
        <p class="mt-3 text-sm leading-relaxed text-white/65">{site.tagline}</p>
      </div>
      <div class="flex flex-wrap gap-x-12 gap-y-8 text-sm">
        <div>
          <p class="font-display text-sm font-semibold uppercase tracking-wider text-gold">Explore</p>
          <ul class="mt-3 space-y-2">
            {site.nav.map((item) => (
              <li>
                <a href={item.href} class="text-white/75 hover:text-gold">
                  {item.label}
                </a>
              </li>
            ))}
            {props.signedIn ? (
              <li>
                <a href="/admin/today" class="text-white/75 hover:text-gold">
                  Today
                </a>
              </li>
            ) : null}
          </ul>
        </div>
        <div>
          <p class="font-display text-sm font-semibold uppercase tracking-wider text-gold">Connect</p>
          <ul class="mt-3 space-y-2">
            <li>
              <a href={`mailto:${site.email}`} class="text-white/75 hover:text-gold">
                {site.email}
              </a>
            </li>
            <li>
              <a href={site.nversHomeUrl} target="_blank" rel="noopener noreferrer" class="text-white/75 hover:text-gold">
                NVERS
              </a>
            </li>
            {site.social.map((link) => (
              <li>
                <a href={link.href} target="_blank" rel="noopener noreferrer" class="text-white/75 hover:text-gold">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a href="/admin/login" class="text-white/75 hover:text-gold">
                Admin login
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div class="border-t border-white/10">
      <div class="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4 text-xs text-white/45 md:flex-row md:justify-between md:px-8">
        <p>&copy; {new Date().getFullYear()} {site.shortName}</p>
        <p>A NVERS Fire/EMS program</p>
      </div>
    </div>
  </footer>
);

export const Hero: FC<{ title: string; lead?: string; compact?: boolean }> = (props) => (
  <section class="hero-atmosphere text-white">
    <div class={`mx-auto max-w-6xl px-5 md:px-8 ${props.compact ? 'py-8 md:py-10' : 'py-12 md:py-14'}`}>
      <p class="font-display text-sm font-semibold uppercase tracking-[0.2em] text-gold">{site.shortName}</p>
      <h1 class="mt-2 max-w-3xl font-display text-4xl font-bold uppercase leading-none tracking-wide md:text-5xl">{props.title}</h1>
      {props.lead ? <p class="mt-4 max-w-2xl text-lg leading-relaxed text-white/75">{props.lead}</p> : null}
    </div>
  </section>
);

export const Section: FC<{ title?: string; lead?: string; narrow?: boolean; children?: Child }> = (props) => (
  <section class="bg-white py-10 text-ink md:py-12">
    <div class="mx-auto max-w-6xl px-5 md:px-8">
      {props.title ? (
        <div class={props.narrow ? 'max-w-2xl' : ''}>
          <h2 class="font-display text-3xl font-bold uppercase leading-none tracking-wide text-navy md:text-4xl">{props.title}</h2>
          {props.lead ? <p class="mt-4 text-lg leading-relaxed text-muted">{props.lead}</p> : null}
        </div>
      ) : null}
      <div class={`${props.title ? 'mt-8' : ''} ${props.narrow ? 'max-w-2xl' : ''}`}>{props.children}</div>
    </div>
  </section>
);

export const Banner: FC<{ kind: 'error' | 'success' | 'info'; children?: Child }> = (props) => {
  const styles = {
    error: 'border-red-700/30 bg-red-50 text-red-900',
    success: 'border-emerald-700/30 bg-emerald-50 text-emerald-900',
    info: 'border-navy/15 bg-surface text-navy',
  };
  return (
    <div class={`mb-6 border px-4 py-3 text-sm ${styles[props.kind]}`} role={props.kind === 'error' ? 'alert' : 'status'}>
      {props.children}
    </div>
  );
};

export const StatusBadge: FC<{ status: Availability }> = (props) => (
  <span class={`status-badge status-${props.status}`}>{STATUS_LABEL[props.status]}</span>
);

export function renderPage(c: Context, node: Child, status: 200 | 400 | 401 | 403 | 404 | 429 | 500 = 200) {
  c.header('Cache-Control', 'no-store');
  return c.html(html`<!DOCTYPE html>${node}`, status);
}
