/* Portfolio admin: overview, visitors, leads, tracked links, content (CMS), system. Talks to /api/admin?action=... */
(function () {
  var view = document.getElementById('view');
  var state = { days: 30, dirty: false, vfilter: 'all', vq: '', lfilter: 'all', lq: '' };

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function num(n) { return (n || 0).toLocaleString(); }
  var regionName = (function () {
    try { var dn = new Intl.DisplayNames(['en'], { type: 'region' }); return function (cc) { try { return cc ? dn.of(cc) : ''; } catch (e) { return cc; } }; }
    catch (e) { return function (cc) { return cc || ''; }; }
  })();
  function place(v) { return [v.city, regionName(v.country)].filter(Boolean).join(', '); }
  function ago(ts) {
    var s = (Date.now() - new Date(ts)) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 30 * 86400) return Math.floor(s / 86400) + 'd ago'; return new Date(ts).toLocaleDateString();
  }
  function when(ts) { return new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
  function toast(msg, err) {
    var t = h('<div class="toast' + (err ? ' err' : '') + '">' + esc(msg) + '</div>');
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2800);
  }
  function api(action, body, qs) {
    var opts = body ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin': '1' }, body: JSON.stringify(body) } : {};
    return fetch('/api/admin?action=' + action + (qs || ''), opts).then(function (r) {
      if (r.status === 401 && action !== 'login') { showLogin(); throw new Error('Please sign in again.'); }
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Request failed'); return d; });
    });
  }
  function fail(e) { toast(e.message, true); }
  function delta(cur, prev) {
    if (prev == null) return '';
    if (!prev) return cur ? '<span class="delta up">↑ new</span>' : '<span class="delta flat">–</span>';
    var p = Math.round((cur - prev) / prev * 100);
    if (!p) return '<span class="delta flat">± 0%</span>';
    return '<span class="delta ' + (p > 0 ? 'up' : 'down') + '">' + (p > 0 ? '↑ ' : '↓ ') + Math.abs(p) + '%</span>';
  }
  function avatar(v) {
    var co = v.org && !v.org_is_isp;
    return '<span class="av' + (co ? ' co' : '') + '">' + esc((co ? v.org : (v.city || v.country || '?')).charAt(0).toUpperCase()) + '</span>';
  }
  function whoName(v) { return v.org && !v.org_is_isp ? v.org : (v.city ? 'Visitor from ' + v.city : 'Anonymous visitor'); }
  function pageHead(kicker, title, actions) {
    return '<div class="ph"><div><span class="kicker">' + kicker + '</span><h1>' + title + '</h1></div><div class="actions">' + (actions || '') + '</div></div>';
  }
  function skeleton() { view.innerHTML = '<div class="grid g-kpi"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div><div class="skel mt" style="height:260px"></div>'; }
  function segmented(options, current, onPick) {
    var el = h('<div class="seg">' + options.map(function (o) {
      return '<button type="button" data-v="' + esc(o[0]) + '"' + (String(o[0]) === String(current) ? ' class="on"' : '') + '>' + esc(o[1]) +
        (o[2] != null ? '<span class="n">' + o[2] + '</span>' : '') + '</button>';
    }).join('') + '</div>');
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      [].forEach.call(el.children, function (c) { c.classList.toggle('on', c === b); });
      onPick(b.getAttribute('data-v'));
    });
    return el;
  }
  function downloadCsv(name, rows, cols) {
    var cell = function (v) {
      v = v == null ? '' : String(v);
      if (/^[=+\-@\t]/.test(v)) v = "'" + v; // keep spreadsheet apps from running it as a formula
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    var csv = [cols.map(function (c) { return c[0]; }).join(',')].concat(rows.map(function (r) {
      return cols.map(function (c) { return cell(typeof c[1] === 'function' ? c[1](r) : r[c[1]]); }).join(',');
    })).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  var scripts = {};
  function loadScript(src) {
    return scripts[src] || (scripts[src] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { delete scripts[src]; rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    }));
  }
  function modal(inner) {
    var back = h('<div class="modal-back"><div class="modal">' + inner + '</div></div>');
    var close = function () { back.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    return back;
  }

  /* hover tooltips for anything with data-tip (chart bars, map countries) */
  var tip;
  document.addEventListener('mousemove', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { if (tip) { tip.remove(); tip = null; } return; }
    if (!tip) { tip = h('<div class="tip"></div>'); document.body.appendChild(tip); }
    tip.textContent = el.getAttribute('data-tip');
    tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px';
  });

  /* ---------- icons + nav ---------- */
  var I = {
    overview: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
    visitors: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.6a3.3 3.3 0 0 1 0 6.3M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
    leads: '<path d="M3 13l3-8h12l3 8v6H3zM3 13h5l1.5 2.5h5L16 13h5"/>',
    links: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    content: '<path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    system: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'
  };
  var TABS = [['overview', 'Overview'], ['activity', 'Activity'], ['visitors', 'Visitors'], ['leads', 'Leads'], ['links', 'Tracked links'], ['content', 'Content'], ['system', 'System']];
  document.getElementById('nav').innerHTML = TABS.map(function (t) {
    return '<a href="#' + t[0] + '" data-tab="' + t[0] + '"><svg class="i" viewBox="0 0 24 24">' + I[t[0]] + '</svg><span class="l">' + t[1] + '</span>' +
      (t[0] === 'leads' ? '<span class="badge hide" id="leadBadge"></span>' : '') + '</a>';
  }).join('');

  /* live indicator + new-lead badge, refreshed every 30s while the tab is visible */
  var liveTimer;
  function pollLive() {
    clearTimeout(liveTimer);
    if (!document.hidden) api('live').then(function (d) {
      var el = document.getElementById('live');
      el.classList.toggle('on', d.count > 0);
      document.getElementById('liveTxt').textContent = d.count ? d.count + ' live now' : 'No one on the site';
      var b = document.getElementById('leadBadge');
      b.textContent = d.newLeads; b.classList.toggle('hide', !d.newLeads);
    }).catch(function () {});
    liveTimer = setTimeout(pollLive, 30000);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pollLive(); });

  /* ---------- auth ---------- */
  var loginWrap = document.getElementById('loginWrap'), login = document.getElementById('login'), app = document.getElementById('app');
  function showLogin() { app.classList.add('hide'); loginWrap.classList.remove('hide'); clearTimeout(liveTimer); login.password.focus(); }
  function showApp() { loginWrap.classList.add('hide'); app.classList.remove('hide'); route(); pollLive(); }
  login.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = document.getElementById('loginMsg'); msg.textContent = 'Signing in…';
    api('login', { password: login.password.value }).then(function () { login.reset(); msg.textContent = ''; showApp(); })
      .catch(function (err) { msg.textContent = err.message; });
  });
  document.getElementById('logout').addEventListener('click', function () { api('logout', {}).then(showLogin); });

  /* ---------- routing ---------- */
  function route() {
    var hsh = location.hash.slice(1) || 'overview', tab = hsh.split('=')[0];
    [].forEach.call(document.querySelectorAll('[data-tab]'), function (a) {
      a.classList.toggle('on', a.getAttribute('data-tab') === (tab === 'visitor' ? 'visitors' : tab));
    });
    skeleton();
    var fn = { overview: overview, activity: activity, visitors: visitors, visitor: visitor, leads: leads, links: links, content: content, system: system }[tab] || overview;
    fn(decodeURIComponent(hsh.split('=')[1] || ''));
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', function () {
    if (state.dirty && !confirm('You have unsaved content changes. Leave anyway?')) return;
    state.dirty = false; route();
  });
  window.addEventListener('beforeunload', function (e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // one readable line per event, shared by the overview feed and the activity log
  function describe(e) {
    var n = e.name || '';
    switch (e.type) {
      case 'pageview': return 'viewed <span class="mono">' + esc(e.path || '/') + '</span>' + (e.ref_host ? ' <span class="faint">from ' + esc(e.ref_host) + '</span>' : '');
      case 'command': return 'typed <span class="mono">' + esc(n) + '</span>' + (e.value === 'unknown' ? ' <span class="tag warn">unknown</span>' : '');
      case 'click': return /^project:/.test(n) ? 'opened project <b>' + esc(n.slice(8)) + '</b>' : 'clicked ' + esc(n);
      case 'download': return 'downloaded ' + (n === 'resume' ? 'your résumé' : esc(n));
      case 'outbound': return n === 'email' ? 'clicked your email' : 'went to ' + esc(n);
      case 'theme': return 'chose the ' + (n === 'developer' ? 'terminal' : n === 'standard' ? 'visual' : esc(n)) + ' view';
      case 'engage': return 'spent ' + esc(e.value || '?') + 's on <span class="mono">' + esc(e.path || '/') + '</span>';
      case 'consent': return 'allowed visit insights';
      case 'choice': return 'declined visit insights';
      default: return esc(e.type) + ' ' + esc(n || e.path || '');
    }
  }
  function whoCell(e) {
    if (e.visitor_id) return '<a href="#visitor=' + esc(e.visitor_id) + '">' + esc(whoName(e)) + '</a>';
    return '<span class="muted">Anonymous' + (e.country ? ' · ' + esc(regionName(e.country)) : '') + '</span>';
  }

  /* ---------- overview ---------- */
  function barList(title, rows, fmt, note) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat(1));
    return '<div class="card"><h2>' + title + (note ? ' <span class="muted">' + note + '</span>' : '') + '</h2>' + (rows.length ? '<div class="blist">' + rows.map(function (r) {
      return '<div class="brow"><span class="fill" style="width:' + (r.n / max * 100) + '%"></span><span>' + (fmt ? fmt(r) : esc(r.k)) + '</span><span class="n">' + num(r.n) + '</span></div>';
    }).join('') + '</div>' : '<div class="muted">No data yet</div>') + '</div>';
  }

  function chart(daily, days) {
    var map = {}; daily.forEach(function (d) { map[d.day] = d; });
    var series = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      series.push(map[d] || { day: d, pageviews: 0, uniques: 0 });
    }
    if (days > 90) { // aggregate a year into weeks so bars stay readable
      var wk = [];
      for (var j = 0; j < series.length; j += 7) {
        var chunk = series.slice(j, j + 7);
        wk.push({ day: chunk[0].day, to: chunk[chunk.length - 1].day, pageviews: chunk.reduce(function (a, c) { return a + c.pageviews; }, 0), uniques: chunk.reduce(function (a, c) { return a + c.uniques; }, 0) });
      }
      series = wk;
    }
    var max = Math.max.apply(null, series.map(function (s) { return s.pageviews; }).concat(1));
    var fmt = function (d) { return new Date(d + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }); };
    return '<div class="chart" role="img" aria-label="Page views over the last ' + days + ' days"><span class="ymax">' + num(max) + ' views</span>' +
      '<span class="gl" style="top:22px"></span><span class="gl" style="top:calc(22px + (100% - 22px) / 2)"></span>' +
      series.map(function (s) {
        var label = s.to ? fmt(s.day) + ' – ' + fmt(s.to) : fmt(s.day);
        return '<div class="col" data-tip="' + esc(label + ' · ' + s.pageviews + ' views · ' + s.uniques + ' visitors') + '"><div class="bar" style="height:' + (s.pageviews / max * 100) + '%"></div></div>';
      }).join('') + '</div><div class="xaxis"><span>' + fmt(series[0].day) + '</span><span>' + (series.length > 2 ? fmt(series[Math.floor(series.length / 2)].day) : '') + '</span><span>Today</span></div>';
  }

  /* ---------- interactive world map: click a country to zoom in and see its states, cities and people ---------- */
  var JSD = 'https://cdn.jsdelivr.net/npm/';
  var geoLib, world50, regionDB;
  function mapLibs() {
    return geoLib || (geoLib = loadScript(JSD + 'd3-array@3/dist/d3-array.min.js')
      .then(function () { return loadScript(JSD + 'd3-geo@3/dist/d3-geo.min.js'); })
      .then(function () { return loadScript(JSD + 'topojson-client@3/dist/topojson-client.min.js'); })
      .then(function () {
        return Promise.all([
          fetch(JSD + 'world-atlas@2/countries-110m.json').then(function (r) { return r.json(); }),
          fetch(JSD + 'i18n-iso-countries@7/codes.json').then(function (r) { return r.json(); })
        ]);
      }).catch(function (e) { geoLib = null; throw e; }));
  }
  // detailed outlines, fetched only when a country is opened
  function hiRes() { return world50 || (world50 = fetch(JSD + 'world-atlas@2/countries-50m.json').then(function (r) { return r.json(); })); }
  var GB_NATIONS = { ENG: 'England', SCT: 'Scotland', WLS: 'Wales', NIR: 'Northern Ireland' };
  function regionNames() {
    return regionDB || (regionDB = fetch(JSD + 'country-region-data@3/data.json').then(function (r) { return r.json(); }).then(function (list) {
      var m = {};
      list.forEach(function (c) { var o = m[c.countryShortCode] = {}; c.regions.forEach(function (r) { if (r.shortCode) o[r.shortCode] = r.name; }); });
      return m;
    }).catch(function () { return {}; }));
  }
  function regionLabel(db, cc, code) {
    if (!code) return 'Unknown';
    if (cc === 'GB' && GB_NATIONS[code]) return GB_NATIONS[code];
    var o = db[cc] || {};
    return o[code] || o[code.replace(/^P/, '')] || o[code.replace(/^0+/, '')] || code;
  }

  function worldMap(el, s) {
    el.innerHTML = '<div class="skel" style="height:380px"></div>';
    mapLibs().then(function (res) {
      var world = res[0], a2n = {}, n2a = {};
      res[1].forEach(function (c) { a2n[c[0]] = c[2]; n2a[c[2]] = c[0]; });
      var counts = {}, max = 1;
      s.geo.forEach(function (g) { var id = a2n[g.k]; if (id) { counts[id] = (counts[id] || 0) + g.n; max = Math.max(max, counts[id]); } });
      var W = 960, H = 470;
      var proj = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: 'Sphere' });
      var path = d3.geoPath(proj);
      var feats = topojson.feature(world, world.objects.countries).features.filter(function (f) { return f.id !== '010'; }); // no Antarctica
      var byId = {}; feats.forEach(function (f) { byId[f.id] = f; });
      var shade = function (n) { return 'color-mix(in oklab,var(--accent) ' + Math.round(18 + 82 * Math.log(1 + n) / Math.log(1 + max)) + '%,var(--land))'; };

      el.innerHTML = '<div class="mapwrap"><div class="map"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Page views by country. Click a country for detail.">' +
        '<g class="zoom"><path class="sphere" d="' + path({ type: 'Sphere' }) + '"/>' +
        feats.map(function (f) {
          var n = counts[f.id] || 0;
          return '<path class="c' + (n ? ' has' : '') + '" data-cc="' + (n2a[f.id] || '') + '" data-id="' + f.id + '" d="' + path(f) + '" style="fill:' + (n ? shade(n) : 'var(--land)') +
            '" data-tip="' + esc(f.properties.name + ' · ' + (n ? num(n) + ' views · click for detail' : 'no visits')) + '"/>';
        }).join('') + '<path class="hi" d=""/><g class="dots"></g></g></svg>' +
        '<div class="zc"><button type="button" class="icon-btn" data-z="in" title="Zoom in" aria-label="Zoom in">+</button>' +
        '<button type="button" class="icon-btn" data-z="out" title="Zoom out" aria-label="Zoom out">−</button>' +
        '<button type="button" class="icon-btn" data-z="reset" title="Reset view" aria-label="Reset view">⟲</button></div>' +
        '<div class="legend"><span>Fewer</span><span class="ramp"></span><span>More page views</span><span class="dot" style="margin-left:14px"></span><span>Opted-in visitors (city)</span>' +
        '<span class="faint" style="margin-left:auto">Scroll or +/− to zoom · drag to pan</span></div></div>' +
        '<aside class="mpanel"></aside></div>';

      var svg = el.querySelector('svg'), zoomG = el.querySelector('.zoom'), dotsG = el.querySelector('.dots'), hi = el.querySelector('.hi'), panel = el.querySelector('.mpanel');
      var view = { k: 1, x: 0, y: 0 }, current = null, lastDots = [[], false];
      function apply(animate) {
        view.x = Math.min(0, Math.max(W - W * view.k, view.x));
        view.y = Math.min(0, Math.max(H - H * view.k, view.y));
        zoomG.classList.toggle('instant', !animate);
        svg.classList.toggle('zoomed', view.k > 1.01);
        zoomG.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.k + ')';
        dots(lastDots[0], lastDots[1]);
      }
      function zoomAt(factor, sx, sy, animate) {
        var k2 = Math.max(1, Math.min(40, view.k * factor));
        view.x = sx - (sx - view.x) * (k2 / view.k); view.y = sy - (sy - view.y) * (k2 / view.k); view.k = k2;
        apply(animate);
      }
      function svgPoint(e) { var r = svg.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; }

      function dots(list, labels) {
        var k = view.k; lastDots = [list, labels];
        dotsG.innerHTML = list.map(function (p) {
          var xy = proj([+p.lon, +p.lat]); if (!xy) return '';
          var r = (3.5 + Math.min(4, (p.score || 0) / 15)) / k;
          var name = p.k || p.city || '';
          return '<g data-city="' + esc(name) + '"><circle cx="' + xy[0].toFixed(2) + '" cy="' + xy[1].toFixed(2) + '" r="' + r.toFixed(3) + '" data-tip="' +
            esc([p.org, name, regionName(p.country)].filter(Boolean).join(' · ') + (p.n ? ' · ' + p.n + (p.n === 1 ? ' visitor' : ' visitors') : '') + ' · score ' + (p.score || 0)) + '"/>' +
            (labels && name ? '<text x="' + (xy[0] + r * 1.7).toFixed(2) + '" y="' + (xy[1] + r * .55).toFixed(2) + '" style="font-size:' + (12 / k).toFixed(3) + 'px">' + esc(name) + '</text>' : '') + '</g>';
        }).join('');
      }

      function worldPanel() {
        var rows = s.geo.slice().sort(function (a, b) { return b.n - a.n; });
        var top = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat(1));
        panel.innerHTML = '<span class="kicker">World</span><h3>' + rows.length + ' ' + (rows.length === 1 ? 'country' : 'countries') + '</h3>' +
          '<p class="muted">Click a country on the map, or below, to see its states, cities and the people who visited.</p>' +
          (rows.length ? '<div class="blist">' + rows.slice(0, 12).map(function (r) {
            return '<a class="brow" href="javascript:void 0" data-pick="' + esc(r.k) + '"><span class="fill" style="width:' + (r.n / top * 100) + '%"></span><span>' + esc(regionName(r.k)) +
              '</span><span class="n">' + num(r.n) + '</span></a>';
          }).join('') + '</div>' : '<div class="muted">No visits yet</div>');
      }

      function reset() {
        current = null;
        view = { k: 1, x: 0, y: 0 };
        [].forEach.call(zoomG.querySelectorAll('path.c'), function (p) { p.classList.remove('dim', 'sel'); });
        hi.setAttribute('d', '');
        lastDots = [s.map, false];
        apply(true);
        worldPanel();
      }

      function select(cc) {
        var id = a2n[cc], f = byId[id]; if (!f) return;
        current = cc;
        var b = path.bounds(f), dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1];
        var k = Math.max(1, Math.min(28, 0.8 / Math.max(dx / W, dy / H)));
        view = { k: k, x: W / 2 - k * (b[0][0] + b[1][0]) / 2, y: H / 2 - k * (b[0][1] + b[1][1]) / 2 };
        lastDots = [[], true];
        apply(true);
        [].forEach.call(zoomG.querySelectorAll('path.c'), function (p) { var me = p.getAttribute('data-id') === id; p.classList.toggle('sel', me); p.classList.toggle('dim', !me); });
        hi.setAttribute('d', path(f));
        hiRes().then(function (w) {
          if (current !== cc) return;
          var g = w.objects.countries.geometries.filter(function (x) { return x.id === id; })[0];
          if (g) hi.setAttribute('d', path(topojson.feature(w, g)));
        }).catch(function () {});
        panel.innerHTML = '<div class="skel" style="height:240px"></div>';
        Promise.all([api('geo-country', null, '&cc=' + cc + '&days=' + state.days), regionNames()]).then(function (r) {
          if (current !== cc) return;
          var d = r[0], db = r[1], t = d.totals;
          dots(d.cities.map(function (c) { c.country = cc; return c; }), true);
          var rmax = Math.max.apply(null, d.regions.map(function (x) { return x.n; }).concat(1));
          panel.innerHTML = '<button class="btn sm" data-reset>← World</button>' +
            '<span class="kicker" style="display:block;margin-top:16px">' + esc(cc) + '</span><h3>' + esc(regionName(cc)) + '</h3>' +
            '<div class="mstats"><div><b>' + num(t.pageviews) + '</b><span>views</span></div><div><b>' + num(t.uniques) + '</b><span>visitors</span></div><div><b>' + num(t.identified) + '</b><span>opted in</span></div></div>' +
            '<h4>States & provinces</h4>' + (d.regions.length ? '<div class="blist">' + d.regions.map(function (x) {
              return '<div class="brow"><span class="fill" style="width:' + (x.n / rmax * 100) + '%"></span><span>' + esc(regionLabel(db, cc, x.k)) + '</span><span class="n">' + num(x.n) + '</span></div>';
            }).join('') + '</div>' : '<div class="muted">No region data yet</div>') +
            '<h4>Cities <span class="faint">· opted-in visitors</span></h4>' + (d.cities.length ? '<div class="blist">' + d.cities.map(function (c) {
              return '<div class="brow" data-hl="' + esc(c.k) + '"><span>' + esc(c.k) + (c.region ? ' <span class="faint">' + esc(regionLabel(db, cc, c.region)) + '</span>' : '') +
                '</span><span class="n">' + c.n + '</span></div>';
            }).join('') + '</div>' : '<div class="muted">None yet</div>') +
            (d.people.length ? '<h4>People</h4><div class="feed">' + d.people.map(function (v) {
              return '<div class="row"><span class="what"><a href="#visitor=' + esc(v.id) + '">' + esc(whoName(v)) + '</a> <span class="faint">· score ' + v.score + '</span></span></div>';
            }).join('') + '</div>' : '') +
            (d.referrers.length ? '<h4>Came from</h4><div class="muted">' + d.referrers.map(function (x) { return esc(x.k) + ' (' + x.n + ')'; }).join(', ') + '</div>' : '');
        }).catch(function (e) { panel.innerHTML = '<button class="btn sm" data-reset>← World</button><p class="muted">' + esc(e.message) + '</p>'; });
      }

      svg.addEventListener('wheel', function (e) {
        e.preventDefault();
        var pt = svgPoint(e); zoomAt(Math.exp(-e.deltaY * 0.0015), pt[0], pt[1], false);
      }, { passive: false });
      var drag = null, moved = false;
      svg.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        drag = { p: svgPoint(e), x: view.x, y: view.y }; moved = false;
      });
      svg.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var pt = svgPoint(e), dx = pt[0] - drag.p[0], dy = pt[1] - drag.p[1];
        if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
        if (!moved) { moved = true; svg.setPointerCapture(e.pointerId); svg.classList.add('dragging'); }
        view.x = drag.x + dx; view.y = drag.y + dy; apply(false);
      });
      svg.addEventListener('pointerup', function () { drag = null; svg.classList.remove('dragging'); });
      el.querySelector('.zc').addEventListener('click', function (e) {
        var z = e.target.closest('[data-z]'); if (!z) return;
        var a = z.getAttribute('data-z');
        if (a === 'in') zoomAt(1.6, W / 2, H / 2, true);
        else if (a === 'out') zoomAt(1 / 1.6, W / 2, H / 2, true);
        else if (current) reset(); else { view = { k: 1, x: 0, y: 0 }; apply(true); }
      });
      svg.addEventListener('click', function (e) {
        if (moved) { moved = false; return; } // end of a drag, not a click
        var p = e.target.closest('path.c');
        if (p) { var cc = p.getAttribute('data-cc'); if (cc && cc !== current) select(cc); }
        else if (current && !e.target.closest('circle')) reset();
      });
      panel.addEventListener('click', function (e) {
        if (e.target.closest('[data-reset]')) reset();
        var pick = e.target.closest('[data-pick]'); if (pick) select(pick.getAttribute('data-pick'));
      });
      panel.addEventListener('mouseover', function (e) {
        var row = e.target.closest('[data-hl]');
        [].forEach.call(dotsG.querySelectorAll('g[data-city]'), function (g) { g.classList.toggle('hl', !!row && g.getAttribute('data-city') === row.getAttribute('data-hl')); });
      });
      reset();
    }).catch(function (e) { el.innerHTML = '<div class="empty">Map unavailable: ' + esc(e.message) + '</div>'; });
  }

  function overview() {
    api('stats', null, '&days=' + state.days).then(function (s) {
      var t = s.totals, p = s.previous, decided = t.accepts + t.rejects;
      var range = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', 365: 'Last 12 months' }[s.days];
      view.innerHTML = pageHead('Dashboard', 'Overview', '');
      view.querySelector('.actions').appendChild(segmented([[7, '7d'], [30, '30d'], [90, '90d'], [365, '12m']], state.days, function (v) { state.days = +v; overview(); }));
      var kpi = function (label, val, d, sub) {
        return '<div class="card kpi"><span class="kicker">' + label + '</span><div class="val">' + val + '</div><div class="sub">' + (d || '') + '<span>' + (sub || '') + '</span></div></div>';
      };
      view.appendChild(h('<div class="grid g-kpi">' +
        kpi('Page views', num(t.pageviews), delta(t.pageviews, p.pageviews), 'vs previous period') +
        kpi('Unique visitors', num(t.uniques), delta(t.uniques, p.uniques), 'cookieless, per day') +
        kpi('Opted in', num(t.identified), delta(t.identified, p.identified), 'identified visitors') +
        kpi('Consent rate', decided ? Math.round(t.accepts / decided * 100) + '%' : '—', '', num(t.accepts) + ' allowed · ' + num(t.rejects) + ' declined') +
        kpi('Leads', num(t.leads), delta(t.leads, p.leads), '<a href="#leads">open inbox →</a>') + '</div>'));

      var funnelRows = [
        { k: 'Unique visitors', n: t.uniques }, { k: 'Opted in', n: t.identified }, { k: 'Engaged (score 10+)', n: s.funnel.engaged },
        { k: 'Hot (score 25+)', n: s.funnel.hot }, { k: 'Sent a message', n: t.leads }
      ];
      var top = t.uniques || 1;
      view.appendChild(h('<div class="grid g-main mt">' +
        '<div class="card"><h2>Traffic <span class="muted">· ' + range + '</span></h2>' + chart(s.daily, s.days) + '</div>' +
        barList('Funnel', funnelRows, function (r) { return esc(r.k) + ' <span class="faint">' + Math.round(r.n / top * 100) + '%</span>'; }) + '</div>'));

      var mapCard = h('<div class="card mt"><h2>Where visitors are <span class="muted">· click a country to drill into its states and cities</span></h2><div class="mapbox"></div></div>');
      view.appendChild(mapCard);
      worldMap(mapCard.querySelector('.mapbox'), s);

      var feed = s.recent.length ? '<div class="feed">' + s.recent.slice(0, 8).map(function (e) {
        return '<div class="row"><span class="t">' + ago(e.ts) + '</span><span class="what">' + whoCell(e) + ' <span class="muted">' + describe(e) + '</span></span></div>';
      }).join('') + '</div><a class="btn sm" href="#activity" style="margin-top:14px">View all activity →</a>' : '<div class="muted">No activity yet</div>';
      view.appendChild(h('<div class="grid g-2 mt">' +
        barList('Companies', s.companies, function (r) { return esc(r.k) + (r.domain ? ' <span class="faint">' + esc(r.domain) + '</span>' : ''); }, '· excludes ISPs') +
        '<div class="card"><h2>Recent activity</h2>' + feed + '</div></div>'));

      view.appendChild(h('<div class="grid g-3 mt">' +
        barList('Countries', s.countries, function (r) { return esc(regionName(r.k)); }) +
        barList('Referrers', s.referrers) +
        barList('Pages', s.pages) +
        barList('Experience chosen', s.themes) +
        barList('Project clicks', s.clicks, function (r) { return esc(r.k.replace(/^project:/, '')); }) +
        barList('CLI commands', s.commands, function (r) { return '<span class="mono">' + esc(r.k) + '</span> ' + (r.status === 'unknown' ? '<span class="tag warn">unknown</span>' : ''); }) +
        barList('Devices', s.devices) +
        barList('Downloads & outbound', s.downloads.concat(s.outbound)) + '</div>'));
    }).catch(fail);
  }

  /* ---------- activity log ---------- */
  var ACT_TYPES = { pageview: 'Page views', command: 'Commands', click: 'Clicks', download: 'Downloads', outbound: 'Outbound', theme: 'View chosen',
    engage: 'Time on page', consent: 'Opt-ins', choice: 'Declines' };
  function activity() {
    var a = state.act || (state.act = { page: 1, type: '', who: '', q: '' });
    view.innerHTML = pageHead('Log', 'Activity', '<button class="btn sm" id="refresh">Refresh</button><button class="btn sm" id="csv">Export page</button>');
    var bar = h('<div class="toolbar"><input type="search" class="search" placeholder="Search page, command, company, city…">' +
      '<select class="st" id="atype"><option value="">All events</option></select>' +
      '<select class="st" id="arange"><option value="1">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select></div>');
    bar.appendChild(segmented([['', 'Everyone'], ['identified', 'Opted in'], ['anonymous', 'Anonymous']], a.who, function (v) { a.who = v; a.page = 1; load(); }));
    view.appendChild(bar);
    var body = h('<div></div>');
    view.appendChild(body);
    var search = bar.querySelector('.search'), typeSel = bar.querySelector('#atype'), rangeSel = bar.querySelector('#arange');
    search.value = a.q; rangeSel.value = String(state.days);
    var timer;
    search.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { a.q = search.value; a.page = 1; load(); }, 300); });
    typeSel.addEventListener('change', function () { a.type = typeSel.value; a.page = 1; load(); });
    rangeSel.addEventListener('change', function () { state.days = +rangeSel.value; a.page = 1; load(); });
    view.querySelector('#refresh').addEventListener('click', function () { load(); });
    var last = [];
    view.querySelector('#csv').addEventListener('click', function () {
      downloadCsv('activity-page-' + a.page + '.csv', last, [['Time', 'ts'], ['Visitor', function (e) { return e.visitor_id ? whoName(e) : 'Anonymous'; }], ['Event', 'type'],
        ['Detail', function (e) { return e.name || ''; }], ['Page', 'path'], ['Value', 'value'], ['Country', function (e) { return regionName(e.country); }], ['Region', 'region'],
        ['Device', 'device'], ['Referrer', 'ref_host'], ['Tracked link', 'link_slug']]);
    });

    function dayLabel(ts) {
      var d = new Date(ts), today = new Date(); today.setHours(0, 0, 0, 0);
      var diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
      return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }
    function pager(d) {
      if (d.pages <= 1) return '';
      var nums = [], p = d.page;
      for (var i = 1; i <= d.pages; i++) if (i === 1 || i === d.pages || Math.abs(i - p) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
      return '<div class="pager"><button class="btn sm" data-p="' + (p - 1) + '"' + (p === 1 ? ' disabled' : '') + '>← Newer</button>' +
        nums.map(function (x) { return x === '…' ? '<span class="faint">…</span>' : '<button class="pg' + (x === p ? ' on' : '') + '" data-p="' + x + '">' + x + '</button>'; }).join('') +
        '<button class="btn sm" data-p="' + (p + 1) + '"' + (p === d.pages ? ' disabled' : '') + '>Older →</button></div>';
    }
    function load() {
      body.innerHTML = '<div class="skel" style="height:420px"></div>';
      var qs = '&page=' + a.page + '&days=' + state.days + '&type=' + encodeURIComponent(a.type) + '&who=' + a.who + '&q=' + encodeURIComponent(a.q);
      api('activity', null, qs).then(function (d) {
        last = d.rows;
        typeSel.innerHTML = '<option value="">All events</option>' + d.types.map(function (t) {
          return '<option value="' + esc(t.k) + '">' + esc(ACT_TYPES[t.k] || t.k) + ' (' + num(t.n) + ')</option>';
        }).join('');
        typeSel.value = a.type;
        if (!d.rows.length) { body.innerHTML = '<div class="card empty"><b>Nothing here</b>No events match these filters.</div>'; return; }
        var from = (d.page - 1) * d.per + 1, to = from + d.rows.length - 1, day = null, html = '';
        d.rows.forEach(function (e) {
          var label = dayLabel(e.ts);
          if (label !== day) { day = label; html += '<tr class="day"><td colspan="5">' + esc(label) + '</td></tr>'; }
          html += '<tr><td class="muted" title="' + esc(when(e.ts)) + '" style="white-space:nowrap">' + new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</td>' +
            '<td><div class="who">' + (e.visitor_id ? avatar(e) : '<span class="av">·</span>') + '<div><b>' + whoCell(e) + '</b><small>' +
              esc([e.city, e.region && e.country ? e.region + ', ' + e.country : regionName(e.country)].filter(Boolean).join(' · ') || '—') + '</small></div></div></td>' +
            '<td><span class="tag">' + esc(ACT_TYPES[e.type] || e.type) + '</span></td><td>' + describe(e) + '</td>' +
            '<td class="muted">' + esc(e.device || '') + (e.link_slug ? ' <span class="tag acc">🔗 ' + esc(e.link_slug) + '</span>' : '') + '</td></tr>';
        });
        body.innerHTML = '<div class="card table-wrap"><table><thead><tr><th>Time</th><th>Who</th><th>Event</th><th>Detail</th><th>Device</th></tr></thead><tbody>' + html + '</tbody></table></div>' +
          '<div class="pagebar"><span class="muted">Showing ' + num(from) + '–' + num(to) + ' of ' + num(d.total) + '</span>' + pager(d) + '</div>';
        body.querySelector('.pagebar').addEventListener('click', function (e) {
          var b = e.target.closest('[data-p]'); if (!b || b.disabled) return;
          a.page = +b.getAttribute('data-p'); load(); window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }).catch(function (e) { body.innerHTML = '<div class="card empty">' + esc(e.message) + '</div>'; });
    }
    load();
  }

  /* ---------- visitors ---------- */
  function visitors() {
    api('visitors').then(function (rows) {
      view.innerHTML = pageHead('People', 'Visitors', '<button class="btn sm" id="csv">Export CSV</button>');
      if (!rows.length) {
        view.appendChild(h('<div class="card empty"><b>No identified visitors yet</b>They appear here once someone clicks “Allow” on the privacy card.</div>'));
        return;
      }
      var counts = {
        all: rows.length, starred: rows.filter(function (v) { return v.starred; }).length,
        companies: rows.filter(function (v) { return v.org && !v.org_is_isp; }).length, leads: rows.filter(function (v) { return v.leads; }).length,
        links: rows.filter(function (v) { return v.link_slug; }).length, hot: rows.filter(function (v) { return v.score >= 25; }).length
      };
      var bar = h('<div class="toolbar"><input type="search" class="search" placeholder="Search company, city, link, note…"></div>');
      bar.appendChild(segmented([['all', 'All', counts.all], ['starred', '★ Starred', counts.starred], ['companies', 'Companies', counts.companies],
        ['leads', 'Sent message', counts.leads], ['links', 'Tracked link', counts.links], ['hot', 'Hot', counts.hot]], state.vfilter, function (v) { state.vfilter = v; draw(); }));
      view.appendChild(bar);
      var table = h('<div class="card table-wrap"><table><thead><tr><th></th><th>Score</th><th>Visitor</th><th>Visits</th><th>Pages</th><th>Source</th><th>Last seen</th></tr></thead><tbody></tbody></table></div>');
      view.appendChild(table);
      var search = bar.querySelector('.search'); search.value = state.vq;
      search.addEventListener('input', function () { state.vq = search.value; draw(); });

      function filtered() {
        var q = state.vq.trim().toLowerCase();
        return rows.filter(function (v) {
          var f = state.vfilter;
          if (f === 'starred' && !v.starred) return false;
          if (f === 'companies' && !(v.org && !v.org_is_isp)) return false;
          if (f === 'leads' && !v.leads) return false;
          if (f === 'links' && !v.link_slug) return false;
          if (f === 'hot' && v.score < 25) return false;
          if (!q) return true;
          return [v.org, v.org_domain, v.city, regionName(v.country), v.link_label, v.referrer, v.note].join(' ').toLowerCase().indexOf(q) > -1;
        });
      }
      function draw() {
        var list = filtered();
        table.querySelector('tbody').innerHTML = list.length ? list.map(function (v) {
          var tagx = v.org ? (v.org_is_isp ? ' <span class="tag">ISP</span>' : ' <span class="tag acc">company</span>') : '';
          return '<tr class="click" data-id="' + esc(v.id) + '"><td><button class="star' + (v.starred ? ' on' : '') + '" data-star title="Star">★</button></td>' +
            '<td><span class="score' + (v.score >= 25 ? ' hot' : '') + '">' + v.score + '</span></td>' +
            '<td><div class="who">' + avatar(v) + '<div><b>' + esc(v.org || 'Unknown network') + tagx + (v.leads ? ' <span class="tag ok">message</span>' : '') + '</b><small>' + esc(place(v) || '—') +
            (v.note ? ' · <i>' + esc(v.note.slice(0, 40)) + '</i>' : '') + '</small></div></div></td>' +
            '<td>' + v.visits + '</td><td>' + v.pageviews + '</td>' +
            '<td>' + (v.link_label ? '<span class="tag acc">🔗 ' + esc(v.link_label) + '</span>' : esc(v.referrer || v.utm || 'Direct')) + '</td><td class="muted">' + ago(v.last_seen) + '</td></tr>';
        }).join('') : '<tr><td colspan="7" class="empty">Nothing matches.</td></tr>';
      }
      table.querySelector('tbody').addEventListener('click', function (e) {
        var tr = e.target.closest('tr[data-id]'); if (!tr) return;
        var id = tr.getAttribute('data-id');
        if (e.target.closest('[data-star]')) {
          var v = rows.filter(function (r) { return r.id === id; })[0]; v.starred = !v.starred;
          e.target.classList.toggle('on', v.starred);
          api('visitor-update', { id: id, starred: v.starred }).catch(fail);
          return;
        }
        location.hash = 'visitor=' + id;
      });
      view.querySelector('#csv').addEventListener('click', function () {
        downloadCsv('visitors.csv', filtered(), [['Score', 'score'], ['Starred', function (v) { return v.starred ? 'yes' : ''; }], ['Company / network', 'org'], ['Domain', 'org_domain'],
          ['ISP', function (v) { return v.org_is_isp ? 'yes' : ''; }], ['City', 'city'], ['Country', function (v) { return regionName(v.country); }], ['Visits', 'visits'], ['Pages', 'pageviews'],
          ['Tracked link', 'link_label'], ['Referrer', 'referrer'], ['Messages', 'leads'], ['Note', 'note'], ['First seen', 'first_seen'], ['Last seen', 'last_seen']]);
      });
      draw();
    }).catch(fail);
  }

  function visitor(id) {
    api('visitor', null, '&id=' + encodeURIComponent(id)).then(function (d) {
      var v = d.visitor;
      var sessions = {};
      d.events.slice().reverse().forEach(function (e) { var k = e.session_id || 'other'; (sessions[k] = sessions[k] || []).push(e); });
      var props = [
        ['Network', esc(v.org || 'Unknown') + (v.org ? (v.org_is_isp ? ' <span class="tag">ISP</span>' : ' <span class="tag acc">company</span>') : '') + (v.org_domain ? ' <span class="muted">' + esc(v.org_domain) + '</span>' : '')],
        ['Location', esc([v.city, v.region, regionName(v.country)].filter(Boolean).join(', ') || '—')],
        ['Device', esc([v.device, v.browser, v.os].filter(Boolean).join(' · '))],
        ['Came from', v.link_label ? '🔗 ' + esc(v.link_label) : esc(v.referrer || v.utm || 'Direct')],
        ['Experience', esc(v.theme || '—')],
        ['Visits', v.visits + ' visits · ' + v.pageviews + ' pages'],
        ['First seen', when(v.first_seen)], ['Last seen', when(v.last_seen) + ' <span class="muted">(' + ago(v.last_seen) + ')</span>']
      ];
      view.innerHTML = '<a class="back" href="#visitors">← All visitors</a>' +
        pageHead('Visitor · score ' + v.score, esc(whoName(v)),
          '<button class="btn sm" id="star">' + (v.starred ? '★ Starred' : '☆ Star') + '</button><button class="btn sm danger" id="del">Delete data</button>');
      var left = h('<div class="grid"></div>');
      left.appendChild(h('<div class="card"><h2>Profile</h2><dl class="props">' + props.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl></div>'));
      var noteCard = h('<div class="card"><h2>Private note</h2><textarea placeholder="e.g. Recruiter at Acme, met at DevFest. Follow up in May."></textarea><div style="margin-top:10px;display:flex;justify-content:flex-end"><button class="btn sm primary">Save note</button></div></div>');
      noteCard.querySelector('textarea').value = v.note || '';
      noteCard.querySelector('button').addEventListener('click', function () {
        api('visitor-update', { id: v.id, note: noteCard.querySelector('textarea').value }).then(function () { toast('Note saved'); }).catch(fail);
      });
      left.appendChild(noteCard);
      if (d.leads.length) left.appendChild(h('<div class="card"><h2>Messages</h2>' + d.leads.map(function (l) {
        return '<div class="lead-card"><div><b>' + esc(l.name) + '</b> · <a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a> <span class="faint">' + ago(l.ts) + '</span></div><div class="quote">' + esc(l.message) + '</div></div>';
      }).join('') + '</div>'));
      var activity = h('<div class="card"><h2>Activity <span class="muted">· ' + d.events.length + ' events</span></h2>' + Object.keys(sessions).reverse().map(function (k) {
        var evs = sessions[k];
        return '<div class="session"><h3>' + when(evs[0].ts) + ' · ' + evs.length + ' events</h3>' + evs.map(function (e) {
          return '<div class="ev"><span class="t">' + new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span><span><b>' + esc(e.type) + '</b> ' +
            esc(e.name || e.path || '') + (e.value && e.type === 'engage' ? ' <span class="muted">' + esc(e.value) + 's active</span>' : '') +
            (e.value === 'unknown' ? ' <span class="tag warn">unknown</span>' : '') + '</span></div>';
        }).join('') + '</div>';
      }).join('') + '</div>');
      var grid = h('<div class="grid g-main"></div>');
      grid.appendChild(activity); grid.appendChild(left);
      view.appendChild(grid);
      view.querySelector('#star').addEventListener('click', function () {
        v.starred = !v.starred; this.textContent = v.starred ? '★ Starred' : '☆ Star';
        api('visitor-update', { id: v.id, starred: v.starred }).catch(fail);
      });
      view.querySelector('#del').addEventListener('click', function () {
        if (!confirm('Delete this visitor and all their events? Use this for deletion requests.')) return;
        api('visitor-delete', { id: v.id }).then(function () { toast('Deleted'); location.hash = 'visitors'; }).catch(fail);
      });
    }).catch(function (e) { view.innerHTML = '<div class="card empty"><b>Visitor not found</b>' + esc(e.message) + '</div>'; });
  }

  /* ---------- leads ---------- */
  function leads() {
    api('leads').then(function (rows) {
      view.innerHTML = pageHead('Inbox', 'Leads', '<button class="btn sm" id="csv">Export CSV</button>');
      if (!rows.length) {
        view.appendChild(h('<div class="card empty"><b>No messages yet</b>They arrive from the “Work with me” form and the terminal’s <span class="mono">hire</span> command.</div>'));
        return;
      }
      var c = function (s) { return rows.filter(function (l) { return l.status === s; }).length; };
      var bar = h('<div class="toolbar"><input type="search" class="search" placeholder="Search name, email, company, message…"></div>');
      bar.appendChild(segmented([['all', 'All', rows.length], ['new', 'New', c('new')], ['contacted', 'Contacted', c('contacted')], ['won', 'Won', c('won')], ['lost', 'Lost', c('lost')]],
        state.lfilter, function (v) { state.lfilter = v; draw(); }));
      view.appendChild(bar);
      var list = h('<div class="grid"></div>');
      view.appendChild(list);
      var search = bar.querySelector('.search'); search.value = state.lq;
      search.addEventListener('input', function () { state.lq = search.value; draw(); });

      function filtered() {
        var q = state.lq.trim().toLowerCase();
        return rows.filter(function (l) {
          if (state.lfilter !== 'all' && l.status !== state.lfilter) return false;
          return !q || [l.name, l.email, l.company, l.message, l.note].join(' ').toLowerCase().indexOf(q) > -1;
        });
      }
      function draw() {
        list.innerHTML = '';
        var items = filtered();
        if (!items.length) { list.appendChild(h('<div class="card empty">Nothing matches.</div>')); return; }
        items.forEach(function (l) {
          var reply = 'mailto:' + encodeURIComponent(l.email) + '?subject=' + encodeURIComponent('Re: your message on my portfolio') +
            '&body=' + encodeURIComponent('Hi ' + l.name.split(' ')[0] + ',\n\nThanks for reaching out!\n\n\n---\n> ' + l.message.replace(/\n/g, '\n> '));
          var card = h('<div class="card lead-card">' +
            '<div class="lead-top"><span class="av co">' + esc(l.name.charAt(0).toUpperCase()) + '</span><div class="grow"><b>' + esc(l.name) + '</b>' + (l.company ? ' <span class="muted">· ' + esc(l.company) + '</span>' : '') +
            '<div class="muted"><a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a> · ' + when(l.ts) + '</div></div>' +
            '<select class="st"><option value="new">New</option><option value="contacted">Contacted</option><option value="won">Won</option><option value="lost">Lost</option></select>' +
            '<a class="btn sm primary" href="' + esc(reply) + '">Reply</a><button class="btn sm danger del">Delete</button></div>' +
            '<div class="quote">' + esc(l.message) + '</div>' +
            (l.visitor_id ? '<div class="muted">Browsed as ' + esc(l.org || 'unknown network') + (place(l) ? ' · ' + esc(place(l)) : '') + ' · score ' + l.score +
              ' · <a href="#visitor=' + esc(l.visitor_id) + '">see what they viewed →</a></div>' : '<div class="faint">This visitor didn’t opt in to tracking.</div>') +
            '<textarea class="note" placeholder="Private note (saved automatically)" style="min-height:44px"></textarea></div>');
          var st = card.querySelector('.st'); st.value = l.status;
          st.addEventListener('change', function () {
            l.status = st.value;
            api('lead-update', { id: l.id, status: st.value }).then(function () { toast('Marked ' + st.value); }).catch(fail);
          });
          var note = card.querySelector('.note'); note.value = l.note || '';
          note.addEventListener('change', function () { l.note = note.value; api('lead-update', { id: l.id, note: note.value }).then(function () { toast('Note saved'); }).catch(fail); });
          card.querySelector('.del').addEventListener('click', function () {
            if (!confirm('Delete this message permanently?')) return;
            api('lead-delete', { id: l.id }).then(function () { rows.splice(rows.indexOf(l), 1); draw(); }).catch(fail);
          });
          list.appendChild(card);
        });
      }
      view.querySelector('#csv').addEventListener('click', function () {
        downloadCsv('leads.csv', filtered(), [['Received', 'ts'], ['Status', 'status'], ['Name', 'name'], ['Email', 'email'], ['Company', 'company'], ['Message', 'message'],
          ['Note', 'note'], ['Network', 'org'], ['City', 'city'], ['Country', function (l) { return regionName(l.country); }], ['Score', 'score']]);
      });
      draw();
    }).catch(fail);
  }

  /* ---------- tracked links ---------- */
  function links() {
    api('links').then(function (rows) {
      var base = location.origin + '/';
      view.innerHTML = pageHead('Networking', 'Tracked links', '');
      var form = h('<form class="card"><h2>New personal link <span class="muted">· you get an email when it’s opened, and their visit is labelled with this name</span></h2>' +
        '<div class="fields"><div class="field"><label>Who it’s for</label><input name="label" placeholder="Jane @ Acme" required></div>' +
        '<div class="field"><label>Greeting shown on the site <span class="faint">(optional)</span></label><input name="greeting" placeholder="Hi Jane, thanks for stopping by"></div>' +
        '<div class="field"><label>Custom slug <span class="faint">(optional)</span></label><input name="slug" placeholder="acme"></div>' +
        '<div class="field"><label>Private note <span class="faint">(optional)</span></label><input name="note" placeholder="Met at DevFest"></div></div>' +
        '<div style="margin-top:14px"><button class="btn primary">Create link</button></div></form>');
      form.addEventListener('submit', function (e) {
        e.preventDefault(); var f = form.elements;
        api('link-create', { label: f.label.value, greeting: f.greeting.value, slug: f.slug.value, note: f.note.value }).then(function (l) {
          copy(base + '?via=' + l.slug); links();
        }).catch(fail);
      });
      view.appendChild(form);
      if (!rows.length) { view.appendChild(h('<div class="card empty mt"><b>No links yet</b>Create one above, then share it in an email, on LinkedIn or as a QR code on your card.</div>')); return; }
      var table = h('<div class="card table-wrap mt"><table><thead><tr><th>For</th><th>Link</th><th>Opens</th><th>Opted in</th><th>Leads</th><th>Last opened</th><th></th></tr></thead><tbody>' + rows.map(function (l) {
        var u = base + '?via=' + l.slug;
        return '<tr><td><b>' + esc(l.label) + '</b>' + (l.note ? '<div class="faint">' + esc(l.note) + '</div>' : '') + (l.greeting ? '<div class="muted">“' + esc(l.greeting) + '”</div>' : '') + '</td>' +
          '<td class="mono">' + esc(u.replace(/^https?:\/\//, '')) + '</td><td>' + (l.opens ? '<span class="tag ok">' + l.opens + '</span>' : '<span class="faint">not yet</span>') + '</td>' +
          '<td>' + l.visitors + '</td><td>' + (l.leads ? '<span class="tag acc">' + l.leads + '</span>' : '0') + '</td><td class="muted">' + (l.last_open ? ago(l.last_open) : '—') + '</td>' +
          '<td style="white-space:nowrap"><button class="btn sm" data-qr="' + esc(l.slug) + '">QR</button> <button class="btn sm" data-copy="' + esc(u) + '">Copy</button> <button class="btn sm danger" data-del="' + esc(l.slug) + '">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>');
      table.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.hasAttribute('data-copy')) copy(b.getAttribute('data-copy'));
        if (b.hasAttribute('data-qr')) { var slug = b.getAttribute('data-qr'); qr(rows.filter(function (r) { return r.slug === slug; })[0], base + '?via=' + slug); }
        if (b.hasAttribute('data-del') && confirm('Delete this link? Past visits stay recorded.')) api('link-delete', { slug: b.getAttribute('data-del') }).then(links).catch(fail);
      });
      view.appendChild(table);
    }).catch(fail);
  }
  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Link copied'); }, function () { prompt('Copy this link:', text); });
  }
  function qr(link, url) {
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js').then(function () {
      var q = qrcode(0, 'M'); q.addData(url); q.make();
      var svg = q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
      var m = modal('<span class="kicker">QR code</span><h2 style="font:400 24px/1.2 var(--serif);margin:6px 0 0">' + esc(link.label) + '</h2><div class="qr">' + svg + '</div>' +
        '<div class="mono muted" style="word-break:break-all;margin-bottom:14px">' + esc(url) + '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn sm" data-close>Close</button><button class="btn sm primary" id="dl">Download SVG</button></div>');
      m.querySelector('#dl').addEventListener('click', function () {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); a.download = 'qr-' + link.slug + '.svg'; a.click();
      });
    }).catch(fail);
  }

  /* ---------- content (CMS) ---------- */
  function markDirty() { state.dirty = true; var s = document.getElementById('saveState'); if (s) s.textContent = 'Unsaved changes'; }

  function rich(obj, key) {
    var wrap = h('<div class="rte"><div class="rte-bar">' +
      '<button type="button" data-c="bold" title="Bold (Ctrl+B)"><b>B</b></button><button type="button" data-c="italic" title="Italic (Ctrl+I)"><i>I</i></button>' +
      '<button type="button" data-c="underline" title="Underline"><u>U</u></button><button type="button" data-c="link" title="Add link">Link</button>' +
      '<button type="button" data-c="unlink" title="Remove link">Unlink</button><button type="button" data-c="removeFormat" title="Clear formatting">Clear</button></div>' +
      '<div class="rte-ed" contenteditable="true"></div></div>');
    var ed = wrap.querySelector('.rte-ed');
    ed.innerHTML = obj[key] || '';
    ed.addEventListener('input', function () { obj[key] = ed.innerHTML; markDirty(); });
    ed.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); } });
    ed.addEventListener('paste', function (e) { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });
    wrap.querySelector('.rte-bar').addEventListener('mousedown', function (e) { e.preventDefault(); });
    wrap.querySelector('.rte-bar').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var c = b.getAttribute('data-c'); ed.focus();
      document.execCommand('styleWithCSS', false, false);
      if (c === 'link') { var u = prompt('Link URL (https://…, mailto:…)'); if (u) document.execCommand('createLink', false, u); }
      else document.execCommand(c);
      obj[key] = ed.innerHTML; markDirty();
    });
    return wrap;
  }

  function upload(file) {
    return fetch('/api/admin?action=upload&filename=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-admin': '1' }, body: file })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Upload failed'); return d.url; }); });
  }

  function field(obj, key, label, type, hint) {
    var f = h('<div class="field' + (type === 'rich' || type === 'wide' || type === 'textarea' ? ' wide' : '') + '"><label>' + esc(label) + '</label></div>');
    if (type === 'rich') f.appendChild(rich(obj, key));
    else if (type === 'check') {
      f = h('<label class="check"><input type="checkbox"> ' + esc(label) + '</label>');
      var cb = f.querySelector('input'); cb.checked = !!obj[key];
      cb.addEventListener('change', function () { obj[key] = cb.checked; markDirty(); });
    } else if (type === 'image' || type === 'file') {
      var box = h('<div class="img-field">' + (type === 'image' ? '<img alt="">' : '') + '<input type="text"><label class="btn sm">Upload<input type="file" hidden accept="' + (type === 'image' ? 'image/*' : 'application/pdf') + '"></label></div>');
      var inp = box.querySelector('input[type=text]'), img = box.querySelector('img'), fileIn = box.querySelector('input[type=file]');
      var sync = function () { if (img) img.src = obj[key] || ''; };
      inp.value = obj[key] || ''; sync();
      inp.addEventListener('input', function () { obj[key] = inp.value; sync(); markDirty(); });
      fileIn.addEventListener('change', function () {
        var fl = fileIn.files[0]; if (!fl) return; toast('Uploading…');
        upload(fl).then(function (u) { obj[key] = inp.value = u; sync(); markDirty(); toast('Uploaded. Remember to save.'); }).catch(fail);
      });
      f.appendChild(box);
    } else {
      var el = type === 'textarea' ? h('<textarea></textarea>') : h('<input type="text">');
      el.value = obj[key] || '';
      el.addEventListener('input', function () { obj[key] = el.value; markDirty(); });
      f.appendChild(el);
    }
    if (hint) f.appendChild(h('<div class="hint">' + esc(hint) + '</div>'));
    return f;
  }

  function fieldsBox(obj, defs) {
    var box = h('<div class="fields"></div>');
    defs.forEach(function (d) { box.appendChild(field(obj, d[0], d[1], d[2], d[3])); });
    return box;
  }

  function listEditor(arr, defs, titleOf, blank, addLabel) {
    var wrap = h('<div></div>');
    function render() {
      wrap.innerHTML = '';
      arr.forEach(function (item, i) {
        var it = h('<div class="item"><div class="item-head"><strong>' + esc(titleOf(item) || 'Untitled') + '</strong>' +
          '<button type="button" class="icon-btn" data-a="up" title="Move up">↑</button><button type="button" class="icon-btn" data-a="down" title="Move down">↓</button>' +
          '<button type="button" class="btn sm danger" data-a="del">Remove</button></div></div>');
        it.appendChild(fieldsBox(item, defs));
        it.querySelector('.item-head').addEventListener('click', function (e) {
          var a = e.target.getAttribute('data-a'); if (!a) return;
          if (a === 'del' && !confirm('Remove "' + (titleOf(item) || 'this item') + '"?')) return;
          if (a === 'del') arr.splice(i, 1);
          if (a === 'up' && i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]);
          if (a === 'down' && i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]);
          markDirty(); render();
        });
        wrap.appendChild(it);
      });
      var add = h('<button type="button" class="btn">+ ' + esc(addLabel) + '</button>');
      add.addEventListener('click', function () { arr.push(JSON.parse(JSON.stringify(blank))); markDirty(); render(); });
      wrap.appendChild(add);
    }
    render();
    return wrap;
  }

  function section(id, title, note, body) {
    var s = h('<div class="card sec" id="sec-' + id + '"><h2>' + esc(title) + (note ? ' <span class="muted">' + esc(note) + '</span>' : '') + '</h2></div>');
    s.appendChild(body);
    return s;
  }

  function content() {
    api('content').then(function (c) {
      var updated = c.updatedAt; delete c.updatedAt;
      state.content = c; state.dirty = false;
      c.cli = c.cli || { about: '', commands: [] };
      view.innerHTML = pageHead('CMS' + (updated ? ' · last saved ' + ago(updated) : ''), 'Content', '<a class="btn sm" href="/" target="_blank">Preview site ↗</a>');
      view.appendChild(h('<div class="jump">' + [['profile', 'Profile'], ['socials', 'Social links'], ['skills', 'Skills'], ['intro', 'Intro & about'], ['timeline', 'Timeline'], ['projects', 'Projects'], ['cli', 'Terminal']]
        .map(function (j) { return '<a href="javascript:void 0" data-jump="sec-' + j[0] + '">' + j[1] + '</a>'; }).join('') + '</div>'));
      view.querySelector('.jump').addEventListener('click', function (e) {
        var a = e.target.closest('[data-jump]'); if (a) document.getElementById(a.getAttribute('data-jump')).scrollIntoView({ behavior: 'smooth' });
      });

      view.appendChild(section('profile', 'Profile & contact', '', fieldsBox(c.profile, [
        ['name', 'Name'], ['role', 'Role / title'], ['location', 'Location'], ['status', 'Status line', null, 'e.g. “Available for work”; leave empty to hide'],
        ['email', 'Email'], ['phone', 'Phone (terminal contact)'], ['avatar', 'Profile picture', 'image'], ['resume', 'Résumé PDF', 'file', 'Adds a résumé link and the terminal “resume” command']
      ])));
      view.appendChild(section('socials', 'Social links', '', listEditor(c.socials, [['label', 'Label'], ['url', 'URL']], function (s) { return s.label; }, { label: '', url: 'https://' }, 'Add social link')));
      var skills = { text: (c.skills || []).join(', ') };
      var sk = field(skills, 'text', 'Skills (comma separated)', 'wide');
      sk.querySelector('input').addEventListener('input', function () { c.skills = skills.text.split(',').map(function (s) { return s.trim(); }).filter(Boolean); });
      view.appendChild(section('skills', 'Skills', '', sk));

      var intro = h('<div class="fields"></div>');
      intro.appendChild(field(c.hero, 'lead', 'Opening paragraph (modern site)', 'rich'));
      intro.appendChild(field(c.about, 'quote', 'About: large quote (italic shows in the accent colour)', 'rich'));
      intro.appendChild(field(c.about, 'p1', 'About: column 1', 'rich'));
      intro.appendChild(field(c.about, 'p2', 'About: column 2', 'rich'));
      view.appendChild(section('intro', 'Intro & about', 'modern site', intro));

      view.appendChild(section('timeline', 'History timeline', 'oldest first', listEditor(c.timeline, [
        ['period', 'Period', null, 'e.g. FEB 2024 — NOW'], ['role', 'Role'], ['company', 'Company'], ['badge', 'Badge', null, 'e.g. Current, Freelance'],
        ['current', 'Current job (highlighted)', 'check'], ['description', 'Description', 'rich'], ['stack', 'Stack (one line per row)', 'textarea']
      ], function (t) { return t.role + (t.company ? ' · ' + t.company : ''); },
        { period: '', role: '', company: '', badge: '', current: false, description: '', stack: '' }, 'Add chapter')));

      view.appendChild(section('projects', 'Projects', '', listEditor(c.projects, [
        ['name', 'Name'], ['category', 'Category', null, 'e.g. Fintech · .NET'], ['stack', 'Stack (terminal)'], ['url', 'Link (optional)'],
        ['image', 'Logo / image', 'image'], ['summary', 'One-liner (terminal)', 'rich'], ['description', 'Description (modern site)', 'rich']
      ], function (p) { return p.name; }, { name: '', category: '', stack: '', url: '', image: '', summary: '', description: '' }, 'Add project')));

      var cli = h('<div></div>');
      cli.appendChild(fieldsBox(c.cli, [['about', '“about” command output', 'rich']]));
      cli.appendChild(h('<h2 style="margin-top:18px">Custom commands <span class="muted">shown in “help”</span></h2>'));
      cli.appendChild(listEditor(c.cli.commands, [['name', 'Command (lowercase, no spaces)'], ['description', 'Help text'], ['output', 'Output', 'rich']],
        function (k) { return k.name; }, { name: '', description: '', output: '' }, 'Add command'));
      view.appendChild(section('cli', 'Terminal', 'skills, projects, experience & contact come from the sections above', cli));

      var bar = h('<div class="savebar"><span class="muted" id="saveState">All changes saved</span><button class="btn primary" type="button">Save changes</button></div>');
      bar.querySelector('button').addEventListener('click', function () {
        var b = this; b.disabled = true;
        api('content', { content: state.content }).then(function () { state.dirty = false; toast('Saved. Live in about 30 seconds.'); content(); })
          .catch(fail).then(function () { b.disabled = false; });
      });
      view.appendChild(bar);
    }).catch(fail);
  }

  /* ---------- system ---------- */
  function system() {
    api('system').then(function (s) {
      var missing = s.checks.filter(function (c) { return c.required && !c.ok; }).length;
      view.innerHTML = pageHead('Setup · ' + esc(s.env) + ' · ' + esc(s.region), 'System', '');
      view.appendChild(h('<div class="grid g-main">' +
        '<div class="card"><h2>Connections ' + (missing ? '<span class="tag warn">' + missing + ' required missing</span>' : '<span class="tag ok">ready</span>') + '</h2>' +
        s.checks.map(function (c) {
          return '<div class="check-row"><span class="ok-dot ' + (c.ok ? 'y">✓' : c.required ? 'n">!' : 'o">–') + '</span><div class="grow"><b>' + esc(c.label) + '</b>' +
            (c.required ? ' <span class="tag">required</span>' : ' <span class="tag">optional</span>') + '<div class="muted">' + esc(c.detail || '') + '</div></div>' +
            '<span class="mono faint">' + esc(c.env) + '</span></div>';
        }).join('') + '</div>' +
        '<div class="grid" style="align-content:start">' +
          '<div class="card"><h2>Stored data</h2><dl class="props"><dt>Events</dt><dd>' + num(s.counts.events) + '</dd><dt>Visitors</dt><dd>' + num(s.counts.visitors) + '</dd>' +
          '<dt>Leads</dt><dd>' + num(s.counts.leads) + '</dd><dt>Links</dt><dd>' + num(s.counts.links) + '</dd><dt>Since</dt><dd>' + (s.counts.since ? when(s.counts.since) : '—') + '</dd></dl></div>' +
          '<div class="card"><h2>Email alerts</h2><p class="muted" style="margin-top:0">Sends a test email to check that alerts reach your inbox.</p><button class="btn sm primary" id="test">Send test alert</button></div>' +
          '<div class="card"><h2>Data retention</h2><p class="muted" style="margin:0">Anonymous stats are kept 13 months. Detailed visits are kept 12 months after the last visit. A daily job deletes older data. Use <b>Delete data</b> on a visitor for deletion requests.</p></div>' +
        '</div></div>'));
      view.querySelector('#test').addEventListener('click', function () {
        var b = this; b.disabled = true;
        api('test-alert', {}).then(function () { toast('Test alert sent. Check your inbox.'); }).catch(fail).then(function () { b.disabled = false; });
      });
    }).catch(fail);
  }

  /* ---------- boot ---------- */
  api('me').then(showApp).catch(function () { showLogin(); });
})();
