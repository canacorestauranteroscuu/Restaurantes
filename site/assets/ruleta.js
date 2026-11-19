/* Ruleta del Sabor — home (pase Muriel). Reemplaza site/assets/ruleta.js completo. */
(function () {
  if (typeof restaurants === 'undefined') return;

  let activeFilter = 'all';
  let openOnly = true;
  let lastWinner = null;
  let spinning = false;
  let angle = 0;

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
    const inMore = !['all', ...HOME_CHIP_CATEGORY_KEYS].includes(key);
    moreBtn?.classList.toggle('is-active', inMore);
    if (moreBtn) moreBtn.textContent = inMore ? `${CATEGORY_LABELS[key] || key} ▾` : 'Más ▾';
    closeMore();
    updateCounts();
  }

  chipRow?.querySelectorAll('.chip[data-filter]').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));

  if (moreMenu) {
    moreFilterCategories().forEach((cat) => {
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
    setHub(r);
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

  // El gradiente empieza en -15°: gajo 0 centrado arriba; puntero fijo a las 12.
  const SPIN_MS = 4600, SEG = 30;
  const mod = (n, m) => ((n % m) + m) % m;
  const segmentUnderPointer = (a) => Math.floor(mod(15 - a, 360) / SEG);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const hubTileCache = new Map();
  function hubTileHtml(r) {
    return logoTile(r, 'sm').replace(' loading="lazy"', '');
  }
  function setHub(r) {
    const key = slugify(r.name);
    if (hub.dataset.slug === key) return;
    hub.dataset.slug = key;
    hub.innerHTML = hubTileCache.get(key) || hubTileHtml(r);
  }
  async function preloadSlots(slots) {
    const seen = new Set();
    const unique = slots.filter((r) => {
      const k = slugify(r.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    await Promise.race([
      Promise.allSettled(unique.map(async (r) => {
        const key = slugify(r.name);
        const html = hubTileHtml(r);
        hubTileCache.set(key, html);
        const m = /src="([^"]+)"/.exec(html);
        if (!m) return;
        const img = new Image();
        img.src = m[1];
        await img.decode();
      })),
      new Promise((resolve) => setTimeout(resolve, 700))
    ]);
  }
  async function spin() {
    if (spinning) return;
    const c = pool(); // instantánea: un cambio de filtro nunca cambia este giro
    if (!c.length) { showEmpty(); return; }
    if (empty) empty.hidden = true;
    const winner = pickWinner(c); // decidido ANTES de crear la animación
    spinning = true; setBusy(true);
    result.classList.remove('is-shown');
    wheel.parentElement.classList.remove('is-done');

    const slots = Array.from({length: 12}, (_, i) => c[i % c.length]);
    const others = c.filter((r) => r !== winner);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    for (let i = 0; i < 12; i++) slots[i] = others.length ? others[i % others.length] : winner;
    const winnerIndex = Math.floor(Math.random() * 12);
    slots[winnerIndex] = winner;
    const startIdx = segmentUnderPointer(angle);
    if (lastWinner && startIdx !== winnerIndex && c.includes(lastWinner)) slots[startIdx] = lastWinner;
    // Nunca mostrar al ganador en el hub mientras la rueda aún no gira (preload / t=0).
    if (startIdx === winnerIndex) {
      const decoy = (lastWinner && lastWinner !== winner && c.includes(lastWinner))
        ? lastWinner
        : others.find((r) => r !== winner);
      if (decoy) slots[startIdx] = decoy;
    }
    const start = angle;
    const target = mod(-winnerIndex * SEG, 360);
    const extraTurn = startIdx === winnerIndex ? 360 : 0;
    const end = start + 4 * 360 + extraTurn + mod(target - mod(start, 360), 360);
    wheel.style.transition = 'none';
    let lastIndex = -1;
    const paint = (a, syncHub = true) => {
      angle = a;
      wheel.style.transform = `rotate(${a}deg)`;
      if (!syncHub) return;
      const index = segmentUnderPointer(a);
      if (index !== lastIndex) { lastIndex = index; setHub(slots[index]); }
    };
    const finish = () => {
      paint(end);
      angle = mod(end, 360);
      wheel.style.transform = `rotate(${angle}deg)`;
      showWinner(winner); spinning = false; setBusy(false);
    };
    if (motion.matches) { finish(); return; }
    await preloadSlots(slots);
    paint(start, false);
    const t0 = performance.now();
    (function frame(now) {
      const p = Math.min(1, (now - t0) / SPIN_MS);
      if (p === 1 || motion.matches) { finish(); return; }
      paint(start + (end - start) * (1 - Math.pow(1 - p, 3)), p > 0);
      requestAnimationFrame(frame);
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
