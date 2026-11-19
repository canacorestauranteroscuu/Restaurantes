const CANACO_GENERAL = 'https://canacochihuahua.com/';
const SITE_ORIGIN = 'https://sercanaco.com';

const NAV_LINKS = [
  { href: '/', label: 'Ruleta del sabor', key: 'home' },
  { href: '/restaurantes/', label: 'Restaurantes', key: 'restaurantes' },
  { href: '/restauranteros/', label: 'La Sección', key: 'restauranteros' },
  { href: '/restauranteros/unete/', label: 'Únete', key: 'unete' },
];

function externalIcon() {
  return ' ↗';
}

function mountSiteHeader(activeKey) {
  const root = document.getElementById('site-header');
  if (!root) return;

  const nav = NAV_LINKS.map(
    (l) =>
      `<a href="${l.href}" class="${l.key === activeKey ? 'is-active' : ''}">${l.label}</a>`
  ).join('');

  const mobile =
    NAV_LINKS.map((l) => `<a href="${l.href}">${l.label}</a>`).join('') +
    `<a href="${CANACO_GENERAL}" target="_blank" rel="noopener">CANACO General${externalIcon()}</a>`;

  root.innerHTML = `
  <a class="skip-link" href="#contenido">Saltar al contenido</a>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="/">
        <span class="brand-mark">CANACO</span>
        <span class="brand-text"><strong>Sección Restauranteros</strong> CHIHUAHUA</span>
      </a>
      <nav class="nav-desktop" aria-label="Principal">${nav}</nav>
      <div class="header-actions">
        <a class="btn btn-ghost" href="${CANACO_GENERAL}" target="_blank" rel="noopener">CANACO General${externalIcon()}</a>
        <a class="btn btn-primary nav-entrar" href="/entrar/">Entrar socios</a>
        <button type="button" class="menu-toggle" id="menuToggle" aria-label="Abrir menú" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
    <nav class="mobile-nav" id="mobileNav" aria-label="Menú móvil">${mobile}</nav>
  </header>`;

  const toggle = document.getElementById('menuToggle');
  const panel = document.getElementById('mobileNav');
  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

function mountSiteFooter() {
  const root = document.getElementById('site-footer');
  if (!root) return;

  root.innerHTML = `
  <div class="canaco-band">
    <div class="container canaco-band-inner">
      <div>
        <strong>Cámara Nacional de Comercio</strong><br>
        ¿Buscas CANACO Chihuahua? Afiliación, trámites y capacitación.
      </div>
      <a class="btn btn-ghost" href="${CANACO_GENERAL}" target="_blank" rel="noopener">Ir a CANACO General${externalIcon()}</a>
    </div>
  </div>
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>
        <div class="brand-mark" style="display:inline-block;margin-bottom:0.5rem">CANACO</div>
        <p style="margin:0;color:var(--muted);font-size:0.85rem">Sección Restauranteros · CANACO Chihuahua</p>
      </div>
      <div>
        <a href="/">Ruleta del sabor</a>
        <a href="/restaurantes/">Restaurantes</a>
        <a href="/restauranteros/">La Sección</a>
      </div>
      <div>
        <a href="/restauranteros/unete/">Únete</a>
        <a href="/restauranteros/renovar/">Renueva tu membresía</a>
        <a href="/restauranteros/preguntas/">Preguntas frecuentes</a>
      </div>
      <div>
        <a href="https://wa.me/526142354312" target="_blank" rel="noopener">Contacto por WhatsApp</a>
        <a href="mailto:canacorestauranteroscuu@gmail.com">Correo de la Sección</a>
        <a href="/aviso-de-privacidad/">Aviso de privacidad</a>
      </div>
    </div>
    <p class="footer-copy">Sección Especializada de Restaurantes · CANACO Servytur Chihuahua</p>
    <p class="ia-note">Fotografías ilustrativas generadas con IA. No corresponden a un restaurante socio en particular.</p>
  </footer>`;
}

/* Revelado escalonado (pase Muriel) */
(function () {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let fired = false;
  const io = new IntersectionObserver(
    (entries) => {
      fired = true;
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }
  );
  document.documentElement.classList.add('js-reveal-ready');
  els.forEach((el) => io.observe(el));
  setTimeout(() => {
    if (!fired) els.forEach((el) => el.classList.add('is-visible'));
  }, 1500);
})();