/* "Work with me" modal. MMLead.open() from anywhere; themed with the same --mmc-* variables as the consent banner. */
(function () {
  var css = '.mml-back{position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:16px;animation:mml-in .25s ease}' +
    '@keyframes mml-in{from{opacity:0}}' +
    '.mml{width:min(480px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--mmc-bg,#161412);color:var(--mmc-fg,#EFE9DE);border:1px solid var(--mmc-line,#3a332c);' +
    'border-radius:var(--mmc-radius,12px);padding:22px;font:14px/1.5 var(--mmc-font,system-ui,sans-serif);box-shadow:0 30px 80px rgba(0,0,0,.5)}' +
    '.mml h2{font-size:20px;font-weight:600;margin:0 0 4px}.mml .sub{opacity:.7;margin:0 0 16px}' +
    '.mml label{display:block;font-size:12px;letter-spacing:.04em;opacity:.75;margin:12px 0 5px}' +
    '.mml input,.mml textarea{width:100%;font:inherit;color:inherit;background:transparent;border:1px solid var(--mmc-line,#3a332c);border-radius:calc(var(--mmc-radius,12px) - 4px);padding:9px 11px}' +
    '.mml input:focus,.mml textarea:focus{outline:none;border-color:var(--mmc-accent,#E8862E)}.mml textarea{min-height:110px;resize:vertical}' +
    '.mml .agree{display:flex;gap:9px;align-items:flex-start;font-size:12.5px;opacity:.85;margin:14px 0 0;letter-spacing:0}.mml .agree input{width:auto;margin-top:3px}' +
    '.mml a{color:var(--mmc-accent,#E8862E)}.mml .hp{position:absolute;left:-9999px}' +
    '.mml .row{display:flex;gap:8px;margin-top:18px}.mml button{flex:1;font:inherit;padding:10px 12px;border-radius:calc(var(--mmc-radius,12px) - 4px);border:1px solid var(--mmc-line,#3a332c);background:transparent;color:inherit;cursor:pointer}' +
    '.mml button.primary{background:var(--mmc-accent,#E8862E);border-color:var(--mmc-accent,#E8862E);color:var(--mmc-bg,#161412);font-weight:600}' +
    '.mml .msg{margin-top:12px;font-size:13px}.mml .msg.err{color:#ff6b5b}';

  function open() {
    if (!document.getElementById('mml-css')) { var st = document.createElement('style'); st.id = 'mml-css'; st.textContent = css; document.head.appendChild(st); }
    var back = document.createElement('div'); back.className = 'mml-back';
    back.innerHTML = '<form class="mml" role="dialog" aria-modal="true" aria-labelledby="mml-t" novalidate>' +
      '<h2 id="mml-t">Work with me</h2><p class="sub">Tell me a little about the project and I\'ll get back to you within a couple of days.</p>' +
      '<label for="mml-name">Name</label><input id="mml-name" name="name" required maxlength="100" autocomplete="name">' +
      '<label for="mml-email">Email</label><input id="mml-email" name="email" type="email" required maxlength="200" autocomplete="email">' +
      '<label for="mml-co">Company <span style="opacity:.6">(optional)</span></label><input id="mml-co" name="company" maxlength="120" autocomplete="organization">' +
      '<label for="mml-msg">Message</label><textarea id="mml-msg" name="message" required maxlength="3000"></textarea>' +
      '<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<label class="agree"><input type="checkbox" name="agree"> <span>I agree that Manil stores this message and my contact details to reply to me. See the <a href="/privacy" target="_blank">privacy notice</a>.</span></label>' +
      '<div class="msg" aria-live="polite"></div>' +
      '<div class="row"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Send</button></div></form>';
    var form = back.querySelector('form'), msg = back.querySelector('.msg');
    function close() { back.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', function (e) { if (e.target === back || e.target.hasAttribute('data-close')) close(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements, btn = form.querySelector('.primary');
      var body = { name: f.name.value, email: f.email.value, company: f.company.value, message: f.message.value, website: f.website.value, agree: f.agree.checked,
        vid: window.MMTrack && MMTrack.visitorId() };
      btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Sending…';
      fetch('/api/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d.error || 'Something went wrong.');
          form.innerHTML = '<h2>Thank you!</h2><p class="sub">Your message is in. I\'ll reply to you soon.</p><div class="row"><button type="button" data-close>Close</button></div>';
        })
        .catch(function (err) { msg.className = 'msg err'; msg.textContent = err.message || 'Could not send. Please email me directly.'; btn.disabled = false; });
    });
    document.body.appendChild(back);
    form.elements.name.focus();
  }

  window.MMLead = { open: open };
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-lead]');
    if (el) { e.preventDefault(); open(); }
  });
})();
