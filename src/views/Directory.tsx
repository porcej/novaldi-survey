import type { Child, FC } from 'hono/jsx';
import { openProgramCards, type AssignmentCard, type Catalog } from '../lib/catalog';
import type { SessionRow } from '../lib/db';
import { instructorList } from '../lib/format';
import { dateInZone, formatClock, formatInstant, formatWeekday } from '../lib/time';
import { Hero, Section, StatusBadge } from './Layout';

export const ClassDirectory: FC<{ catalog: Catalog; cards: AssignmentCard[] }> = (props) => {
  const zone = props.catalog.event.timezone;
  const days = groupByDay(props.catalog.sessions, zone);
  const shared = props.cards.filter((card) => !card.session);
  return (
    <>
      <Hero title="Classes" lead="Choose your class to see its surveys. Surveys for every class are listed separately." />
      <Section>
        <div class="grid gap-3 sm:grid-cols-2">
          <ProgramLink href="/company" title="Company surveys" count={openProgramCards(props.cards, props.catalog, 'company').length} />
          <ProgramLink href="/command" title="Command surveys" count={openProgramCards(props.cards, props.catalog, 'command').length} />
        </div>
        <p class="mt-4">
          <a href="/templates" class="font-semibold text-navy underline">
            Surveys by template
          </a>
        </p>
      </Section>
      {days.length === 0 && shared.length === 0 ? (
        <Section narrow>
          <p class="text-muted">The class list will appear here once the schedule is published.</p>
        </Section>
      ) : null}
      {days.map(([day, sessions]) => (
        <Section title={formatWeekday(day, zone)}>
          <ul class="grid gap-3">
            {sessions.map((session) => {
              const count = props.cards.filter((card) => card.session?.id === session.id).length;
              const program = props.catalog.programs.find((item) => item.id === session.program_id)?.name ?? 'All classes';
              const instructors = instructorList(props.catalog.instructors.get(session.id) ?? []);
              const place = [instructors, session.location].filter(Boolean).join(' · ');
              return (
                <li>
                  <a href={`/class/${session.id}`} class="panel block transition hover:border-navy">
                    <p class="font-display text-sm font-semibold uppercase tracking-wide text-muted">
                      {program} · {formatClock(session.starts_at, zone)}–{formatClock(session.ends_at, zone)}
                    </p>
                    <h3 class="mt-1 font-display text-2xl font-bold uppercase leading-none text-navy">{session.title}</h3>
                    {place ? <p class="mt-2 text-sm text-muted">{place}</p> : null}
                    <p class="mt-3 text-sm font-semibold text-navy">{count === 1 ? '1 survey' : `${count} surveys`}</p>
                  </a>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}
      {shared.length > 0 ? (
        <Section title="Every class">
          <a href="/class/shared" class="panel block max-w-2xl transition hover:border-navy">
            <h3 class="font-display text-2xl font-bold uppercase leading-none text-navy">Surveys for every class</h3>
            <p class="mt-2 text-sm text-muted">Hotel, meals, the overall program, and other surveys that are not tied to one class.</p>
            <p class="mt-3 text-sm font-semibold text-navy">{shared.length === 1 ? '1 survey' : `${shared.length} surveys`}</p>
          </a>
        </Section>
      ) : null}
      <Section title="Have a code?" narrow>
        <form method="get" action="/go" class="space-y-4">
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Survey link or code</span>
            <input class="input mt-1.5" name="code" required autocomplete="off" />
          </label>
          <button type="submit" class="btn btn-primary">
            Continue
          </button>
        </form>
      </Section>
    </>
  );
};

export type TemplateChoice = { slug: string; href: string; name: string; category: string; openCount: number };

export const TemplateChooser: FC<{ templates: TemplateChoice[]; current?: string }> = (props) => (
  <form method="get" action="/templates" class="mb-6 flex flex-wrap items-end gap-3">
    <label class="block min-w-64">
      <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Template</span>
      <select class="select mt-1.5" name="template" onchange="if (this.value) this.form.requestSubmit()">
        <option value="">Choose a template</option>
        {props.templates.map((template) => (
          <option value={template.slug} selected={template.slug === props.current}>
            {template.name}
          </option>
        ))}
      </select>
    </label>
    <button type="submit" class="btn btn-secondary">
      Show
    </button>
  </form>
);

export const TemplateIndex: FC<{ templates: TemplateChoice[] }> = (props) => (
  <>
    <Hero compact title="Surveys by template" lead="Published surveys that are open now, grouped by questionnaire." />
    <Section>
      <p class="mb-6">
        <a href="/" class="font-semibold text-navy underline">
          All classes
        </a>
      </p>
      <TemplateChooser templates={props.templates} />
      {props.templates.length === 0 ? <p class="text-muted">No templates are available yet.</p> : null}
      <ul class="grid gap-3">
        {props.templates.map((template) => (
          <li>
            <a href={template.href} class="panel block transition hover:border-navy">
              <h2 class="font-display text-2xl font-bold uppercase leading-none text-navy">{template.name}</h2>
              <p class="mt-2 text-sm text-muted">{template.category}</p>
              <p class="mt-3 text-sm font-semibold text-navy">{template.openCount === 1 ? '1 survey open now' : `${template.openCount} surveys open now`}</p>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  </>
);

export const SurveyDirectory: FC<{ title: string; lead: string; cards: AssignmentCard[]; zone: string; empty?: string; showSession?: boolean; picker?: Child }> = (props) => (
  <>
    <Hero compact title={props.title} lead={props.lead} />
    <Section>
      <p class="mb-6">
        <a href="/" class="font-semibold text-navy underline">
          All classes
        </a>
      </p>
      {props.picker}
      {props.cards.length === 0 ? <p class="text-muted">{props.empty ?? 'No surveys are published for this class yet.'}</p> : null}
      <ul class="grid gap-3">
        {props.cards.map((card) => {
          const instructors = instructorList(card.instructors);
          return (
          <li>
            <a href={`/s/${card.assignment.public_id}`} class="panel block transition hover:border-navy">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 class="font-display text-2xl font-bold uppercase leading-none text-navy">{card.assignment.title}</h2>
                  {props.showSession && card.session ? (
                    <p class="mt-2 text-sm text-muted">
                      {[
                        formatWeekday(dateInZone(card.session.starts_at, props.zone), props.zone),
                        `${formatClock(card.session.starts_at, props.zone)}–${formatClock(card.session.ends_at, props.zone)}`,
                        card.session.location,
                        instructors,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : instructors ? (
                    <p class="mt-2 text-sm text-muted">{instructors}</p>
                  ) : null}
                  <p class="mt-2 text-sm text-muted">
                    {card.assignment.category_name}
                    {card.assignment.anonymity === 'identified' ? ' · Your name is collected' : ' · Anonymous'}
                  </p>
                </div>
                <StatusBadge status={card.window.availability} />
              </div>
              <p class="mt-3 text-sm text-muted">{surveyTiming(card, props.zone)}</p>
            </a>
          </li>
          );
        })}
      </ul>
    </Section>
  </>
);

const ProgramLink: FC<{ href: string; title: string; count: number }> = (props) => (
  <a href={props.href} class="panel block transition hover:border-navy">
    <h2 class="font-display text-2xl font-bold uppercase leading-none text-navy">{props.title}</h2>
    <p class="mt-2 text-sm text-muted">{props.count === 1 ? '1 survey open now' : `${props.count} surveys open now`}</p>
  </a>
);

function groupByDay(sessions: SessionRow[], zone: string): [string, SessionRow[]][] {
  const groups = new Map<string, SessionRow[]>();
  const ordered = sessions.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title));
  for (const session of ordered) {
    const day = dateInZone(session.starts_at, zone);
    const list = groups.get(day) ?? [];
    list.push(session);
    groups.set(day, list);
  }
  return [...groups.entries()];
}

function surveyTiming(card: AssignmentCard, zone: string): string {
  if (card.window.availability === 'scheduled' && card.window.openAt) return `Opens ${formatInstant(card.window.openAt, zone)}`;
  if (card.window.availability === 'open' && card.window.closeAt) return `Open until ${formatInstant(card.window.closeAt, zone)}`;
  if (card.window.availability === 'closed') return card.window.closeAt ? `Closed ${formatInstant(card.window.closeAt, zone)}` : 'Closed';
  return '';
}
