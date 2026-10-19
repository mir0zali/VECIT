// Live brand suggestions under the search boxes.
document.querySelectorAll('input[data-suggest]').forEach((input) => {
  const form = input.form;
  let box, timer, items = [], active = -1;

  const close = () => { if (box) box.remove(); box = null; active = -1; };
  const highlight = (i) => {
    if (!box) return;
    const links = box.querySelectorAll('a');
    links.forEach((a, n) => a.classList.toggle('active', n === i));
    active = i;
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) return close();
    timer = setTimeout(async () => {
      try {
        items = await (await fetch('/api/search?q=' + encodeURIComponent(q))).json();
      } catch { return; }
      close();
      if (!items.length) return;
      box = document.createElement('div');
      box.className = 'suggest';
      box.setAttribute('role', 'listbox');
      for (const it of items) {
        const a = document.createElement('a');
        a.href = '/brand/' + it.slug;
        a.setAttribute('role', 'option');
        const img = document.createElement('img'); img.src = it.logo; img.alt = '';
        const name = document.createElement('strong'); name.textContent = it.name;
        const cat = document.createElement('span'); cat.textContent = it.category;
        a.append(img, name, cat);
        box.append(a);
      }
      form.append(box);
    }, 120);
  });

  input.addEventListener('keydown', (e) => {
    if (!box) return;
    const n = box.querySelectorAll('a').length;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight((active + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight((active - 1 + n) % n); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); location.href = box.querySelectorAll('a')[active].href; }
    else if (e.key === 'Escape') close();
  });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
});

// Copy a brand color's hex code.
document.querySelectorAll('[data-copy]').forEach((el) => {
  el.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el.dataset.copy); } catch { return; }
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 1200);
  });
});

// Ask before destructive admin actions.
document.querySelectorAll('form[data-confirm]').forEach((f) => {
  f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); });
});
