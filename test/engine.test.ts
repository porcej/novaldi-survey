import { describe, expect, it } from 'vitest';
import { SEED_TEMPLATES } from '../src/content/templates';
import { parseSessionCsv, toCsv } from '../src/lib/csv';
import { instructorList, templateFromSlug, templateHref, templateSlug } from '../src/lib/format';
import {
  collectAnswers,
  fieldName,
  findQuestion,
  newQuestion,
  parseSurveyDocument,
  questionFromFields,
  validateDocument,
  type SurveyDocument,
} from '../src/lib/questions';
import { detailsVisibility, summarizeQuestion, type ResponseGroup } from '../src/lib/report';
import { computeWindow, defaultSessionRules, type WindowContext } from '../src/lib/schedule';
import { endOfDayUtc, zonedToUtc } from '../src/lib/time';
import { resolveDocument, unresolvedTokens } from '../src/lib/tokens';

const hotel = SEED_TEMPLATES.find((template) => template.name === 'Hotel Evaluation')!.document;
const staff = SEED_TEMPLATES.find((template) => template.name === 'Future Staff Interest')!.document;
const session = SEED_TEMPLATES.find((template) => template.name === 'Standard Session Evaluation')!.document;

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

describe('questionnaires', () => {
  it('accepts the seeded templates', () => {
    for (const template of SEED_TEMPLATES) {
      expect(validateDocument(template.document)).toEqual([]);
      const parsed = parseSurveyDocument(JSON.parse(JSON.stringify(template.document)));
      expect('document' in parsed).toBe(true);
      if ('document' in parsed) expect(validateDocument(parsed.document)).toEqual([]);
    }
  });

  it('rejects an unknown question type and a later dependency', () => {
    expect(parseSurveyDocument({ sections: [{ id: 'main', title: 'Questions', questions: [{ id: 'q1', type: 'rank', title: 'Rank' }] }] })).toEqual({ error: 'A question has an unknown type.' });
    const later = {
      sections: [
        {
          id: 'main',
          title: 'Questions',
          questions: [
            { id: 'first', type: 'yes_no', title: 'First', yesLabel: 'Yes', noLabel: 'No', visibility: [{ questionId: 'second', operator: 'equals', value: 'Yes' }] },
            { id: 'second', type: 'yes_no', title: 'Second', yesLabel: 'Yes', noLabel: 'No' },
          ],
        },
      ],
    };
    const parsed = parseSurveyDocument(later);
    expect('document' in parsed).toBe(true);
    if ('document' in parsed) expect(validateDocument(parsed.document).some((error) => error.includes('earlier question'))).toBe(true);
  });

  it('requires a visible rating and drops hidden hotel answers', () => {
    const stayed = findQuestion(hotel, 'stayed')!;
    const missing = collectAnswers(hotel, form({ [fieldName(stayed.id)]: 'yes' }));
    expect(missing.errors.map((error) => error.id)).toContain('hotel_rating');

    const noStay = collectAnswers(hotel, form({
      [fieldName('stayed')]: 'no',
      [fieldName('hotel_rating', 'cleanliness')]: 'c5',
    }));
    expect(noStay.errors).toEqual([]);
    expect(noStay.answers.hotel_rating).toBeUndefined();
    expect(noStay.answers.stayed).toEqual({ t: 'choice', id: 'no' });
  });

  it('keeps staff contact only when interest is yes or maybe', () => {
    const declined = collectAnswers(staff, form({ [fieldName('interested')]: 'no' }));
    expect(declined.errors).toEqual([]);
    expect(declined.answers.full_name).toBeUndefined();

    const interested = collectAnswers(staff, form({
      [fieldName('interested')]: 'yes',
      [fieldName('roles')]: ['instructor', 'logistics'],
      [fieldName('full_name')]: 'Jordan Lee',
      [fieldName('email')]: 'not-an-email',
      [fieldName('phone')]: '555',
    }));
    expect(interested.errors.map((error) => error.id).sort()).toEqual(['email', 'phone']);
  });

  it('rejects an impossible rating and a later-question condition', () => {
    const rating = newQuestion('rating', 'rate');
    const doc: SurveyDocument = { sections: [{ id: 's', title: 'S', description: '', visibility: [], questions: [rating] }] };
    const bad = collectAnswers(doc, form({ [fieldName('rate')]: '9' }));
    expect(bad.errors[0]?.message).toMatch(/scale/);

    const cyclic: SurveyDocument = {
      sections: [
        {
          id: 's',
          title: 'S',
          description: '',
          visibility: [],
          questions: [
            { ...newQuestion('yes_no', 'a', 'A'), visibility: [{ questionId: 'b', operator: 'equals', value: 'Yes' }] },
            newQuestion('yes_no', 'b', 'B'),
          ],
        },
      ],
    };
    expect(validateDocument(cyclic).join(' ')).toMatch(/earlier question/);
  });

  it('builds a matrix question from editor fields', () => {
    const current = newQuestion('matrix', 'grid', 'Rate');
    const result = questionFromFields(current, {
      title: 'Rate the stay',
      description: '',
      required: 'on',
      metric: 'stay',
      rows: 'Cleanliness\nComfort',
      columns: '1 Poor\n5 Excellent',
      allow_na: 'on',
      vis_q_1: '',
      vis_op_1: 'equals',
      vis_value_1: '',
    });
    expect('question' in result).toBe(true);
    if (!('question' in result) || result.question.type !== 'matrix') return;
    expect(result.question.rows).toHaveLength(2);
    expect(result.question.columns.map((column) => column.value)).toEqual([1, 5]);
  });
});

describe('schedule', () => {
  const base = (): WindowContext => ({
    publication: 'published',
    manualState: null,
    scheduleOverride: false,
    overrideOpenAt: null,
    overrideCloseAt: null,
    rules: defaultSessionRules(),
    session: { startsAt: '2026-10-19T18:00:00.000Z', endsAt: '2026-10-19T21:00:00.000Z' },
    eventEndsOn: '2026-10-24',
    timeZone: 'America/New_York',
    now: '2026-10-19T20:00:00.000Z',
  });

  it('opens at session end and closes at the end of the institute', () => {
    expect(computeWindow(base()).availability).toBe('scheduled');
    expect(computeWindow({ ...base(), now: '2026-10-19T21:00:00.000Z' }).availability).toBe('open');
    expect(computeWindow({ ...base(), now: '2026-10-25T04:00:00.000Z' }).availability).toBe('closed');
  });

  it('follows a moved session unless an override is set', () => {
    const moved = computeWindow({
      ...base(),
      now: '2026-10-19T22:00:00.000Z',
      session: { startsAt: '2026-10-19T20:00:00.000Z', endsAt: '2026-10-19T23:00:00.000Z' },
    });
    expect(moved.availability).toBe('scheduled');
    const pinned = computeWindow({
      ...base(),
      now: '2026-10-19T22:00:00.000Z',
      session: { startsAt: '2026-10-19T20:00:00.000Z', endsAt: '2026-10-19T23:00:00.000Z' },
      scheduleOverride: true,
      overrideOpenAt: '2026-10-19T21:00:00.000Z',
      overrideCloseAt: '2026-10-25T03:59:59.000Z',
    });
    expect(pinned.availability).toBe('open');
  });

  it('honors manual close, draft, and a missing session', () => {
    expect(computeWindow({ ...base(), manualState: 'closed', now: '2026-10-20T12:00:00.000Z' }).availability).toBe('closed');
    expect(computeWindow({ ...base(), publication: 'draft' }).availability).toBe('draft');
    expect(computeWindow({ ...base(), session: null }).error).toMatch(/session/);
  });
});

describe('time and tokens', () => {
  it('converts Eastern Time, including daylight saving', () => {
    expect(zonedToUtc('2026-10-19', '17:00', 'America/New_York')).toBe('2026-10-19T21:00:00.000Z');
    expect(zonedToUtc('2026-01-15', '17:00', 'America/New_York')).toBe('2026-01-15T22:00:00.000Z');
    expect(endOfDayUtc('2026-10-24', 'America/New_York')).toBe('2026-10-25T03:59:59.000Z');
  });

  it('resolves session tokens and reports leftovers', () => {
    const resolved = resolveDocument(session, {
      session_title: 'Leadership Fundamentals',
      instructor_name: instructorList(['Alex Morgan', 'Sam Patel']),
      class_name: 'Company Officer',
      event_name: '2026 NVFR LDI',
      session_date: 'October 19, 2026',
    });
    expect(resolved.unresolved).toEqual([]);
    expect(resolved.document.sections[0]?.title).toBe('Leadership Fundamentals');
    expect(unresolvedTokens(resolveDocument(session, { session_title: 'Leadership' }).document.sections[0]?.description ?? '')).toContain('instructor_name');
  });
});

describe('template links', () => {
  const templates = [
    { id: 1, name: 'Scenario' },
    { id: 2, name: 'Standard Session Evaluation' },
    { id: 8, name: 'Scenario' },
  ];

  it('builds a shareable slug and keeps the older name when two templates match', () => {
    expect(templateSlug('Standard Session Evaluation')).toBe('standard-session-evaluation');
    expect(templateHref(templates[0]!, templates)).toBe('/templates/scenario');
    expect(templateHref(templates[2]!, templates)).toBe('/templates/scenario-8');
    expect(templateFromSlug(templates, 'scenario')?.id).toBe(1);
    expect(templateFromSlug(templates, 'scenario-8')?.id).toBe(8);
    expect(templateFromSlug(templates, 'missing')).toBeUndefined();
  });
});

describe('reports and csv', () => {
  it('excludes N/A from the mean and suppresses small groups for staff', () => {
    const question = newQuestion('rating', 'rate', 'Quality');
    const groups: ResponseGroup[] = [
      { id: 'b', submittedOn: '2026-10-19', answers: { rate: { t: 'num', v: 5 } } },
      { id: 'a', submittedOn: '2026-10-19', answers: { rate: { t: 'num', v: 4 } } },
      { id: 'c', submittedOn: '2026-10-19', answers: { rate: { t: 'na' } } },
      { id: 'd', submittedOn: '2026-10-19', answers: {} },
    ];
    const report = summarizeQuestion(question, groups);
    expect(report.mean).toBe(4.5);
    expect(report.na).toBe(1);
    expect(report.skipped).toBe(1);
    expect(report.favorablePercent).toBe(100);
    expect(detailsVisibility(4, 5, false)).toEqual({ show: false, warning: false });
    expect(detailsVisibility(4, 5, true)).toEqual({ show: true, warning: true });
  });

  it('parses a session file and keeps quoted titles', () => {
    const parsed = parseSessionCsv('date,start,end,program,title,instructors,location,type\n2026-10-19,09:00,10:30,Company,"Leadership, Fundamentals",Alex Morgan; Sam Patel,Hall,instruction\n');
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.title).toBe('Leadership, Fundamentals');
    expect(parsed.rows[0]?.instructors).toEqual(['Alex Morgan', 'Sam Patel']);
    expect(toCsv([['Hello, world']])).toContain('"Hello, world"');
  });
});
