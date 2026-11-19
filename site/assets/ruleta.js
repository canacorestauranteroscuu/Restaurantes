/* Ruleta del Sabor — home (pase Muriel). Reemplaza site/assets/ruleta.js completo. */
(function () {
  if (typeof restaurants === 'undefined') return;

  let activeFilter = 'all';
  let openOnly = true;
  let lastWinner = null;
  let spinning = false;
  let angle = 0;
  const SPIN_MS = 3000;

  const $ = (id) => document.getElementById(id);
  const wheel = $('ruletaWheel'), hub = $('ruletaHub'), hint = $('ruletaHint');
  const result = $('ruletaResult'), live = $('ruletaLive'), empty = $('ruletaEmpty');
  const spinMain = $('spinBtn'), spinSticky = $('spinBtnSticky');
  const openToggle = $('openNowToggle'), openCount = $('openCountNote');
  const chipRow = $('filterChips'), moreBtn = $('chipMoreBtn'), moreMenu = $('chipMoreMenu');
  const listPreview = $('homeRestList'), homeSearch = $('homeSearch'), homeTotal = $('homeRestTotal');
  const stickyBar = $('stickySpin'), maps = $('ruletaMaps'), share = $('ruletaShare');

  const q = () => homeSearch?.value?.trim() || '';
  const pool = () => filterRestaurants({ category: activeFilter, openOnly, query: q() });

  function updateCounts() {
    const all = filterRestaurants({ category: activeFilter, query: q() });
    const openN = countOpen(all);
    if (openCount) openCount.textContent = openOnly ? `${openN} de ${all.length}` : `${all.length} socios`;
    if (homeTotal) homeTotal.textContent = `${restaurants.length} restaurantes socios`;
    document.querySelectorAll('[data-stat="socios"]').forEach((el) => (el.textContent = restaurants.length));
    if (empty) empty.hidden = true;
  }

  function setFilter(key) {
    activeFilter = key;
    chipRow?.querySelectorAll('.chip[data-filter]').forEach((el) => {
      const on = el.dataset.filter === key;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const inMore = !['all', 'Restaurante', 'Desayunos', 'Café'].includes(key);
    moreBtn?.classList.toggle('is-active', inMore);
    if (moreBtn) moreBtn.textContent = inMore ? `${CATEGORY_LABELS[key] || key} ▾` : 'Más ▾';
    closeMore();
    updateCounts();
  }

  chipRow?.querySelectorAll('.chip[data-filter]').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));

  if (moreMenu) {
    MORE_FILTER_CATEGORIES.forEach((cat) => {
      if (!restaurants.some((r) => r.categories.includes(cat))) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = CATEGORY_LABELS[cat] || cat;
      b.addEventListener('click', () => setFilter(cat));
      moreMenu.appendChild(b);
    });
  }
  function closeMore() { moreMenu?.classList.remove('is-open'); moreBtn?.setAttribute('aria-expanded', 'false'); }
  moreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = moreMenu.classList.toggle('is-open');
    moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', closeMore);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMore(); });

  // «Solo abiertos»: el <label> nativo ya alterna el checkbox. NO añadir otro listener de click (causaba doble toggle).
  openToggle?.addEventListener('change', () => { openOnly = openToggle.checked; updateCounts(); });

  function renderPreview() {
    if (!listPreview) return;
    const items = filterRestaurants({ category: 'all', query: q(), openOnly: false }).slice(0, 6);
    listPreview.innerHTML = items.map((r) => {
      const st = statusText(r);
      const rid = 'r-' + slugify(r.name);
      return `<a class="rest-card${lastWinner && lastWinner.name === r.name ? ' is-highlight' : ''}" href="/restaurantes/#${rid}">
        ${logoTile(r, 'sm')}
        <span class="rest-info">
          <span class="rest-name">${escapeHtml(r.name)}</span>
          <span class="rest-meta"><span class="${st.cls}">${st.text}</span> · ${escapeHtml(categoryLine(r))}${ratingLine(r)}</span>
        </span>
        <span class="rest-chevron" aria-hidden="true">›</span>
      </a>`;
    }).join('');
  }

  function setBusy(b) {
    [spinMain, spinSticky].forEach((el) => {
      if (!el) return;
      el.setAttribute('aria-disabled', b ? 'true' : 'false');
      el.textContent = b ? 'Girando…' : (lastWinner ? 'Otra vez' : '¡Sorpréndeme!');
    });
  }

  function pickWinner(c) {
    if (c.length < 2 || !lastWinner) return c[Math.floor(Math.random() * c.length)];
    const rest = c.filter((r) => r.name !== lastWinner.name);
    return rest[Math.floor(Math.random() * rest.length)];
  }

  function showEmpty() {
    if (!empty) return;
    empty.hidden = false;
    live.textContent = openOnly ? 'A esta hora no hay socios abiertos con este filtro.' : 'No hay socios con este filtro.';
  }
  $('ruletaVerTodos')?.addEventListener('click', () => {
    openToggle.checked = false; openOnly = false; activeFilter !== 'all' && setFilter('all'); updateCounts(); spin();
  });

  function showWinner(r) {
    const st = statusText(r);
    lastWinner = r;
    hub.innerHTML = logoTile(r, 'sm');
    $('resLogo').innerHTML = logoTile(r, 'lg');
    $('resName').textContent = r.name;
    $('resType').textContent = categoryLine(r) + (r.rating ? ` · ★ ${r.rating.toFixed(1)}` : '');
    $('resStatus').innerHTML = `<span class="${st.cls}">${st.text}</span> · ${escapeHtml(hoyHorario(r))}`;
    $('resAddr').textContent = r.address || '';
    hint.hidden = true;
    const stage = wheel.parentElement; stage.classList.remove('is-done'); void stage.offsetWidth; stage.classList.add('is-done');
    result.classList.add('is-shown');
    result.classList.remove('is-in'); void result.offsetWidth; result.classList.add('is-in');
    if (maps) { maps.href = r.mapsUrl || '#'; maps.hidden = !r.mapsUrl; }
    if (share) share.onclick = () => shareWinner(r);
    live.textContent = `Te tocó ${r.name}. ${st.text}. ${hoyHorario(r)}. ${r.address || ''}`;
    if (navigator.vibrate && !prefersReducedMotion) navigator.vibrate(12);
    renderPreview();
    const box = result.getBoundingClientRect();
    if (box.bottom > innerHeight - 90) result.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }

  function shareWinner(r) {
    const text = `La Ruleta del Sabor me mandó a ${r.name}. ¡Vamos a consumir local! ${SITE_ORIGIN}/`;
    if (navigator.share) navigator.share({ title: 'Ruleta del Sabor', text }).catch(() => {});
    else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }

  function spin() {
    if (spinning) return;
    const c = pool();
    if (!c.length) { showEmpty(); return; }
    if (empty) empty.hidden = true;
    const winner = pickWinner(c);
    spinning = true;
    setBusy(true);

    if (prefersReducedMotion) {
      showWinner(winner); spinning = false; setBusy(false); return;
    }
    angle += 1440 + Math.floor(Math.random() * 360);
    wheel.style.transition = `transform ${SPIN_MS}ms var(--ease-spin)`;
    wheel.style.transform = `rotate(${angle}deg)`;
    const t0 = performance.now();
    let lastStep = -1;
    const STEPS = 22;
    (function tick(now) {
      const p = Math.min(1, (now - t0) / SPIN_MS);
      const step = Math.floor((1 - Math.pow(1 - p, 3)) * STEPS); // se frena junto con la rueda
      if (step !== lastStep && p < 1) {
        lastStep = step;
        hub.innerHTML = logoTile(c[Math.floor(Math.random() * c.length)], 'sm');
        hub.classList.remove('is-tick'); void hub.offsetWidth; hub.classList.add('is-tick');
      }
      if (p < 1) requestAnimationFrame(tick);
      else { showWinner(winner); spinning = false; setBusy(false); }
    })(t0);
  }

  [spinMain, spinSticky].forEach((b) => b?.addEventListener('click', spin));
  homeSearch?.addEventListener('input', () => { renderPreview(); updateCounts(); });

  if (stickyBar && spinMain) {
    new IntersectionObserver(([e]) => {
      const show = !e.isIntersecting && e.boundingClientRect.top < 0;
      stickyBar.classList.toggle('is-visible', show);
      document.body.classList.toggle('has-sticky', show);
    }, { threshold: 0 }).observe(spinMain);
  }

  updateCounts();
  renderPreview();
})();
