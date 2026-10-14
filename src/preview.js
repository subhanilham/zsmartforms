/* =====================================================================
   preview.js — layout preview of a form (static approximation of the
   print preview): pages, windows at their positions, texts with the
   style's paragraph/character formats, tables with their line types.
   Fields are shown as &FIELD& because no data is passed.
   ===================================================================== */
'use strict';

const Preview = {
  render(form) {
    const wrap = document.createElement('div'); wrap.className = 'pv-wrap';
    const ctx = form.ctx;
    const pxcm = 37.8;
    for (const page of form.pages) {
      const { w, h, format } = form.pageSize(page);
      const sh = document.createElement('div'); sh.className = 'pv-page'; sh.style.width = w * pxcm + 'px'; sh.style.height = h * pxcm + 'px';
      const cap = document.createElement('div'); cap.className = 'pv-cap'; cap.textContent = `${page.name} · ${page.caption} · ${format}`; wrap.appendChild(cap);
      for (const win of page.children.filter(c => c.type === 'WI')) {
        const oa = win.outattr; if (!oa) continue;
        const g = k => toCm(X.val(oa, k) || 0, X.val(oa, 'U_' + k) || 'CM', ctx);
        const d = document.createElement('div'); d.className = 'pv-win';
        d.style.left = g('WLEFT') * pxcm + 'px'; d.style.top = g('WTOP') * pxcm + 'px'; d.style.width = g('WWIDTH') * pxcm + 'px'; d.style.height = g('WHEIGHT') * pxcm + 'px';
        Preview.box(d, oa);
        d.title = win.name;
        const style = APP.styleFor(form, win);
        if (win.sub === 'G') d.appendChild(Preview.graphic(win.innerObj));
        else if (win.sub === 'A') d.appendChild(Preview.address());
        else for (const c of win.children) Preview.node(c, d, form, style);
        sh.appendChild(d);
      }
      wrap.appendChild(sh);
    }
    return wrap;
  },
  rgb(c, def) { return c ? `rgb(${+X.val(c, 'RED') || 0},${+X.val(c, 'GREEN') || 0},${+X.val(c, 'BLUE') || 0})` : def; },
  /* Box and Shading of an output attribute: frame lines with thickness / color / spacing,
     shading color mixed with white by the saturation (WSHADING 0..100) */
  box(d, oa) {
    if (!oa) return false;
    let any = false;
    for (const [s, css] of [['LEFT', 'Left'], ['TOP', 'Top'], ['RIGHT', 'Right'], ['BOTTOM', 'Bottom']]) {
      const a = X.path(oa, 'BORDER', s + 'ATTR');
      const dist = a ? toCm(X.val(a, 'DISTANCE') || 0, X.val(a, 'DISTANCEU') || 'CM') * 37.8 : 0;
      if (X.val(oa, 'BORDER', s + 'LINE') !== 'X') { if (dist) { d.style['padding' + css] = dist + 'px'; any = true; } continue; }
      const t = toCm(X.val(a, 'THICKNESS') || 0, X.val(a, 'THICKNESSU') || 'PT') * 37.8;
      d.style['border' + css] = `${Math.max(1, Math.round(t))}px solid ${Preview.rgb(X.kid(a, 'COLOR'), '#000')}`;
      if (dist) d.style['padding' + css] = dist + 'px';
      any = true;
    }
    const sh = +X.val(oa, 'WSHADING') || 0;
    if (sh) { d.style.background = `color-mix(in srgb, ${Preview.rgb(X.kid(oa, 'SHADINGCOL'), '#000')} ${Math.min(100, sh)}%, #fff)`; any = true; }
    return any;
  },
  /* template / table cell: frame lines and fill color of the pattern */
  cell(d, c) {
    const bi = X.kids(X.kid(c, 'BORDERS'), 'item')[0];
    if (!bi) return;
    for (const [s, css, col] of [['LLEFT', 'borderLeft', 'CLEFT'], ['LTOP', 'borderTop', 'CTOP'], ['LRIGHT', 'borderRight', 'CRIGHT'], ['LBOTTOM', 'borderBottom', 'CBOTTOM']]) {
      const th = parseFloat(X.val(bi, s));
      if (th > 0) d.style[css] = `${Math.max(1, Math.round(toCm(th, X.val(bi, s + '_U') || 'MM') * 37.8))}px solid ${Preview.rgb(X.kid(bi, col), '#000')}`;
    }
    /* shading = INTENSITY % of the shading color FILLCOLOR (0 = not filled) */
    const fc = X.kid(bi, 'FILLCOLOR');
    const sh = +X.val(bi, 'INTENSITY') || +X.val(c, 'SHADING') || 0;
    if (sh) d.style.background = `color-mix(in srgb, ${Preview.rgb(fc && X.val(fc, 'USED') === 'X' ? fc : null, '#000')} ${Math.min(100, sh)}%, #fff)`;
  },
  graphic(g) { const d = document.createElement('div'); d.className = 'pv-gr'; d.innerHTML = `${icon('graphic')}<span>${esc(X.val(g, 'GKEYBDS', 'NAME'))}</span>`; return d; },
  address() { const d = document.createElement('div'); d.className = 'pv-gr'; d.innerHTML = `${icon('address')}<span>Address</span>`; return d; },
  node(n, host, form, style) {
    const st = APP.styleFor(form, n) || style;
    /* nodes with Box and Shading get their own frame */
    if (['TI', 'GR', 'AD'].includes(n.type) && n.outattr && !host.dataset.boxed) {
      const b = document.createElement('div'); b.className = 'pv-box';
      if (Preview.box(b, n.outattr)) { b.dataset.boxed = '1'; Preview.node(n, b, form, style); delete b.dataset.boxed; host.appendChild(b); return; }
    }
    switch (n.type) {
      case 'TI': {
        const t = X.val(n.obj, 'TTYPE');
        let lines = [];
        if (!t) lines = form.textLines(n.obj);
        else if (t === 'R') lines = APP.textModuleLines(X.val(n.obj, 'REF_NAME')) || [{ f: '*', t: `[Text module ${X.val(n.obj, 'REF_NAME')}]` }];
        else if (t === 'I') lines = [{ f: X.val(n.obj, 'TKEY', 'PAR') || '*', t: `[Include ${X.val(n.obj, 'TKEY', 'OBJECT')} ${X.val(n.obj, 'TKEY', 'NAME')} ${X.val(n.obj, 'TKEY', 'ID')}]` }];
        else lines = [{ f: '*', t: `[Dynamic text ${X.val(n.obj, 'REF_NAME')}]` }];
        const pv = TextEditor.renderPreview(TextEditor.toParas(lines.filter(l => !/^\/[*]/.test(l.f))), st);
        pv.classList.add('pv-text');
        if (X.val(n.obj, 'APPMODE') === 'A') pv.classList.add('pv-append');
        host.appendChild(pv); break;
      }
      case 'GR': host.appendChild(Preview.graphic(n.obj)); break;
      case 'AD': host.appendChild(Preview.address()); break;
      case 'CD': { const t = n.children.find(c => c.sub === '+'); if (t) for (const c of t.children) Preview.node(c, host, form, st); break; }
      case 'SE': {
        if (n.sub === 'C' || n.sub === 'S') { host.appendChild(Preview.table(n, form, st)); break; }
        const d = document.createElement('div'); d.className = 'pv-sect'; if (n.outattr) Preview.box(d, n.outattr);
        for (const c of n.children) Preview.node(c, d, form, st);
        host.appendChild(d); break;
      }
      case 'EV': for (const c of n.children) Preview.node(c, host, form, st); break;
    }
  },
  table(n, form, style) {
    const o = n.obj, ctx = form.ctx, pxcm = 37.8;
    const t = document.createElement('div'); t.className = 'pv-table';
    const rowOut = (row, ltName) => {
      const r = document.createElement('div'); r.className = 'pv-row';
      const cells = cellsOf(o, ltName);
      const nodes = row ? row.children.filter(c => c.kind === 'SE-E') : [];
      cells.forEach((c, i) => {
        const d = document.createElement('div'); d.className = 'pv-cell'; d.style.width = toCm(X.val(c, 'CWIDTH') || 0, X.val(c, 'U_CWIDTH') || 'CM', ctx) * pxcm + 'px';
        Preview.cell(d, c);
        const cn = nodes[i]; if (cn) for (const k of cn.children) Preview.node(k, d, form, style);
        r.appendChild(d);
      });
      t.appendChild(r);
    };
    if (n.sub === 'C') {
      for (const ev of n.children.filter(c => c.type === 'EV' && 'HBF'.includes(c.sub))) {
        const walk = x => { for (const c of x.children) { if (c.kind === 'SE-R') rowOut(c, X.val(c.outattr, 'T_LINETYPE')); else if (c.type === 'SE' || c.type === 'EV') walk(c); } };
        walk(ev);
      }
    } else {
      /* template: lines from STATLINES, cells addressed by T_LINENR / T_CELLNR of the children */
      const lines = X.kids(X.kid(o, 'STATLINES'), 'item');
      for (const lt of lines) for (let l = +X.val(lt, 'LINEFROM'); l <= +X.val(lt, 'LINETO'); l++) {
        const r = document.createElement('div'); r.className = 'pv-row';
        cellsOf(o, X.val(lt, 'NAME')).forEach((c, ci) => {
          const d = document.createElement('div'); d.className = 'pv-cell'; d.style.width = toCm(X.val(c, 'CWIDTH') || 0, X.val(c, 'U_CWIDTH') || 'CM', ctx) * pxcm + 'px';
          d.style.minHeight = toCm(X.val(lt, 'LHEIGHT') || 0, X.val(lt, 'U_LHEIGHT') || 'CM', ctx) * pxcm + 'px';
          Preview.cell(d, c);
          for (const k of n.children) if (+X.val(k.outattr, 'T_LINENR') === l && +X.val(k.outattr, 'T_CELLNR') === ci + 1) Preview.node(k, d, form, style);
          r.appendChild(d);
        });
        t.appendChild(r);
      }
    }
    return t;
  },
};
