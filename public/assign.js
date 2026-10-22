const picker = document.querySelector('#session-picker');
if (picker) {
  const boxes = () => [...picker.querySelectorAll('input[name="session_id"]')];
  const refresh = () => {
    const count = boxes().filter((box) => box.checked).length;
    const label = picker.querySelector('[data-selected-count]');
    if (label) label.textContent = count === 1 ? '1 session selected' : `${count} sessions selected`;
  };
  picker.addEventListener('click', (event) => {
    const button = event.target.closest('[data-select]');
    if (!button) return;
    const mode = button.dataset.select;
    const day = button.dataset.day;
    const program = button.dataset.program;
    for (const box of boxes()) {
      if (mode === 'all') box.checked = true;
      if (mode === 'none') box.checked = false;
      if (mode === 'day' && box.dataset.day === day) box.checked = true;
      if (mode === 'program' && box.dataset.program === program) box.checked = true;
    }
    refresh();
  });
  picker.addEventListener('change', refresh);
}
