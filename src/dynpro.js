/* =====================================================================
   dynpro.js — renders SAP dynpro definitions (screens.json) 1:1.
   Positions come from the screen painter (line / column / length);
   field logic comes from a binding object per screen (bindings.js).
   ===================================================================== */
'use strict';

const CW = 7.4;   /* px per character cell */
const LH = 24;    /* px per screen line */

const Dynpro = {
  /* env: { edit:bool, pai(label, fn), rerender(), sel: Map(TC -> Set), msg(type,text), app } */
  render(key, binding, env, opts = {}) {
    const scr = SCREENS[key];
    const root = document.createElement('div');
    root.className = 'dyn';
    root.dataset.screen = key;
    if (!scr) { root.textContent = `Screen ${key} not found`; return root; }
    const b = binding || {};
    const fit = opts.fit; /* subscreen area size in lines/cols */
    /* extent of the fixed-size content */
    let maxC = 1, maxL = 1;
    for (const e of scr.els) if (!e.inv && e.cont === 'SCREEN') { maxC = Math.max(maxC, e.c - 1 + (e.w || 1) + 1); maxL = Math.max(maxL, e.l + (e.h || 1) - 1); }
    for (const c of scr.conts) if (!c.of || c.of === 'SCREEN') { maxC = Math.max(maxC, c.rh ? c.c + 30 : c.c - 1 + c.w); maxL = Math.max(maxL, c.l - 1 + (c.rv ? Math.min(c.h, c.t === 'TABLE_CTRL' ? 380 / LH : 560 / LH) : c.h)); }
    const hasResizable = scr.conts.some(c => (!c.of || c.of === 'SCREEN') && c.rh && c.t !== 'SUBSCREEN');
    root.style.width = hasResizable || opts.stretch ? '100%' : (Math.min(fit?.w || scr.cols, maxC + 1) * CW) + 'px';
    root.style.minWidth = (maxC * CW) + 'px';
    root.style.minHeight = (Math.min(fit?.h || scr.lines, maxL + 1) * LH) + 'px';

    const conts = Object.fromEntries(scr.conts.map(c => [c.n, c]));
    const tcOf = el => {
      let c = el.cont;
      while (c && conts[c]) { if (conts[c].t === 'TABLE_CTRL') return c; if (conts[c].t === 'STRIP_CTRL') return c; c = conts[c].of; }
      return null;
    };
    const visible = el => {
      if (b.vis) { const v = b.vis(el); if (v !== undefined) return v; }
      return !el.inv;
    };
    const editable = el => env.edit && !el.ro && (el.in || ['CHECK', 'RADIO'].includes(el.t)) && !(b.ro && b.ro(el));

    /* frames first so fields render above them */
    const els = scr.els.filter(e => !tcOf(e) && visible(e));
    for (const el of els.filter(e => e.t === 'FRAME')) root.appendChild(Dynpro.frame(el));

    /* containers: subscreens, custom controls, table controls */
    for (const c of scr.conts) {
      if (c.of && c.of !== 'SCREEN') continue; /* nested in tabstrip / table control: handled elsewhere */
      if (c.t === 'SUBSCREEN') {
        const host = Dynpro.box(c, 'dyn-sub');
        const sub = b.sub?.[c.n];
        if (sub) {
          const r = typeof sub === 'function' ? sub(host, env) : sub;
          if (typeof r === 'string') host.appendChild(env.renderScreen(r, { w: c.w, h: c.h }));
          else if (r instanceof Node) host.appendChild(r);
        }
        if (host.childNodes.length) root.appendChild(host);
      } else if (c.t === 'CUST_CTRL') {
        const host = Dynpro.box(c, 'dyn-cust');
        const fn = b.cust?.[c.n];
        if (fn) { fn(host, env, c); root.appendChild(host); }
      } else if (c.t === 'TABLE_CTRL') {
        if (b.vis && b.vis({ n: c.n, t: 'TABLE_CTRL' }) === false) continue;
        root.appendChild(Dynpro.tableCtrl(scr, c, scr.els.filter(e => tcOf(e) === c.n), b.tc?.[c.n], env));
      }
    }

    for (const el of els) {
      if (el.t === 'FRAME') continue;
      const node = Dynpro.element(el, b, env, editable(el), scr);
      if (node) root.appendChild(node);
    }
    return root;
  },

  box(c, cls) {
    const d = document.createElement('div');
    d.className = cls;
    d.style.left = ((c.c - 1) * CW) + 'px';
    d.style.top = ((c.l - 1) * LH) + 'px';
    /* resizable controls (rh/rv) fill the free space like in SAP GUI */
    if (c.rh && c.t !== 'SUBSCREEN') { d.style.right = '6px'; d.style.minWidth = Math.min(c.w * CW, 420) + 'px'; } else d.style.width = (c.w * CW) + 'px';
    if (c.rv && c.t !== 'SUBSCREEN') { d.style.height = Math.min(c.h * LH, c.t === 'TABLE_CTRL' ? 380 : 560) + 'px'; d.classList.add('rv'); } else d.style.height = (c.h * LH) + 'px';
    d.dataset.name = c.n;
    return d;
  },
  place(node, el, wChars) {
    node.style.left = ((el.c - 1) * CW) + 'px';
    node.style.top = ((el.l - 1) * LH) + 'px';
    if (wChars) node.style.width = (wChars * CW) + 'px';
  },
  frame(el) {
    const f = document.createElement('fieldset');
    f.className = 'dyn-frame';
    f.style.left = ((el.c - 1) * CW + 2) + 'px';
    f.style.top = ((el.l - 1) * LH + 4) + 'px';
    f.style.width = (el.w * CW - 4) + 'px';
    f.style.height = ((el.h) * LH - 8) + 'px';
    if (el.tx) { const lg = document.createElement('legend'); lg.textContent = el.tx; f.appendChild(lg); }
    return f;
  },
  labelNode(tx) {
    const { icon: ic, tip, text } = parseIconText(tx);
    const span = document.createElement('span');
    if (ic) span.insertAdjacentHTML('beforeend', icon(ic));
    if (text) span.appendChild(document.createTextNode(text));
    if (tip) span.title = tip;
    return span;
  },
  element(el, b, env, canEdit, scr) {
    let f = b.f?.[el.n] || {};
    switch (el.t) {
      case 'TEXT': {
        const s = document.createElement('label');
        s.className = 'dyn-text';
        Dynpro.place(s, el, el.w);
        const tx = f.label ? f.label() : el.tx;
        s.appendChild(Dynpro.labelNode(tx));
        s.title = s.textContent;
        s.dataset.for = el.n;
        return s;
      }
      case 'TEMPLATE': {
        const val = f.get ? f.get() : undefined;
        const bound = !!f.get;
        let input;
        const values = f.values ? f.values() : null;
        if (el.dd === 'L' || (values && f.dropdown)) {
          input = document.createElement('select');
          const list = values || [];
          const cur = val ?? '';
          let found = false;
          for (const [k, t] of list) {
            const o = document.createElement('option'); o.value = k; o.textContent = t; if (k === cur) { o.selected = true; found = true; } input.appendChild(o);
          }
          if (!found && cur !== '') { const o = document.createElement('option'); o.value = cur; o.textContent = cur; o.selected = true; input.prepend(o); }
          if (!found && cur === '' && !list.some(([k]) => k === '')) { const o = document.createElement('option'); o.value = ''; o.textContent = ''; o.selected = true; input.prepend(o); }
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.value = val ?? '';
          input.maxLength = f.maxLength || el.len || 132;
          input.spellcheck = false;
          if (!el.lc && !f.lower && canEdit && bound) input.classList.add('upper');
          if (values && values.length && !f.f4) {
            /* possible entries (F4) like SAP: double-click, F4 or the help marker */
            f = { ...f, f4: inp => APP.popupList(inp, 'Possible Entries', values, inp.value, v => { inp.value = v; inp.dispatchEvent(new Event('change')); }) };
            input.title = values.slice(0, 12).map(([k, t]) => `${k}  ${t !== k ? t : ''}`.trim()).join('\n') + (values.length > 12 ? '\n…' : '');
          }
        }
        input.className = (input.className + ' dyn-field').trim();
        input.name = el.n;
        if (el.req) input.classList.add('req');
        Dynpro.place(input, el, Math.max(el.w, 2) + (input.tagName === 'SELECT' ? 3 : el.w <= 3 ? 2.4 : 1.5));
        Dynpro.wireInput(input, el, f, env, canEdit && bound);
        if (!bound) input.classList.add('unbound');
        return input;
      }
      case 'CHECK': {
        const lab = document.createElement('label');
        lab.className = 'dyn-check';
        Dynpro.place(lab, el, el.w + 2);
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.name = el.n;
        cb.checked = !!(f.get && f.get());
        cb.disabled = !(canEdit && f.set);
        cb.addEventListener('change', () => env.pai(`${el.n}`, () => f.set(cb.checked)));
        lab.appendChild(cb);
        if (el.tx) lab.appendChild(Dynpro.labelNode(el.tx));
        if (!f.get) lab.classList.add('unbound');
        return lab;
      }
      case 'RADIO': {
        const lab = document.createElement('label');
        lab.className = 'dyn-radio';
        Dynpro.place(lab, el, el.w + 2);
        const rb = document.createElement('input'); rb.type = 'radio'; rb.name = scr.prog + scr.dynnr + (el.cont || 'rg');
        rb.dataset.field = el.n;
        rb.checked = !!(f.get && f.get());
        rb.disabled = !(canEdit && f.set);
        rb.addEventListener('change', () => { if (rb.checked) env.pai(`${el.n}`, () => f.set(true)); });
        lab.appendChild(rb);
        if (el.tx) lab.appendChild(Dynpro.labelNode(el.tx));
        if (!f.get) lab.classList.add('unbound');
        return lab;
      }
      case 'PUSH': {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'dyn-push'; btn.name = el.n;
        Dynpro.place(btn, el, Math.max(el.w, 2) + 1);
        const { icon: idTx, tip, text } = parseIconText(el.tx);
        const ic = el.icon || idTx;
        if (ic) btn.insertAdjacentHTML('beforeend', icon(ic));
        if (text) btn.appendChild(document.createTextNode(text));
        btn.title = tip || el.qi || text || el.n;
        const fc = el.fc;
        const handler = (b.fc && (b.fc[fc] || b.fc[el.n])) || null;
        const needsEdit = !['CHECK', 'TPAINT', 'TPATTERN', 'BP_OPTIONS', 'INFO', 'TC_PREV', 'TC_NEXT', 'TC_PREV_PAGE', 'TC_NEXT_PAGE', 'TC_CHECK', 'EDIT'].includes(fc);
        btn.disabled = !handler || (needsEdit && !env.edit);
        if (handler) btn.addEventListener('click', () => {
          const r = handler(env, btn);
          if (r && typeof r.then === 'function') return;
        });
        if (!el.w || el.w <= 4) btn.classList.add('icon-only');
        return btn;
      }
      default: return null;
    }
  },
  wireInput(input, el, f, env, canEdit) {
    input.disabled = !canEdit;
    if (!canEdit) input.readOnly = true;
    if (!canEdit && input.tagName === 'INPUT') { input.disabled = false; input.readOnly = true; input.tabIndex = -1; input.classList.add('ro'); }
    if (!canEdit) return;
    let last = input.value;
    const commit = () => {
      if (input.value === last && input.tagName === 'INPUT') return; last = input.value;
      let v = input.value;
      if (input.tagName === 'INPUT' && input.classList.contains('upper')) v = v.toUpperCase();
      const cur = f.get ? (f.get() ?? '') : '';
      if (v === cur) return;
      env.pai(el.n, () => f.set(v));
    };
    input.addEventListener('change', commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'F4' && f.f4) { e.preventDefault(); f.f4(input); }
    });
    if (f.f4) { input.classList.add('has-f4'); input.addEventListener('dblclick', () => f.f4(input)); }
  },

  /* ---------------- table control ---------------- */
  tableCtrl(scr, c, els, tb, env) {
    const wrap = Dynpro.box(c, 'dyn-tc');
    const title = els.find(e => e.t === 'TEXT' && !e.c);
    const colIdx = [...new Set(els.filter(e => e.c).map(e => e.c))].sort((a, b) => a - b);
    const cols = colIdx.map(i => {
      const at = els.filter(e => e.c === i);
      const field = at.find(e => e.in || ['CHECK', 'RADIO', 'PUSH_'].includes(e.t)) || at.find(e => e.t === 'TEMPLATE');
      const head = at.find(e => e !== field && (e.t === 'TEXT' || e.t === 'TEMPLATE')) || null;
      return { i, field, head };
    }).filter(c => c.field && !(tb?.hideCol && tb.hideCol(c.field.n)));
    if (title) { const t = document.createElement('div'); t.className = 'tc-title'; t.textContent = tb?.title ? tb.title() : title.tx; wrap.appendChild(t); }
    const scroller = document.createElement('div'); scroller.className = 'tc-scroll';
    const table = document.createElement('table'); table.className = 'tc';
    const thead = table.createTHead().insertRow();
    thead.insertCell().className = 'tc-sel-h';
    for (const col of cols) {
      const th = document.createElement('th');
      let label = col.head ? (col.head.t === 'TEMPLATE' ? (tb?.headerValue ? tb.headerValue(col.head.n) : '') : col.head.tx) : '';
      if (tb?.label?.[col.field.n]) label = tb.label[col.field.n]();
      th.appendChild(Dynpro.labelNode(label || ''));
      th.style.minWidth = (Math.max(col.field.w, 2) * CW + 10) + 'px';
      thead.appendChild(th);
    }
    const tbody = table.createTBody();
    const rows = tb ? tb.rows() : [];
    const sel = env.sel(c.n);
    const canEdit = env.edit && tb && !tb.readonly;
    const visRows = Math.min(c.h - 2, 12);
    const emptyRows = canEdit && tb.add ? Math.max(2, visRows - rows.length) : Math.max(0, visRows - rows.length);
    const total = rows.length + emptyRows;
    for (let ri = 0; ri < total; ri++) {
      const row = rows[ri];
      const tr = tbody.insertRow();
      const sc = tr.insertCell(); sc.className = 'tc-sel';
      if (row !== undefined) {
        if (sel.has(ri)) tr.classList.add('sel');
        sc.addEventListener('click', ev => {
          if (!ev.ctrlKey && !ev.shiftKey && !ev.metaKey) { const had = sel.has(ri) && sel.size === 1; sel.clear(); if (!had) sel.add(ri); }
          else if (sel.has(ri)) sel.delete(ri); else sel.add(ri);
          env.rerender();
        });
      }
      for (const col of cols) {
        const td = tr.insertCell();
        const fe = col.field; const cb = tb?.col?.[fe.n] || {};
        const val = row !== undefined && cb.get ? cb.get(row) : (fe.t === 'CHECK' ? false : '');
        const rowRo = row !== undefined && cb.ro && cb.ro(row);
        const editableCell = canEdit && !!cb.set && !rowRo && (row !== undefined || !!tb.add);
        if (fe.t === 'CHECK' || fe.t === 'RADIO') {
          const inp = document.createElement('input'); inp.type = fe.t === 'CHECK' ? 'checkbox' : 'radio';
          if (fe.t === 'RADIO') inp.name = `${c.n}-${fe.cont}-${ri}`;
          inp.checked = !!val; inp.disabled = !editableCell || row === undefined;
          inp.addEventListener('change', () => env.pai(fe.n, () => cb.set(row, inp.checked)));
          td.className = 'tc-center'; td.appendChild(inp);
        } else if (fe.t === 'PUSH_') {
          const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'tc-push';
          const disp = cb.display ? cb.display(row) : val;
          btn.textContent = disp || '';
          btn.disabled = !editableCell || row === undefined;
          if (cb.click) btn.addEventListener('click', () => cb.click(row, btn, env));
          td.className = 'tc-center'; td.appendChild(btn);
        } else {
          const values = cb.values ? cb.values(row) : null;
          let inp;
          if (fe.dd === 'L' && values) {
            inp = document.createElement('select');
            const cur = val ?? '';
            if (!values.some(([k]) => k === cur)) { const o = document.createElement('option'); o.value = cur; o.textContent = cur; inp.appendChild(o); }
            for (const [k, t] of values) { const o = document.createElement('option'); o.value = k; o.textContent = t; if (k === cur) o.selected = true; inp.appendChild(o); }
          } else {
            inp = document.createElement('input'); inp.type = 'text'; inp.value = val ?? ''; inp.spellcheck = false;
            inp.maxLength = cb.maxLength || fe.len || 132;
            if (!fe.lc && !cb.lower) inp.classList.add('upper');
            if (values && values.length) { inp.classList.add('has-f4'); inp.title = values.slice(0, 12).map(([k, t]) => `${k}  ${t !== k ? t : ''}`.trim()).join('\n'); const f4 = () => { if (inp.readOnly) return; APP.popupList(inp, 'Possible Entries', values, inp.value, v => { inp.value = v; inp.dispatchEvent(new Event('change')); }); }; inp.addEventListener('dblclick', f4); inp.addEventListener('keydown', e => { if (e.key === 'F4') { e.preventDefault(); f4(); } }); }
          }
          inp.className += ' tc-in';
          inp.dataset.k = c.n + ':' + ri + ':' + fe.n;
          inp.style.width = (Math.max(fe.w, 2) * CW + (fe.w <= 3 ? 16 : 8)) + 'px';
          if (!editableCell) { inp.readOnly = true; inp.tabIndex = -1; inp.classList.add('ro'); if (inp.tagName === 'SELECT') inp.disabled = true; }
          else {
            let last = inp.value;
            const commit = () => {
              if (inp.value === last) return; last = inp.value;
              let v = inp.value; if (inp.classList.contains('upper')) v = v.toUpperCase();
              if (row === undefined) { if (v === '') return; env.pai(fe.n, () => { const nr = tb.add(); cb.set(nr, v); }); }
              else if (v !== (val ?? '')) env.pai(fe.n, () => cb.set(row, v));
            };
            inp.addEventListener('change', commit);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
          }
          td.appendChild(inp);
        }
      }
      if (row === undefined) tr.classList.add('tc-empty');
      if (tb?.rowClass && row !== undefined) { const cls = tb.rowClass(row); if (cls) tr.classList.add(cls); }
    }
    scroller.appendChild(table);
    wrap.appendChild(scroller);
    return wrap;
  },
};
