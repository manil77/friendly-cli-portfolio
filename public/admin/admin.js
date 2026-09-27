/* Portfolio admin: dashboard, visitors, leads, tracked links, CMS. Talks to /api/admin?action=... */
(function () {
  var view = document.getElementById('view');
  var state = { days: 30, content: null, dirty: false };

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function num(n) { return (n || 0).toLocaleString(); }
  function flag(cc) { return cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint.apply(null, cc.split('').map(function (c) { return 127397 + c.charCodeAt(0); })) + ' ' : ''; }
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

  /* ---------- auth ---------- */
  var login = document.getElementById('login'), app = document.getElementById('app');
  function showLogin() { app.classList.add('hide'); login.classList.remove('hide'); login.password.focus(); }
  function showApp() { login.classList.add('hide'); app.classList.remove('hide'); route(); }
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
    view.innerHTML = '<div class="empty">Loading…</div>';
    var fn = { overview: overview, visitors: visitors, visitor: visitor, leads: leads, links: links, content: content }[tab] || overview;
    fn(hsh.split('=')[1]);
  }
  window.addEventListener('hashchange', function () {
    if (state.dirty && !confirm('You have unsaved content changes. Leave anyway?')) return;
    state.dirty = false; route();
  });
  window.addEventListener('beforeunload', function (e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- overview ---------- */
  function barList(title, rows, fmt) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat(1));
    return '<div class="card"><h2>' + title + '</h2>' + (rows.length ? '<div class="blist">' + rows.map(function (r) {
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
    var max = Math.max.apply(null, series.map(function (s) { return s.pageviews; }).concat(1));
    var fmt = function (d) { return new Date(d + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }); };
    return '<div class="chart" role="img" aria-label="Daily page views, last ' + days + ' days"><span class="ymax">' + num(max) + ' views</span><span class="grid-line"></span>' +
      series.map(function (s) {
        return '<div class="col" data-tip="' + esc(fmt(s.day) + ' · ' + s.pageviews + ' views · ' + s.uniques + ' visitors') + '"><div class="bar" style="height:' + (s.pageviews / max * 100) + '%"></div></div>';
      }).join('') + '</div><div class="xaxis"><span>' + fmt(series[0].day) + '</span><span>' + fmt(series[series.length - 1].day) + '</span></div>';
  }

  var tip;
  document.addEventListener('mousemove', function (e) {
    var col = e.target.closest && e.target.closest('[data-tip]');
    if (!col) { if (tip) tip.remove(), tip = null; return; }
    if (!tip) { tip = h('<div class="tip"></div>'); document.body.appendChild(tip); }
    tip.textContent = col.getAttribute('data-tip');
    var r = col.getBoundingClientRect(); tip.style.left = (r.left + r.width / 2) + 'px'; tip.style.top = (e.clientY - 8) + 'px';
  });

  function overview() {
    api('stats', null, '&days=' + state.days).then(function (s) {
      var t = s.totals, decided = t.accepts + t.rejects;
      view.innerHTML = '';
      view.appendChild(h('<h1>Overview <span class="toolbar"><select id="range"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select></span></h1>'));
      var range = view.querySelector('#range'); range.value = String(state.days);
      range.addEventListener('change', function () { state.days = +range.value; overview(); });
      var kpi = function (label, val, sub) { return '<div class="card kpi"><div class="label">' + label + '</div><div class="val">' + val + '</div><div class="sub">' + (sub || '&nbsp;') + '</div></div>'; };
      view.appendChild(h('<div class="grid g-kpi">' +
        kpi('Page views', num(t.pageviews)) +
        kpi('Unique visitors', num(t.uniques), 'daily-unique, cookieless') +
        kpi('Identified visitors', num(t.identified), 'opted in to tracking') +
        kpi('Consent rate', decided ? Math.round(t.accepts / decided * 100) + '%' : '—', num(t.accepts) + ' allowed · ' + num(t.rejects) + ' declined') +
        kpi('Leads', num(t.leads), '<a href="#leads">view leads →</a>') + '</div>'));
      view.appendChild(h('<div class="card" style="margin-top:14px"><h2>Daily page views</h2>' + chart(s.daily, s.days) + '</div>'));
      var cmdRows = s.commands.map(function (c) { return { k: c.k, n: c.n, status: c.status }; });
      view.appendChild(h('<div class="grid g-2" style="margin-top:14px">' +
        barList('Countries', s.countries, function (r) { return flag(r.k) + esc(r.k); }) +
        barList('Referrers', s.referrers) +
        barList('Pages', s.pages) +
        barList('Devices', s.devices) +
        barList('Theme chosen', s.themes) +
        barList('Project clicks', s.clicks, function (r) { return esc(r.k.replace(/^project:/, '')); }) +
        barList('CLI commands', cmdRows, function (r) { return '<span class="mono">' + esc(r.k) + '</span> ' + (r.status === 'unknown' ? '<span class="tag warn">unknown</span>' : ''); }) +
        barList('Downloads & outbound clicks', s.downloads.concat(s.outbound)) + '</div>'));
      view.appendChild(h('<div class="card" style="margin-top:14px"><h2>Where identified visitors are <span class="muted" style="font-weight:400">(city-level, opted-in only)</span></h2><div id="map"></div></div>'));
      drawMap(s.map);
    }).catch(fail);
  }

  function drawMap(points) {
    if (!window.L) { document.getElementById('map').innerHTML = '<div class="empty">Map library failed to load</div>'; return; }
    var m = L.map('map', { worldCopyJump: true, scrollWheelZoom: false }).setView([20, 20], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 10, attribution: '© OpenStreetMap' }).addTo(m);
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    points.forEach(function (p) {
      L.circleMarker([p.lat, p.lon], { radius: 5 + Math.min(10, p.score / 8), color: '#fff', weight: 2, fillColor: accent, fillOpacity: .9 })
        .bindTooltip(esc([p.city, p.country].filter(Boolean).join(', ')) + (p.org ? '<br>' + esc(p.org) : '') + '<br>score ' + p.score).addTo(m);
    });
  }

  /* ---------- visitors ---------- */
  function orgCell(v) {
    if (!v.org) return '<span class="faint">unknown</span>';
    return esc(v.org) + ' ' + (v.org_is_isp ? '<span class="tag">ISP</span>' : '<span class="tag acc">company</span>');
  }
  function visitors() {
    api('visitors').then(function (rows) {
      view.innerHTML = '<h1>Visitors <span class="muted" style="font-size:14px;font-weight:400">opted-in visitors, hottest first</span></h1>';
      if (!rows.length) { view.appendChild(h('<div class="card empty">No identified visitors yet. They appear here once someone clicks “Allow”.</div>')); return; }
      view.appendChild(h('<div class="card table-wrap"><table><thead><tr><th>Score</th><th>Company / network</th><th>Location</th><th>Visits</th><th>Pages</th><th>Source</th><th>Last seen</th></tr></thead><tbody>' +
        rows.map(function (v) {
          return '<tr class="click" data-id="' + esc(v.id) + '"><td><span class="score' + (v.score >= 25 ? ' hot' : '') + '">' + v.score + '</span></td><td>' + orgCell(v) +
            (v.leads ? ' <span class="tag ok">lead</span>' : '') + '</td><td>' + flag(v.country) + esc([v.city, v.country].filter(Boolean).join(', ')) + '</td><td>' + v.visits + '</td><td>' + v.pageviews +
            '</td><td>' + (v.link_label ? '<span class="tag acc">🔗 ' + esc(v.link_label) + '</span>' : esc(v.referrer || v.utm || 'direct')) + '</td><td>' + ago(v.last_seen) + '</td></tr>';
        }).join('') + '</tbody></table></div>'));
      view.querySelector('tbody').addEventListener('click', function (e) { var tr = e.target.closest('tr'); if (tr) location.hash = 'visitor=' + tr.getAttribute('data-id'); });
    }).catch(fail);
  }

  function visitor(id) {
    api('visitor', null, '&id=' + encodeURIComponent(id)).then(function (d) {
      var v = d.visitor;
      var sessions = {};
      d.events.slice().reverse().forEach(function (e) { var k = e.session_id || 'other'; (sessions[k] = sessions[k] || []).push(e); });
      var info = [
        ['Company / network', orgCell(v) + (v.org_domain ? ' <span class="muted">' + esc(v.org_domain) + '</span>' : '')],
        ['Location', flag(v.country) + esc([v.city, v.region, v.country].filter(Boolean).join(', '))],
        ['Device', esc([v.device, v.browser, v.os].filter(Boolean).join(' · '))],
        ['First came from', v.link_label ? '🔗 ' + esc(v.link_label) : esc(v.referrer || v.utm || 'direct')],
        ['Theme', esc(v.theme || '—')],
        ['First seen', when(v.first_seen)], ['Last seen', when(v.last_seen)],
        ['Visits / pages', v.visits + ' / ' + v.pageviews]
      ];
      view.innerHTML = '';
      view.appendChild(h('<h1><a href="#visitors" style="text-decoration:none">←</a> Visitor <span class="score' + (v.score >= 25 ? ' hot' : '') + '">' + v.score + '</span>' +
        '<span class="toolbar"><button class="btn sm danger" id="del">Delete all data</button></span></h1>'));
      view.appendChild(h('<div class="grid g-2"><div class="card"><h2>Profile</h2><table>' + info.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') + '</table>' +
        (d.leads.length ? '<h2 style="margin-top:16px">Messages</h2>' + d.leads.map(function (l) { return '<div class="lead"><div><b>' + esc(l.name) + '</b> · <a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a></div><div class="msg">' + esc(l.message) + '</div></div>'; }).join('') : '') +
        '</div><div class="card"><h2>Activity</h2>' + Object.keys(sessions).reverse().map(function (k) {
          var evs = sessions[k];
          return '<div class="session"><h3>' + when(evs[0].ts) + ' · ' + evs.length + ' events</h3>' + evs.map(function (e) {
            return '<div class="ev"><span class="t">' + new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span><span><b>' + esc(e.type) + '</b> ' +
              esc(e.name || e.path || '') + (e.value && e.type !== 'command' ? ' <span class="muted">' + esc(e.type === 'engage' ? e.value + 's active' : e.value) + '</span>' : '') +
              (e.value === 'unknown' ? ' <span class="tag warn">unknown</span>' : '') + '</span></div>';
          }).join('') + '</div>';
        }).join('') + '</div></div>'));
      view.querySelector('#del').addEventListener('click', function () {
        if (!confirm('Delete this visitor and all their events? (Use this for deletion requests.)')) return;
        api('visitor-delete', { id: v.id }).then(function () { toast('Deleted'); location.hash = 'visitors'; }).catch(fail);
      });
    }).catch(function (e) { view.innerHTML = '<div class="card empty">' + esc(e.message) + '</div>'; });
  }

  /* ---------- leads ---------- */
  function leads() {
    api('leads').then(function (rows) {
      view.innerHTML = '<h1>Leads</h1>';
      if (!rows.length) { view.appendChild(h('<div class="card empty">No messages yet. They arrive from the “Work with me” form and the CLI <span class="mono">hire</span> command.</div>')); return; }
      var wrap = h('<div class="grid"></div>');
      rows.forEach(function (l) {
        var card = h('<div class="card lead"><div class="row"><b>' + esc(l.name) + '</b>' + (l.company ? '<span class="muted">' + esc(l.company) + '</span>' : '') +
          '<a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a><span class="faint">' + when(l.ts) + '</span>' +
          '<span class="toolbar"><select class="st"><option>new</option><option>contacted</option><option>won</option><option>lost</option></select><button class="btn sm danger del">Delete</button></span></div>' +
          '<div class="msg">' + esc(l.message) + '</div>' +
          (l.visitor_id ? '<div class="muted">Tracked visitor: ' + esc(l.org || 'unknown network') + ' · ' + esc([l.city, l.country].filter(Boolean).join(', ')) + ' · score ' + l.score + ' · <a href="#visitor=' + esc(l.visitor_id) + '">see activity →</a></div>'
            : '<div class="faint">Visitor did not opt in to tracking</div>') + '</div>');
        var st = card.querySelector('.st'); st.value = l.status;
        st.addEventListener('change', function () { api('lead-status', { id: l.id, status: st.value }).then(function () { toast('Updated'); }).catch(fail); });
        card.querySelector('.del').addEventListener('click', function () {
          if (confirm('Delete this message permanently?')) api('lead-delete', { id: l.id }).then(function () { card.remove(); }).catch(fail);
        });
        wrap.appendChild(card);
      });
      view.appendChild(wrap);
    }).catch(fail);
  }

  /* ---------- tracked links ---------- */
  function links() {
    api('links').then(function (rows) {
      var base = location.origin + '/';
      view.innerHTML = '<h1>Tracked links</h1>';
      var form = h('<form class="card" style="margin-bottom:14px"><h2>Create a personal link</h2><p class="muted" style="margin-top:0">Send it to one person or company. You get an email when it’s opened, and their visit is labelled with this name. The greeting shows on the site.</p>' +
        '<div class="fields"><div class="field"><label>Label (who it’s for)</label><input name="label" placeholder="Jane @ Acme" required></div>' +
        '<div class="field"><label>Greeting shown on the site (optional)</label><input name="greeting" placeholder="Hi Jane 👋 thanks for stopping by"></div>' +
        '<div class="field"><label>Custom slug (optional)</label><input name="slug" placeholder="acme"></div>' +
        '<div class="field"><label>Private note (optional)</label><input name="note" placeholder="Met at DevFest"></div></div>' +
        '<div style="margin-top:12px"><button class="btn primary">Create link</button></div></form>');
      form.addEventListener('submit', function (e) {
        e.preventDefault(); var f = form.elements;
        api('link-create', { label: f.label.value, greeting: f.greeting.value, slug: f.slug.value, note: f.note.value }).then(function (l) {
          copy(base + '?via=' + l.slug); links();
        }).catch(fail);
      });
      view.appendChild(form);
      if (!rows.length) { view.appendChild(h('<div class="card empty">No links yet.</div>')); return; }
      var table = h('<div class="card table-wrap"><table><thead><tr><th>For</th><th>Link</th><th>Opens</th><th>Opted-in visitors</th><th>Last opened</th><th></th></tr></thead><tbody>' + rows.map(function (l) {
        var u = base + '?via=' + l.slug;
        return '<tr><td><b>' + esc(l.label) + '</b>' + (l.note ? '<div class="faint">' + esc(l.note) + '</div>' : '') + (l.greeting ? '<div class="muted">“' + esc(l.greeting) + '”</div>' : '') + '</td>' +
          '<td class="mono">' + esc(u) + '</td><td>' + (l.opens ? '<span class="tag ok">' + l.opens + '</span>' : '<span class="faint">not yet</span>') + '</td><td>' + l.visitors + '</td>' +
          '<td>' + (l.last_open ? ago(l.last_open) : '—') + '</td><td class="row"><button class="btn sm" data-copy="' + esc(u) + '">Copy</button><button class="btn sm danger" data-del="' + esc(l.slug) + '">Delete</button></td></tr>';
      }).join('') + '</tbody></table></div>');
      table.addEventListener('click', function (e) {
        var c = e.target.getAttribute('data-copy'), d = e.target.getAttribute('data-del');
        if (c) copy(c);
        if (d && confirm('Delete this link? Past visits stay recorded.')) api('link-delete', { slug: d }).then(links).catch(fail);
      });
      view.appendChild(table);
    }).catch(fail);
  }
  function copy(text) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Link copied'); }, function () { prompt('Copy this link:', text); }); }

  /* ---------- content (CMS) ---------- */
  function markDirty() { state.dirty = true; var s = document.getElementById('saveState'); if (s) s.textContent = 'Unsaved changes'; }

  function rich(obj, key) {
    var wrap = h('<div class="rte"><div class="rte-bar">' +
      '<button type="button" data-c="bold" title="Bold (Ctrl+B)"><b>B</b></button><button type="button" data-c="italic" title="Italic (Ctrl+I)"><i>I</i></button>' +
      '<button type="button" data-c="underline" title="Underline"><u>U</u></button><button type="button" data-c="link" title="Add link">🔗</button>' +
      '<button type="button" data-c="unlink" title="Remove link">⛓️‍💥</button><button type="button" data-c="removeFormat" title="Clear formatting">✕</button></div>' +
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
        upload(fl).then(function (u) { obj[key] = inp.value = u; sync(); markDirty(); toast('Uploaded — remember to save'); }).catch(fail);
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
          '<button type="button" class="btn sm" data-a="up" title="Move up">↑</button><button type="button" class="btn sm" data-a="down" title="Move down">↓</button>' +
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

  function section(title, note, body) {
    var s = h('<div class="card sec"><h2>' + esc(title) + (note ? ' <span class="muted" style="font-weight:400">' + esc(note) + '</span>' : '') + '</h2></div>');
    s.appendChild(body);
    return s;
  }

  function content() {
    api('content').then(function (c) {
      delete c.updatedAt;
      state.content = c; state.dirty = false;
      c.cli = c.cli || { about: '', commands: [] };
      view.innerHTML = '<h1>Content <span class="muted" style="font-size:14px;font-weight:400">changes go live within ~30 seconds of saving</span></h1>';

      view.appendChild(section('Profile & contact', '', fieldsBox(c.profile, [
        ['name', 'Name'], ['role', 'Role / title'], ['location', 'Location'], ['status', 'Status line', null, 'e.g. “Available for work”; leave empty to hide'],
        ['email', 'Email'], ['phone', 'Phone (CLI contact)'], ['avatar', 'Profile picture', 'image'], ['resume', 'Résumé PDF', 'file', 'Adds a résumé link + the CLI “resume” command']
      ])));

      var skills = { text: (c.skills || []).join(', ') };
      var sk = field(skills, 'text', 'Skills (comma separated)', 'wide');
      sk.querySelector('input').addEventListener('input', function () { c.skills = skills.text.split(',').map(function (s) { return s.trim(); }).filter(Boolean); });
      view.appendChild(section('Social links', '', listEditor(c.socials, [['label', 'Label'], ['url', 'URL']], function (s) { return s.label; }, { label: '', url: 'https://' }, 'Add social link')));
      view.appendChild(section('Skills', '', sk));

      var intro = h('<div class="fields"></div>');
      intro.appendChild(field(c.hero, 'lead', 'Opening paragraph (modern site)', 'rich'));
      intro.appendChild(field(c.about, 'quote', 'About — large quote (italic = accent colour)', 'rich'));
      intro.appendChild(field(c.about, 'p1', 'About — column 1', 'rich'));
      intro.appendChild(field(c.about, 'p2', 'About — column 2', 'rich'));
      view.appendChild(section('Intro & about', 'modern site', intro));

      view.appendChild(section('History / timeline', 'oldest first', listEditor(c.timeline, [
        ['period', 'Period', null, 'e.g. FEB 2024 — NOW'], ['role', 'Role'], ['company', 'Company'], ['badge', 'Badge', null, 'e.g. Current, Freelance'],
        ['current', 'Current job (highlighted)', 'check'], ['description', 'Description', 'rich'], ['stack', 'Stack (one line per row)', 'textarea']
      ], function (t) { return t.role + (t.company ? ' · ' + t.company : ''); },
        { period: '', role: '', company: '', badge: '', current: false, description: '', stack: '' }, 'Add chapter')));

      view.appendChild(section('Projects / work', '', listEditor(c.projects, [
        ['name', 'Name'], ['category', 'Category', null, 'e.g. Fintech · .NET'], ['stack', 'Stack (CLI)'], ['url', 'Link (optional)'],
        ['image', 'Logo / image', 'image'], ['summary', 'One-liner (CLI)', 'rich'], ['description', 'Description (modern site)', 'rich']
      ], function (p) { return p.name; }, { name: '', category: '', stack: '', url: '', image: '', summary: '', description: '' }, 'Add project')));

      var cli = h('<div></div>');
      cli.appendChild(fieldsBox(c.cli, [['about', '“about” command output', 'rich']]));
      cli.appendChild(h('<h2 style="margin-top:16px">Custom commands <span class="muted" style="font-weight:400">shown in “help”</span></h2>'));
      cli.appendChild(listEditor(c.cli.commands, [['name', 'Command (lowercase, no spaces)'], ['description', 'Help text'], ['output', 'Output', 'rich']],
        function (k) { return k.name; }, { name: '', description: '', output: '' }, 'Add command'));
      view.appendChild(section('CLI terminal', 'skills, projects, experience & contact come from the sections above', cli));

      var bar = h('<div class="savebar"><span class="muted" id="saveState"></span><button class="btn primary" type="button">Save changes</button></div>');
      bar.querySelector('button').addEventListener('click', function () {
        var b = this; b.disabled = true;
        api('content', { content: state.content }).then(function () { state.dirty = false; toast('Saved — live in ~30s'); content(); })
          .catch(fail).then(function () { b.disabled = false; });
      });
      view.appendChild(bar);
    }).catch(fail);
  }

  /* ---------- boot ---------- */
  api('me').then(showApp).catch(function () { showLogin(); });
})();
