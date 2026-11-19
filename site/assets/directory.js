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
        ? '<p style="color:var(--muted)">No se encontraron restaurantes.</p>'
        : items
            .map((r) => {
              const st = statusText(r);
              const id = slugify(r.name);
              return `<article class="rest-card" id="${id}" data-name="${r.name.replace(/"/g, '&quot;')}">
          <span class="rest-thumb" aria-hidden="true">${initials(r.name)}</span>
          <span class="rest-info">
            <div class="rest-name">${r.name}</div>
            <div class="rest-meta"><span class="${st.cls}">${st.text}</span> · ${categoryLine(r)}${ratingLine(r)}</div>
            ${r.address ? `<div class="rest-meta" style="margin-top:0.35rem">${r.address}</div>` : ''}
            <p class="rest-meta" style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.5rem">
              ${r.mapsUrl ? `<a href="${r.mapsUrl}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}
              ${r.phone ? `<a href="tel:${phoneDigits(r.phone)}">Llamar</a>` : ''}
              ${waLink(getWaNum(r)) ? `<a href="${waLink(getWaNum(r))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
            </p>
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
    const el = document.querySelector(location.hash);
    el?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }
})();