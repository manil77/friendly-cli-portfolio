/* Consent + first-party tracking.
   Before a choice (or after "No thanks", or with Global Privacy Control on): anonymous counts only, nothing stored in the browser.
   After "Allow": a random visitor id in localStorage links visits so leads can be followed up.
   Theme the banner per page with --mmc-bg / --mmc-fg / --mmc-line / --mmc-accent / --mmc-font / --mmc-radius. */
(function () {
  var API = '/api/collect', KEY = 'mm_consent', VID = 'mm_vid', SID = 'mm_sid', VIA = 'mm_via';
  var gpc = navigator.globalPrivacyControl === true;
  var params = new URLSearchParams(location.search);
  var landVia = params.get('via');
  var utm = ['utm_source', 'utm_medium', 'utm_campaign'].map(function (k) { return params.get(k); }).filter(Boolean).join(' / ') || null;
  var ls = {
    get: function (s, k) { try { return window[s].getItem(k); } catch (e) { return null; } },
    set: function (s, k, v) { try { window[s].setItem(k, v); } catch (e) {} },
    del: function (s, k) { try { window[s].removeItem(k); } catch (e) {} }
  };

  function choice() { try { return JSON.parse(ls.get('localStorage', KEY)); } catch (e) { return null; } }
  function granted() { var c = choice(); return !gpc && !!c && c.analytics === true; }
  function rid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 36); }

  function ids() {
    if (!granted()) return {};
    var vid = ls.get('localStorage', VID);
    if (!vid) { vid = 'v-' + rid(); ls.set('localStorage', VID, vid); }
    var raw = ls.get('sessionStorage', SID), now = Date.now(), s = raw ? raw.split('|') : null;
    var sid = s && now - +s[1] < 30 * 60 * 1000 ? s[0] : 's-' + rid();
    ls.set('sessionStorage', SID, sid + '|' + now);
    if (landVia) ls.set('sessionStorage', VIA, landVia);
    return { c: 1, vid: vid, sid: sid, via: landVia || ls.get('sessionStorage', VIA) || undefined };
  }

  function send(t, extra, beacon) {
    var body = Object.assign({ t: t, p: location.pathname }, ids(), extra || {});
    if (!body.via && landVia) body.via = landVia;
    var data = JSON.stringify(body);
    if (beacon && navigator.sendBeacon) { navigator.sendBeacon(API, new Blob([data], { type: 'text/plain' })); return Promise.resolve({}); }
    return fetch(API, { method: 'POST', body: data, keepalive: true, headers: { 'content-type': 'text/plain' } })
      .then(function (r) { return r.json(); }).catch(function () { return {}; });
  }

  var api = window.MMTrack = {
    hasConsent: granted,
    visitorId: function () { return granted() ? ls.get('localStorage', VID) : null; },
    track: function (type, name, value) { send(type, { n: name, v: value == null ? undefined : String(value) }, true); },
    openSettings: function () { banner(true); }
  };

  /* ---- page view (+ tracked-link greeting) ---- */
  send('pageview', { r: document.referrer || undefined, utm: utm || undefined, land: landVia ? 1 : undefined }).then(function (res) {
    if (res && res.greeting) {
      api.greeting = res.greeting;
      document.dispatchEvent(new CustomEvent('mm:greeting', { detail: res.greeting }));
    }
  });

  /* ---- engagement (consented only): active seconds on page ---- */
  var active = 0, last = Date.now(), visible = !document.hidden;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (visible) active += (Date.now() - last) / 1000;
      visible = false;
      if (granted() && active >= 5) { send('engage', { v: String(Math.round(active)) }, true); active = 0; }
    } else { visible = true; last = Date.now(); }
  });

  /* ---- declarative click tracking: data-track="name", outbound links, downloads ---- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a,[data-track],[data-privacy-settings]');
    if (!el) return;
    if (el.hasAttribute('data-privacy-settings')) { e.preventDefault(); api.openSettings(); return; }
    if (el.hasAttribute('data-track')) { api.track(el.getAttribute('data-track-type') || 'click', el.getAttribute('data-track')); return; }
    var href = el.getAttribute('href') || '';
    if (/^mailto:/i.test(href)) api.track('outbound', 'email');
    else if (/^https?:/i.test(href) && el.host !== location.host) api.track('outbound', el.hostname.replace(/^www\./, ''));
  });

  /* ---- banner ---- */
  var css = '.mmc{position:fixed;left:16px;bottom:16px;z-index:10000;width:min(400px,calc(100vw - 32px));background:var(--mmc-bg,#161412);color:var(--mmc-fg,#EFE9DE);' +
    'border:1px solid var(--mmc-line,#3a332c);border-radius:var(--mmc-radius,12px);padding:16px 18px;font:14px/1.55 var(--mmc-font,system-ui,sans-serif);box-shadow:0 20px 50px rgba(0,0,0,.35);animation:mmc-in .4s cubic-bezier(.16,1,.3,1)}' +
    '@keyframes mmc-in{from{opacity:0;transform:translateY(10px)}}' +
    '.mmc h2{font:inherit;font-weight:600;margin:0 0 6px}.mmc p{margin:0 0 12px;opacity:.85}.mmc a{color:var(--mmc-accent,#E8862E);text-decoration:underline}' +
    '.mmc .mmc-row{display:flex;gap:8px}.mmc button{flex:1;font:inherit;padding:9px 12px;border-radius:calc(var(--mmc-radius,12px) - 4px);border:1px solid var(--mmc-line,#3a332c);' +
    'background:transparent;color:inherit;cursor:pointer}.mmc button:hover,.mmc button:focus-visible{border-color:var(--mmc-accent,#E8862E);outline:none}' +
    '.mmc .mmc-note{font-size:12px;opacity:.7;margin:10px 0 0}';

  function banner(force) {
    var old = document.getElementById('mmc'); if (old) old.remove();
    if (!force && (choice() || gpc)) return;
    if (!document.getElementById('mmc-css')) { var st = document.createElement('style'); st.id = 'mmc-css'; st.textContent = css; document.head.appendChild(st); }
    var c = choice();
    var box = document.createElement('div');
    box.className = 'mmc'; box.id = 'mmc'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Privacy choices');
    box.innerHTML = '<h2>Can I remember your visit?</h2>' +
      '<p>Anonymous, cookie-free counts are always on. If you allow it, I\'ll also remember this visit: your approximate city, the company network you browse from, and the pages you view. I use it only to follow up on work opportunities. It\'s never sold or shared. <a href="/privacy">Details</a></p>' +
      '<div class="mmc-row"><button type="button" data-v="0">No thanks</button><button type="button" data-v="1">Allow</button></div>' +
      (gpc ? '<p class="mmc-note">Your browser sends Global Privacy Control, so tracking stays off.</p>' : '') +
      (c ? '<p class="mmc-note">Current choice: ' + (c.analytics ? 'allowed' : 'not allowed') + '.</p>' : '');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      decide(b.getAttribute('data-v') === '1'); box.remove();
    });
    document.body.appendChild(box);
  }

  function decide(allow) {
    var was = granted(), oldVid = ls.get('localStorage', VID);
    if (gpc) allow = false;
    ls.set('localStorage', KEY, JSON.stringify({ analytics: allow, ts: new Date().toISOString(), v: 1 }));
    if (allow && !was) send('consent', { r: document.referrer || undefined, utm: utm || undefined });
    if (!allow) {
      if (was && oldVid) send('withdraw', { vid: oldVid, c: 0 }, true);
      else send('choice', { n: 'reject' }, true);
      ls.del('localStorage', VID); ls.del('sessionStorage', SID); ls.del('sessionStorage', VIA);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { banner(false); });
  else banner(false);
})();
