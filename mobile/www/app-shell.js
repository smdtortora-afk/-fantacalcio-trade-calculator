/* FANTASCAM Store Edition — shell nativa.
   Navigazione a tab, barra verdetto, vista Analisi e soprattutto i select
   custom: nessuna tendina di sistema. Il motore continua a parlare con i
   suoi <select> veri (valore, eventi change, opzioni ricreate), la shell
   li nasconde e ne mostra una copia fedele come bottom sheet.
   Nessun file del motore viene modificato. */
(() => {
  if (window.__FS_APP_SHELL__) return;
  window.__FS_APP_SHELL__ = true;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  /* ---------- feedback aptico (se il plugin c'e'; altrimenti nulla) ---------- */
  const haptic = (kind = 'light') => {
    try {
      const H = window.Capacitor?.Plugins?.Haptics;
      if (!H) return;
      // su iOS selectionChanged vibra solo dentro una selectionStart/End
      if (kind === 'select') { H.selectionStart?.(); H.selectionChanged?.(); H.selectionEnd?.(); }
      else if (kind === 'success' || kind === 'warning' || kind === 'error') H.notification?.({type: kind.toUpperCase()});
      else H.impact?.({style: kind === 'medium' ? 'MEDIUM' : 'LIGHT'});
    } catch (e) {}
  };
  window.FS_HAPTIC = haptic;

  /* =====================================================================
     SELECT CUSTOM
     ===================================================================== */
  const CHEVRON = '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg>';
  const CHECK = '<svg class="cs-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const SEARCH_FROM = 10;   // oltre questo numero di opzioni il foglio mostra la ricerca

  const proto = HTMLSelectElement.prototype;
  const valueDesc = Object.getOwnPropertyDescriptor(proto, 'value');
  const indexDesc = Object.getOwnPropertyDescriptor(proto, 'selectedIndex');

  const sheet = (() => {
    const el = document.createElement('div');
    el.id = 'csSheet';
    el.innerHTML = `<div class="cs-backdrop"></div><div class="cs-panel" role="dialog" aria-modal="true">
      <div class="cs-grab"></div>
      <div class="cs-head"><span class="cs-title"></span><button type="button" class="cs-done">Fine</button></div>
      <input class="cs-search" type="search" placeholder="Cerca" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="cs-list"></div></div>`;
    return el;
  })();
  let current = null;

  const titleFor = sel => {
    const lbl = sel.closest('label');
    if (lbl) {
      const t = [...lbl.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
      // "FANTASQUADRA A" -> "Fantasquadra A": maiuscolo da etichetta, minuscolo da titolo.
      if (t) return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)(\S)(?=\s|$)|^\S/g, m => m.toUpperCase()) : t;
    }
    return sel.getAttribute('aria-label') || 'Seleziona';
  };

  // Le opzioni tipo "Nome · Squadra · FVM 30" diventano titolo + sottotitolo.
  const splitText = t => {
    const parts = String(t).split(' · ');
    return parts.length > 1 ? [parts[0], parts.slice(1).join(' · ')] : [t, ''];
  };

  const renderList = (q = '') => {
    if (!current) return;
    const list = $('.cs-list', sheet), query = q.trim().toLowerCase();
    const frag = document.createDocumentFragment();
    let shown = 0;
    const addOpt = o => {
      if (!o.value && o.index === 0 && current.options.length > 1) return; // placeholder "Scegli…"
      if (query && !o.textContent.toLowerCase().includes(query)) return;
      const [name, extra] = splitText(o.textContent);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cs-opt' + (o.selected ? ' selected' : '');
      b.disabled = o.disabled;
      b.innerHTML = `<span class="cs-main"><span class="cs-name">${esc(name)}</span>${extra ? `<span class="cs-extra">${esc(extra)}</span>` : ''}</span>${CHECK}`;
      b.addEventListener('click', () => choose(o.value));
      frag.appendChild(b); shown++;
    };
    for (const child of current.children) {
      if (child.tagName === 'OPTGROUP') {
        const opts = [...child.children].filter(o => !query || o.textContent.toLowerCase().includes(query));
        if (!opts.length) continue;
        const h = document.createElement('div');
        h.className = 'cs-group'; h.textContent = child.label;
        frag.appendChild(h);
        opts.forEach(addOpt);
      } else if (child.tagName === 'OPTION') addOpt(child);
    }
    list.innerHTML = '';
    if (!shown) {
      const only = current.options.length === 1 ? current.options[0].textContent : 'Nessun risultato';
      list.innerHTML = `<div class="cs-empty">${esc(only)}</div>`;
    } else list.appendChild(frag);
  };

  const open = sel => {
    if (sel.disabled) return;
    document.activeElement?.blur?.();
    current = sel;
    $('.cs-title', sheet).textContent = titleFor(sel);
    const search = $('.cs-search', sheet);
    search.value = '';
    search.style.display = sel.options.length > SEARCH_FROM ? '' : 'none';
    renderList();
    sheet.classList.add('open');
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('show')));
    haptic('light');
    const sel1 = $('.cs-opt.selected', sheet);
    if (sel1) sel1.scrollIntoView({block: 'center'});
  };

  const close = () => {
    if (!sheet.classList.contains('open')) return;
    sheet.classList.remove('show');
    $('.cs-search', sheet).blur();
    setTimeout(() => { if (!sheet.classList.contains('show')) sheet.classList.remove('open'); }, 300);
    current = null;
  };

  const choose = value => {
    const sel = current;
    if (!sel) return;
    const changed = String(sel.value) !== String(value);
    sel.value = value;
    close();
    if (changed) {
      haptic('select');
      sel.dispatchEvent(new Event('input', {bubbles: true}));
      sel.dispatchEvent(new Event('change', {bubbles: true}));
    }
  };

  $('.cs-backdrop', sheet).addEventListener('click', close);
  $('.cs-done', sheet).addEventListener('click', close);
  $('.cs-search', sheet).addEventListener('input', e => renderList(e.target.value));

  // Trascina giu' la maniglia per chiudere, come un foglio di sistema.
  (() => {
    const panel = $('.cs-panel', sheet);
    let y0 = null, dy = 0;
    const start = e => {
      const list = $('.cs-list', sheet);
      if (e.target.closest('.cs-list') && list.scrollTop > 0) return;
      y0 = e.touches[0].clientY; dy = 0; panel.style.transition = 'none';
    };
    const move = e => {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 0) { panel.style.transform = `translateY(${dy}px)`; if (e.cancelable) e.preventDefault(); }
    };
    const end = () => {
      if (y0 === null) return;
      panel.style.transition = ''; panel.style.transform = '';
      if (dy > 90) close();
      y0 = null;
    };
    panel.addEventListener('touchstart', start, {passive: true});
    panel.addEventListener('touchmove', move, {passive: false});
    panel.addEventListener('touchend', end);
    panel.addEventListener('touchcancel', end);
  })();

  const syncButton = sel => {
    const b = sel.__csBtn;
    if (!b) return;
    const o = sel.options[sel.selectedIndex];
    const label = $('.cs-label', b);
    const txt = o ? o.textContent : '';
    label.textContent = txt ? splitText(txt)[0] : 'Seleziona…';
    label.classList.toggle('placeholder', !o || !o.value);
    b.disabled = sel.disabled;
    if (current === sel && sheet.classList.contains('show')) renderList($('.cs-search', sheet).value);
  };

  // Le select che la UI non mostra mai: ruolo e giocatore di riga sono
  // sostituiti dalla ricerca globale di players.js.
  const SKIP = 'select.role, select.footballer';

  const enhance = sel => {
    if (sel.__csBtn || sel.matches(SKIP)) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cs-btn';
    b.innerHTML = `<span class="cs-label"></span>${CHEVRON}`;
    b.addEventListener('click', e => { e.preventDefault(); open(sel); });
    sel.__csBtn = b;
    sel.classList.add('cs-native');
    sel.insertAdjacentElement('afterend', b);

    // Il motore assegna spesso .value senza emettere eventi: lo intercettiamo
    // sull'istanza, cosi' il bottone resta sempre allineato.
    let queued = false;
    const queue = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; syncButton(sel); }); };
    Object.defineProperty(sel, 'value', {configurable: true, get() { return valueDesc.get.call(this); }, set(v) { valueDesc.set.call(this, v); queue(); }});
    Object.defineProperty(sel, 'selectedIndex', {configurable: true, get() { return indexDesc.get.call(this); }, set(v) { indexDesc.set.call(this, v); queue(); }});
    sel.addEventListener('change', queue);
    new MutationObserver(queue).observe(sel, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected']});
    syncButton(sel);
  };

  const enhanceAll = root => {
    if (root.nodeType !== 1) return;
    if (root.tagName === 'SELECT') enhance(root);
    root.querySelectorAll?.('select').forEach(enhance);
  };

  /* =====================================================================
     STEPPER per i campi numerici dei crediti
     ===================================================================== */
  const enhanceNumber = input => {
    if (input.__stepper || !input.closest('#fantascam-credit-controls')) return;
    input.__stepper = true;
    input.setAttribute('inputmode', 'numeric');
    const wrap = document.createElement('span');
    wrap.className = 'stepper';
    const minus = document.createElement('button'), plus = document.createElement('button');
    minus.type = plus.type = 'button';
    minus.textContent = '−'; plus.textContent = '+';
    minus.setAttribute('aria-label', 'Diminuisci'); plus.setAttribute('aria-label', 'Aumenta');
    input.replaceWith(wrap);
    wrap.append(minus, input, plus);
    const min = Number(input.min || 0);
    const bump = d => {
      const v = Math.max(min, (Number(input.value) || 0) + d);
      if (String(v) === input.value) return;
      input.value = v;
      haptic('select');
      input.dispatchEvent(new Event('input', {bubbles: true}));
    };
    // Tieni premuto per scorrere veloce.
    const hold = (btn, d) => {
      let t1, t2;
      const stop = () => { clearTimeout(t1); clearInterval(t2); };
      btn.addEventListener('pointerdown', e => {
        e.preventDefault(); bump(d);
        t1 = setTimeout(() => { t2 = setInterval(() => bump(d * (Math.abs(Number(input.value)) >= 50 ? 5 : 1)), 80); }, 380);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
    };
    hold(minus, -1); hold(plus, 1);
    input.addEventListener('focus', () => input.select());
  };
  const enhanceNumbers = () => $$('#fantascam-credit-controls input[type=number]').forEach(enhanceNumber);

  /* =====================================================================
     NAVIGAZIONE A TAB
     ===================================================================== */
  const appbar = () => $('.appbar');
  const activeView = () => $('.view.active');
  const TITLES = {trade: 'Scambio', analysis: 'Analisi', info: 'Info'};

  const updateAppbar = () => {
    const v = activeView();
    appbar()?.classList.toggle('scrolled', !!v && v.scrollTop > 36);
    const t = $('.appbar-title');
    if (t && v) t.textContent = TITLES[v.dataset.view] || '';
  };

  /* ---------- movimento: ingresso a cascata degli elementi di una vista ---------- */
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  // Il punteggio conta fino al valore scritto dal motore. Se nel frattempo il
  // motore riscrive #score, l'animazione si ferma e vince il suo testo.
  let scoreRaf = 0;
  const countScore = (from = 0) => {
    const el = $('#score'), m = el?.textContent.match(/^(\d+)%$/);
    cancelAnimationFrame(scoreRaf);
    if (!m || reduceMotion()) return;
    const to = +m[1], t0 = performance.now();
    if (from === to) return;
    let last = el.textContent;
    const step = now => {
      if (el.textContent !== last) return;
      const k = Math.min(1, (now - t0) / 950), e = 1 - Math.pow(1 - k, 3);
      last = el.textContent = Math.round(from + (to - from) * e) + '%';
      if (k < 1) scoreRaf = requestAnimationFrame(step);
    };
    scoreRaf = requestAnimationFrame(step);
  };

  // Il cerchio riparte da zero e si riempie fino al valore attuale.
  const refillGauge = () => {
    const g = $('#gauge'), f = Number(window.FS_LAST_TRADE?.fairness);
    if (!g || !Number.isFinite(f)) return;
    g.classList.add('no-anim');
    g.style.setProperty('--pct', 0);
    void g.offsetWidth;
    g.classList.remove('no-anim');
    g.style.setProperty('--pct', Math.max(0, Math.min(100, f)));
    setTimeout(() => restart(g, 'glow'), 650);
  };

  const reveal = view => {
    if (!view || reduceMotion()) return;
    const inner = $('.view-inner', view);
    if (!inner) return;
    const items = [];
    const shown = el => el.offsetParent !== null;
    const walk = parent => {
      for (const el of parent.children) {
        if (!shown(el) || el.tagName === 'TEMPLATE') continue;
        if (el.matches('.result')) { walk(el); continue; }
        if (el.matches('.result-hero')) {
          // la card entra, e il cerchio dentro di lei ruota in posizione
          items.push([el, 'rv']);
          const g = $('#gauge', el); if (g) items.push([g, 'rv']);
          continue;
        }
        if (el.id === 'fs-v9-analysis') {
          $$('.fsv9-factor, .fsv9-side-title, .fsv9-player', el).filter(shown).forEach(x => items.push([x, 'rv']));
          continue;
        }
        items.push([el, 'rv']);
        if (el.matches('.list-group')) [...el.children].filter(shown).forEach(li => items.push([li, 'rv-sub']));
      }
    };
    walk(inner);
    items.forEach(([el]) => el.classList.remove('rv', 'rv-sub'));
    void inner.offsetWidth;
    let t = 0;
    items.forEach(([el, cls]) => {
      el.style.animationDelay = Math.min(t, 760) + 'ms';
      el.classList.add(cls);
      t += cls === 'rv' ? 55 : 38;
      el.addEventListener('animationend', function done(e) {
        if (e.target !== el) return;
        el.classList.remove(cls); el.style.animationDelay = '';
        el.removeEventListener('animationend', done);
      });
    });
    if (view.dataset.view === 'analysis' && view.classList.contains('has-trade')) { refillGauge(); countScore(0); }
  };

  const showView = name => {
    const prev = activeView()?.dataset.view;
    $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
    if (prev && prev !== name) reveal($(`.view[data-view="${name}"]`));
    $$('.tab').forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) t.classList.remove('has-news');
    });
    $('.verdictbar')?.toggleAttribute('data-off', name !== 'trade');
    updateVerdictBar();
    updateAppbar();
  };
  window.FS_SHOW_VIEW = showView;

  const bindNav = () => {
    $$('.tab').forEach(t => t.addEventListener('click', () => {
      const v = $(`.view[data-view="${t.dataset.tab}"]`);
      // Secondo tap sul tab attivo: torna in cima, come nelle app di sistema.
      if (t.classList.contains('active') && v) v.scrollTo({top: 0, behavior: 'smooth'});
      else { haptic('light'); showView(t.dataset.tab); }
    }));
    $$('.view').forEach(v => v.addEventListener('scroll', updateAppbar, {passive: true}));
    $('.verdictbar')?.addEventListener('click', () => { haptic('light'); showView('analysis'); });
    $$('[data-goto]').forEach(b => b.addEventListener('click', () => showView(b.dataset.goto)));
  };

  // Con la tastiera aperta tab bar e barra verdetto spariscono.
  const bindKeyboard = () => {
    const isField = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'file'].includes(el.type)));
    document.addEventListener('focusin', e => { if (isField(e.target)) document.body.classList.add('kb-open'); });
    document.addEventListener('focusout', () => setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove('kb-open'); }, 60));
  };

  /* =====================================================================
     VERDETTO: barra in basso + vista Analisi
     ===================================================================== */
  const STATUS_TEXT = {good: 'Scambio equilibrato', warn: 'Scambio accettabile', bad: 'FANTASCAM!'};
  const statusOf = t => t?.status || (t ? (t.fairness < 75 ? 'bad' : t.fairness < 88 ? 'warn' : 'good') : null);
  let lastSig = '', lastFair = null;

  function updateVerdictBar() {
    const bar = $('.verdictbar');
    if (!bar) return;
    const t = window.FS_LAST_TRADE, valid = t && t.A?.length && t.B?.length;
    const onTrade = !bar.hasAttribute('data-off');
    bar.classList.toggle('hidden', !valid || !onTrade);
    if (!valid) return;
    const st = statusOf(t), fair = Math.round(Number(t.fairness) || 0);
    bar.classList.remove('good', 'warn', 'bad');
    bar.classList.add(st);
    $('.vb-ring', bar).style.setProperty('--p', fair);
    $('.vb-ring span', bar).textContent = fair + '%';
    $('.vb-text b', bar).textContent = STATUS_TEXT[st];
    const who = t.stronger ? `Vantaggio ${t.stronger === 'A' ? (t.teamA?.name || 'Squadra A') : (t.teamB?.name || 'Squadra B')}` : 'Nessun lato avvantaggiato';
    $('.vb-text small', bar).textContent = `${who} · tocca per l'analisi`;
  }

  const renderReasons = t => {
    const box = $('#reasonList');
    if (!box) return;
    const reasons = (t?.reasons || []).filter(Boolean);
    box.innerHTML = reasons.length
      ? reasons.slice(0, 8).map(r => `<div class="li">${esc(r)}</div>`).join('')
      : '<span class="empty">Nessuna osservazione particolare.</span>';
  };

  const onTrade = () => {
    const t = window.FS_LAST_TRADE, valid = !!(t && t.A?.length && t.B?.length);
    const view = $('.view[data-view="analysis"]');
    view?.classList.toggle('has-trade', valid);
    view?.classList.toggle('no-trade', !valid);
    updateVerdictBar();
    if (!valid) { lastSig = ''; lastFair = null; return; }
    renderReasons(t);
    const sig = `${t.A.map(p => p.id)}|${t.B.map(p => p.id)}|${t.creditsA}|${t.creditsB}|${Math.round(t.fairness)}|${t.teamA?.id}|${t.teamB?.id}`;
    if (sig !== lastSig) {
      const first = !lastSig;
      lastSig = sig;
      // Scambio cambiato mentre l'Analisi è visibile: il punteggio conta dal
      // valore precedente e il verdetto "batte".
      if (!first && $('.view[data-view="analysis"]')?.classList.contains('active') && !reduceMotion()) {
        countScore(lastFair ?? 0);
        const v = $('#verdict'); if (v) restart(v, 'pop');
        const g = $('#gauge'); if (g) restart(g, 'glow');
      }
      const bar = $('.verdictbar');
      if (bar && !first) { bar.classList.remove('pulse'); void bar.offsetWidth; bar.classList.add('pulse'); }
      if (!$('.tab[data-tab="analysis"]')?.classList.contains('active')) $('.tab[data-tab="analysis"]')?.classList.add('has-news');
      const st = statusOf(t);
      haptic(st === 'good' ? 'success' : st === 'warn' ? 'warning' : 'error');
    }
    lastFair = Math.round(Number(t.fairness) || 0);
  };
  // V9 emette trade-updated, il wrapper V10 trade-v10 subito dopo: si legge
  // sempre FS_LAST_TRADE dopo un tick, cosi' vince il risultato finale.
  let tick = 0;
  const scheduleTrade = () => { clearTimeout(tick); tick = setTimeout(onTrade, 0); };
  window.addEventListener('fantascam:trade-updated', scheduleTrade);
  window.addEventListener('fantascam:trade-v10', scheduleTrade);

  /* Pannello lega: compatto finche' non c'e' una lega collegata. */
  const syncLeague = () => {
    const box = $('#fs-v10-league');
    if (!box) return;
    const l = window.FS_LEAGUE?.get?.();
    box.classList.toggle('fs-has-league', !!(l && l.teams?.length));
    const small = $('.fsv10-head small', box);
    if (small) {
      small.dataset.orig ??= small.textContent;
      const t = box.classList.contains('fs-has-league') ? small.dataset.orig : 'Collega la tua lega per valutare lo scambio sulle due rose reali.';
      if (small.textContent !== t) small.textContent = t;
    }
  };

  /* =====================================================================
     OSSERVATORE: tutto cio' che il motore inietta dopo
     ===================================================================== */
  const observe = () => {
    new MutationObserver(muts => {
      let numbers = false;
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        enhanceAll(n);
        if (n.id === 'fantascam-credit-controls' || n.querySelector?.('#fantascam-credit-controls')) numbers = true;
      }
      if (numbers) enhanceNumbers();
      syncLeague();
      // Lo stato "nessuno scambio" non sempre emette eventi: si ricontrolla.
      scheduleTrade();
    }).observe(document.body, {childList: true, subtree: true});
  };

  const boot = () => {
    document.body.appendChild(sheet);
    enhanceAll(document.body);
    enhanceNumbers();
    observe();
    bindNav();
    bindKeyboard();
    showView('trade');
    onTrade();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  // Tasto indietro di Android (plugin @capacitor/app), dal livello più in alto:
  // tastiera → foglio custom → pannelli lega del motore → tab Scambio → esci.
  try {
    window.Capacitor?.Plugins?.App?.addListener?.('backButton', () => {
      const ae = document.activeElement;
      const engineModal = $('#fs-v101-manager.show, #fs-v10-league-modal.show');
      if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && document.body.classList.contains('kb-open')) ae.blur();
      else if (sheet.classList.contains('open')) close();
      else if (engineModal) { const x = engineModal.querySelector('[data-close]'); x ? x.click() : engineModal.classList.remove('show'); }
      else if (!$('.view[data-view="trade"]').classList.contains('active')) showView('trade');
      else window.Capacitor.Plugins.App.exitApp?.();
    });
  } catch (e) {}
})();
