import type { FC } from 'hono/jsx';
import { Hono } from 'hono';
import { blankDocument, linesFromScale, moveItem, newQuestion, orderedQuestions, questionFromFields, removeQuestion, replaceQuestion, validateDocument, type Question, type SurveyDocument, type VisibilityRule } from '../lib/questions';
import { QUESTION_TYPES } from '../lib/questions';
import { createDraft, getTemplate, getVersion, insertTemplate, latestVersion, listCategories, listTemplates, listVersions, publishVersion, saveDraft, setTemplateArchived, updateTemplateMeta, writeAudit } from '../lib/db';
import { getEvent } from '../lib/db';
import { readFields, stringFields } from '../lib/form';
import { newKey } from '../lib/ids';
import { unknownTokens } from '../lib/tokens';
import { Banner, Hero, Section } from '../views/Layout';
import { SurveyForm } from '../views/SurveyForm';
import { page, requireAdmin } from './guard';

export const templateRoutes = new Hono<{ Bindings: Env }>();

templateRoutes.get('/admin/templates', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const [templates, versions] = await Promise.all([listTemplates(c.env.DB), c.env.DB.prepare('SELECT template_id, version_number, status FROM survey_versions').all<{ template_id: number; version_number: number; status: string }>()]);
  const event = await getEvent(c.env.DB);
  const categories = await listCategories(c.env.DB, event.id);
  return page(c, access, 'Templates', <TemplateList templates={templates} versions={versions.results} categories={categories.map((category) => category.name)} notice={c.req.query('notice')} />);
});

templateRoutes.post('/admin/templates', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const fields = stringFields(await readFields(c));
  const name = (fields.name ?? '').trim();
  if (!name) return c.redirect('/admin/templates?notice=Enter+a+template+name');
  const id = await insertTemplate(c.env.DB, {
    name,
    description: fields.description?.trim() ?? '',
    category: fields.category || 'General / Other',
    anonymity: fields.anonymity === 'identified' ? 'identified' : 'anonymous',
    document: blankDocument(),
  });
  await writeAudit(c.env.DB, access.actor ?? 'admin', 'template_create', 'template', String(id), name);
  return c.redirect(`/admin/templates/${id}`);
});

templateRoutes.get('/admin/templates/:id/preview', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const loaded = await loadEditor(c.env.DB, Number(c.req.param('id')), c.req.query('v'));
  if (!loaded) return c.redirect('/admin/templates');
  const sample = { session_title: 'Leadership Fundamentals', instructor_name: 'Alex Morgan', class_name: 'Company Officer', event_name: '2026 NVFR LDI', session_date: 'October 19, 2026' };
  const { resolveDocument } = await import('../lib/tokens');
  const rendered = resolveDocument(loaded.document, sample).document;
  return page(
    c,
    access,
    loaded.template.name,
    <>
      <Hero compact title={loaded.template.name} lead="Preview with sample session details. Tokens that still appear in braces need a real session." />
      <Section>
        <SurveyForm document={rendered} anonymity={loaded.template.anonymity} preview />
      </Section>
    </>,
    200,
    true,
  );
});

templateRoutes.get('/admin/templates/:id', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const loaded = await loadEditor(c.env.DB, Number(c.req.param('id')), c.req.query('v'));
  if (!loaded) return c.redirect('/admin/templates');
  return page(c, access, loaded.template.name, <Editor {...loaded} notice={c.req.query('notice')} error={c.req.query('error')} />);
});

templateRoutes.post('/admin/templates/:id', async (c) => {
  const access = await requireAdmin(c);
  if (access instanceof Response) return access;
  const templateId = Number(c.req.param('id'));
  const fields = await readFields(c);
  const flat = stringFields(fields);
  const action = flat.action;
  const template = await getTemplate(c.env.DB, templateId);
  if (!template) return c.redirect('/admin/templates');
  const version = await getVersion(c.env.DB, Number(flat.version_id));
  if (!version || version.template_id !== templateId) return c.redirect(`/admin/templates/${templateId}?error=That+version+was+not+found`);

  if (action === 'meta') {
    const name = flat.name.trim();
    if (!name) return c.redirect(`/admin/templates/${templateId}?v=${version.id}&error=Enter+a+name`);
    await updateTemplateMeta(c.env.DB, templateId, {
      name,
      description: flat.description.trim(),
      category: flat.category,
      anonymity: flat.anonymity === 'identified' ? 'identified' : 'anonymous',
    });
    await writeAudit(c.env.DB, access.actor ?? 'admin', 'template_update', 'template', String(templateId), 'details');
    return c.redirect(`/admin/templates/${templateId}?v=${version.id}&notice=Template+saved`);
  }
  if (action === 'archive') {
    await setTemplateArchived(c.env.DB, templateId, template.archived !== 1);
    return c.redirect('/admin/templates?notice=Template+updated');
  }
  if (action === 'duplicate') {
    const copyId = await insertTemplate(c.env.DB, {
      name: `Copy of ${template.name}`,
      description: template.description,
      category: template.category_name,
      anonymity: template.anonymity,
      document: JSON.parse(version.document_json) as SurveyDocument,
    });
    await writeAudit(c.env.DB, access.actor ?? 'admin', 'template_duplicate', 'template', String(copyId), template.name);
    return c.redirect(`/admin/templates/${copyId}`);
  }
  if (action === 'new-draft') {
    const draftId = await createDraft(c.env.DB, templateId, JSON.parse(version.document_json) as SurveyDocument);
    await writeAudit(c.env.DB, access.actor ?? 'admin', 'template_draft', 'template', String(templateId), `version ${draftId}`);
    return c.redirect(`/admin/templates/${templateId}?v=${draftId}`);
  }

  if (version.status !== 'draft') return c.redirect(`/admin/templates/${templateId}?v=${version.id}&error=Published+surveys+cannot+be+edited.+Start+a+new+draft.`);
  let document = JSON.parse(version.document_json) as SurveyDocument;
  if (action === 'add-section') {
    document.sections.push({ id: newKey('s'), title: flat.title.trim() || 'New section', description: '', visibility: [], questions: [] });
  } else if (action === 'section') {
    document = {
      sections: document.sections.map((section) =>
        section.id === flat.section_id ? { ...section, title: flat.title.trim() || section.title, description: flat.description.trim(), visibility: rulesFrom(flat) } : section,
      ),
    };
  } else if (action === 'delete-section') {
    if (document.sections.length === 1) document.sections[0].questions = [];
    else {
      const removed = new Set(document.sections.find((section) => section.id === flat.section_id)?.questions.map((question) => question.id) ?? []);
      document = {
        sections: document.sections
          .filter((section) => section.id !== flat.section_id)
          .map((section) => ({ ...section, questions: section.questions.map((question) => ({ ...question, visibility: question.visibility.filter((rule) => !removed.has(rule.questionId)) })) })),
      };
    }
  } else if (action === 'move-section') {
    const index = document.sections.findIndex((section) => section.id === flat.section_id);
    document = { sections: moveItem(document.sections, index, flat.dir === 'up' ? -1 : 1) };
  } else if (action === 'add-question') {
    const type = QUESTION_TYPES.find((item) => item === flat.type) ?? 'rating';
    const question = newQuestion(type, newKey('q'), flat.title.trim() || 'New question');
    document = {
      sections: document.sections.map((section) => (section.id === flat.section_id ? { ...section, questions: [...section.questions, question] } : section)),
    };
  } else if (action === 'update-question') {
    const current = orderedQuestions(document).find((question) => question.id === flat.question_id);
    if (!current) return c.redirect(`/admin/templates/${templateId}?v=${version.id}&error=Question+not+found`);
    const updated = questionFromFields(current, flat);
    if ('error' in updated) return c.redirect(`/admin/templates/${templateId}?v=${version.id}&error=${encodeURIComponent(updated.error)}`);
    document = replaceQuestion(document, updated.question);
  } else if (action === 'delete-question') {
    document = removeQuestion(document, flat.question_id);
  } else if (action === 'move-question') {
    document = moveQuestion(document, flat.question_id, flat.dir === 'up' ? -1 : 1);
  } else if (action === 'publish') {
    const problems = [...validateDocument(document), ...unknownTokens(document).map((token) => `Unknown token {{${token}}}.`)];
    if (problems.length > 0) return c.redirect(`/admin/templates/${templateId}?v=${version.id}&error=${encodeURIComponent(problems[0])}`);
    await publishVersion(c.env.DB, version.id);
    await writeAudit(c.env.DB, access.actor ?? 'admin', 'template_publish', 'template', String(templateId), `version ${version.version_number}`);
    return c.redirect(`/admin/templates/${templateId}?v=${version.id}&notice=Published`);
  } else {
    return c.redirect(`/admin/templates/${templateId}?v=${version.id}&error=Unknown+action`);
  }

  const saved = await saveDraft(c.env.DB, version.id, document);
  if (!saved) return c.redirect(`/admin/templates/${templateId}?v=${version.id}&error=This+version+is+already+published`);
  return c.redirect(`/admin/templates/${templateId}?v=${version.id}&notice=Saved`);
});

function rulesFrom(fields: Record<string, string>): VisibilityRule[] {
  const rules: VisibilityRule[] = [];
  for (let slot = 1; slot <= 3; slot += 1) {
    const questionId = (fields[`vis_q_${slot}`] ?? '').trim();
    const operator = (fields[`vis_op_${slot}`] ?? 'equals') as VisibilityRule['operator'];
    const value = (fields[`vis_value_${slot}`] ?? '').trim();
    if (!questionId) continue;
    rules.push({ questionId, operator, value: value || undefined });
  }
  return rules;
}

function moveQuestion(doc: SurveyDocument, questionId: string, dir: -1 | 1): SurveyDocument {
  const sections = doc.sections.map((section) => ({ ...section, questions: section.questions.slice() }));
  let sectionIndex = -1;
  let questionIndex = -1;
  sections.forEach((section, index) => {
    const found = section.questions.findIndex((question) => question.id === questionId);
    if (found >= 0) {
      sectionIndex = index;
      questionIndex = found;
    }
  });
  if (sectionIndex < 0) return doc;
  const next = questionIndex + dir;
  if (next >= 0 && next < sections[sectionIndex].questions.length) {
    sections[sectionIndex].questions = moveItem(sections[sectionIndex].questions, questionIndex, dir);
    return { sections };
  }
  const target = sectionIndex + dir;
  if (target < 0 || target >= sections.length) return { sections };
  const [question] = sections[sectionIndex].questions.splice(questionIndex, 1);
  if (dir < 0) sections[target].questions.push(question);
  else sections[target].questions.unshift(question);
  return { sections };
}

async function loadEditor(db: D1Database, templateId: number, versionQuery: string | undefined) {
  const template = await getTemplate(db, templateId);
  if (!template) return null;
  const versions = await listVersions(db, templateId);
  const version = (versionQuery ? versions.find((item) => item.id === Number(versionQuery)) : null) ?? (await latestVersion(db, templateId));
  if (!version) return null;
  const event = await getEvent(db);
  const categories = await listCategories(db, event.id);
  return { template, version, versions, document: JSON.parse(version.document_json) as SurveyDocument, categories: categories.map((category) => category.name) };
}

const TemplateList: FC<{ templates: Awaited<ReturnType<typeof listTemplates>>; versions: { template_id: number; version_number: number; status: string }[]; categories: string[]; notice?: string }> = (props) => (
  <>
    <Hero compact title="Templates" lead="Published questionnaires stay fixed. Editing a published survey starts a new version." />
    <Section>
      {props.notice ? <Banner kind="success">{props.notice}</Banner> : null}
      <form method="post" action="/admin/templates" class="mb-8 grid gap-3 border border-navy/10 p-4 md:grid-cols-2">
        <label class="block md:col-span-2">
          <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">New template</span>
          <input class="input mt-1.5" name="name" required placeholder="Template name" />
        </label>
        <label class="block">
          <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Category</span>
          <select class="select mt-1.5" name="category">
            {props.categories.map((category) => (
              <option value={category}>{category}</option>
            ))}
          </select>
        </label>
        <label class="block">
          <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Default anonymity</span>
          <select class="select mt-1.5" name="anonymity">
            <option value="anonymous">Anonymous</option>
            <option value="identified">Identified</option>
          </select>
        </label>
        <div class="md:col-span-2">
          <button type="submit" class="btn btn-primary">
            Create template
          </button>
        </div>
      </form>
      <div class="grid gap-3">
        {props.templates.map((template) => {
          const latest = props.versions.filter((version) => version.template_id === template.id).sort((a, b) => b.version_number - a.version_number)[0];
          return (
            <a href={`/admin/templates/${template.id}`} class="panel block hover:border-navy/30">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="font-display text-2xl font-bold uppercase text-navy">{template.name}</h3>
                <span class="text-sm uppercase tracking-wide text-muted">
                  {template.archived ? 'Archived · ' : ''}
                  {template.anonymity} · v{latest?.version_number ?? 1} {latest?.status ?? 'draft'}
                </span>
              </div>
              <p class="mt-1 text-sm text-muted">{template.category_name}</p>
            </a>
          );
        })}
      </div>
    </Section>
  </>
);

const Editor: FC<Awaited<ReturnType<typeof loadEditor>> & { notice?: string; error?: string }> = (props) => {
  if (!props.template || !props.version || !props.document) return null;
  const locked = props.version.status !== 'draft';
  const questions = orderedQuestions(props.document);
  const problems = locked ? [] : [...validateDocument(props.document), ...unknownTokens(props.document).map((token) => `Unknown token {{${token}}}.`)];
  return (
    <>
      <Hero compact title={props.template.name} lead={props.template.description || 'Add sections and questions, then publish.'} />
      <Section>
        {props.notice ? <Banner kind="success">{props.notice}</Banner> : null}
        {props.error ? <Banner kind="error">{props.error}</Banner> : null}
        {locked ? <Banner kind="info">Version {props.version.version_number} is published and cannot be changed. Start a new draft to edit.</Banner> : null}
        {problems.length > 0 ? (
          <Banner kind="error">
            <ul class="list-disc pl-5">
              {problems.map((problem) => (
                <li>{problem}</li>
              ))}
            </ul>
          </Banner>
        ) : null}
        <div class="mb-6 flex flex-wrap gap-3">
          <a href={`/admin/templates/${props.template.id}/preview?v=${props.version.id}`} class="btn btn-quiet">
            Preview
          </a>
          {locked ? (
            <form method="post" action={`/admin/templates/${props.template.id}`}>
              <input type="hidden" name="action" value="new-draft" />
              <input type="hidden" name="version_id" value={String(props.version.id)} />
              <button type="submit" class="btn btn-primary">
                New draft
              </button>
            </form>
          ) : (
            <form method="post" action={`/admin/templates/${props.template.id}`}>
              <input type="hidden" name="action" value="publish" />
              <input type="hidden" name="version_id" value={String(props.version.id)} />
              <button type="submit" class="btn btn-primary">
                Publish version {props.version.version_number}
              </button>
            </form>
          )}
          <form method="post" action={`/admin/templates/${props.template.id}`}>
            <input type="hidden" name="action" value="duplicate" />
            <input type="hidden" name="version_id" value={String(props.version.id)} />
            <button type="submit" class="btn btn-quiet">
              Duplicate
            </button>
          </form>
          <form method="post" action={`/admin/templates/${props.template.id}`}>
            <input type="hidden" name="action" value="archive" />
            <input type="hidden" name="version_id" value={String(props.version.id)} />
            <button type="submit" class="btn btn-quiet">
              {props.template.archived ? 'Restore' : 'Archive'}
            </button>
          </form>
        </div>
        <form method="post" action={`/admin/templates/${props.template.id}`} class="mb-8 grid gap-3 border border-navy/10 p-4 md:grid-cols-2">
          <input type="hidden" name="action" value="meta" />
          <input type="hidden" name="version_id" value={String(props.version.id)} />
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Name</span>
            <input class="input mt-1.5" name="name" value={props.template.name} />
          </label>
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Category</span>
            <select class="select mt-1.5" name="category">
              {(props.categories ?? []).map((category) => (
                <option value={category} selected={category === props.template?.category_name}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label class="block">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Default anonymity</span>
            <select class="select mt-1.5" name="anonymity">
              <option value="anonymous" selected={props.template.anonymity === 'anonymous'}>
                Anonymous
              </option>
              <option value="identified" selected={props.template.anonymity === 'identified'}>
                Identified
              </option>
            </select>
          </label>
          <label class="block md:col-span-2">
            <span class="font-display text-sm font-semibold uppercase tracking-wide text-navy">Description</span>
            <textarea class="textarea mt-1.5" name="description">
              {props.template.description}
            </textarea>
          </label>
          <div>
            <button type="submit" class="btn btn-secondary">
              Save details
            </button>
          </div>
        </form>
        {props.versions && props.versions.length > 1 ? (
          <p class="mb-6 text-sm text-muted">
            Versions:{' '}
            {props.versions.map((version) => (
              <a href={`/admin/templates/${props.template?.id}?v=${version.id}`} class="mr-3 underline">
                v{version.version_number} {version.status}
              </a>
            ))}
          </p>
        ) : null}
        {props.document.sections.map((section, sectionIndex) => (
          <section class="mb-8 border border-navy/10 p-4" id={section.id}>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="font-display text-2xl font-bold uppercase text-navy">{section.title}</h3>
              {locked ? null : (
                <div class="flex gap-2">
                  <MoveForm templateId={props.template.id} versionId={props.version.id} action="move-section" idName="section_id" id={section.id} dir="up" />
                  <MoveForm templateId={props.template.id} versionId={props.version.id} action="move-section" idName="section_id" id={section.id} dir="down" />
                </div>
              )}
            </div>
            {locked ? null : (
              <form method="post" action={`/admin/templates/${props.template.id}`} class="mt-4 grid gap-3">
                <input type="hidden" name="action" value="section" />
                <input type="hidden" name="version_id" value={String(props.version.id)} />
                <input type="hidden" name="section_id" value={section.id} />
                <input class="input" name="title" value={section.title} />
                <textarea class="textarea" name="description">
                  {section.description}
                </textarea>
                <RuleEditor earlier={questionsBeforeSection(props.document, sectionIndex)} rules={section.visibility} />
                <div class="flex flex-wrap gap-2">
                  <button type="submit" class="btn btn-quiet btn-sm">
                    Save section
                  </button>
                </div>
              </form>
            )}
            {locked ? null : (
              <form method="post" action={`/admin/templates/${props.template.id}`} class="mt-2">
                <input type="hidden" name="action" value="delete-section" />
                <input type="hidden" name="version_id" value={String(props.version.id)} />
                <input type="hidden" name="section_id" value={section.id} />
                <button type="submit" class="text-sm text-navy underline">
                  Delete section
                </button>
              </form>
            )}
            <div class="mt-4 grid gap-3">
              {section.questions.map((question) => {
                const earlier = questions.filter((item) => questions.indexOf(item) < questions.indexOf(question));
                return locked ? (
                  <p class="border border-navy/10 px-3 py-2">
                    {question.title} <span class="text-sm text-muted">{question.type}</span>
                  </p>
                ) : (
                  <details class="border border-navy/10 p-3" id={`q-${question.id}`}>
                    <summary class="cursor-pointer font-semibold">
                      {question.title} <span class="text-sm font-normal text-muted">{question.type}</span>
                    </summary>
                    <form method="post" action={`/admin/templates/${props.template?.id}`} class="mt-3 grid gap-3">
                      <input type="hidden" name="action" value="update-question" />
                      <input type="hidden" name="version_id" value={String(props.version?.id)} />
                      <input type="hidden" name="question_id" value={question.id} />
                      <input class="input" name="title" value={question.title} />
                      <textarea class="textarea" name="description">
                        {question.description}
                      </textarea>
                      <label class="flex items-center gap-2">
                        <input type="checkbox" name="required" value="on" checked={question.required} /> Required
                      </label>
                      <input class="input" name="metric" value={question.reportingMetric} placeholder="Reporting metric id" />
                      <TypeFields question={question} />
                      <RuleEditor earlier={earlier} rules={question.visibility} />
                      <button type="submit" class="btn btn-secondary btn-sm">
                        Save question
                      </button>
                    </form>
                    <div class="mt-3 flex flex-wrap gap-2">
                      <MoveForm templateId={props.template.id} versionId={props.version.id} action="move-question" idName="question_id" id={question.id} dir="up" />
                      <MoveForm templateId={props.template.id} versionId={props.version.id} action="move-question" idName="question_id" id={question.id} dir="down" />
                      <form method="post" action={`/admin/templates/${props.template.id}`}>
                        <input type="hidden" name="action" value="delete-question" />
                        <input type="hidden" name="version_id" value={String(props.version.id)} />
                        <input type="hidden" name="question_id" value={question.id} />
                        <button type="submit" class="btn btn-quiet btn-sm">
                          Delete
                        </button>
                      </form>
                    </div>
                  </details>
                );
              })}
            </div>
            {locked ? null : (
              <form method="post" action={`/admin/templates/${props.template.id}`} class="mt-4 flex flex-wrap gap-2">
                <input type="hidden" name="action" value="add-question" />
                <input type="hidden" name="version_id" value={String(props.version.id)} />
                <input type="hidden" name="section_id" value={section.id} />
                <input class="input max-w-xs" name="title" placeholder="Question title" />
                <select class="select max-w-xs" name="type">
                  {QUESTION_TYPES.map((type) => (
                    <option value={type}>{type.replaceAll('_', ' ')}</option>
                  ))}
                </select>
                <button type="submit" class="btn btn-secondary btn-sm">
                  Add question
                </button>
              </form>
            )}
          </section>
        ))}
        {locked ? null : (
          <form method="post" action={`/admin/templates/${props.template.id}`} class="flex flex-wrap gap-2">
            <input type="hidden" name="action" value="add-section" />
            <input type="hidden" name="version_id" value={String(props.version.id)} />
            <input class="input max-w-sm" name="title" placeholder="New section title" />
            <button type="submit" class="btn btn-quiet">
              Add section
            </button>
          </form>
        )}
      </Section>
    </>
  );
};

const MoveForm: FC<{ templateId: number; versionId: number; action: string; idName: string; id: string; dir: 'up' | 'down' }> = (props) => (
  <form method="post" action={`/admin/templates/${props.templateId}`}>
    <input type="hidden" name="action" value={props.action} />
    <input type="hidden" name="version_id" value={String(props.versionId)} />
    <input type="hidden" name={props.idName} value={props.id} />
    <input type="hidden" name="dir" value={props.dir} />
    <button type="submit" class="btn btn-quiet btn-sm">
      {props.dir === 'up' ? 'Up' : 'Down'}
    </button>
  </form>
);

const RuleEditor: FC<{ earlier: Question[]; rules: VisibilityRule[] }> = (props) => (
  <div class="grid gap-2">
    <p class="text-sm text-muted">Show this when any of these earlier answers match. Leave the question blank to always show it.</p>
    {[0, 1, 2].map((index) => {
      const rule = props.rules[index];
      const slot = index + 1;
      return (
        <div class="grid gap-2 md:grid-cols-3">
          <select class="select" name={`vis_q_${slot}`}>
            <option value="">No condition</option>
            {props.earlier.map((question) => (
              <option value={question.id} selected={rule?.questionId === question.id}>
                {question.title}
              </option>
            ))}
          </select>
          <select class="select" name={`vis_op_${slot}`}>
            {(['equals', 'not_equals', 'answered', 'unanswered'] as const).map((operator) => (
              <option value={operator} selected={(rule?.operator ?? 'equals') === operator}>
                {operator.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
          <input class="input" name={`vis_value_${slot}`} value={rule?.value ?? ''} placeholder="Yes, Maybe, …" />
        </div>
      );
    })}
  </div>
);

const TypeFields: FC<{ question: Question }> = ({ question }) => {
  if (question.type === 'rating' || question.type === 'likert') {
    return (
      <>
        <label class="block">
          <span class="text-sm text-muted">Scale, one per line, like “1 Poor”</span>
          <textarea class="textarea mt-1" name="labels">
            {linesFromScale(question.scale)}
          </textarea>
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="allow_na" value="on" checked={question.scale.allowNa} /> Allow N/A
        </label>
      </>
    );
  }
  if (question.type === 'single' || question.type === 'dropdown' || question.type === 'multi') {
    return (
      <>
        <label class="block">
          <span class="text-sm text-muted">Choices, one per line</span>
          <textarea class="textarea mt-1" name="choices">
            {question.choices.map((choice) => choice.label).join('\n')}
          </textarea>
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="allow_other" value="on" checked={question.allowOther} /> Allow an other answer
        </label>
        {question.type === 'multi' ? (
          <div class="grid gap-2 sm:grid-cols-2">
            <input class="input" name="min_select" value={String(question.minSelect)} placeholder="Minimum selected" />
            <input class="input" name="max_select" value={question.maxSelect === null ? '' : String(question.maxSelect)} placeholder="Maximum selected" />
          </div>
        ) : null}
      </>
    );
  }
  if (question.type === 'short_text' || question.type === 'long_text' || question.type === 'email' || question.type === 'phone') {
    return (
      <>
        <input class="input" name="placeholder" value={question.placeholder} placeholder="Placeholder" />
        {question.type === 'short_text' || question.type === 'long_text' ? (
          <div class="grid gap-2 sm:grid-cols-2">
            <input class="input" name="min_length" value={String(question.minLength)} />
            <input class="input" name="max_length" value={String(question.maxLength)} />
          </div>
        ) : null}
      </>
    );
  }
  if (question.type === 'yes_no') {
    return (
      <div class="grid gap-2 sm:grid-cols-2">
        <input class="input" name="yes_label" value={question.yesLabel} />
        <input class="input" name="no_label" value={question.noLabel} />
      </div>
    );
  }
  if (question.type === 'matrix') {
    return (
      <>
        <label class="block">
          <span class="text-sm text-muted">Rows, one per line</span>
          <textarea class="textarea mt-1" name="rows">
            {question.rows.map((row) => row.label).join('\n')}
          </textarea>
        </label>
        <label class="block">
          <span class="text-sm text-muted">Columns, one per line, like “1 Poor”</span>
          <textarea class="textarea mt-1" name="columns">
            {question.columns.map((column) => `${column.value} ${column.label}`).join('\n')}
          </textarea>
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="allow_na" value="on" checked={question.allowNa} /> Allow N/A
        </label>
      </>
    );
  }
  return null;
};

function questionsBeforeSection(doc: SurveyDocument, sectionIndex: number): Question[] {
  return doc.sections.slice(0, sectionIndex).flatMap((section) => section.questions);
}
