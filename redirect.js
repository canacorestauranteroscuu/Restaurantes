(function () {
  var target = document.documentElement.getAttribute('data-redirect');
  if (!target) return;
  location.replace(target + location.search + location.hash);
})();