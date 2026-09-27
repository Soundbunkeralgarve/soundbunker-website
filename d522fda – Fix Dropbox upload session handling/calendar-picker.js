(() => {
  const dialog = document.createElement('dialog');
  dialog.className = 'sb-calendar';
  dialog.setAttribute('aria-labelledby', 'sb-calendar-month');
  dialog.innerHTML = '<div class="sb-calendar-header"><button type="button" data-move="-1" aria-label="Previous month">‹</button><strong id="sb-calendar-month" aria-live="polite"></strong><button type="button" data-move="1" aria-label="Next month">›</button></div><div class="sb-calendar-week"></div><div class="sb-calendar-days"></div><button type="button" class="sb-calendar-close">Close</button>';
  document.body.append(dialog);
  let field, month, year;
  const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const locale = () => ({ en: 'en-GB', pt: 'pt-PT', de: 'de-DE', fr: 'fr-FR' }[document.documentElement.lang] || 'en-GB');
  function render() {
    const language = document.documentElement.lang;
    dialog.querySelector('.sb-calendar-close').textContent = ({ pt: 'Fechar', de: 'Schließen', fr: 'Fermer' }[language] || 'Close');
    dialog.querySelector('#sb-calendar-month').textContent = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
    const weekdays = dialog.querySelector('.sb-calendar-week');
    weekdays.replaceChildren();
    for (let n = 0; n < 7; n++) {
      const label = document.createElement('span');
      label.textContent = new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(2024, 0, 1 + n));
      weekdays.append(label);
    }
    const days = dialog.querySelector('.sb-calendar-days');
    days.replaceChildren();
    for (let n = 0; n < (new Date(year, month, 1).getDay() + 6) % 7; n++) days.append(document.createElement('span'));
    const count = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= count; day++) {
      const value = iso(year, month, day);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = day;
      button.disabled = Boolean((field.min && value < field.min) || (field.max && value > field.max));
      button.setAttribute('aria-label', new Intl.DateTimeFormat(locale(), { dateStyle: 'full' }).format(new Date(year, month, day)));
      button.setAttribute('aria-pressed', String(value === field.value));
      button.addEventListener('click', () => {
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        dialog.close();
      });
      days.append(button);
    }
    dialog.querySelector('[data-move="-1"]').disabled = Boolean(field.min && iso(year, month, 1) <= field.min);
    dialog.querySelector('[data-move="1"]').disabled = Boolean(field.max && iso(year, month, count) >= field.max);
  }
  function open(input) {
    if (input.disabled || input.readOnly || dialog.open) return;
    field = input;
    const today = new Date();
    let value = input.value || iso(today.getFullYear(), today.getMonth(), today.getDate());
    if (input.min && value < input.min) value = input.min;
    if (input.max && value > input.max) value = input.max;
    const parts = value.split('-').map(Number);
    year = parts[0]; month = parts[1] - 1;
    render();
    dialog.showModal();
    (dialog.querySelector('[aria-pressed="true"]:not(:disabled)') || dialog.querySelector('.sb-calendar-days button:not(:disabled)'))?.focus();
  }
  dialog.addEventListener('click', event => {
    const move = event.target.closest('[data-move]');
    if (move) {
      const next = new Date(year, month + Number(move.dataset.move), 1);
      year = next.getFullYear(); month = next.getMonth(); render();
    }
    if (event.target.closest('.sb-calendar-close')) dialog.close();
  });
  dialog.addEventListener('close', () => field?.focus());
  document.addEventListener('click', event => {
    if (event.target.matches('input[type="date"]')) { event.preventDefault(); open(event.target); }
  });
  document.addEventListener('keydown', event => {
    if (!event.target.matches('input[type="date"]') || event.key === 'Tab') return;
    event.preventDefault();
    if (['Enter', ' ', 'ArrowDown'].includes(event.key)) open(event.target);
  });
  document.addEventListener('beforeinput', event => { if (event.target.matches('input[type="date"]')) event.preventDefault(); });
  function enhance() {
    document.querySelectorAll('input[type="date"]').forEach(input => {
      input.setAttribute('inputmode', 'none');
      input.setAttribute('aria-haspopup', 'dialog');
    });
  }
  enhance();
  new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true });
})();
