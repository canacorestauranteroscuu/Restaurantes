/* Directorio completo — /restaurantes */
(function () {
  if (typeof restaurants === 'undefined') return;

  const listEl = document.getElementById('directoryList');
  const searchEl = document.getElementById('dirSearch');
  const countEl = document.getElementById('dirCount');
  const openToggle = document.getElementById('dirOpenOnly');
  let openOnly = false;

  function render() {
    const q = searchEl?.value?.trim() || '';
    let items = filterRestaurants({ category: 'all', query: q, openOnly });
    if (countEl) {
      countEl.textContent = `${items.length} resultado${items.length !== 1 ? 's' : ''}`;
    }
    if (!listEl) return;
    listEl.innerHTML =
      items.length === 0
        ? '<p class="empty-state"><img src="/assets/fotos/comida-detalle-320.webp" width="64" height="64" alt="" loading="lazy">No encontramos ese nombre. Prueba con otro o <a href="/">gira la ruleta</a>.</p>'
        : items
            .map((r) => {
              const st = statusText(r);
              const id = 'r-' + slugify(r.name);
              return `<article class="rest-card" id="${id}" data-name="${escapeHtml(r.name)}">
          ${logoTile(r, 'sm')}
          <span class="rest-info">
            <span class="rest-name">${escapeHtml(r.name)}</span>
            <span class="rest-meta"><span class="${st.cls}">${st.text}</span> · ${escapeHtml(categoryLine(r))}${ratingLine(r)}</span>
            ${r.address ? `<span class="rest-meta" style="margin-top:0.35rem">${escapeHtml(r.address)}</span>` : ''}
            <span class="rest-meta" style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.5rem">
              ${r.mapsUrl ? `<a href="${r.mapsUrl}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}
              ${r.phone ? `<a href="tel:${phoneDigits(r.phone)}">Llamar</a>` : ''}
              ${waLink(getWaNum(r)) ? `<a href="${waLink(getWaNum(r))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
            </span>
          </span>
        </article>`;
            })
            .join('');
  }

  searchEl?.addEventListener('input', render);
  openToggle?.addEventListener('change', () => {
    openOnly = openToggle.checked;
    render();
  });
  render();

  if (location.hash) {
    const raw = decodeURIComponent(location.hash.slice(1));
    const id = raw.startsWith('r-') ? raw : 'r-' + raw;
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }
})();