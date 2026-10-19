(function () {
  const root = document.querySelector('[data-builder]');
  if (!root) return;
  const form = root.querySelector('[data-builder-form]');
  const palette = root.querySelector('[data-palette]');
  const canvas = root.querySelector('[data-canvas]');
  const errors = root.querySelector('[data-errors]');
  const source = root.querySelector('[data-document]');
  if (!form || !palette || !canvas || !errors || !source) return;

  const TYPES = ['rating', 'likert', 'single', 'multi', 'short_text', 'long_text', 'yes_no', 'dropdown', 'matrix', 'email', 'phone', 'info'];
  const LABELS = {
    rating: 'Rating',
    likert: 'Likert',
    single: 'Single choice',
    multi: 'Multiple choice',
    short_text: 'Short text',
    long_text: 'Long text',
    yes_no: 'Yes / no',
    dropdown: 'Dropdown',
    matrix: 'Matrix',
    email: 'Email',
    phone: 'Phone',
    info: 'Note',
  };
  const OPERATORS = [
    ['equals', 'equals'],
    ['not_equals', 'does not equal'],
    ['answered', 'is answered'],
    ['unanswered', 'is unanswered'],
  ];
  const TOKENS = ['session_title', 'instructor_name', 'class_name', 'event_name', 'session_date'];

  let doc = JSON.parse(source.value);
  let drag = null;
  let dragged = false;

  palette.append(el('p', { class: 'mb-3 text-sm text-muted', text: 'Drag a question type into a section, or use Add.' }));
  const chips = el('div', { class: 'flex flex-wrap gap-2' });
  TYPES.forEach(function (type) {
    const chip = el('button', { type: 'button', class: 'builder-chip', draggable: 'true', text: LABELS[type] });
    chip.dataset.drag = 'type';
    chip.dataset.type = type;
    chip.addEventListener('click', function () {
      if (dragged) {
        dragged = false;
        return;
      }
      const section = doc.sections[doc.sections.length - 1];
      if (!section) return;
      addQuestion(section.id, null, type);
    });
    chips.append(chip);
  });
  palette.append(chips);

  form.addEventListener('dragstart', onDragStart);
  form.addEventListener('dragover', onDragOver);
  form.addEventListener('dragleave', onDragLeave);
  form.addEventListener('drop', onDrop);
  form.addEventListener('dragend', function () {
    clearDrop();
    setTimeout(function () { dragged = false; }, 0);
  });
  form.addEventListener('input', onEdit);
  form.addEventListener('change', onEdit);
  form.addEventListener('click', onClick);
  form.addEventListener('submit', onSubmit);
  render();

  function onDragStart(event) {
    const handle = event.target.closest('[data-drag]');
    if (!handle || !event.dataTransfer) return;
    drag = { kind: handle.dataset.drag, id: handle.dataset.id || '', type: handle.dataset.type || '' };
    dragged = true;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', drag.kind);
  }

  function onDragOver(event) {
    const zone = dropZone(event.target);
    if (!zone || !drag) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    clearDrop();
    zone.classList.add('builder-drop');
  }

  function onDragLeave(event) {
    const zone = dropZone(event.target);
    if (zone) zone.classList.remove('builder-drop');
  }

  function onDrop(event) {
    const zone = dropZone(event.target);
    event.preventDefault();
    clearDrop();
    if (!zone || !drag) return;
    const sectionId = zone.dataset.sectionId;
    if (drag.kind === 'section') moveSectionBefore(drag.id, zone.dataset.sectionId);
    else if (drag.kind === 'type') addQuestion(sectionId, zone.dataset.beforeId || null, drag.type);
    else moveQuestionBefore(drag.id, sectionId, zone.dataset.beforeId || null);
    drag = null;
  }

  function dropZone(target) {
    if (!drag || !target.closest) return null;
    if (drag.kind === 'section') return target.closest('[data-drop-section]');
    return target.closest('[data-drop-question], [data-drop-end]') || target.closest('[data-drop-section]');
  }

  function onEdit(event) {
    const field = event.target.closest('[data-field]');
    if (!field) return;
    const questionNode = field.closest('[data-question-id]');
    if (questionNode) updateQuestion(questionNode.dataset.questionId, field);
    else {
      const sectionNode = field.closest('[data-section-id]');
      if (sectionNode) updateSection(sectionNode.dataset.sectionId, field);
    }
    if (field.dataset.field === 'type') render();
    else refreshErrors();
  }

  function onClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const questionNode = button.closest('[data-question-id]');
    const sectionNode = button.closest('[data-section-id]');
    if (action === 'add-section') addSection();
    else if (action === 'delete-section' && sectionNode) deleteSection(sectionNode.dataset.sectionId);
    else if (action === 'section-up' && sectionNode) moveSection(sectionNode.dataset.sectionId, -1);
    else if (action === 'section-down' && sectionNode) moveSection(sectionNode.dataset.sectionId, 1);
    else if (action === 'add-question' && sectionNode) addQuestion(sectionNode.dataset.sectionId, null, sectionNode.querySelector('[data-add-type]').value);
    else if (action === 'delete-question' && questionNode) deleteQuestion(questionNode.dataset.questionId);
    else if (action === 'question-up' && questionNode) moveQuestion(questionNode.dataset.questionId, -1);
    else if (action === 'question-down' && questionNode) moveQuestion(questionNode.dataset.questionId, 1);
    else if (action === 'add-rule') addRule(questionNode, sectionNode);
    else if (action === 'delete-rule') deleteRule(questionNode, sectionNode, Number(button.dataset.ruleIndex));
  }

  function onSubmit(event) {
    const problems = validate(doc);
    refreshErrors();
    if (problems.length > 0) {
      event.preventDefault();
      errors.scrollIntoView({ block: 'nearest' });
      return;
    }
    form.querySelector('[name="document"]').value = JSON.stringify(cleanDocument(doc));
  }

  function addSection() {
    doc.sections.push({ id: uid('s'), title: 'New section', description: '', visibility: [], questions: [] });
    render();
  }

  function deleteSection(sectionId) {
    if (doc.sections.length === 1) {
      doc.sections[0].questions = [];
      doc.sections[0].visibility = [];
    } else doc.sections = doc.sections.filter(function (section) { return section.id !== sectionId; });
    prune();
    render();
  }

  function addQuestion(sectionId, beforeId, type) {
    const section = findSection(sectionId);
    if (!section || !TYPES.includes(type)) return;
    const question = blankQuestion(type);
    const index = beforeId ? section.questions.findIndex(function (item) { return item.id === beforeId; }) : section.questions.length;
    section.questions.splice(index < 0 ? section.questions.length : index, 0, question);
    prune();
    render();
  }

  function deleteQuestion(questionId) {
    doc.sections.forEach(function (section) {
      section.questions = section.questions.filter(function (question) { return question.id !== questionId; });
      section.visibility = section.visibility.filter(function (rule) { return rule.questionId !== questionId; });
    });
    doc.sections.forEach(function (section) {
      section.questions.forEach(function (question) {
        question.visibility = question.visibility.filter(function (rule) { return rule.questionId !== questionId; });
      });
    });
    render();
  }

  function moveQuestion(questionId, direction) {
    const located = locate(questionId);
    if (!located) return;
    const next = located.questionIndex + direction;
    const section = located.section;
    if (next >= 0 && next < section.questions.length) {
      const [question] = section.questions.splice(located.questionIndex, 1);
      section.questions.splice(next, 0, question);
    } else {
      const sectionIndex = doc.sections.indexOf(section);
      const target = doc.sections[sectionIndex + direction];
      if (!target) return;
      const [question] = section.questions.splice(located.questionIndex, 1);
      if (direction < 0) target.questions.push(question);
      else target.questions.unshift(question);
    }
    prune();
    render();
  }

  function moveQuestionBefore(questionId, sectionId, beforeId) {
    if (!questionId || questionId === beforeId) return;
    const located = locate(questionId);
    const section = findSection(sectionId);
    if (!located || !section) return;
    const [question] = located.section.questions.splice(located.questionIndex, 1);
    const index = beforeId ? section.questions.findIndex(function (item) { return item.id === beforeId; }) : section.questions.length;
    section.questions.splice(index < 0 ? section.questions.length : index, 0, question);
    prune();
    render();
  }

  function moveSection(sectionId, direction) {
    const index = doc.sections.findIndex(function (section) { return section.id === sectionId; });
    const next = index + direction;
    if (index < 0 || next < 0 || next >= doc.sections.length) return;
    const [section] = doc.sections.splice(index, 1);
    doc.sections.splice(next, 0, section);
    prune();
    render();
  }

  function moveSectionBefore(sectionId, beforeId) {
    if (!sectionId || sectionId === beforeId) return;
    const index = doc.sections.findIndex(function (section) { return section.id === sectionId; });
    if (index < 0) return;
    const [section] = doc.sections.splice(index, 1);
    const target = doc.sections.findIndex(function (item) { return item.id === beforeId; });
    doc.sections.splice(target < 0 ? doc.sections.length : target, 0, section);
    prune();
    render();
  }

  function addRule(questionNode, sectionNode) {
    const rules = ruleList(questionNode, sectionNode);
    if (!rules || rules.length >= 12) return;
    rules.push({ questionId: '', operator: 'equals', value: '' });
    render();
  }

  function deleteRule(questionNode, sectionNode, index) {
    const rules = ruleList(questionNode, sectionNode);
    if (!rules) return;
    rules.splice(index, 1);
    render();
  }

  function ruleList(questionNode, sectionNode) {
    if (questionNode) {
      const question = findQuestion(questionNode.dataset.questionId);
      return question ? question.visibility : null;
    }
    if (sectionNode) {
      const section = findSection(sectionNode.dataset.sectionId);
      return section ? section.visibility : null;
    }
    return null;
  }

  function updateSection(sectionId, field) {
    const section = findSection(sectionId);
    if (!section) return;
    const name = field.dataset.field;
    if (name === 'title') section.title = field.value;
    else if (name === 'description') section.description = field.value;
    else writeRule(section.visibility, field);
    const heading = field.closest('[data-section-id]')?.querySelector('[data-section-heading]');
    if (heading && name === 'title') heading.textContent = section.title || 'Untitled section';
  }

  function updateQuestion(questionId, field) {
    const question = findQuestion(questionId);
    if (!question) return;
    const name = field.dataset.field;
    if (name === 'title') question.title = field.value;
    else if (name === 'description') question.description = field.value;
    else if (name === 'required') question.required = field.checked && question.type !== 'info';
    else if (name === 'metric') question.reportingMetric = field.value;
    else if (name === 'type' && field.value !== question.type) replaceType(question, field.value);
    else if (name === 'labels') question.scale = scaleFromLines(field.value, question.scale);
    else if (name === 'allow_na') {
      if (question.scale) question.scale.allowNa = field.checked;
      if ('allowNa' in question) question.allowNa = field.checked;
    } else if (name === 'choices') question.choices = choicesFromLines(field.value);
    else if (name === 'allow_other') question.allowOther = field.checked;
    else if (name === 'min_select') question.minSelect = clamp(field.value, 0, 50, 0);
    else if (name === 'max_select') question.maxSelect = field.value.trim() ? clamp(field.value, 1, 50, 1) : null;
    else if (name === 'placeholder') question.placeholder = field.value;
    else if (name === 'min_length') question.minLength = clamp(field.value, 0, question.type === 'short_text' ? 500 : 4000, 0);
    else if (name === 'max_length') question.maxLength = clamp(field.value, 1, question.type === 'short_text' ? 500 : 4000, question.maxLength);
    else if (name === 'yes_label') question.yesLabel = field.value;
    else if (name === 'no_label') question.noLabel = field.value;
    else if (name === 'rows') question.rows = rowsFromLines(field.value);
    else if (name === 'columns') question.columns = columnsFromLines(field.value);
    else writeRule(question.visibility, field);
    const card = canvas.querySelector('[data-question-id="' + cssEscape(questionId) + '"]');
    const heading = card && card.querySelector('[data-heading]');
    if (heading && name === 'title') heading.textContent = question.title || 'Untitled question';
  }

  function writeRule(rules, field) {
    const index = Number(field.dataset.ruleIndex);
    const rule = rules[index];
    if (!rule) return;
    if (field.dataset.field === 'rule-question') rule.questionId = field.value;
    else if (field.dataset.field === 'rule-operator') rule.operator = field.value;
    else if (field.dataset.field === 'rule-value') rule.value = field.value;
  }

  function replaceType(question, type) {
    const next = blankQuestion(type);
    next.id = question.id;
    next.title = question.title;
    next.description = question.description;
    next.reportingMetric = question.reportingMetric;
    next.visibility = question.visibility;
    next.required = type === 'info' ? false : question.required;
    const located = locate(question.id);
    if (!located) return;
    located.section.questions.splice(located.questionIndex, 1, next);
  }

  function render() {
    canvas.replaceChildren();
    doc.sections.forEach(function (section, sectionIndex) {
      canvas.append(sectionNode(section, sectionIndex));
    });
    const add = el('button', { type: 'button', class: 'btn btn-quiet', text: 'Add section' });
    add.dataset.action = 'add-section';
    canvas.append(add);
    refreshErrors();
  }

  function sectionNode(section, sectionIndex) {
    const node = el('section', { class: 'mb-6 border border-navy/10 p-4', id: section.id });
    node.dataset.sectionId = section.id;
    node.dataset.dropSection = section.id;
    const head = el('div', { class: 'flex flex-wrap items-center justify-between gap-2' });
    const titleWrap = el('div', { class: 'flex items-center gap-2' });
    titleWrap.append(dragHandle('section', section.id, 'Drag section'));
    titleWrap.append(el('h3', { class: 'font-display text-2xl font-bold uppercase text-navy', text: section.title || 'Untitled section' }));
    titleWrap.lastChild.dataset.sectionHeading = '';
    head.append(titleWrap);
    const controls = el('div', { class: 'flex flex-wrap gap-2' });
    controls.append(actionButton('section-up', 'Up', sectionIndex === 0));
    controls.append(actionButton('section-down', 'Down', sectionIndex === doc.sections.length - 1));
    controls.append(actionButton('delete-section', 'Delete section', false));
    head.append(controls);
    node.append(head);
    node.append(labeled('Title', input('title', section.title)));
    node.append(labeled('Description', area('description', section.description)));
    node.append(ruleEditor(section.visibility, questionsBefore(sectionIndex, -1)));
    const list = el('div', { class: 'mt-4 grid gap-3' });
    section.questions.forEach(function (question, questionIndex) {
      list.append(questionNode(question, section, questionIndex));
    });
    const end = el('div', { class: 'border border-dashed border-navy/20 px-3 py-3 text-sm text-muted', text: 'Drop a question here' });
    end.dataset.dropEnd = '';
    end.dataset.sectionId = section.id;
    list.append(end);
    node.append(list);
    const addRow = el('div', { class: 'mt-4 flex flex-wrap gap-2' });
    const select = el('select', { class: 'select max-w-xs' });
    select.dataset.addType = '';
    TYPES.forEach(function (type) {
      const option = el('option', { value: type, text: LABELS[type] });
      select.append(option);
    });
    addRow.append(select);
    addRow.append(actionButton('add-question', 'Add question', false));
    node.append(addRow);
    return node;
  }

  function questionNode(question, section, questionIndex) {
    const node = el('article', { class: 'border border-navy/10 bg-surface p-3' });
    node.dataset.questionId = question.id;
    node.dataset.dropQuestion = question.id;
    node.dataset.sectionId = section.id;
    node.dataset.beforeId = question.id;
    const head = el('div', { class: 'flex flex-wrap items-center justify-between gap-2' });
    const titleWrap = el('div', { class: 'flex min-w-0 items-center gap-2' });
    titleWrap.append(dragHandle('question', question.id, 'Drag question'));
    const heading = el('p', { class: 'font-semibold text-navy', text: question.title || 'Untitled question' });
    heading.dataset.heading = '';
    titleWrap.append(heading);
    titleWrap.append(el('span', { class: 'text-sm text-muted', text: LABELS[question.type] || question.type }));
    head.append(titleWrap);
    const atStart = questionIndex === 0 && doc.sections[0] === section;
    const atEnd = questionIndex === section.questions.length - 1 && doc.sections[doc.sections.length - 1] === section;
    const controls = el('div', { class: 'flex flex-wrap gap-2' });
    controls.append(actionButton('question-up', 'Up', atStart));
    controls.append(actionButton('question-down', 'Down', atEnd));
    controls.append(actionButton('delete-question', 'Delete', false));
    head.append(controls);
    node.append(head);
    const summary = el('p', { class: 'mt-1 text-sm text-muted', text: ruleSummary(question.visibility) });
    summary.dataset.ruleSummary = '';
    node.append(summary);
    const body = el('div', { class: 'mt-3 grid gap-3' });
    body.append(labeled('Question', input('title', question.title)));
    body.append(labeled('Help text', area('description', question.description)));
    if (question.type !== 'info') body.append(check('required', 'Required', question.required));
    body.append(labeled('Reporting metric', input('metric', question.reportingMetric)));
    body.append(labeled('Question type', typeSelect(question.type)));
    body.append(typeFields(question));
    body.append(ruleEditor(question.visibility, questionsBeforeSection(section, questionIndex)));
    node.append(body);
    return node;
  }

  function typeFields(question) {
    const wrap = el('div', { class: 'grid gap-3' });
    if (question.type === 'rating' || question.type === 'likert') {
      wrap.append(labeled('Scale, one per line, like “1 Poor”', area('labels', linesFromScale(question.scale))));
      wrap.append(check('allow_na', 'Allow N/A', question.scale.allowNa));
    } else if (question.type === 'single' || question.type === 'dropdown' || question.type === 'multi') {
      wrap.append(labeled('Choices, one per line', area('choices', question.choices.map(function (choice) { return choice.label; }).join('\n'))));
      wrap.append(check('allow_other', 'Allow an other answer', question.allowOther));
      if (question.type === 'multi') {
        const row = el('div', { class: 'grid gap-2 sm:grid-cols-2' });
        row.append(input('min_select', String(question.minSelect), 'Minimum selected'));
        row.append(input('max_select', question.maxSelect === null ? '' : String(question.maxSelect), 'Maximum selected'));
        wrap.append(row);
      }
    } else if (question.type === 'short_text' || question.type === 'long_text' || question.type === 'email' || question.type === 'phone') {
      wrap.append(input('placeholder', question.placeholder, 'Placeholder'));
      if (question.type === 'short_text' || question.type === 'long_text') {
        const row = el('div', { class: 'grid gap-2 sm:grid-cols-2' });
        row.append(input('min_length', String(question.minLength), 'Minimum length'));
        row.append(input('max_length', String(question.maxLength), 'Maximum length'));
        wrap.append(row);
      }
    } else if (question.type === 'yes_no') {
      const row = el('div', { class: 'grid gap-2 sm:grid-cols-2' });
      row.append(input('yes_label', question.yesLabel, 'Yes label'));
      row.append(input('no_label', question.noLabel, 'No label'));
      wrap.append(row);
    } else if (question.type === 'matrix') {
      wrap.append(labeled('Rows, one per line', area('rows', question.rows.map(function (row) { return row.label; }).join('\n'))));
      wrap.append(labeled('Columns, one per line, like “1 Poor”', area('columns', question.columns.map(function (column) { return column.value + ' ' + column.label; }).join('\n'))));
      wrap.append(check('allow_na', 'Allow N/A', question.allowNa));
    }
    return wrap;
  }

  function ruleEditor(rules, earlier) {
    const wrap = el('div', { class: 'grid gap-2' });
    wrap.append(el('p', { class: 'text-sm text-muted', text: 'Show this when any earlier answer matches. Leave it empty to always show it.' }));
    rules.forEach(function (rule, index) {
      const row = el('div', { class: 'grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]' });
      const question = el('select', { class: 'select' });
      question.dataset.field = 'rule-question';
      question.dataset.ruleIndex = String(index);
      question.append(el('option', { value: '', text: 'Always show' }));
      earlier.forEach(function (item) {
        const option = el('option', { value: item.id, text: item.title || 'Untitled question' });
        if (item.id === rule.questionId) option.selected = true;
        question.append(option);
      });
      const operator = el('select', { class: 'select' });
      operator.dataset.field = 'rule-operator';
      operator.dataset.ruleIndex = String(index);
      OPERATORS.forEach(function (item) {
        const option = el('option', { value: item[0], text: item[1] });
        if (item[0] === (rule.operator || 'equals')) option.selected = true;
        operator.append(option);
      });
      const value = input('rule-value', rule.value || '', 'Yes, Maybe, …');
      value.dataset.ruleIndex = String(index);
      const remove = actionButton('delete-rule', 'Remove', false);
      remove.dataset.ruleIndex = String(index);
      row.append(question, operator, value, remove);
      wrap.append(row);
    });
    wrap.append(actionButton('add-rule', 'Add condition', rules.length >= 12));
    return wrap;
  }

  function questionsBefore(sectionIndex, questionIndex) {
    const items = [];
    doc.sections.forEach(function (section, index) {
      if (index > sectionIndex) return;
      section.questions.forEach(function (question, position) {
        if (index < sectionIndex || position < questionIndex) items.push(question);
      });
    });
    return items;
  }

  function questionsBeforeSection(section, questionIndex) {
    return questionsBefore(doc.sections.indexOf(section), questionIndex);
  }

  function prune() {
    const order = [];
    doc.sections.forEach(function (section) { section.questions.forEach(function (question) { order.push(question.id); }); });
    const index = new Map(order.map(function (id, position) { return [id, position]; }));
    let cursor = 0;
    doc.sections.forEach(function (section) {
      section.visibility = keepEarlier(section.visibility, index, cursor);
      section.questions.forEach(function (question) {
        question.visibility = keepEarlier(question.visibility, index, index.get(question.id));
        cursor += 1;
      });
    });
  }

  function keepEarlier(rules, index, position) {
    return rules.filter(function (rule) {
      if (!rule.questionId) return true;
      const prior = index.get(rule.questionId);
      return prior !== undefined && prior < position;
    });
  }

  function validate(document) {
    const problems = [];
    const questions = [];
    document.sections.forEach(function (section) { section.questions.forEach(function (question) { questions.push(question); }); });
    if (questions.length === 0 || questions.every(function (question) { return question.type === 'info'; })) problems.push({ id: '', message: 'Add at least one question.' });
    const index = new Map(questions.map(function (question, position) { return [question.id, position]; }));
    let cursor = 0;
    document.sections.forEach(function (section, sectionIndex) {
      if (!section.title.trim()) problems.push({ id: section.id, message: 'Section ' + (sectionIndex + 1) + ' needs a title.' });
      ruleProblems(section.visibility, section.id, section.title || 'Section ' + (sectionIndex + 1), index, cursor, problems);
      section.questions.forEach(function (question) {
        if (!question.title.trim()) problems.push({ id: question.id, message: 'Every question needs a title.' });
        ruleProblems(question.visibility, question.id, question.title || 'Question', index, index.get(question.id), problems);
        configProblems(question, problems);
        cursor += 1;
      });
    });
    const unknown = [];
    const sourceText = JSON.stringify(document);
    const pattern = /\{\{\s*([a-z_]+)\s*\}\}/g;
    let match = pattern.exec(sourceText);
    while (match) {
      if (!TOKENS.includes(match[1]) && !unknown.includes(match[1])) unknown.push(match[1]);
      match = pattern.exec(sourceText);
    }
    unknown.forEach(function (token) { problems.push({ id: '', message: 'Unknown token {{' + token + '}}.' }); });
    return problems;
  }

  function ruleProblems(rules, id, label, index, position, problems) {
    rules.forEach(function (rule) {
      if (!rule.questionId) return;
      const prior = index.get(rule.questionId);
      if (prior === undefined || prior >= position) problems.push({ id: id, message: '“' + label + '” must depend on an earlier question.' });
      else if ((rule.operator === 'equals' || rule.operator === 'not_equals') && !(rule.value || '').trim()) problems.push({ id: id, message: '“' + label + '” needs a value for its condition.' });
    });
  }

  function configProblems(question, problems) {
    if ((question.type === 'rating' || question.type === 'likert') && !(question.scale.min < question.scale.max)) problems.push({ id: question.id, message: '“' + question.title + '” needs a scale with at least two points.' });
    if ((question.type === 'single' || question.type === 'dropdown' || question.type === 'multi') && question.choices.length === 0) problems.push({ id: question.id, message: '“' + question.title + '” needs at least one choice.' });
    if (question.type === 'matrix' && (question.rows.length === 0 || question.columns.length === 0)) problems.push({ id: question.id, message: '“' + question.title + '” needs rows and columns.' });
  }

  function refreshErrors() {
    const problems = validate(doc);
    errors.replaceChildren();
    if (problems.length > 0) {
      const list = el('ul', { class: 'list-disc pl-5' });
      problems.forEach(function (problem) { list.append(el('li', { text: problem.message })); });
      const box = el('div', { class: 'mb-4 border border-red-700/30 bg-red-50 px-4 py-3 text-sm text-red-900', role: 'alert' });
      box.append(list);
      errors.append(box);
    }
    canvas.querySelectorAll('[data-question-id], [data-section-id]').forEach(function (card) {
      const id = card.dataset.questionId || card.dataset.sectionId;
      const mine = problems.filter(function (problem) { return problem.id === id; });
      let note = card.querySelector(':scope > [data-problem]');
      if (mine.length === 0) {
        if (note) note.remove();
        return;
      }
      if (!note) {
        note = el('p', { class: 'mt-2 text-sm text-red-800' });
        note.dataset.problem = '';
        card.append(note);
      }
      note.textContent = mine.map(function (problem) { return problem.message; }).join(' ');
    });
    doc.sections.forEach(function (section) {
      section.questions.forEach(function (question) {
        const card = canvas.querySelector('[data-question-id="' + cssEscape(question.id) + '"]');
        const summary = card && card.querySelector('[data-rule-summary]');
        if (summary) summary.textContent = ruleSummary(question.visibility);
      });
    });
  }

  function cleanDocument(document) {
    return {
      sections: document.sections.map(function (section) {
        return {
          id: section.id,
          title: section.title.trim(),
          description: section.description.trim(),
          visibility: cleanRules(section.visibility),
          questions: section.questions.map(function (question) {
            const next = Object.assign({}, question, { title: question.title.trim(), description: question.description.trim(), visibility: cleanRules(question.visibility) });
            if (next.type === 'info') next.required = false;
            return next;
          }),
        };
      }),
    };
  }

  function cleanRules(rules) {
    return rules.filter(function (rule) { return rule.questionId; }).map(function (rule) {
      return { questionId: rule.questionId, operator: rule.operator, value: (rule.value || '').trim() || undefined };
    });
  }

  function blankQuestion(type) {
    const base = { id: uid('q'), title: 'New question', description: '', required: type !== 'info' && type !== 'long_text', reportingMetric: '', visibility: [] };
    if (type === 'rating') return Object.assign(base, { type: type, scale: standardScale(['Poor', 'Fair', 'Good', 'Very Good', 'Excellent']) });
    if (type === 'likert') return Object.assign(base, { type: type, scale: standardScale(['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree']) });
    if (type === 'single' || type === 'dropdown') return Object.assign(base, { type: type, choices: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }], allowOther: false });
    if (type === 'multi') return Object.assign(base, { type: type, choices: [{ id: 'option-1', label: 'Option 1' }], allowOther: false, minSelect: 0, maxSelect: null });
    if (type === 'short_text') return Object.assign(base, { type: type, minLength: 0, maxLength: 500, placeholder: '' });
    if (type === 'long_text') return Object.assign(base, { type: type, minLength: 0, maxLength: 4000, placeholder: '' });
    if (type === 'yes_no') return Object.assign(base, { type: type, yesLabel: 'Yes', noLabel: 'No' });
    if (type === 'matrix') return Object.assign(base, { type: type, rows: [{ id: 'row-1', label: 'Item' }], columns: [1, 2, 3, 4, 5].map(function (value, index) { return { id: 'c' + value, label: ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][index], value: value }; }), allowNa: true });
    if (type === 'email' || type === 'phone') return Object.assign(base, { type: type, placeholder: '' });
    return Object.assign(base, { type: 'info', required: false });
  }

  function standardScale(names) {
    const labels = {};
    names.forEach(function (name, index) { labels[String(index + 1)] = name; });
    return { min: 1, max: names.length, allowNa: true, labels: labels };
  }

  function scaleFromLines(text, fallback) {
    const labels = {};
    text.split('\n').forEach(function (line) {
      const match = /^(\d+)\s+(.+)$/.exec(line.trim());
      if (match) labels[match[1]] = match[2].trim();
    });
    const numbers = Object.keys(labels).map(Number);
    if (numbers.length < 2) return fallback;
    return { min: Math.min.apply(null, numbers), max: Math.max.apply(null, numbers), allowNa: fallback.allowNa, labels: labels };
  }

  function linesFromScale(scale) {
    const lines = [];
    for (let value = scale.min; value <= scale.max; value += 1) lines.push((value + ' ' + (scale.labels[String(value)] || '')).trim());
    return lines.join('\n');
  }

  function choicesFromLines(text) {
    const seen = {};
    const choices = [];
    text.split('\n').forEach(function (line) {
      const label = line.trim();
      if (!label) return;
      const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'option';
      seen[base] = (seen[base] || 0) + 1;
      choices.push({ id: seen[base] === 1 ? base : base + '-' + seen[base], label: label });
    });
    return choices;
  }

  function rowsFromLines(text) {
    return choicesFromLines(text).map(function (choice) { return { id: choice.id, label: choice.label }; });
  }

  function columnsFromLines(text) {
    const columns = [];
    text.split('\n').forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed) return;
      const match = /^(\d+)\s+(.+)$/.exec(trimmed);
      const value = match ? Number(match[1]) : columns.length + 1;
      columns.push({ id: 'c' + value, label: match ? match[2].trim() : trimmed, value: value });
    });
    return columns;
  }

  function ruleSummary(rules) {
    const active = rules.filter(function (rule) { return rule.questionId; });
    if (active.length === 0) return 'Always shown';
    return 'Shown when ' + active.map(function (rule) {
      const question = findQuestion(rule.questionId);
      const name = question ? question.title : 'a missing question';
      if (rule.operator === 'answered') return name + ' is answered';
      if (rule.operator === 'unanswered') return name + ' is unanswered';
      if (rule.operator === 'not_equals') return name + ' is not ' + (rule.value || '…');
      return name + ' is ' + (rule.value || '…');
    }).join(' or ');
  }

  function dragHandle(kind, id, label) {
    const button = el('button', { type: 'button', class: 'cursor-grab px-1 font-display text-lg text-muted', draggable: 'true', text: '⋮⋮', title: label });
    button.setAttribute('aria-label', label);
    button.dataset.drag = kind;
    button.dataset.id = id;
    return button;
  }

  function actionButton(action, label, disabled) {
    const button = el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: label });
    button.dataset.action = action;
    button.disabled = Boolean(disabled);
    return button;
  }

  function labeled(label, field) {
    const wrap = el('label', { class: 'block' });
    wrap.append(el('span', { class: 'text-sm text-muted', text: label }));
    field.classList.add('mt-1');
    wrap.append(field);
    return wrap;
  }

  function input(field, value, placeholder) {
    const node = el('input', { class: 'input', value: value || '' });
    if (placeholder) node.placeholder = placeholder;
    node.dataset.field = field;
    return node;
  }

  function area(field, value) {
    const node = el('textarea', { class: 'textarea', text: value || '' });
    node.dataset.field = field;
    return node;
  }

  function check(field, label, checked) {
    const wrap = el('label', { class: 'flex items-center gap-2' });
    const box = el('input', { type: 'checkbox' });
    box.dataset.field = field;
    box.checked = Boolean(checked);
    wrap.append(box, el('span', { text: label }));
    return wrap;
  }

  function typeSelect(current) {
    const select = el('select', { class: 'select' });
    select.dataset.field = 'type';
    TYPES.forEach(function (type) {
      const option = el('option', { value: type, text: LABELS[type] });
      if (type === current) option.selected = true;
      select.append(option);
    });
    return select;
  }

  function findSection(id) {
    return doc.sections.find(function (section) { return section.id === id; });
  }

  function findQuestion(id) {
    const located = locate(id);
    return located ? located.question : null;
  }

  function locate(id) {
    for (let index = 0; index < doc.sections.length; index += 1) {
      const questionIndex = doc.sections[index].questions.findIndex(function (question) { return question.id === id; });
      if (questionIndex >= 0) return { section: doc.sections[index], questionIndex: questionIndex, question: doc.sections[index].questions[questionIndex] };
    }
    return null;
  }

  function clearDrop() {
    form.querySelectorAll('.builder-drop').forEach(function (node) { node.classList.remove('builder-drop'); });
  }

  function clamp(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function uid(prefix) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    let body = '';
    bytes.forEach(function (byte) { body += String.fromCharCode(byte); });
    body = btoa(body).replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
    return prefix + '_' + (body || 'id');
  }

  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"');
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(function (entry) {
      const key = entry[0];
      const value = entry[1];
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : String(value));
    });
    (children || []).forEach(function (child) { if (child) node.append(child); });
    return node;
  }
})();
