/* Shared restaurant helpers — loaded after restaurants-data.js */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const todayName = DAYS[new Date().getDay()];

const CATEGORY_LABELS = {
  'Restaurante': 'Restaurante',
  'Desayunos': 'Desayuno',
  'Comida para llevar': 'Para llevar',
  'Restaurante Bar': 'Restaurante bar',
  'Bar': 'Bar',
  'Café': 'Café',
  'Dulcería': 'Dulcería',
  'Pastelería': 'Pastelería',
  'Panadería': 'Panadería',
  'Expendio': 'Expendio',
  'Eventos': 'Eventos',
  'Venta alimentos para cocinar': 'Alimentos para cocinar',
  'Abarrotes': 'Abarrotes',
  'Área de niños': 'Área de niños',
  'Pet friendly': 'Pet friendly',
  'Otro': 'Otro',
};

const HOME_FILTER_CHIPS = [
  { key: 'all', label: 'Todos' },
  { key: 'Restaurante', label: 'Restaurante' },
  { key: 'Desayunos', label: 'Desayuno' },
  { key: 'Café', label: 'Café' },
];

const MORE_FILTER_CATEGORIES = [
  'Bar',
  'Comida para llevar',
  'Restaurante Bar',
  'Pastelería',
  'Panadería',
];

function phoneDigits(p) {
  if (!p) return null;
  const d = p.replace(/\D/g, '');
  return d.length === 10 ? '52' + d : d;
}

function todayHours(r) {
  return (r.hours && r.hours[todayName]) || null;
}

function isOpenNow(r) {
  const h = todayHours(r);
  if (!h || h === 'Cerrado') return false;

  function toMins(str) {
    const ampm = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (ampm) {
      let hr = parseInt(ampm[1], 10);
      const mn = parseInt(ampm[2], 10);
      const ap = ampm[3].toUpperCase();
      if (ap === 'PM' && hr !== 12) hr += 12;
      if (ap === 'AM' && hr === 12) hr = 0;
      return hr * 60 + mn;
    }
    const mil = str.match(/(\d+):(\d+)/);
    if (mil) return parseInt(mil[1], 10) * 60 + parseInt(mil[2], 10);
    return null;
  }

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const ranges = h.split(',').map((s) => s.trim());
  for (const range of ranges) {
    const parts = range.split('–').map((s) => s.trim());
    if (parts.length < 2) continue;
    const open = toMins(parts[0]);
    let close = toMins(parts[1]);
    if (open === null || close === null) continue;
    if (close < open) close += 24 * 60;
    if (nowMins >= open && nowMins < close) return true;
  }
  return false;
}

function statusText(r) {
  const h = todayHours(r);
  if (!h) return { cls: 'st-unknown', text: 'Horario no disponible' };
  if (h === 'Cerrado') return { cls: 'st-closed', text: 'Cerrado hoy' };
  if (isOpenNow(r)) return { cls: 'st-open', text: 'Abierto ahora' };
  return { cls: 'st-closed', text: 'Cerrado ahora' };
}

function categoryLine(r) {
  return r.categories
    .map((c) => CATEGORY_LABELS[c] || c)
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ');
}

function ratingLine(r) {
  return r.rating ? ` · ★ ${r.rating.toFixed(1)}` : '';
}

function safeUrl(url) {
  if (!url) return null;
  return url.startsWith('http') ? url : 'https://' + url;
}

function waLink(phone) {
  const d = phoneDigits(phone);
  return d ? `https://wa.me/${d}` : null;
}

function getWaNum(r) {
  if (r.whatsapp === 'no') return null;
  return r.whatsapp || r.phone;
}

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function filterRestaurants({ category = 'all', query = '', openOnly = false } = {}) {
  let list = restaurants;
  if (category !== 'all') {
    list = list.filter((r) => r.categories.includes(category));
  }
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.address && r.address.toLowerCase().includes(q))
    );
  }
  if (openOnly) {
    list = list.filter((r) => isOpenNow(r));
  }
  return list;
}

function countOpen(list) {
  return list.filter((r) => isOpenNow(r)).length;
}

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>'"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
const MONO_STOP = new Set(['y', 'de', 'del', 'la', 'el', 'los', 'las', '&']);
function monogram(name) {
  const w = name
    .replace(/[^\p{L}\p{N}\s&]/gu, '')
    .split(/\s+/)
    .filter((x) => x && !MONO_STOP.has(x.toLowerCase()));
  return (w.slice(0, 2).map((x) => x[0]).join('') || name[0] || '?').toUpperCase();
}
function logoTile(r, size = 'sm') {
  const slug = slugify(r.name);
  const px = size === 'lg' ? 76 : 40;
  let src = r.logo || null;
  if (!src && typeof LOGOS !== 'undefined' && LOGOS.has(slug)) {
    src = `/assets/logos/${slug}.webp`;
  }
  if (src) {
    const mono = escapeHtml(monogram(r.name));
    const alt = slug.length % 2;
    return `<span class="logo-tile logo-tile--${size}"><img src="${src}" alt="" width="${px}" height="${px}" loading="lazy" decoding="async" onerror="this.parentNode.outerHTML=monoTile('${mono}','${size}',${alt})"></span>`;
  }
  return monoTile(escapeHtml(monogram(r.name)), size, slug.length % 2);
}
function monoTile(txt, size, alt) {
  return `<span class="logo-tile logo-tile--${size} logo-tile--mono${alt ? ' alt' : ''}" aria-hidden="true">${txt}</span>`;
}
function to24(s) {
  return s
    .replace(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi, (m, h, mi, ap) => {
      let hh = parseInt(h, 10) % 12;
      if (ap.toUpperCase() === 'PM') hh += 12;
      if (parseInt(h, 10) === 12 && ap.toUpperCase() === 'AM') hh = 0;
      if (parseInt(h, 10) === 12 && ap.toUpperCase() === 'PM') hh = 12;
      return `${String(hh).padStart(2, '0')}:${mi}`;
    })
    .replace(/\s*–\s*/g, '–');
}
function hoyHorario(r) {
  const h = todayHours(r);
  if (!h) return 'Horario no disponible';
  if (h === 'Cerrado') return 'Hoy cerrado';
  return 'Hoy ' + to24(h);
}