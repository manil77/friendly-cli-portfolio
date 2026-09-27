/* Consent + first-party tracking.
   Before a choice (or after "Decline", or with Global Privacy Control on): anonymous counts only, nothing stored in the browser.
   After "Allow": a random visitor id in localStorage links visits so leads can be followed up.
   Theme the consent UI per page with --mmc-bg / --mmc-fg / --mmc-accent / --mmc-font / --mmc-serif / --mmc-label. */
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
    openSettings: function () { prefs(); }
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

  /* ---- consent UI: a compact card on first visit, the full preferences panel from "Cookie settings" ---- */
  var BG = 'var(--mmc-bg,#161412)', FG = 'var(--mmc-fg,#EFE9DE)', AC = 'var(--mmc-accent,#E8862E)';
  var FONT = 'var(--mmc-font,system-ui,sans-serif)', SERIF = 'var(--mmc-serif,"Sentient",Georgia,serif)', LABEL = 'var(--mmc-label,ui-monospace,monospace)';
  var HAIR = 'color-mix(in srgb,' + FG + ' 13%,transparent)', EASE = 'cubic-bezier(.16,1,.3,1)';
  var css = `
    .mmc{position:relative;overflow:hidden;color:${FG};font:14px/1.62 ${FONT};
      background:color-mix(in srgb,${BG} 90%,transparent);-webkit-backdrop-filter:blur(20px) saturate(150%);backdrop-filter:blur(20px) saturate(150%);
      border:1px solid ${HAIR};border-radius:22px;padding:28px 28px 22px;
      box-shadow:inset 0 1px 0 color-mix(in srgb,${FG} 7%,transparent),0 40px 90px -24px rgba(0,0,0,.65),0 10px 30px -12px rgba(0,0,0,.45);
      animation:mmc-in .9s ${EASE} both}
    .mmc::before{content:"";position:absolute;left:28px;right:28px;top:0;height:1px;background:linear-gradient(90deg,transparent,${AC},transparent);opacity:.8}
    @keyframes mmc-in{from{opacity:0;transform:translateY(18px) scale(.985);filter:blur(8px)}}
    @keyframes mmc-fade{from{opacity:0}}
    .mmc-card{position:fixed;z-index:10000;left:24px;bottom:24px;width:min(440px,calc(100vw - 24px))}
    .mmc-head{display:flex;align-items:center;gap:16px;margin-bottom:16px}
    .mmc-seal{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:${AC};font:italic 400 21px/1 ${SERIF};
      border:1px solid color-mix(in srgb,${AC} 55%,transparent);box-shadow:0 0 0 5px color-mix(in srgb,${AC} 9%,transparent)}
    .mmc-kicker{display:block;font:400 10.5px/1 ${LABEL};letter-spacing:.24em;text-transform:uppercase;opacity:.55;margin-bottom:7px}
    .mmc-title{font:400 23px/1.12 ${SERIF};letter-spacing:-.012em;margin:0}
    .mmc-title em{font-style:italic;color:${AC}}
    .mmc p{margin:0 0 20px;opacity:.74}
    .mmc-row{display:grid;grid-template-columns:repeat(var(--n,2),1fr);gap:10px}
    .mmc-btn{font:400 10.5px/1 ${LABEL};letter-spacing:.2em;text-transform:uppercase;padding:15px 12px;border-radius:999px;cursor:pointer;
      border:1px solid color-mix(in srgb,${FG} 24%,transparent);background:transparent;color:inherit;transition:background .4s,color .4s,border-color .4s}
    .mmc-btn:hover,.mmc-btn:focus-visible{background:${FG};color:${BG};border-color:${FG};outline:none}
    .mmc-links{display:flex;justify-content:space-between;gap:12px;margin-top:16px;font-size:12.5px}
    .mmc-link{background:none;border:0;padding:0;font:inherit;color:inherit;opacity:.6;cursor:pointer;text-decoration:underline;text-underline-offset:4px;
      text-decoration-color:color-mix(in srgb,${FG} 35%,transparent);transition:opacity .3s,color .3s}
    .mmc-link:hover,.mmc-link:focus-visible{opacity:1;color:${AC};outline:none}
    .mmc-back{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.5);
      -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);animation:mmc-fade .5s ease both}
    .mmc-panel{width:min(540px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:32px 32px 24px}
    .mmc-x{position:absolute;top:18px;right:18px;width:34px;height:34px;border-radius:50%;border:1px solid ${HAIR};background:none;color:inherit;
      cursor:pointer;font:300 18px/1 ${FONT};opacity:.7;transition:.3s}
    .mmc-x:hover,.mmc-x:focus-visible{opacity:1;border-color:${AC};color:${AC};outline:none}
    .mmc-opts{margin:4px 0 24px}
    .mmc-opt{display:flex;gap:18px;align-items:flex-start;padding:18px 0;border-top:1px solid ${HAIR}}
    .mmc-opt:last-child{border-bottom:1px solid ${HAIR}}
    .mmc-opt > div{flex:1}
    .mmc-opt h3{font:400 17px/1.3 ${SERIF};margin:0 0 4px}
    .mmc-opt p{margin:0;font-size:13px;opacity:.66}
    .mmc-on{flex:none;font:400 9.5px/1 ${LABEL};letter-spacing:.2em;text-transform:uppercase;opacity:.5;padding-top:7px;white-space:nowrap}
    .mmc-sw{flex:none;position:relative;width:48px;height:28px;margin-top:1px}
    .mmc-sw input{position:absolute;inset:0;margin:0;opacity:0;cursor:pointer;z-index:1}
    .mmc-sw span{position:absolute;inset:0;border-radius:999px;border:1px solid color-mix(in srgb,${FG} 28%,transparent);transition:background .45s,border-color .45s}
    .mmc-sw span::after{content:"";position:absolute;top:4px;left:4px;width:18px;height:18px;border-radius:50%;background:${FG};opacity:.5;
      transition:transform .5s ${EASE},opacity .4s,background .4s}
    .mmc-sw input:checked + span{background:${AC};border-color:${AC}}
    .mmc-sw input:checked + span::after{transform:translateX(20px);opacity:1;background:${BG}}
    .mmc-sw input:focus-visible + span{outline:1px solid ${AC};outline-offset:4px}
    .mmc-sw input:disabled{cursor:not-allowed} .mmc-sw input:disabled + span{opacity:.4}
    .mmc-note{font-size:12.5px;opacity:.7;margin:-8px 0 20px}
    @media(max-width:560px){.mmc-card{left:12px;right:12px;bottom:12px;width:auto}.mmc{padding:24px 20px 18px}.mmc-panel .mmc-row{--n:1!important}}
    @media(prefers-reduced-motion:reduce){.mmc,.mmc-back{animation:none}}`;

  function styles() {
    if (document.getElementById('mmc-css')) return;
    var st = document.createElement('style'); st.id = 'mmc-css'; st.textContent = css; document.head.appendChild(st);
  }
  function onEsc(e) { if (e.key === 'Escape') { close(); if (!choice()) banner(); } }
  function close() {
    ['mmc', 'mmc-prefs'].forEach(function (id) { var n = document.getElementById(id); if (n) n.remove(); });
    document.removeEventListener('keydown', onEsc);
  }
  function head(kicker, title, id) {
    return '<div class="mmc-head"><span class="mmc-seal" aria-hidden="true">M</span><div><span class="mmc-kicker">' + kicker + '</span>' +
      '<h2 class="mmc-title"' + (id ? ' id="' + id + '"' : '') + '>' + title + '</h2></div></div>';
  }

  function banner() {
    if (choice() || gpc) return;
    styles(); close();
    var box = document.createElement('div');
    box.className = 'mmc mmc-card'; box.id = 'mmc';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-labelledby', 'mmc-bt');
    box.innerHTML = head('Privacy', 'A small <em>request.</em>', 'mmc-bt') +
      '<p>Anonymous, cookie-free counts are always on. May I also remember your visit, including your city, company network and the work you view, so I can follow up on opportunities? It is never sold or shared.</p>' +
      '<div class="mmc-row"><button type="button" class="mmc-btn" data-v="0">Decline</button><button type="button" class="mmc-btn" data-v="1">Allow</button></div>' +
      '<div class="mmc-links"><button type="button" class="mmc-link" data-prefs>Customize</button><a class="mmc-link" href="/privacy">Privacy notice</a></div>';
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-prefs]')) { prefs(); return; }
      var b = e.target.closest('[data-v]'); if (!b) return;
      decide(b.getAttribute('data-v') === '1'); close();
    });
    document.body.appendChild(box);
  }

  function prefs() {
    styles(); close();
    var back = document.createElement('div');
    back.className = 'mmc-back'; back.id = 'mmc-prefs';
    back.innerHTML = '<div class="mmc mmc-panel" role="dialog" aria-modal="true" aria-labelledby="mmc-pt">' +
      '<button type="button" class="mmc-x" data-close aria-label="Close">×</button>' +
      head('Privacy preferences', 'Your visit, <em>your terms.</em>', 'mmc-pt') +
      '<p>Choose what this site may remember. You can change this at any time from “Cookie settings”.</p>' +
      '<div class="mmc-opts">' +
        '<div class="mmc-opt"><div><h3>Essential</h3><p>Remembers the choice you make here, and nothing else.</p></div><span class="mmc-on">Always on</span></div>' +
        '<div class="mmc-opt"><div><h3>Anonymous statistics</h3><p>Cookie-free page counts: country, device and referring site. Your IP address is never stored.</p></div><span class="mmc-on">Always on</span></div>' +
        '<div class="mmc-opt"><div><h3>Visit insights</h3><p>Your approximate city, the company network you browse from and the pages you view, linked across visits. Used only to follow up on work opportunities.</p></div>' +
          '<label class="mmc-sw"><input type="checkbox" aria-label="Allow visit insights"' + (granted() ? ' checked' : '') + (gpc ? ' disabled' : '') + '><span></span></label></div>' +
      '</div>' +
      (gpc ? '<p class="mmc-note">Your browser sends Global Privacy Control, so visit insights stay off.</p>' : '') +
      '<div class="mmc-row" style="--n:3"><button type="button" class="mmc-btn" data-v="0">Decline all</button>' +
        '<button type="button" class="mmc-btn" data-save>Save choices</button><button type="button" class="mmc-btn" data-v="1">Allow all</button></div>' +
      '<div class="mmc-links"><a class="mmc-link" href="/privacy">Read the privacy notice</a></div></div>';
    var sw = back.querySelector('input');
    back.addEventListener('click', function (e) {
      if (e.target === back || e.target.closest('[data-close]')) { close(); if (!choice()) banner(); return; }
      if (e.target.closest('[data-save]')) { decide(sw.checked); close(); return; }
      var b = e.target.closest('[data-v]'); if (!b) return;
      decide(b.getAttribute('data-v') === '1'); close();
    });
    document.addEventListener('keydown', onEsc);
    document.body.appendChild(back);
    (gpc ? back.querySelector('[data-close]') : sw).focus();
  }

  function decide(allow) {
    var prev = choice(), was = granted(), oldVid = ls.get('localStorage', VID);
    if (gpc) allow = false;
    ls.set('localStorage', KEY, JSON.stringify({ analytics: allow, ts: new Date().toISOString(), v: 1 }));
    if (allow && !was) send('consent', { r: document.referrer || undefined, utm: utm || undefined });
    if (!allow) {
      if (was && oldVid) send('withdraw', { vid: oldVid, c: 0 }, true);
      else if (!prev) send('choice', { n: 'reject' }, true);
      ls.del('localStorage', VID); ls.del('sessionStorage', SID); ls.del('sessionStorage', VIA);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', banner);
  else banner();
})();
