/* STUDIO — horizontal experience engine
   flow field · sideways scroll · panel reveals · cursor · hover-image */
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(pointer:fine)').matches;
  var lerp = function (a, b, n) { return a + (b - a) * n; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  /* ---- custom cursor ---- */
  function cursor() {
    if (!fine) return;
    document.documentElement.classList.add('has-cursor');
    var ring = document.createElement('div'); ring.className = 'cur';
    document.body.appendChild(ring);
    var x = innerWidth/2, y = innerHeight/2, rx = x, ry = y;
    addEventListener('mousemove', function (e){ x = e.clientX; y = e.clientY; });
    (function loop(){ rx = lerp(rx,x,.2); ry = lerp(ry,y,.2);
      ring.style.transform = 'translate('+rx+'px,'+ry+'px) translate(-50%,-50%)'; requestAnimationFrame(loop); })();
    var sel = 'a,button,[data-img],[data-cursor]';
    addEventListener('mouseover', function(e){ if(e.target.closest(sel)) ring.classList.add('on'); });
    addEventListener('mouseout', function(e){ var t=e.target.closest(sel);
      if(t && (!e.relatedTarget||!e.relatedTarget.closest||!e.relatedTarget.closest(sel))) ring.classList.remove('on'); });
  }

  /* ---- work hover image ---- */
  function hoverImg() {
    if (!fine) return;
    var rows = document.querySelectorAll('[data-img]'); if(!rows.length) return;
    var box = document.createElement('div'); box.className='hoverimg';
    box.innerHTML = '<div class="hi-inner"><img alt=""></div>';
    document.body.appendChild(box);
    var img = box.querySelector('img');
    var tx=0,ty=0,cx=0,cy=0,on=false;
    rows.forEach(function(row){
      row.addEventListener('mouseenter', function(){ img.src=row.getAttribute('data-img'); box.classList.add('show'); on=true; });
      row.addEventListener('mouseleave', function(){ box.classList.remove('show'); on=false; });
    });
    addEventListener('mousemove', function(e){ tx=e.clientX; ty=e.clientY; });
    (function loop(){ cx=lerp(cx,tx,.1); cy=lerp(cy,ty,.1);
      if(on) box.style.transform='translate('+cx+'px,'+cy+'px) translate(-50%,-50%)'; requestAnimationFrame(loop); })();
  }

  /* ---- flow field ---- */
  function flow() {
    var c = document.querySelector('.topo'); if (!c) return;
    var ctx = c.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W, H, seeds = [];
    var ink = '26,23,20', acc = '210,80,42';
    function readPalette(){
      var cs = getComputedStyle(document.documentElement);
      var i = cs.getPropertyValue('--ink-rgb').trim(), a = cs.getPropertyValue('--accent-rgb').trim();
      if (i) ink = i; if (a) acc = a;
    }
    readPalette();
    window.addEventListener('palettechange', readPalette);
    function hash(x, y){ var n = x*374761393 + y*668265263; n = (n ^ (n>>13))*1274126177;
      return ((n ^ (n>>16)) >>> 0) / 4294967295; }
    function sm(t){ return t*t*(3-2*t); }
    function noise(x, y){
      var xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
      var tl=hash(xi,yi), tr=hash(xi+1,yi), bl=hash(xi,yi+1), br=hash(xi+1,yi+1);
      var u=sm(xf), v=sm(yf);
      return (tl*(1-u)+tr*u)*(1-v) + (bl*(1-u)+br*u)*v;
    }
    var SCALE=0.0016, TAU=Math.PI*2;
    function angle(x,y,t){ return (noise(x*SCALE+t*0.06,y*SCALE)*0.65 + noise(x*SCALE*2.3,y*SCALE*2.3-t*0.04)*0.35)*TAU*2.2; }
    function build(){
      W=innerWidth; H=innerHeight; c.width=W*dpr; c.height=H*dpr; c.style.width=W+'px'; c.style.height=H+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0); seeds=[];
      var sp=Math.max(34,Math.round(Math.sqrt(W*H/300)));
      for(var y=-sp;y<H+sp;y+=sp) for(var x=-sp;x<W+sp;x+=sp)
        seeds.push({x:x+(hash(x,y)-0.5)*sp, y:y+(hash(y,x)-0.5)*sp, ember:hash(x*7,y*7)>0.88, phase:hash(x*3,y*5)*200});
    }
    build(); addEventListener('resize', build);
    var mx=0,my=0,px=0,py=0;
    addEventListener('mousemove', function(e){ mx=(e.clientX/W-0.5); my=(e.clientY/H-0.5); });
    var t=0, fp=0, STEPS=36, LEN=7;
    function draw(){
      ctx.clearRect(0,0,W,H); ctx.lineCap='round';
      px=lerp(px,mx,0.05); py=lerp(py,my,0.05);
      ctx.save(); ctx.translate(px*26,py*26);
      for(var i=0;i<seeds.length;i++){
        var s=seeds[i], x=s.x, y=s.y;
        ctx.beginPath(); ctx.moveTo(x,y);
        for(var k=0;k<STEPS;k++){ var a=angle(x,y,t); x+=Math.cos(a)*LEN; y+=Math.sin(a)*LEN; ctx.lineTo(x,y); }
        ctx.setLineDash([]);
        if(s.ember){ ctx.strokeStyle='rgba('+acc+',0.09)'; ctx.lineWidth=1.1; }
        else { ctx.strokeStyle='rgba('+ink+',0.045)'; ctx.lineWidth=1; }
        ctx.stroke();
        ctx.setLineDash([3,74]); ctx.lineDashOffset=-(fp+s.phase);
        if(s.ember){ ctx.strokeStyle='rgba('+acc+',0.34)'; ctx.lineWidth=1.6; }
        else { ctx.strokeStyle='rgba('+ink+',0.16)'; ctx.lineWidth=1.3; }
        ctx.stroke();
      }
      ctx.restore(); ctx.setLineDash([]);
      if(!reduce){ t+=0.0016; fp+=0.8; requestAnimationFrame(draw); }
    }
    draw();
  }

  /* ---- horizontal scroll engine ---- */
  function horizontal() {
    var scroller = document.querySelector('.scroller'); if (!scroller) return;
    var fill = document.querySelector('.progress .fill');
    var counter = document.querySelector('.counter .cur');
    var nowLabel = document.getElementById('now');
    var nowLabel = document.getElementById('now');
    var panels = [].slice.call(scroller.querySelectorAll('.panel'));

    function maxScroll(){ return scroller.scrollWidth - scroller.clientWidth; }

    function goTo(px){ px = clamp(px,0,maxScroll());
      if (scroller._goTo) scroller._goTo(px); else scroller.scrollTo({left:px, behavior:'smooth'}); }

    // ---- dot nav (built first so updateUI can reference it) ----
    var nav = document.querySelector('.dots'); var dots = [];
    if (nav) {
      panels.forEach(function(pn,i){
        var b = document.createElement('button'); b.className='dot';
        b.setAttribute('aria-label', pn.getAttribute('data-name')||('Panel '+(i+1)));
        b.addEventListener('click', function(){ goTo(pn.offsetLeft - (scroller.clientWidth - pn.offsetWidth)/2); });
        nav.appendChild(b); dots.push(b);
      });
    }

    function updateUI(){
      var m = maxScroll() || 1, p = scroller.scrollLeft / m;
      if (fill) fill.style.transform = 'scaleX(' + clamp(p,0,1) + ')';
      var center = scroller.scrollLeft + scroller.clientWidth/2, idx = 0, best = 1e9;
      panels.forEach(function(pn,i){ var c = pn.offsetLeft + pn.offsetWidth/2; var d = Math.abs(c-center); if(d<best){best=d;idx=i;} });
      if (counter) counter.textContent = String(idx+1).padStart(2,'0');
      if (nowLabel && panels[idx]) nowLabel.textContent = panels[idx].getAttribute('data-name') || '';
      dots.forEach(function(dot,i){ dot.classList.toggle('on', i===idx); });
      panels.forEach(function(pn){ var r = pn.getBoundingClientRect();
        if (r.left < innerWidth*0.85 && r.right > innerWidth*0.15) pn.classList.add('seen'); });
    }

    // ---- scroll input ----
    if (!fine) {
      scroller.style.overflowX = 'auto';
      scroller.addEventListener('scroll', updateUI, { passive:true });
    } else {
      var target = 0, current = 0;
      addEventListener('wheel', function(e){
        if (e.ctrlKey) return;
        e.preventDefault();
        var d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        target = clamp(target + d, 0, maxScroll());
      }, { passive:false });
      addEventListener('keydown', function(e){
        if (e.key==='ArrowRight'||e.key==='PageDown'){ target = clamp(target + scroller.clientWidth*0.8, 0, maxScroll()); }
        else if (e.key==='ArrowLeft'||e.key==='PageUp'){ target = clamp(target - scroller.clientWidth*0.8, 0, maxScroll()); }
        else if (e.key==='Home'){ target = 0; } else if (e.key==='End'){ target = maxScroll(); }
      });
      addEventListener('resize', function(){ target = clamp(target,0,maxScroll()); });
      scroller._goTo = function(px){ target = clamp(px,0,maxScroll()); };
      (function loop(){ current = lerp(current, target, 0.085); scroller.scrollLeft = current; updateUI(); requestAnimationFrame(loop); })();
    }

    // anchor links (nav → panel)
    document.querySelectorAll('[data-to]').forEach(function(a){
      a.addEventListener('click', function(e){ e.preventDefault();
        var pn = document.getElementById(a.getAttribute('data-to')); if(!pn) return;
        goTo(pn.offsetLeft - (scroller.clientWidth-pn.offsetWidth)/2);
      });
    });
    setTimeout(updateUI, 60);
  }

  function intro() {
    var run = function(){ document.querySelectorAll('.intro').forEach(function(e,i){ e.style.transitionDelay=(i*90)+'ms'; e.classList.add('in'); }); };
    if (reduce) { run(); return; } setTimeout(run, 180);
  }

  function init(){ cursor(); hoverImg(); flow(); horizontal(); intro(); }
  if (document.readyState==='loading') addEventListener('DOMContentLoaded', init); else init();
})();
