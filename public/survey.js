(function () {
  const form = document.querySelector('[data-survey]');
  if (!form) return;

  function tokensFor(questionId) {
    const root = form.querySelector('[data-qid="' + CSS.escape(questionId) + '"]');
    if (!root || root.hidden || root.closest('[hidden]')) return [];
    const tokens = [];
    root.querySelectorAll('input, select, textarea').forEach(function (input) {
      if (input.closest('[hidden]') && input.closest('[hidden]') !== root) return;
      if (input.tagName === 'SELECT') {
        const option = input.selectedOptions && input.selectedOptions[0];
        if (option && option.value) {
          tokens.push(option.value);
          tokens.push((option.textContent || '').trim());
        }
        return;
      }
      if ((input.type === 'radio' || input.type === 'checkbox') && !input.checked) return;
      const value = (input.value || '').trim();
      if (!value) return;
      tokens.push(value);
      const label = input.getAttribute('data-label');
      if (label) tokens.push(label);
    });
    return tokens;
  }

  function matches(rule) {
    const tokens = tokensFor(rule.questionId);
    const wanted = (rule.value || '').trim().toLowerCase();
    if (rule.operator === 'answered') return tokens.length > 0;
    if (rule.operator === 'unanswered') return tokens.length === 0;
    const hit = tokens.some(function (token) {
      return token.toLowerCase() === wanted;
    });
    if (rule.operator === 'equals') return hit;
    return tokens.length > 0 && !hit;
  }

  function applyVisibility() {
    const nodes = Array.from(form.querySelectorAll('[data-show]'));
    for (let pass = 0; pass < nodes.length + 1; pass += 1) {
      let changed = false;
      nodes.forEach(function (node) {
        let rules = [];
        try {
          rules = JSON.parse(node.getAttribute('data-show') || '[]');
        } catch (error) {
          rules = [];
        }
        const visible = !Array.isArray(rules) || rules.length === 0 || rules.some(matches);
        if (node.hidden === visible) {
          node.hidden = !visible;
          changed = true;
        }
      });
      if (!changed) break;
    }
  }

  form.addEventListener('change', function () {
    applyVisibility();
    renderSteps();
  });
  form.addEventListener('input', applyVisibility);
  applyVisibility();

  const sections = Array.from(form.querySelectorAll('[data-section]'));
  const back = form.querySelector('[data-back]');
  const next = form.querySelector('[data-next]');
  const submit = form.querySelector('[data-submit]');
  if (sections.length < 2 || !back || !next || !submit) return;

  let index = 0;
  const invalid = form.querySelector('[data-invalid]');
  if (invalid) {
    const host = invalid.closest('[data-section]');
    const found = sections.filter(function (section) { return !section.hidden; }).indexOf(host);
    if (found >= 0) index = found;
  }

  function renderSteps() {
    const visible = sections.filter(function (section) { return !section.hidden; });
    if (index >= visible.length) index = Math.max(0, visible.length - 1);
    sections.forEach(function (section) {
      const current = section === visible[index];
      section.classList.toggle('step-off', !section.hidden && !current);
    });
    back.hidden = index <= 0;
    next.hidden = index >= visible.length - 1;
    submit.hidden = visible.length > 0 && index < visible.length - 1;
  }

  back.addEventListener('click', function () {
    index = Math.max(0, index - 1);
    renderSteps();
    const current = sections.filter(function (section) { return !section.hidden; })[index];
    if (current) current.scrollIntoView({ block: 'start' });
  });
  next.addEventListener('click', function () {
    const visible = sections.filter(function (section) { return !section.hidden; });
    index = Math.min(visible.length - 1, index + 1);
    renderSteps();
    const current = visible[index];
    if (current) current.scrollIntoView({ block: 'start' });
  });
  renderSteps();
})();
