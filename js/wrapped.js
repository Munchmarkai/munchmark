// "Wrapped"-style story player for the weekly recap.
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const int = n => Math.round(n).toLocaleString();
const pct = (v, t) => t > 0 ? Math.round(v / t * 100) : 0;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const rings = (cls) => `<svg class="wr-deco ${cls}" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="96"/><circle cx="100" cy="100" r="64"/><circle cx="100" cy="100" r="30"/></svg>`;

function range(s){
  const a = new Date(s.start + 'T00:00'), b = new Date(s.end + 'T00:00');
  const m1 = a.toLocaleDateString(undefined, {month:'short'}), m2 = b.toLocaleDateString(undefined, {month:'short'});
  return m1 === m2 ? `${m1} ${a.getDate()} – ${b.getDate()}` : `${m1} ${a.getDate()} – ${m2} ${b.getDate()}`;
}
function verdict(v, goal){
  const r = v / goal;
  if (r < 0.88) return `${int(goal - v)} under your goal`;
  if (r > 1.12) return `${int(v - goal)} over your goal`;
  return 'right on your goal';
}

function slides(s){
  const T = s.target, a = s.avg, out = [];
  out.push({theme:'green', html:`${rings('d1')}
    <p class="wr-eyebrow wr-in">Your week, wrapped</p>
    <h2 class="wr-huge wr-in">${esc(range(s))}</h2>
    <p class="wr-sub wr-in">${s.loggedDays} day${s.loggedDays === 1 ? '' : 's'} logged · ${s.entries} meal${s.entries === 1 ? '' : 's'}</p>`});
  const top = Math.max(T.calories * 1.2, ...s.days.map(d => d.t[0]), 1);
  out.push({theme:'amber', html:`${rings('d2')}
    <p class="wr-eyebrow wr-in">On average you ate</p>
    <p class="wr-big wr-in" data-count="${Math.round(a[0])}">${int(a[0])}</p>
    <p class="wr-sub wr-in">calories a day, ${esc(verdict(a[0], T.calories))}</p>
    <div class="wr-cols wr-in">${s.days.map((d, i) => `<span><i style="--h:${d.t[0] / top * 100}%"${d.t[0] > T.calories * 1.12 ? ' class="hi"' : ''}></i><em>${DAYS[i][0]}</em></span>`).join('')}<b style="--g:${T.calories / top * 100}%"></b></div>`});
  out.push({theme:'cream', html:`<p class="wr-eyebrow wr-in">Day by day</p>
    <ul class="wr-days wr-in">${s.days.map((d, i) => {
      const k = d.t[0], P = d.t[1] * 4, C = d.t[2] * 4, F = d.t[3] * 9, sum = P + C + F || 1;
      return `<li class="${s.bestDay && s.bestDay.date === d.date ? 'best' : ''}${d.logged ? '' : ' off'}"><b>${DAYS[i].slice(0, 3)}</b>
        <span class="wr-stack">${d.logged ? `<i class="p" style="flex:${P / sum}"></i><i class="c" style="flex:${C / sum}"></i><i class="f" style="flex:${F / sum}"></i>` : ''}</span>
        <em>${d.logged ? int(k) : '—'}</em></li>`; }).join('')}</ul>
    <p class="wr-key wr-in"><i class="p"></i>Protein <i class="c"></i>Carbs <i class="f"></i>Fat · calories each day</p>`});
  if (s.bestDay) {
    const d = s.bestDay, i = s.days.indexOf(d);
    out.push({theme:'blue', html:`${rings('d3')}
      <p class="wr-eyebrow wr-in">Your best day</p>
      <h2 class="wr-huge wr-in">${DAYS[i]}</h2>
      <p class="wr-sub wr-in">Closest to every goal you set</p>
      <dl class="wr-grid wr-in"><div><dt>Calories</dt><dd>${int(d.t[0])}</dd></div><div><dt>Protein</dt><dd>${int(d.t[1])} g</dd></div><div><dt>Carbs</dt><dd>${int(d.t[2])} g</dd></div><div><dt>Fat</dt><dd>${int(d.t[3])} g</dd></div></dl>`});
  }
  out.push({theme:'rose', html:`${rings('d4')}
    <p class="wr-eyebrow wr-in">Your macros, daily average</p>
    <ul class="wr-macros wr-in">
      ${[['Protein', a[1], T.protein_g], ['Carbs', a[2], T.carbs_g], ['Fat', a[3], T.fat_g]].map(([l, v, t]) => `<li><span>${l}</span><b data-count="${Math.round(v)}">${int(v)}</b><em>g · ${pct(v, t)}% of goal</em><i><u style="width:${Math.min(100, pct(v, t))}%"></u></i></li>`).join('')}
    </ul>
    <p class="wr-sub wr-in">Protein goal hit on <b>${s.proteinDays} of 7</b> days</p>`});
  if (s.topFoods.length) out.push({theme:'plum', html:`${rings('d5')}
    <p class="wr-eyebrow wr-in">Your top foods</p>
    <ol class="wr-top wr-in">${s.topFoods.map((f, i) => `<li><b>${i + 1}</b><span>${esc(f.name)}</span><em>×${f.count}</em></li>`).join('')}</ol>`});
  const micro = [['Fiber', a[4], 28, 'g', 'low'], ['Sodium', a[8], 2300, 'mg', 'high'], ['Potassium', a[9], 4700, 'mg', 'low'], ['Sugars', a[5], 0, 'g', '']];
  out.push({theme:'green', html:`${rings('d6')}
    <p class="wr-eyebrow wr-in">Beyond the macros</p>
    <ul class="wr-micro wr-in">${micro.map(([l, v, dv, u, bad]) => {
      const r = dv ? v / dv : 0; let tag = '';
      if (bad === 'low' && dv) tag = r < 0.7 ? 'low' : 'good'; if (bad === 'high') tag = r > 1 ? 'high' : 'good';
      return `<li><span>${l}</span><b>${int(v)}<small>${u}</small></b>${tag ? `<em class="${tag}">${tag === 'good' ? 'on track' : tag}</em>` : '<em>a day</em>'}</li>`; }).join('')}</ul>`});
  out.push({theme:'amber', html:`${rings('d7')}
    <p class="wr-eyebrow wr-in">Longest logging streak</p>
    <p class="wr-big wr-in">${s.streak}<small> day${s.streak === 1 ? '' : 's'}</small></p>
    ${s.biggestProtein ? `<p class="wr-sub wr-in">Biggest protein meal: <b>${esc(s.biggestProtein.name)}</b> with ${int(s.biggestProtein.protein)} g</p>` : ''}`});
  out.push({theme:'green', dur:11000, html:`<p class="wr-eyebrow wr-in">For next week</p>
    <ul class="wr-tips wr-in">${s.suggestions.slice(0, 3).map(t => `<li class="${t.tone}"><b>${esc(t.title)}</b><span>${esc(t.text)}</span></li>`).join('')}</ul>`});
  out.push({theme:'cream', final:true, html:`${rings('d8')}
    <p class="wr-eyebrow wr-in">That's your week</p>
    <h2 class="wr-huge wr-in">See you next week.</h2>
    <div class="wr-actions wr-in"><button type="button" class="wr-btn" data-wr="report">See full report</button><button type="button" class="wr-btn ghost" data-wr="close">Done</button></div>`});
  return out;
}

export function playWrapped(summary, {onClose = () => {}, onReport = () => {}} = {}){
  const S = slides(summary);
  const el = document.createElement('div');
  el.className = 'wr'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Your week, wrapped');
  el.innerHTML = `<div class="wr-bars">${S.map(() => '<i><b></b></i>').join('')}</div>
    <button type="button" class="wr-x" data-wr="close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <div class="wr-stage" aria-live="polite"></div>
    <button type="button" class="wr-tap prev" aria-label="Previous"></button><button type="button" class="wr-tap next" aria-label="Next"></button>`;
  document.body.append(el); document.documentElement.classList.add('wr-open');
  const stage = el.querySelector('.wr-stage'), bars = [...el.querySelectorAll('.wr-bars b')];
  let i = 0, t0 = performance.now(), elapsed = 0, paused = false, raf = 0, closed = false;
  const show = n => {
    i = Math.max(0, Math.min(S.length - 1, n)); elapsed = 0;
    stage.className = `wr-stage t-${S[i].theme}`; el.dataset.theme = S[i].theme;
    stage.innerHTML = `<section class="wr-slide">${S[i].html}</section>`;
    bars.forEach((b, k) => b.style.width = k < i ? '100%' : '0%');
    if (!reduced()) stage.querySelectorAll('[data-count]').forEach(n => countUp(n, Number(n.dataset.count)));
  };
  const close = () => { if (closed) return; closed = true; cancelAnimationFrame(raf); el.remove(); document.documentElement.classList.remove('wr-open'); document.removeEventListener('keydown', onKey); onClose(); };
  const tick = now => {
    const dt = now - t0; t0 = now;
    if (!paused && !document.hidden) elapsed += dt;
    const dur = S[i].dur || 6500;
    bars[i].style.width = Math.min(100, elapsed / dur * 100) + '%';
    if (elapsed >= dur && !S[i].final) show(i + 1);
    raf = requestAnimationFrame(tick);
  };
  const onKey = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') show(i + 1); if (e.key === 'ArrowLeft') show(i - 1); };
  document.addEventListener('keydown', onKey);
  let downAt = 0;
  el.addEventListener('pointerdown', e => { if (e.target.closest('[data-wr]')) return; downAt = performance.now(); paused = true; });
  el.addEventListener('pointerup', () => { paused = false; });
  el.addEventListener('pointercancel', () => { paused = false; });
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-wr]');
    if (a) { if (a.dataset.wr === 'report') { close(); onReport(); } else close(); return; }
    const held = performance.now() - downAt > 350;
    if (held) return;
    if (e.target.closest('.wr-tap.prev')) show(i - 1);
    else if (e.target.closest('.wr-tap.next')) show(i + 1);
  });
  show(0); raf = requestAnimationFrame(tick);
  el.querySelector('.wr-x').focus({preventScroll: true});
  return close;
}

function countUp(node, to){
  const start = performance.now(), dur = 900, small = node.querySelector('small');
  const tail = small ? small.outerHTML : '';
  const step = now => { const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3); node.innerHTML = int(to * e) + tail; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
