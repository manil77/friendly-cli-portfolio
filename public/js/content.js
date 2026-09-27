/* CMS content loader. Pages keep their static HTML as a fallback and re-render once this resolves. */
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function url(u) { u = String(u || ''); return /^(https?:|mailto:|tel:|\/(?!\/))/i.test(u) ? esc(u) : ''; }
  window.MMContent = {
    esc: esc,
    url: url,
    ready: fetch('/api/content').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
  };
})();
