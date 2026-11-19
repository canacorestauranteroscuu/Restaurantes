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

/** Categorías en chips fijos del home (no van al menú «Más»). */
const HOME_CHIP_CATEGORY_KEYS = ['Restaurante', 'Desayunos', 'Café'];

/** Todas las demás categorías presentes en datos, por conteo ↓ y nombre; «Otro» al final. */
function moreFilterCategories() {
  if (typeof restaurants === 'undefined') return [];
  const counts = new Map();
  for (const r of restaurants) {
    for (const cat of r.categories) {
      if (HOME_CHIP_CATEGORY_KEYS.includes(cat)) continue;
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
  }
  return [...counts.keys()].sort((a, b) => {
    if (a === 'Otro') return 1;
    if (b === 'Otro') return -1;
    const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
    if (diff !== 0) return diff;
    return (CATEGORY_LABELS[a] || a).localeCompare(CATEGORY_LABELS[b] || b, 'es');
  });
}

function phoneDigits(p) {
  if (!p) return null;
  const d = p.replace(/\D/g, '');
  return d.length === 10 ? '52' + d : d;
}

// Corrige medianoche mal escrita por el sync: "6:00 PM – 12:00 PM" → "6:00 PM – 12:00 AM"
function fixMidnight(h) {
  return h.replace(/(\d{1,2}:\d{2}\s*PM)\s*–\s*12:00\s*PM/gi, (m, open) => `${open} – 12:00 AM`);
}
function todayHours(r) {
  const h = r.hours && r.hours[todayName];
  return h ? fixMidnight(h) : null;
}

function toMinsHM(str) {
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
  return mil ? parseInt(mil[1], 10) * 60 + parseInt(mil[2], 10) : null;
}

function inRanges(h, mins, overnightOnly) {
  if (!h || h === 'Cerrado') return false;
  for (const range of h.split(',').map((s) => s.trim())) {
    const parts = range.split('–').map((s) => s.trim());
    if (parts.length < 2) continue;
    const open = toMinsHM(parts[0]);
    let close = toMinsHM(parts[1]);
    if (open === null || close === null) continue;
    if (close <= open) close += 24 * 60;
    if (overnightOnly && close <= 24 * 60) continue;
    if (mins >= open && mins < close) return true;
  }
  return false;
}

function overnightRangeActive(r) {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const yRaw = r.hours && r.hours[DAYS[(now.getDay() + 6) % 7]];
  const yH = yRaw ? fixMidnight(yRaw) : null;
  if (!yH || yH === 'Cerrado') return null;
  for (const range of yH.split(',').map((s) => s.trim())) {
    const parts = range.split('–').map((s) => s.trim());
    if (parts.length < 2) continue;
    const open = toMinsHM(parts[0]);
    let close = toMinsHM(parts[1]);
    if (open === null || close === null) continue;
    if (close <= open) close += 24 * 60;
    if (close <= 24 * 60) continue;
    const virtualMins = mins + 24 * 60;
    if (virtualMins >= open && virtualMins < close) return { closeLabel: parts[1] };
  }
  return null;
}

function isOpenNow(r) {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const yRaw = r.hours && r.hours[DAYS[(now.getDay() + 6) % 7]];
  return (
    inRanges(todayHours(r), mins, false) ||
    inRanges(yRaw ? fixMidnight(yRaw) : null, mins + 24 * 60, true)
  );
}

function statusText(r) {
  const h = todayHours(r);
  if (!h) return { cls: 'st-unknown', text: 'Horario no disponible' };
  if (isOpenNow(r)) return { cls: 'st-open', text: 'Abierto ahora' };
  if (h === 'Cerrado') return { cls: 'st-closed', text: 'Cerrado hoy' };
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
function formatHM24(str) {
  const m = toMinsHM(str);
  if (m === null) return str;
  const h = Math.floor(m / 60) % 24;
  const mi = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

function hoyHorario(r) {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const h = todayHours(r);
  if (inRanges(h, mins, false) && h && h !== 'Cerrado') return 'Hoy ' + to24(h);
  const overnight = overnightRangeActive(r);
  if (overnight) return `Abierto hasta ${formatHM24(overnight.closeLabel)}`;
  if (!h) return 'Horario no disponible';
  if (h === 'Cerrado') return 'Hoy cerrado';
  return 'Hoy ' + to24(h);
}