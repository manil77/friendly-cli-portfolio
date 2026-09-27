/* Renders CMS content into the modern (horizontal) page. Rich-text fields arrive sanitized from the API. */
(function () {
  var esc = MMContent.esc, url = MMContent.url;
  var $ = function (id) { return document.getElementById(id); };
  var TOPS = [18, 34, 22]; // staggered card heights (vh), repeating

  document.addEventListener('mm:greeting', function (e) { $('cEyebrow').textContent = e.detail; });

  MMContent.ready.then(function (C) {
    if (!C) return;
    var p = C.profile || {};
    if (!(window.MMTrack && MMTrack.greeting)) $('cEyebrow').textContent = [p.role, p.location].filter(Boolean).join(' · ');
    if (C.hero && C.hero.lead) $('cLead').innerHTML = C.hero.lead;
    $('cStatus').textContent = p.status || '';
    $('cStatus').parentNode.style.display = p.status ? '' : 'none';
    if (p.avatar) { $('cAvatar').src = p.avatar; $('cAvatar').alt = p.name || ''; }
    var a = C.about || {};
    if (a.quote) $('cQuote').innerHTML = a.quote;
    if (a.p1) $('cP1').innerHTML = a.p1;
    $('cP2').innerHTML = a.p2 || ''; $('cP2').style.display = a.p2 ? '' : 'none';

    var tl = C.timeline || [];
    $('cChapters').innerHTML = tl.map(function (t, i) {
      var yr = (String(t.period).match(/\d{4}/) || [''])[0];
      return '<div class="chapter rv d' + Math.min(i, 3) + (t.current ? ' is-now' : '') + '">' +
        (yr ? '<span class="ghost">’' + yr.slice(2) + '</span>' : '') +
        '<span class="chno">Chapter ' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="yr">' + esc(t.period) + '</span>' +
        '<div class="role">' + esc(t.role) + '</div>' +
        '<div class="co">' + (t.current ? '<span class="dot"></span>' : '') + (t.badge ? '<span class="badge">' + esc(t.badge) + '</span> ' : '') + esc(t.company) + '</div>' +
        '<p>' + t.description + '</p>' +
        '<div class="stack">' + esc(t.stack).replace(/\n/g, '<br/>') + '</div></div>';
    }).join('');
    document.querySelector('.p-history').style.width = Math.max(700, 120 + tl.length * 380) + 'px';

    var pr = C.projects || [];
    $('cWork').innerHTML = pr.map(function (x, i) {
      var href = url(x.url), img = url(x.image);
      return '<a class="wcard rv d' + (i % 3) + '" style="left:' + (60 + i * 360) + 'px;top:' + TOPS[i % 3] + 'vh"' +
        (href ? ' href="' + href + '" target="_blank" rel="noreferrer"' : ' href="#"') +
        (img ? ' data-img="' + img + '"' : '') + ' data-cursor data-track="project:' + esc(x.name) + '">' +
        '<span class="go">↗</span><span class="idx">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="cat">' + esc(x.category) + '</div><div class="name">' + esc(x.name) + '</div>' +
        '<p>' + x.description + '</p>' +
        (img ? '<div class="logo"><img src="' + img + '" alt="' + esc(x.name) + '"/></div>' : '') + '</a>';
    }).join('');
    document.querySelector('.p-work').style.width = Math.max(700, 60 + pr.length * 360 + 100) + 'px';

    $('cSkills').innerHTML = (C.skills || []).map(function (s) { return '<span class="chip">' + esc(s) + '</span>'; }).join('');
    if (p.email) { $('cEmail').href = 'mailto:' + p.email; $('cEmail').textContent = p.email; }
    var links = (C.socials || []).map(function (s) {
      return '<a href="' + url(s.url) + '" target="_blank" rel="noreferrer">' + esc(s.label.toUpperCase()) + ' ↗</a>';
    });
    if (url(p.resume)) links.push('<a href="' + url(p.resume) + '" target="_blank" rel="noreferrer" data-track="resume" data-track-type="download">RÉSUMÉ ↓</a>');
    $('cSocials').innerHTML = links.join('');
    document.querySelectorAll('[href="#"].wcard').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); }); });
  });
})();
