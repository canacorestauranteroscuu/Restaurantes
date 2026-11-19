(function () {
  const btn = document.getElementById('startRegistro');
  const panel = document.getElementById('paymentPlaceholder');
  btn?.addEventListener('click', () => {
    panel?.classList.add('is-visible');
    panel?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  });
})();