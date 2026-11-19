/* Ruleta del Sabor — home page */
(function () {
  if (typeof restaurants === 'undefined') return;

  let activeFilter = 'all';
  let openOnly = true;
  let lastWinner = null;
  let spinning = false;

  const wheelEl = document.getElementById('ruletaWheel');
  const resultName = document.getElementById('ruletaResultName');
  const resultMeta = document.getElementById('ruletaResultMeta');
  const spinMain = document.getElementById('spinBtn');
  const spinSticky = document.getElementById('spinBtnSticky');
  const openToggle = document.getElementById('openNowToggle');
  const openCountEl = document.getElementById('openCountNote');
  const chipRow = document.getElementById('filterChips');
  const moreBtn = document.getElementById('chipMoreBtn');
  const moreMenu = document.getElementById('chipMoreMenu');
  const listPreview = document.getElementById('homeRestList');
  const homeSearch = document.getElementById('homeSearch');
  const homeTotal = document.getElementById('homeRestTotal');
  const stickyBar = document.getElementById('stickySpin');

  function pool() {
    return filterRestaurants({
      category: activeFilter,
      openOnly,
      query: homeSearch?.value?.trim() || '',
    });
  }

  function updateOpenNote() {
    const all = filterRestaurants({
      category: activeFilter,
      query: homeSearch?.value?.trim() || '',
    });
    const openN = countOpen(all);
    if (openCountEl) {
      openCountEl.textContent = openOnly
        ? `Solo abiertos ahora · ${openN} de ${all.length} abiertos`
        : `${all.length} restaurantes socios`;
    }
    if (homeTotal) homeTotal.textContent = `${restaurants.length} restaurantes socios`;
  }

  function setFilter(key) {
    activeFilter = key;
    chipRow?.querySelectorAll('.chip[data-filter]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.filter === key);
    });
    updateOpenNote();
    renderPreview();
  }

  chipRow?.querySelectorAll('.chip[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });

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

  moreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    moreMenu?.classList.toggle('is-open');
  });
  document.addEventListener('click', () => moreMenu?.classList.remove('is-open'));

  function renderPreview() {
    if (!listPreview) return;
    const q = homeSearch?.value?.trim() || '';
    const items = filterRestaurants({ category: 'all', query: q, openOnly: false }).slice(0, 6);
    listPreview.innerHTML = items
      .map((r) => {
        const st = statusText(r);
        return `<a class="rest-card" href="/restaurantes/#${slugify(r.name)}" data-name="${r.name.replace(/"/g, '&quot;')}">
          <span class="rest-thumb" aria-hidden="true">${initials(r.name)}</span>
          <span class="rest-info">
            <div class="rest-name">${r.name}</div>
            <div class="rest-meta"><span class="${st.cls}">${st.text}</span> · ${categoryLine(r)}${ratingLine(r)}</div>
          </span>
          <span class="rest-chevron" aria-hidden="true">›</span>
        </a>`;
      })
      .join('');
    highlightWinner();
  }

  function highlightWinner() {
    if (!lastWinner || !listPreview) return;
    listPreview.querySelectorAll('.rest-card').forEach((el) => {
      el.classList.toggle('is-highlight', el.dataset.name === lastWinner.name);
    });
  }

  function showWinner(r) {
    const st = statusText(r);
    resultName.textContent = r.name;
    resultMeta.innerHTML = `<span class="${st.cls}">${st.text}</span> · ${categoryLine(r)}${ratingLine(r)}`;
    wheelEl.textContent = '';
    wheelEl.classList.remove('spinning');
    lastWinner = r;
    highlightWinner();
    const maps = document.getElementById('ruletaMaps');
    if (maps) {
      maps.href = r.mapsUrl || '#';
      maps.style.display = r.mapsUrl ? '' : 'none';
    }
    document.getElementById('ruletaShare').onclick = () => shareWinner(r);
  }

  function shareWinner(r) {
    const st = statusText(r);
    const text = `La Ruleta del Sabor me sugiere ${r.name} (${st.text}). ¿Vienes?\n\n${SITE_ORIGIN}/`;
    if (navigator.share) {
      navigator.share({ title: 'Ruleta del Sabor', text }).catch(() => {});
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
    }
  }

  function spin() {
    if (spinning) return;
    const candidates = pool();
    if (!candidates.length) {
      resultMeta.textContent = 'No hay restaurantes abiertos con estos filtros.';
      return;
    }
    spinning = true;
    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    wheelEl.classList.add('spinning');

    if (prefersReducedMotion) {
      showWinner(winner);
      spinning = false;
      return;
    }

    let cycles = 0;
    const maxCycles = 16;
    const tick = setInterval(() => {
      wheelEl.textContent = candidates[Math.floor(Math.random() * candidates.length)].name;
      cycles += 1;
      if (cycles >= maxCycles) {
        clearInterval(tick);
        showWinner(winner);
        spinning = false;
      }
    }, 70);
  }

  [spinMain, spinSticky].forEach((btn) => btn?.addEventListener('click', spin));

  openToggle?.addEventListener('change', () => {
    openOnly = openToggle.checked;
    document.getElementById('openDot')?.classList.toggle('is-on', openOnly);
    updateOpenNote();
    renderPreview();
  });

  openCountEl?.closest('label')?.addEventListener('click', (e) => {
    if (e.target === openToggle) return;
    openToggle.checked = !openToggle.checked;
    openToggle.dispatchEvent(new Event('change'));
  });

  homeSearch?.addEventListener('input', renderPreview);

  if (stickyBar && spinMain) {
    const obs = new IntersectionObserver(
      ([entry]) => stickyBar.classList.toggle('is-visible', !entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(spinMain);
  }

  updateOpenNote();
  renderPreview();
})();