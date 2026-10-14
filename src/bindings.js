/* =====================================================================
   bindings.js — PBO/PAI of the Form Builder subscreens (SAPLSTXB).
   Each entry maps dynpro field names to the XML of the current node.
   ===================================================================== */
'use strict';

/* ---------- value lists from the DDIC domains (probe 3/5) ---------- */
const VL = {
  unitH: UNITS_H.map(u => [u, u]), unitV: UNITS_V.map(u => [u, u]), unitAll: UNITS_ALL.map(u => [u, u]),
  wtype: [['M', 'Main Window'], ['T', 'Secondary Window'], ['C', 'Copies Window'], ['L', 'Final Window']],
  textType: [['E', 'Text Element'], ['M', 'Text Module'], ['I', 'Include Text'], ['D', 'Dynamic Text']],
  appmode: [['P', 'New Paragraph'], ['L', 'New Line'], ['A', 'Append directly']],
  typing: [['TYPE', 'TYPE'], ['LIKE', 'LIKE'], ['TYPE REF TO', 'TYPE REF TO']],
  typingG: [['TYPE', 'TYPE'], ['LIKE', 'LIKE'], ['TYPE REF TO', 'TYPE REF TO'], ['TYPE TABLE OF', 'TYPE TABLE OF'], ['LIKE TABLE OF', 'LIKE TABLE OF'], ['TYPE RANGE OF', 'TYPE RANGE OF']],
  typingFs: [['TYPE', 'TYPE'], ['LIKE', 'LIKE'], ['TYPE ANY', 'TYPE ANY'], ['TYPE STANDARD TABLE', 'TYPE STANDARD TABLE'], ['TYPE ANY TABLE', 'TYPE ANY TABLE']],
  tabhtype: [['I', 'INTO'], ['A', 'ASSIGNING']],
  calcOp: [['SUM', 'Total'], ['AVG', 'Mean Value'], ['CNT', 'Number']],
  calcEvt: [['B', 'Before Loop'], ['A', 'After Loop'], ['R', 'Before Sorting'], ['T', 'After Sorting']],
  calcRes: [['', ''], ['S', 'Sort Criterion']],
  alignH: [['L', 'Left'], ['C', 'Centered'], ['R', 'Right']],
  alignV: [['T', 'Top'], ['C', 'Centered'], ['B', 'Bottom']],
  relmode: [['W', 'Window'], ['P', 'Last paragraph']],
  tabAlign: [['L', 'Left-justif.'], ['C', 'Centered'], ['R', 'Right-justif.'], ['D', 'Absolute']],
  vpos: [['C', 'Current'], ['A', 'Absolut']],
  printmode: [['', ''], ['S', 'S  Simplex'], ['D', 'D  Duplex'], ['T', 'T  Tumble duplex']],
  bgrPrint: [['', 'Form Painter only'], ['V', 'Print Preview'], ['X', 'Print preview and print']],
  xouttype: [['', 'Standard Output'], ['XSF', 'XSF Output'], ['HTM', 'XSF Output + HTML']],
  xoutmode: [['S', 'Spool'], ['A', 'Application']],
  refType: [['CURR', 'CURR'], ['QUAN', 'QUAN']],
  resolution: ['', '75', '100', '150', '200', '300', '600'].map(v => [v, v]),
  cop: [['EQ', '= Equal to'], ['NE', '≠ Not equal to'], ['GT', '> Greater than'], ['LT', '< Less than'], ['GE', '≥ Greater than/equal to'], ['LE', '≤ Less than/equal to'], ['BT', '[ ] Between'], ['NB', '] [ Not between'], ['CP', '* Pattern'], ['NP', '!* Exclude pattern']],
};
const COP_ICON = { EQ: '@20\\QSelect: Equal to@', NE: '@21\\QSelect: Not equal to@', GT: '@22\\QSelect: Greater than@', LT: '@23\\QSelect: Less than@',
  GE: '@24\\QSelect: Greater than/equal to@', LE: '@25\\QSelect: Less than/equal to@', BT: '@26\\QSelect: Between@', NB: '@27\\QSelect: Not between@',
  CP: '@28\\QSelect: Pattern@', NP: '@29\\QSelect: Exclude pattern@' };
const COP_SYM = { EQ: '=', NE: '≠', GT: '>', LT: '<', GE: '≥', LE: '≤', BT: '[ ]', NB: '] [', CP: '*', NP: '!*' };

/* ---------- field-binding helpers ---------- */
const B = {
  /* plain leaf; el/ens are functions returning the element (read) and ensuring it (write) */
  leaf(el, ens, name, opt = {}) {
    return {
      get: () => { const e = el(); const v = e ? X.val(e, name) : ''; return opt.out ? opt.out(v) : v; },
      set: v => { if (opt.in) v = opt.in(v); if (opt.check) opt.check(v); X.set(v === '' && !el() ? null : ens(), name, v); },
      values: opt.values ? () => opt.values : undefined, lower: opt.lower, maxLength: opt.max,
    };
  },
  dec(el, ens, name, decimals = 2) { return B.leaf(el, ens, name, { in: v => normDec(v, decimals) }); },
  flag(el, ens, name, onVal = 'X') {
    return { get: () => { const e = el(); return !!e && X.val(e, name) === onVal; }, set: on => X.set(on ? ens() : el() || ens(), name, on ? onVal : '') };
  },
  radio(el, ens, name, value, extra) {
    return { get: () => { const e = el(); return (e ? X.val(e, name) : '') === value; }, set: () => { X.set(ens(), name, value); extra && extra(); } };
  },
  unit(el, ens, name, list = VL.unitAll) {
    return B.leaf(el, ens, name, { values: list, check: v => { if (v && !list.some(([k]) => k === v)) throw new Error(`Unit ${v} is not allowed`); } });
  },
  num3(el, ens, name) { return B.leaf(el, ens, name, { in: v => v === '' ? '' : String(parseInt(v, 10) || 0).padStart(3, '0') }); },
  path(el, ens, names, opt = {}) {
    return {
      get: () => { const e = el(); return e ? X.val(e, ...names) : ''; },
      set: v => { if (opt.in) v = opt.in(v); if (v === '' && !el()) return; X.setPath(ens(), names, v); },
      values: opt.values ? () => opt.values : undefined,
    };
  },
  /* field that holds either a literal or a dynamic &FIELD& value */
  sym(getEl, ensEl, names) {
    const isSym = v => /^&.*&$/.test(v);
    return {
      static: {
        get: () => { const v = getEl() ? X.val(getEl(), ...names) : ''; return isSym(v) ? '' : v; },
        set: v => X.setPath(ensEl(), names, v),
      },
      dyn: {
        get: () => { const v = getEl() ? X.val(getEl(), ...names) : ''; return isSym(v) ? v : ''; },
        set: v => { v = v.trim(); if (v && !isSym(v)) v = '&' + v.replace(/^&|&$/g, '') + '&'; X.setPath(ensEl(), names, v); },
        lower: true,
      },
      isSym: () => isSym(getEl() ? X.val(getEl(), ...names) : ''),
    };
  },
};

/* rows of an item list with simple column bindings */
function itemTable(listEl, ensList, cols, opt = {}) {
  const rowsOf = () => { const l = listEl(); return l ? X.kids(l, 'item').filter(opt.filter || (() => true)) : []; };
  const tb = {
    rows: rowsOf,
    col: {},
    add: () => { const l = ensList(); const it = X.mk(l.ownerDocument, 'item'); const after = opt.insertAfter ? opt.insertAfter(l) : null; l.insertBefore(it, after ? after.nextSibling : null); opt.init && opt.init(it); return it; },
    insertAt: idx => { const rows = rowsOf(); const l = ensList(); const it = X.mk(l.ownerDocument, 'item'); l.insertBefore(it, rows[idx] || (opt.insertAfter ? opt.insertAfter(l)?.nextSibling : null) || null); opt.init && opt.init(it); return it; },
    remove: idxs => { const rows = rowsOf(); for (const i of [...idxs].sort((a, b) => b - a)) rows[i]?.remove(); const l = listEl(); if (l && !X.kids(l, 'item').length && opt.dropEmpty !== false) l.remove(); },
  };
  for (const [fname, spec] of Object.entries(cols)) {
    const s = typeof spec === 'string' ? { el: spec } : spec;
    tb.col[fname] = {
      get: row => s.get ? s.get(row) : (s.check ? X.val(row, s.el) === 'X' : X.val(row, s.el)),
      set: s.ro ? undefined : (row, v) => { if (s.set) return s.set(row, v); if (s.check) v = v ? 'X' : ''; if (s.in) v = s.in(v); X.set(row, s.el, v); },
      values: s.values ? () => s.values : undefined, ro: s.roRow, lower: s.lower, maxLength: s.max,
    };
  }
  return tb;
}
/* standard table-control function codes for item tables */
function tcCodes(tcName, tb, ctx, extra = {}) {
  const sel = env => [...env.sel(tcName)].sort((a, b) => a - b);
  return {
    TC_INSERT: env => env.pai('Insert row', () => { const s = sel(env); tb.insertAt(s.length ? s[0] : tb.rows().length); }),
    TC_DELETE: env => { const s = sel(env); if (!s.length) return env.msg('W', 'Select at least one row'); env.pai('Delete rows', () => tb.remove(s)); env.sel(tcName).clear(); },
    TC_CUT: env => { const s = sel(env); if (!s.length) return env.msg('W', 'Select at least one row'); APP.tcClip = { tc: tcName, rows: s.map(i => tb.rows()[i].cloneNode(true)) }; env.pai('Cut rows', () => tb.remove(s)); env.sel(tcName).clear(); },
    TC_COPY: env => { const s = sel(env); if (!s.length) return env.msg('W', 'Select at least one row'); APP.tcClip = { tc: tcName, rows: s.map(i => tb.rows()[i].cloneNode(true)) }; env.msg('S', `${s.length} row(s) copied`); },
    TC_PASTE: env => {
      const c = APP.tcClip; if (!c || !c.rows.length) return env.msg('W', 'Clipboard is empty');
      env.pai('Paste rows', () => { const s = sel(env); let at = s.length ? s[0] : tb.rows().length; for (const r of c.rows) { const it = tb.insertAt(at++); it.replaceWith(it.ownerDocument.importNode(r, true)); } });
    },
    ...extra,
  };
}

/* ---------- lists used by dropdowns ---------- */
function pageList(form) { return form.pages.map(p => [p.name, `${p.name}  ${p.caption}`.trim()]); }
function lineTypes(sect) { return X.kids(X.kid(sect, 'DYNLINES'), 'item').map(i => X.val(i, 'NAME')); }

/* ---------- Box & shading (1011 / 1014) ---------- */
const SIDES = [['LEFT', 'L'], ['TOP', 'T'], ['RIGHT', 'R'], ['BOTTOM', 'B']];
function borderApi(node) {
  const oa = () => node.outattr, ens = () => node.ensureOutattr();
  const side = s => X.path(oa(), 'BORDER', s + 'ATTR');
  const ensSide = s => {
    const a = X.ensurePath(ens(), 'BORDER', s + 'ATTR');
    if (!X.kid(a, 'THICKNESS')) { X.set(a, 'THICKNESS', '0.00'); X.set(a, 'THICKNESSU', 'PT'); X.set(a, 'DISTANCE', '0.00'); X.set(a, 'DISTANCEU', 'CM'); const c = X.ensure(a, 'COLOR'); for (const k of ['RED', 'GREEN', 'BLUE', 'TRANS']) X.set(c, k, '000'); }
    return a;
  };
  const on = s => X.val(oa(), 'BORDER', s + 'LINE') === 'X';
  const api = {
    on, side, ensSide,
    any: () => SIDES.some(([s]) => on(s)),
    setOn: (s, v) => { ensSide(s); X.set(X.ensurePath(ens(), 'BORDER'), s + 'LINE', v ? 'X' : ''); },
    active: () => SIDES.map(([s]) => s).filter(on),
    /* "default" values shown on 1011 = first active side, else LEFT */
    ref: () => side(api.active()[0] || 'LEFT'),
    color: s => { const c = X.kid(side(s), 'COLOR'); return c ? '#' + ['RED', 'GREEN', 'BLUE'].map(k => (+X.val(c, k) || 0).toString(16).padStart(2, '0')).join('') : '#000000'; },
    setColor: (s, hex) => { const c = X.ensure(ensSide(s), 'COLOR'); const h = hex.replace('#', ''); ['RED', 'GREEN', 'BLUE'].forEach((k, i) => X.set(c, k, String(parseInt(h.slice(i * 2, i * 2 + 2), 16)).padStart(3, '0'))); X.set(c, 'TRANS', '000'); },
    shadeColor: () => { const c = X.kid(oa(), 'SHADINGCOL'); return c ? '#' + ['RED', 'GREEN', 'BLUE'].map(k => (+X.val(c, k) || 0).toString(16).padStart(2, '0')).join('') : '#ffffff'; },
    setShadeColor: hex => { const c = X.ensure(ens(), 'SHADINGCOL'); const h = hex.replace('#', ''); ['RED', 'GREEN', 'BLUE'].forEach((k, i) => X.set(c, k, String(parseInt(h.slice(i * 2, i * 2 + 2), 16)).padStart(3, '0'))); X.set(c, 'TRANS', '000'); },
  };
  return api;
}
function colorPicker(get, set, env, label) {
  const wrap = document.createElement('span'); wrap.className = 'color-pick';
  const inp = document.createElement('input'); inp.type = 'color'; inp.value = get(); inp.disabled = !env.edit; inp.title = label || 'Color';
  inp.addEventListener('change', () => env.pai('Color', () => set(inp.value)));
  const sw = document.createElement('span'); sw.className = 'hex'; sw.textContent = get().toUpperCase();
  wrap.append(inp, sw); return wrap;
}
/* SAP (LSTXBF…): Boxes/Shadings are not allowed within a table — tables and templates
   themselves and every node inside them get no frame or shading */
const BOX_IN_TABLE = 'Boxes/Shadings are not allowed within a table';
function boxLocked(node) { return !!node && (node.kind === 'SE-C' || node.kind === 'SE-S' || !!(node.tableContext && node.tableContext())); }
function hasBox(node) {
  const oa = node && node.outattr; if (!oa) return false;
  return SIDES.some(([s]) => X.val(oa, 'BORDER', s + 'LINE') === 'X') || (+X.val(oa, 'WSHADING') || 0) > 0;
}
function bindBox(ctx, node) {
  const locked = boxLocked(node);
  const bp = borderApi(node);
  const all = SIDES.map(([s]) => s);
  const applyAll = fn => { const act = bp.active(); for (const s of (act.length ? act : all)) fn(s); };
  return {
    f: {
      BP_LINES: { get: () => bp.any(), set: v => { if (v === bp.any()) return; for (const s of all) bp.setOn(s, v); } },
      'SSFSCREEN-DISTD': { get: () => X.val(bp.ref(), 'DISTANCE'), set: v => { v = normDec(v); applyAll(s => X.set(bp.ensSide(s), 'DISTANCE', v || '0.00')); } },
      'SSFSCREEN-U_DISTD': { get: () => X.val(bp.ref(), 'DISTANCEU'), set: v => applyAll(s => X.set(bp.ensSide(s), 'DISTANCEU', v)), values: () => VL.unitAll },
      'SSFSCREEN-THICKD': { get: () => X.val(bp.ref(), 'THICKNESS'), set: v => { v = normDec(v); applyAll(s => X.set(bp.ensSide(s), 'THICKNESS', v || '0.00')); } },
      'SSFSCREEN-U_THICKD': { get: () => X.val(bp.ref(), 'THICKNESSU'), set: v => applyAll(s => X.set(bp.ensSide(s), 'THICKNESSU', v)), values: () => VL.unitAll },
      'SSFSCREEN-WSHADING': { get: () => { const v = X.val(node.outattr, 'WSHADING'); return v ? String(+v) : ''; }, set: v => { const n = v === '' ? 0 : parseInt(v, 10); if (!(n >= 0 && n <= 100)) throw new Error('Enter a value between 0 and 100'); const was = +X.val(node.outattr, 'WSHADING') || 0; if (n === was) return; X.set(node.ensureOutattr(), 'WSHADING', n ? String(n).padStart(3, '0') : ''); if (n && !was && !X.kid(node.outattr, 'SHADINGCOL')) bp.setShadeColor('#000000'); } },
      'SSFSCREEN-WEMPTY': B.flag(() => node.outattr, () => node.ensureOutattr(), 'WEMPTY'),
    },
    fc: {
      BP_CLEAR: env => env.pai('Reset box', () => { for (const s of all) bp.setOn(s, false); if (locked && node.outattr && X.val(node.outattr, 'WSHADING')) X.set(node.outattr, 'WSHADING', ''); }),
      BP_OPTIONS: env => { if (locked) return APP.msg('E', BOX_IN_TABLE); APP.dialog1014(node, env); },
    },
    vis: el => {
      if (['SSFSCREEN-DISTD', 'SSFSCREEN-U_DISTD', 'SSFSCREEN-THICKD', 'SSFSCREEN-U_THICKD'].includes(el.n)) return true;
      return undefined;
    },
    ro: el => (locked && el.n !== 'BP_CLEAR') || (['SSFSCREEN-DISTD', 'SSFSCREEN-U_DISTD', 'SSFSCREEN-THICKD', 'SSFSCREEN-U_THICKD'].includes(el.n) && !bp.any()),
    cust: {
      BP_COLOR_DEFAULT: (host, env) => host.appendChild(colorPicker(() => bp.color(bp.active()[0] || 'LEFT'), hex => applyAll(s => bp.setColor(s, hex)), locked ? { ...env, edit: false } : env, 'Line color')),
      BP_COLOR_SHADING: (host, env) => host.appendChild(colorPicker(() => bp.shadeColor(), hex => bp.setShadeColor(hex), locked ? { ...env, edit: false } : env, 'Shading color')),
      BORDERPAINTER: (host, env) => {
        host.appendChild(borderPainter(bp, node, locked ? { ...env, edit: false } : env));
        /* like SAP's PBO message on this screen */
        if (locked && hasBox(node)) APP.msg('E', `${BOX_IN_TABLE} – reset the box with the button next to "Lines With"`);
      },
    },
  };
}
function borderPainter(bp, node, env) {
  const d = document.createElement('div'); d.className = 'border-painter';
  const tools = document.createElement('div'); tools.className = 'bp-tools';
  const btn = (ic, tip, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tb-btn'; b.innerHTML = icon(ic); b.title = tip; b.disabled = !env.edit; b.onclick = () => env.pai(tip, fn); tools.appendChild(b); };
  btn('border_outside', 'Outer Frame', () => SIDES.forEach(([s]) => bp.setOn(s, true)));
  btn('border_left', 'Left Frame', () => bp.setOn('LEFT', !bp.on('LEFT')));
  btn('border_right', 'Right Frame', () => bp.setOn('RIGHT', !bp.on('RIGHT')));
  btn('border_top', 'Upper Frame', () => bp.setOn('TOP', !bp.on('TOP')));
  btn('border_bottom', 'Lower Frame', () => bp.setOn('BOTTOM', !bp.on('BOTTOM')));
  btn('reset', 'Reset Frame', () => SIDES.forEach(([s]) => bp.setOn(s, false)));
  const pv = document.createElement('div'); pv.className = 'bp-preview';
  const shade = +X.val(node.outattr, 'WSHADING') || 0;
  if (shade) { const sc = bp.shadeColor(); pv.style.background = `color-mix(in srgb, ${sc} ${shade}%, #fff)`; }
  for (const [s] of SIDES) {
    const line = document.createElement('div'); line.className = 'bp-side bp-' + s.toLowerCase() + (bp.on(s) ? ' on' : '');
    if (bp.on(s)) { line.style.background = bp.color(s); const w = Math.max(1, Math.round(toCm(X.val(bp.side(s), 'THICKNESS'), X.val(bp.side(s), 'THICKNESSU') || 'PT') * 37.8)); line.style.setProperty('--w', Math.min(w, 6) + 'px'); }
    line.title = s.charAt(0) + s.slice(1).toLowerCase() + ' line: click to toggle';
    if (env.edit) line.onclick = () => env.pai('Toggle line', () => bp.setOn(s, !bp.on(s)));
    pv.appendChild(line);
  }
  const txt = document.createElement('div'); txt.className = 'bp-sample'; txt.textContent = 'Text'; pv.appendChild(txt);
  d.append(tools, pv); return d;
}
function bind1014(ctx, node) {
  const bp = borderApi(node);
  const f = {};
  for (const [s, k] of SIDES) {
    f['BP_LINE' + k] = { get: () => bp.on(s), set: v => bp.setOn(s, v) };
    f['SSFSCREEN-DIST' + k] = { get: () => X.val(bp.side(s), 'DISTANCE'), set: v => X.set(bp.ensSide(s), 'DISTANCE', normDec(v) || '0.00') };
    f['SSFSCREEN-U_DIST' + k] = { get: () => X.val(bp.side(s), 'DISTANCEU'), set: v => X.set(bp.ensSide(s), 'DISTANCEU', v), values: () => VL.unitAll };
    f['SSFSCREEN-THICK' + k] = { get: () => X.val(bp.side(s), 'THICKNESS'), set: v => X.set(bp.ensSide(s), 'THICKNESS', normDec(v) || '0.00') };
    f['SSFSCREEN-U_THICK' + k] = { get: () => X.val(bp.side(s), 'THICKNESSU'), set: v => X.set(bp.ensSide(s), 'THICKNESSU', v), values: () => VL.unitAll };
  }
  const fc = {}; const cust = {};
  for (const [s, k] of SIDES) {
    fc['BP_CLEAR' + k] = env => env.pai('Reset line', () => bp.setOn(s, false));
    cust['BP_COLOR_' + { L: 'LEFT', T: 'TOP', R: 'RIGHT', B: 'BOTTOM' }[k]] = (host, env) => host.appendChild(colorPicker(() => bp.color(s), hex => bp.setColor(s, hex), env));
  }
  return { f, fc, cust, ro: el => { const m = /(DIST|THICK)([LTRB])$/.exec(el.n); return m ? !bp.on(SIDES.find(x => x[1] === m[2])[0]) : false; } };
}

/* ---------- conditions (1300) ---------- */
function condTable(getList, ensList, ctx) {
  const tb = itemTable(getList, ensList, {
    'G_OUTPUT_WHERE-OP1': { get: r => X.val(r, 'LOP') === 'OR' && !X.kid(r, 'OP1') ? 'OR' : X.val(r, 'OP1'), set: (r, v) => X.set(r, 'OP1', v), roRow: r => X.val(r, 'LOP') === 'OR' && !X.kid(r, 'COP') },
    'G_OUTPUT_WHERE-COP': { get: r => X.val(r, 'COP'), ro: true },
    'G_OUTPUT_WHERE-OP2': { get: r => X.val(r, 'OP2'), set: (r, v) => X.set(r, 'OP2', v), lower: true, roRow: r => X.val(r, 'LOP') === 'OR' && !X.kid(r, 'COP') },
    'G_OUTPUT_WHERE-ICON': { get: r => X.val(r, 'COP') },
  }, { init: it => { X.set(it, 'COP', 'EQ'); X.set(it, 'ICON', COP_ICON.EQ); } });
  const fixLop = () => {
    const rows = tb.rows();
    rows.forEach((r, i) => {
      const isOr = X.val(r, 'LOP') === 'OR' && !X.kid(r, 'COP');
      if (isOr) return;
      const prev = rows[i - 1];
      const want = !prev || (X.val(prev, 'LOP') === 'OR' && !X.kid(prev, 'COP')) ? '' : 'AND';
      if (X.val(r, 'LOP') !== want && (want === '' || !X.kid(r, 'LOP'))) X.set(r, 'LOP', want);
    });
  };
  const add0 = tb.add, ins0 = tb.insertAt;
  tb.add = () => { const r = add0(); fixLop(); return r; };
  tb.insertAt = i => { const r = ins0(i); fixLop(); return r; };
  tb.col['G_OUTPUT_WHERE-ICON'].display = r => (X.val(r, 'LOP') === 'OR' && !X.kid(r, 'COP')) ? '' : (COP_SYM[X.val(r, 'COP')] || X.val(r, 'COP'));
  tb.col['G_OUTPUT_WHERE-ICON'].set = () => {};
  tb.col['G_OUTPUT_WHERE-ICON'].click = (row, btn, env) => APP.popupList(btn, 'Select Comparison Operator', VL.cop, X.val(row, 'COP'), v => env.pai('Operator', () => { X.set(row, 'COP', v); X.set(row, 'ICON', COP_ICON[v]); }));
  tb.rowClass = r => (X.val(r, 'LOP') === 'OR' && !X.kid(r, 'COP')) ? 'or-row' : '';
  tb.fixLop = fixLop;
  return tb;
}
function bind1300(ctx, node, { alternative = false } = {}) {
  const cEl = alternative ? () => node.obj : () => node.cond;
  const cEns = alternative ? () => node.obj : () => node.ensureCond();
  const list = () => X.kid(cEl(), 'COND');
  const tb = condTable(list, () => X.ensure(cEns(), 'COND'), ctx);
  const rm0 = tb.remove; tb.remove = idx => { rm0(idx); if (!alternative) node.dropCondIfEmpty(); };
  const oc = k => ({ get: () => X.val(cEl(), 'OCOND', k) === 'X', set: v => { X.setPath(cEns(), ['OCOND', k], v ? 'X' : ''); const o = X.kid(cEl(), 'OCOND'); if (o && !o.children.length) o.remove(); if (!alternative) node.dropCondIfEmpty(); } });
  const f = {
    'SSFSCREEN-CON_FPAGE': oc('FPAGE'), 'SSFSCREEN-CON_NFPAGE': oc('NFPAGE'), 'SSFSCREEN-CON_LPAGE': oc('LPAGE'), 'SSFSCREEN-CON_NLPAGE': oc('NLPAGE'),
    'SSFSCREEN-CON_PBREAK': oc('PAGEBREAK'), 'SSFSCREEN-CON_HEADER': oc('HEADER'), 'SSFSCREEN-CON_FOOTER': oc('FOOTER'),
    'SSFSCREEN-CON_POUT': { get: () => !!X.val(cEl(), 'OCOND', 'PAGENAME', 'INAME') || !!ctx.ui.conPout, set: v => { ctx.ui.conPout = v; if (!v) { const o = X.path(cEl(), 'OCOND'); X.remove(o || cEns(), 'PAGENAME'); if (o && !o.children.length) o.remove(); node.dropCondIfEmpty?.(); } } },
    'SSFSCREEN-CON_PNAME': { get: () => X.val(cEl(), 'OCOND', 'PAGENAME', 'INAME'), set: v => { X.setPath(cEns(), ['OCOND', 'PAGENAME', 'INAME'], v); }, values: () => [['', ''], ...pageList(ctx.form)] },
  };
  return {
    f, tc: { TC_OUTPUT_WHERE: tb },
    fc: tcCodes('TC_OUTPUT_WHERE', tb, ctx, {
      TC_CONDOR: env => env.pai('Insert OR', () => { const s = [...env.sel('TC_OUTPUT_WHERE')]; const at = s.length ? s[0] : tb.rows().length; const l = X.ensure(cEns(), 'COND'); const it = X.mk(l.ownerDocument, 'item'); l.insertBefore(it, tb.rows()[at] || null); X.set(it, 'LOP', 'OR'); tb.fixLop(); }),
      CHECK: env => APP.checkNode(node, env),
    }),
    vis: el => {
      if (alternative && (el.n === 'FRAME' || el.n.startsWith('SSFSCREEN-CON_'))) return false;
      if (el.n === 'SSFSCREEN-CON_PNAME') return !!X.val(cEl(), 'OCOND', 'PAGENAME', 'INAME') || !!ctx.ui.conPout;
      return undefined;
    },
  };
}

/* ---------- table / template line-type editors (1094, 1095) ---------- */
function cellsOf(sect, line) { return X.kids(X.kid(sect, 'CELLS'), 'item').filter(c => X.val(c, 'NAME') === line).sort((a, b) => +X.val(a, 'COLUMNNR') - +X.val(b, 'COLUMNNR')); }
function renumberCells(sect, line) { cellsOf(sect, line).forEach((c, i) => X.set(c, 'COLUMNNR', String(i + 1).padStart(3, '0'))); }
function lineTable(ctx, node, kind) {
  const sect = node.obj, form = ctx.form;
  const listName = kind === 'dyn' ? 'DYNLINES' : 'STATLINES';
  const prefix = kind === 'dyn' ? 'G_OUTPUT_DYNTAB-' : 'G_OUTPUT_STRUCT-';
  const ncols = kind === 'dyn' ? 5 : 4;
  const off = () => ctx.ui.colOffset || 0;
  const cols = {
    NAME: {
      get: r => X.val(r, 'NAME'),
      set: (r, v) => {
        v = v.trim().toUpperCase(); const old = X.val(r, 'NAME'); if (!v) throw new Error('Enter a name for the line type');
        if (lineTypes(sect).concat(X.kids(X.kid(sect, 'STATLINES'), 'item').map(i => X.val(i, 'NAME'))).filter(n => n === v).length && v !== old) throw new Error(`Line type ${v} already exists`);
        X.set(r, 'NAME', v);
        for (const c of cellsOf(sect, old)) X.set(c, 'NAME', v);
        for (const n of node.children) for (const d of [n, ...form.all.filter(x => x.ancestors().includes(n))]) if (d.outattr && X.val(d.outattr, 'T_LINETYPE') === old) X.set(d.outattr, 'T_LINETYPE', v);
        for (const it of X.kids(X.kid(sect, 'STATLINES'), 'item')) if (X.val(it, 'REFERENCE') === old) X.set(it, 'REFERENCE', v);
      },
    },
  };
  if (kind === 'dyn') {
    cols.DEFAULTVAL = { get: r => X.val(r, 'DEFAULTVAL') === 'X', set: (r, v) => { if (!v) return; for (const it of X.kids(X.kid(sect, 'DYNLINES'), 'item')) X.set(it, 'DEFAULTVAL', it === r ? 'X' : ''); } };
    cols.PROTECT = { check: true, el: 'PROTECT' };
  } else {
    cols.LINEFROM = { get: r => String(+X.val(r, 'LINEFROM') || ''), set: (r, v) => X.set(r, 'LINEFROM', String(parseInt(v, 10) || 1).padStart(3, '0')) };
    cols.LINETO = { get: r => String(+X.val(r, 'LINETO') || ''), set: (r, v) => X.set(r, 'LINETO', String(parseInt(v, 10) || 1).padStart(3, '0')) };
    cols.REFERENCE = { get: r => X.val(r, 'REFERENCE'), set: (r, v) => X.set(r, 'REFERENCE', v.toUpperCase()) };
    cols.LHEIGHT = { get: r => X.val(r, 'LHEIGHT'), set: (r, v) => X.set(r, 'LHEIGHT', normDec(v) || '0.00') };
    cols.U_LHEIGHT = { get: r => X.val(r, 'U_LHEIGHT'), set: (r, v) => X.set(r, 'U_LHEIGHT', v), values: VL.unitV };
  }
  for (let k = 1; k <= ncols; k++) {
    cols['COL' + k] = {
      get: r => { const c = cellsOf(sect, X.val(r, 'NAME'))[off() + k - 1]; return c ? X.val(c, 'CWIDTH') : ''; },
      set: (r, v) => {
        const name = X.val(r, 'NAME'); let cells = cellsOf(sect, name); const idx = off() + k - 1;
        if (v === '' && cells[idx]) { cells[idx].remove(); renumberCells(sect, name); return; }
        v = normDec(v);
        while (cells.length <= idx) { form.addCell(X.ensure(sect, 'CELLS'), name, cells.length + 1, '0.00', 'CM'); cells = cellsOf(sect, name); }
        X.set(cells[idx], 'CWIDTH', v);
      },
    };
    cols['COL' + k + 'U'] = {
      get: r => { const c = cellsOf(sect, X.val(r, 'NAME'))[off() + k - 1]; return c ? X.val(c, 'U_CWIDTH') : ''; },
      set: (r, v) => { const c = cellsOf(sect, X.val(r, 'NAME'))[off() + k - 1]; if (c) X.set(c, 'U_CWIDTH', v); }, values: VL.unitH,
    };
  }
  const real = {};
  for (const [k, v] of Object.entries(cols)) real[prefix + k] = v;
  const tb = itemTable(() => X.kid(sect, listName), () => X.ensure(sect, listName), real, {
    dropEmpty: false,
    init: it => {
      const used = new Set([...lineTypes(sect), ...X.kids(X.kid(sect, 'STATLINES'), 'item').map(i => X.val(i, 'NAME'))]);
      const base = kind === 'dyn' ? '%LTYPE' : '%C'; let n = 1; while (used.has(base + n)) n++;
      X.set(it, 'NAME', base + n);
      if (kind === 'dyn') { X.set(it, 'SHADING', '000'); if (!lineTypes(sect).length) X.set(it, 'DEFAULTVAL', 'X'); }
      else {
        const rows = X.kids(X.kid(sect, 'STATLINES'), 'item'); const last = rows.filter(r => r !== it).reduce((m, r) => Math.max(m, +X.val(r, 'LINETO') || 0), 0);
        X.set(it, 'LINEFROM', String(last + 1).padStart(3, '0')); X.set(it, 'LINETO', String(last + 1).padStart(3, '0')); X.set(it, 'LHEIGHT', '0.50'); X.set(it, 'U_LHEIGHT', 'CM'); X.set(it, 'SHADING', '000');
      }
      form.addCell(X.ensure(sect, 'CELLS'), X.val(it, 'NAME'), 1, '1.00', 'CM');
    },
  });
  const rm0 = tb.remove;
  tb.remove = idxs => { const rows = tb.rows(); for (const i of idxs) { const nm = X.val(rows[i], 'NAME'); for (const c of cellsOf(sect, nm)) c.remove(); } rm0(idxs); };
  tb.headerValue = n => { const m = /SCR_COL_HEAD(\d)(U?)$/.exec(n); if (!m) return ''; return m[2] ? '' : String(off() + +m[1]); };
  tb.label = {};
  return tb;
}
function bindLineTypes(ctx, node, kind) {
  const tcName = kind === 'dyn' ? 'TC_OUTPUT_DYNTAB' : 'TC_OUTPUT_STRUCT';
  const tb = lineTable(ctx, node, kind);
  const sect = node.obj;
  const maxCells = () => Math.max(0, ...tb.rows().map(r => cellsOf(sect, X.val(r, 'NAME')).length));
  const scroll = d => env => { ctx.ui.colOffset = Math.max(0, Math.min((ctx.ui.colOffset || 0) + d, Math.max(0, maxCells() - 1))); env.rerender(); };
  const selRow = env => { const s = [...env.sel(tcName)]; return s.length ? tb.rows()[s[0]] : null; };
  const fc = tcCodes(tcName, tb, ctx, {
    TC_C_INSERT: env => { const r = selRow(env); if (!r) return env.msg('W', 'Select a line type'); env.pai('Insert cell', () => { const nm = X.val(r, 'NAME'); ctx.form.addCell(X.ensure(sect, 'CELLS'), nm, cellsOf(sect, nm).length + 1, '1.00', 'CM'); }); },
    TC_C_DELETE: env => { const r = selRow(env); if (!r) return env.msg('W', 'Select a line type'); const nm = X.val(r, 'NAME'); const cells = cellsOf(sect, nm); if (cells.length <= 1) return env.msg('E', 'A line type needs at least one cell'); env.pai('Delete cell', () => { cells[cells.length - 1].remove(); }); },
    TC_PREV: scroll(-1), TC_NEXT: scroll(1), TC_PREV_PAGE: scroll(-5), TC_NEXT_PAGE: scroll(5),
    TC_CHECK: env => APP.checkNode(node, env),
    TPAINT: env => { ctx.ui.painter = !ctx.ui.painter; env.rerender(); },
    TPATTERN: env => APP.dialogPattern(node, env),
  });
  return { tb, fc, tcName };
}
function bindPattern(ctx, node) {
  const sect = node.obj;
  return {
    f: {
      'SSFSCREEN-WFRAME': B.dec(() => X.kid(sect, 'PATTERN'), () => X.ensure(sect, 'PATTERN'), 'FRAME'),
      'SSFSCREEN-U_WFRAME': B.unit(() => X.kid(sect, 'PATTERN'), () => X.ensure(sect, 'PATTERN'), 'U_FRAME'),
    },
    fc: { TPATTERN: env => APP.dialogPattern(node, env) },
    cust: { TP_PATTERN: host => { host.innerHTML = `<span class="pattern-num">${icon('pattern')} Pattern ${esc(X.val(sect, 'PATTERN', 'PATTNUM') || '0000')}${X.val(sect, 'PATTERN', 'BORDER') === 'X' ? ' · framed' : ''}</span>`; } },
  };
}

/* ---------- ABAP code areas ---------- */
function codeEditorSub(getList, ensList, ctx, opts = {}) {
  return (host, env) => {
    const ed = AbapEditor.create(X.lines(getList()), env.edit, lines => env.pai('ABAP', () => { const l = ensList(); X.setLines(l, lines); if (!lines.some(x => x.trim()) && opts.dropEmpty) l.remove(); }), opts);
    host.classList.add('abap-host');
    return ed;
  };
}
function plistTable(getObj, ensObj, listName, outin, col) {
  return itemTable(() => X.kid(getObj(), listName), () => X.ensure(ensObj(), listName), {
    [col]: { get: r => X.val(r, 'OPD'), set: (r, v) => X.set(r, 'OPD', v.toUpperCase()) },
  }, { filter: r => X.val(r, 'OUTIN') === outin, init: it => X.set(it, 'OUTIN', outin) });
}

/* ---------- text editor custom control ---------- */
function textEditorCtrl(ctx, node, { readonly = false, linesGetter = null } = {}) {
  return (host, env) => {
    const obj = node.type === 'TI' ? node.obj : node.obj;
    const lines = linesGetter ? (linesGetter() || [{ f: '/*', t: 'Text module not in the library: upload it to see its text' }]) : ctx.form.textLines(obj);
    host.classList.add('te-host');
    host.appendChild(TextEditor.create({
      lines, edit: env.edit && !readonly, style: APP.styleFor(ctx.form, node), fields: () => APP.fieldList(ctx.form),
      onCommit: nl => env.pai('Text', () => ctx.form.setTextLines(obj, nl)),
    }));
  };
}

/* =====================================================================
   screen registry
   ===================================================================== */
const BIND = {
  /* ---------------- form attributes ---------------- */
  'SAPLSTXB:1202': ctx => {
    const h = () => ctx.form.header;
    const ro = n => ({ get: () => X.val(h(), n) });
    const langv = () => X.val(h(), 'LANGVECTOR');
    return {
      f: {
        'SSFSCREEN-FIRSTUSER': ro('FIRSTUSER'), 'SSFSCREEN-LASTUSER': ro('LASTUSER'),
        'SSFSCREEN-FIRSTDATE': { get: () => fmtDate(X.val(h(), 'FIRSTDATE')) }, 'SSFSCREEN-LASTDATE': { get: () => fmtDate(X.val(h(), 'LASTDATE')) },
        'SSFSCREEN-FIRSTTIME': ro('FIRSTTIME'), 'SSFSCREEN-LASTTIME': ro('LASTTIME'),
        'SSFSCREEN-DEVCLASS': ro('DEVCLASS'), 'SSFSCREEN-VERSION': ro('VERSION'),
        'SSFSCREEN-MASTERLANG': { get: () => LANG.iso(X.val(h(), 'MASTERLANG')) },
        'SSFSCREEN-TRANS_ALL': { get: () => langv() === '*', set: () => X.set(h(), 'LANGVECTOR', '*') },
        'SSFSCREEN-TRANS_SOME': { get: () => langv() !== '*' && langv().replace(X.val(h(), 'MASTERLANG'), '') !== '', set: () => { if (langv() === '*' || !langv()) APP.dialogLanguages(ctx); } },
        'SSFSCREEN-TRANS_NONE': { get: () => langv() !== '*' && langv().replace(X.val(h(), 'MASTERLANG'), '') === '', set: () => { if (langv() === '*' || langv().replace(X.val(h(), 'MASTERLANG'), '') !== '') X.set(h(), 'LANGVECTOR', X.val(h(), 'MASTERLANG')); } },
        'SSFSCREEN-THRULANG': B.flag(h, h, 'THRULANG'), 'SSFSCREEN-INSTLANG': B.flag(h, h, 'INSTLANG'),
      },
      fc: { TRLG: env => APP.dialogLanguages(ctx, env) },
      vis: el => (el.g3 === 'WEG' || el.g3 === 'FPM') ? false : undefined,
    };
  },
  'SAPLSTXB:1000': ctx => {
    const v = () => ctx.form.varItem;
    const xtype = () => X.val(v(), 'XSF') !== 'X' ? '' : (X.val(v(), 'XSFFORMAT') === 'X' ? 'HTM' : 'XSF');
    return {
      f: {
        'SSFSCREEN-PAGEFORMAT': B.leaf(v, v, 'PAGEFORMAT', { values: Object.keys(PAGE_SIZES).map(k => [k, k]), check: x => { if (!x) throw new Error('Enter a page format'); } }),
        'SSFSCREEN-CPI': B.dec(v, v, 'CPI'), 'SSFSCREEN-LPI': B.dec(v, v, 'LPI'),
        'SSFSCREEN-STDSTYLE': B.leaf(v, v, 'STDSTYLE', { values: APP.styleNames(), check: x => { if (!x) throw new Error('Enter a style'); } }),
        'SSFSCREEN-XOUTTYPE': { get: xtype, set: x => { X.set(v(), 'XSF', x ? 'X' : ''); X.set(v(), 'XSFFORMAT', x === 'HTM' ? 'X' : ''); }, values: () => VL.xouttype },
        'SSFSCREEN-XOUTMODE': B.leaf(v, v, 'XSFOUTMODE', { values: VL.xoutmode }),
        'SSFSCREEN-XOUTDEV': B.leaf(v, v, 'XSFOUTDEV'),
        'SSFSCREEN-XOUTACTION': B.leaf(v, v, 'XSFACTION', { lower: true }),
      },
      vis: el => ['SSFSCREEN-XOUTMODE', 'SSFSCREEN-XOUTDEV', 'SSFSCREEN-XOUTACTION'].includes(el.n) ? !!xtype() : undefined,
    };
  },
  /* ---------------- interface ---------------- */
  ...Object.fromEntries([['1212', 'I', 'TC_IMPORT'], ['1213', 'E', 'TC_EXPORT'], ['1215', 'T', 'TC_TABLES'], ['1214', 'X', 'TC_EXCEPTIONS']].map(([dyn, io, tc]) => ['SAPLSTXB:' + dyn, ctx => {
    const root = ctx.form.root;
    const list = () => X.kid(root, 'INTERFACE');
    const isStd = r => X.val(r, 'STANDARD') === 'X';
    const tb = itemTable(list, () => X.ensure(root, 'INTERFACE'), {
      'G_HEADER_INTERFACE-NAME': { get: r => X.val(r, 'NAME'), set: (r, v) => { v = v.trim().toUpperCase(); if (!/^[A-Z_][A-Z0-9_]*$/.test(v)) throw new Error(`Parameter name ${v} is not valid`); if (X.kids(list(), 'item').some(i => i !== r && X.val(i, 'NAME') === v)) throw new Error(`Parameter ${v} already exists`); X.set(r, 'NAME', v); }, roRow: isStd },
      'G_HEADER_INTERFACE-TYPING': { get: r => X.val(r, 'TYPING'), set: (r, v) => X.set(r, 'TYPING', v.toUpperCase()), values: VL.typing, roRow: isStd },
      'G_HEADER_INTERFACE-TYPENAME': { get: r => X.val(r, 'TYPENAME'), set: (r, v) => X.set(r, 'TYPENAME', v.toUpperCase()), roRow: isStd },
      'G_HEADER_INTERFACE-DEFAULTVAL': { get: r => X.val(r, 'DEFAULTVAL'), set: (r, v) => X.set(r, 'DEFAULTVAL', v), lower: true, roRow: isStd },
      'G_HEADER_INTERFACE-OPTIONAL': { check: true, el: 'OPTIONAL', roRow: isStd },
      'G_HEADER_INTERFACE-BYVALUE': { check: true, el: 'BYVALUE', roRow: isStd },
    }, {
      filter: r => X.val(r, 'IOTYPE') === io,
      init: it => { X.set(it, 'IOTYPE', io); if (io !== 'X') { X.set(it, 'TYPING', 'TYPE'); } if (io === 'I' || io === 'E') X.set(it, 'BYVALUE', 'X'); },
      insertAfter: l => { const same = X.kids(l, 'item').filter(r => X.val(r, 'IOTYPE') === io); return same[same.length - 1] || null; },
    });
    tb.rowClass = r => isStd(r) ? 'std' : '';
    const rm0 = tb.remove; tb.remove = idxs => { const rows = tb.rows(); if (idxs.some(i => isStd(rows[i]))) throw new Error('Standard parameters cannot be deleted'); rm0(idxs); };
    return {
      tc: { [tc]: tb },
      fc: tcCodes(tc, tb, ctx, {
        TC_RENAME: env => { const s = [...env.sel(tc)]; if (s.length !== 1) return env.msg('W', 'Select exactly one row'); APP.dialogRename(ctx, tb.rows()[s[0]], env); },
        TC_CHECK: env => APP.checkForm(env),
      }),
    };
  }])),
  /* ---------------- global definitions ---------------- */
  'SAPLSTXB:1222': ctx => {
    const root = ctx.form.root;
    const tb = itemTable(() => X.kid(root, 'GDATA'), () => X.ensure(root, 'GDATA'), {
      'G_HEADER_INTERFACE-NAME': { get: r => X.val(r, 'NAME'), set: (r, v) => { v = v.trim().toUpperCase(); if (X.kids(X.kid(root, 'GDATA'), 'item').some(i => i !== r && X.val(i, 'NAME') === v)) throw new Error(`Variable ${v} already exists`); X.set(r, 'NAME', v); } },
      'G_HEADER_INTERFACE-TYPING': { get: r => X.val(r, 'TYPING'), set: (r, v) => X.set(r, 'TYPING', v.toUpperCase()), values: VL.typingG },
      'G_HEADER_INTERFACE-TYPENAME': { get: r => X.val(r, 'TYPENAME'), set: (r, v) => X.set(r, 'TYPENAME', v.toUpperCase()) },
      'G_HEADER_INTERFACE-DEFAULTVAL': { get: r => X.val(r, 'DEFAULTVAL'), set: (r, v) => X.set(r, 'DEFAULTVAL', v), lower: true },
      'G_HEADER_INTERFACE-CONSTANT': { check: true, el: 'CONSTANT' },
    }, { init: it => X.set(it, 'TYPING', 'TYPE') });
    return { tc: { TC_GLOBALS: tb }, fc: tcCodes('TC_GLOBALS', tb, ctx, { TC_RENAME: env => { const s = [...env.sel('TC_GLOBALS')]; if (s.length !== 1) return env.msg('W', 'Select exactly one row'); APP.dialogRename(ctx, tb.rows()[s[0]], env); }, TC_CHECK: env => APP.checkForm(env) }) };
  },
  'SAPLSTXB:1226': ctx => {
    const root = ctx.form.root;
    const tb = itemTable(() => X.kid(root, 'FSYMBOLS'), () => X.ensure(root, 'FSYMBOLS'), {
      'G_HEADER_INTERFACE-NAME': { get: r => X.val(r, 'NAME'), set: (r, v) => { v = v.trim().toUpperCase(); if (!/^<[A-Z0-9_]+>$/.test(v)) throw new Error('Field symbol names must be written as <NAME>'); X.set(r, 'NAME', v); } },
      'G_HEADER_INTERFACE-TYPING': { get: r => X.val(r, 'TYPING'), set: (r, v) => X.set(r, 'TYPING', v.toUpperCase()), values: VL.typingFs },
      'G_HEADER_INTERFACE-TYPENAME': { get: r => X.val(r, 'TYPENAME'), set: (r, v) => X.set(r, 'TYPENAME', v.toUpperCase()) },
    }, { init: it => X.set(it, 'TYPING', 'TYPE') });
    return { tc: { TC_FIELDSYMBOLS: tb }, fc: tcCodes('TC_FIELDSYMBOLS', tb, ctx, { TC_RENAME: env => { const s = [...env.sel('TC_FIELDSYMBOLS')]; if (s.length !== 1) return env.msg('W', 'Select exactly one row'); APP.dialogRename(ctx, tb.rows()[s[0]], env); }, TC_CHECK: env => APP.checkForm(env) }) };
  },
  'SAPLSTXB:1227': ctx => {
    const root = ctx.form.root;
    const tb = itemTable(() => X.kid(root, 'REFFIELDS'), () => X.ensure(root, 'REFFIELDS'), {
      'G_HEADER_CURRS-FIELDNAME': { get: r => X.val(r, 'VALUE'), set: (r, v) => X.set(r, 'VALUE', v.toUpperCase()) },
      'G_HEADER_CURRS-REFFIELD': { get: r => X.val(r, 'UNIT'), set: (r, v) => X.set(r, 'UNIT', v.toUpperCase()) },
      'G_HEADER_CURRS-DATATYPE': { get: r => X.val(r, 'DATATYPE'), set: (r, v) => X.set(r, 'DATATYPE', v), values: VL.refType },
    }, { init: it => { X.set(it, 'ACTIVE', 'X'); X.set(it, 'DATATYPE', 'CURR'); } });
    return { tc: { TC_CURRENCIES: tb }, fc: tcCodes('TC_CURRENCIES', tb, ctx, { TC_CHECK: env => APP.checkForm(env) }) };
  },
  'SAPLSTXB:1223': ctx => ({ sub: { ABAP_EDITOR: codeEditorSub(() => X.kid(ctx.form.root, 'GTYPES'), () => X.ensure(ctx.form.root, 'GTYPES'), ctx, { dropEmpty: true }) }, fc: abapFc(ctx, () => X.kid(ctx.form.root, 'GTYPES')) }),
  'SAPLSTXB:1224': ctx => ({ sub: { ABAP_EDITOR: codeEditorSub(() => X.kid(ctx.form.root, 'FCODING'), () => X.ensure(ctx.form.root, 'FCODING'), ctx, { dropEmpty: true }) }, fc: abapFc(ctx, () => X.kid(ctx.form.root, 'FCODING')) }),
  'SAPLSTXB:1225': ctx => {
    const root = ctx.form.root;
    const tin = plistTable(() => root, () => root, 'GPLIST', 'I', 'G_HEADER_INPUT-OPD');
    const tout = plistTable(() => root, () => root, 'GPLIST', 'O', 'G_HEADER_OUTPUT-OPD');
    return { tc: { TC_PARAMS_INPUT: tin, TC_PARAMS_OUTPUT: tout }, sub: { ABAP_EDITOR: codeEditorSub(() => X.kid(root, 'GCODING'), () => X.ensure(root, 'GCODING'), ctx, { dropEmpty: true }) }, fc: abapFc(ctx, () => X.kid(root, 'GCODING')) };
  },
  /* ---------------- page ---------------- */
  'SAPLSTXB:1012': ctx => {
    const o = () => ctx.node.obj;
    const nt = () => X.val(o(), 'NUMB_TYPE'), up = () => X.val(o(), 'NUMB_UPPER') === 'X';
    const setNT = (t, u) => () => { X.set(o(), 'NUMB_TYPE', t); X.set(o(), 'NUMB_UPPER', u ? 'X' : ''); };
    return {
      f: {
        'SSFSCREEN-NEXTPAGE': { get: () => X.val(o(), 'NEXTPAGE', 'INAME'), set: v => X.setPath(o(), ['NEXTPAGE', 'INAME'], v), values: () => pageList(ctx.form) },
        RB_COUNTER_ARABIC: { get: () => nt() === 'A' || !nt(), set: setNT('A', false) },
        RB_COUNTER_ROMAN_CAPITAL: { get: () => nt() === 'R' && up(), set: setNT('R', true) },
        RB_COUNTER_ROMAN_SMALL: { get: () => nt() === 'R' && !up(), set: setNT('R', false) },
        RB_COUNTER_LETTER_CAPITAL: { get: () => nt() === 'L' && up(), set: setNT('L', true) },
        RB_COUNTER_LETTER_SMALL: { get: () => nt() === 'L' && !up(), set: setNT('L', false) },
        RB_COUNTER_INIT: B.radio(o, o, 'NUMB_MODE', '1'), RB_COUNTER_INCREASE: B.radio(o, o, 'NUMB_MODE', 'I'),
        RB_COUNTER_HOLD: B.radio(o, o, 'NUMB_MODE', 'H'), RB_COUNTER_HOLD2: B.radio(o, o, 'NUMB_MODE', 'S'),
      },
    };
  },
  'SAPLSTXB:1001': ctx => {
    const o = () => ctx.node.obj;
    return {
      f: {
        'SSFSCREEN-PAGEFORMAT': { get: () => X.val(ctx.form.varItem, 'PAGEFORMAT') },
        'SSFSCREEN-RESSOURCE': B.leaf(o, o, 'RESSOURCE'),
        'SSFSCREEN-PRINTMODE': B.leaf(o, o, 'PRINTMODE', { values: VL.printmode, check: v => { if (v && !'SDT'.includes(v)) throw new Error('Print mode: S, D, T or blank'); } }),
        RB_ORIENTATION_PORTRAIT: { get: () => X.val(o(), 'PAGEORTN') !== 'L', set: () => X.set(o(), 'PAGEORTN', 'P') },
        RB_ORIENTATION_LANDSCAPE: { get: () => X.val(o(), 'PAGEORTN') === 'L', set: () => X.set(o(), 'PAGEORTN', 'L') },
      },
    };
  },
  'SAPLSTXB:1013': ctx => {
    const page = ctx.node.obj;
    const g = () => X.path(page, 'sf:BACKGROUND', 'sf:GRAPHIC');
    const ens = () => {
      let gr = g(); if (gr) return gr;
      const f = ctx.form, bg = X.ensure(page, 'sf:BACKGROUND');
      gr = f.baseObj('GRAPHIC', '%GRAPHIC', 'Background Picture', 'GR', { GTYPE: 'B', GKEYBDS: { OBJECT: 'GRAPHICS', ID: 'BMAP', BTYPE: 'BMON' }, APPMODE: 'B', U_SB: 'CM', U_SA: 'CM', RELMODE: 'S', ALIGNMENT: 'L', U_MARGIN: 'CM', BGR_EXT: { MARGINH: '0.00', U_MARGINH: 'CM', MARGINV: '0.00', U_MARGINV: 'CM' } });
      X.set(gr, 'CAPTION', 'Background Picture'); for (const it of X.kids(X.kid(gr, 'T_CAPTION'), 'item')) X.set(it, 'CAPTION', 'Background Picture');
      bg.appendChild(gr); return gr;
    };
    return graphicBinding(ctx, g, ens, { background: true });
  },
  /* ---------------- windows ---------------- */
  'SAPLSTXB:1022': ctx => {
    const o = () => ctx.node.obj;
    const isCopy = () => X.val(o(), 'WTYPE') === 'C';
    return {
      f: {
        'SSFSCREEN-WTYPE': {
          get: () => X.val(o(), 'WTYPE'), values: () => VL.wtype,
          set: v => {
            if (v === X.val(o(), 'WTYPE')) return;
            if (v === 'M') { const pg = ctx.node.page; const other = pg && pg.children.find(n => n.type === 'WI' && n.obj !== o() && X.val(n.obj, 'WTYPE') === 'M'); if (other) throw new Error(`Page ${pg.name} already has a main window (${other.name})`); }
            X.set(o(), 'WTYPE', v); if (v === 'C' && !X.val(o(), 'WCOPYMODE')) X.set(o(), 'WCOPYMODE', '1'); if (v !== 'C' && v !== 'M') X.set(o(), 'WCOPYMODE', '');
          },
        },
        RB_CPMODE_OC_DIFF: B.radio(o, o, 'WCOPYMODE', '1'), RB_CPMODE_OC_EQ: B.radio(o, o, 'WCOPYMODE', '2'), RB_CPMODE_O: B.radio(o, o, 'WCOPYMODE', '3'),
        RB_CPMODE_C_DIFF: B.radio(o, o, 'WCOPYMODE', '4'), RB_CPMODE_C_EQ: B.radio(o, o, 'WCOPYMODE', '5'),
      },
      fc: { CHECK: env => APP.checkNode(ctx.node, env) },
      vis: el => (el.g3 === 'COP') ? isCopy() : undefined,
    };
  },
  'SAPLSTXB:1002': ctx => {
    const n = ctx.node, oa = () => n.outattr, ens = () => n.ensureOutattr();
    const dim = k => B.dec(oa, ens, k), u = (k, l) => B.unit(oa, ens, k, l);
    return {
      f: { 'SSFSCREEN-WLEFT': dim('WLEFT'), 'SSFSCREEN-U_WLEFT': u('U_WLEFT', VL.unitH), 'SSFSCREEN-WWIDTH': dim('WWIDTH'), 'SSFSCREEN-U_WWIDTH': u('U_WWIDTH', VL.unitH),
        'SSFSCREEN-WTOP': dim('WTOP'), 'SSFSCREEN-U_WTOP': u('U_WTOP', VL.unitV), 'SSFSCREEN-WHEIGHT': dim('WHEIGHT'), 'SSFSCREEN-U_WHEIGHT': u('U_WHEIGHT', VL.unitV) },
      sub: { SUB_LINES: 'SAPLSTXB:1011' },
    };
  },
  'SAPLSTXB:1003': ctx => {
    const n = ctx.node, oa = () => n.outattr, ens = () => n.ensureOutattr();
    const dim = k => B.dec(oa, ens, k), u = (k, l) => B.unit(oa, ens, k, l);
    return {
      f: { 'SSFSCREEN-STDSTYLE': B.leaf(oa, ens, 'STDSTYLE', { values: APP.styleNames() }),
        'SSFSCREEN-WLEFT': dim('WLEFT'), 'SSFSCREEN-U_WLEFT': u('U_WLEFT', VL.unitH), 'SSFSCREEN-WWIDTH': dim('WWIDTH'), 'SSFSCREEN-U_WWIDTH': u('U_WWIDTH', VL.unitH),
        'SSFSCREEN-WTOP': dim('WTOP'), 'SSFSCREEN-U_WTOP': u('U_WTOP', VL.unitV), 'SSFSCREEN-WHEIGHT': dim('WHEIGHT'), 'SSFSCREEN-U_WHEIGHT': u('U_WHEIGHT', VL.unitV) },
      sub: { SUB_LINES: 'SAPLSTXB:1011' },
    };
  },
  'SAPLSTXB:1011': ctx => bindBox(ctx, ctx.node),
  'SAPLSTXB:1014': ctx => bind1014(ctx, ctx.node),
  /* ---------------- output options of other nodes ---------------- */
  'SAPLSTXB:1010': ctx => {
    const n = ctx.node, oa = () => n.outattr, ens = () => n.ensureOutattr();
    const tctx = n.tableContext();
    let subTable = null;
    if (tctx && n.parent === tctx && tctx.sub === 'S') subTable = 'SAPLSTXB:1006';
    else if (tctx && n.parent === tctx && (tctx.sub || '') === '' && X.val(tctx.obj, 'OTABTYPE') === 'D') subTable = 'SAPLSTXB:1007';
    if (n.kind === 'SE-R') subTable = 'SAPLSTXB:1015';
    const styleField = {
      get: () => X.val(oa(), 'STDSTYLE'),
      set: v => { v = v.toUpperCase(); if (v === X.val(oa(), 'STDSTYLE')) return; X.set(v || oa() ? ens() : null, 'STDSTYLE', v); if (n.type === 'TI' && v) X.set(n.obj, 'STYLE_NAME', v); },
      values: () => APP.styleNames(),
    };
    return {
      f: { 'SSFSCREEN-STDSTYLE': styleField, 'SSFSCREEN-PROTECT': B.flag(oa, ens, 'PROTECT') },
      sub: { SUB_LINES: n.type === 'EV' ? null : 'SAPLSTXB:1011', SUB_TABLE: subTable, SUB_EVENT: null },
      vis: el => (el.n === 'SSFSCREEN-PROTECT' && ['SE-R', 'SE-E'].includes(n.kind)) ? false : undefined,
    };
  },
  'SAPLSTXB:1006': ctx => {
    const n = ctx.node, oa = () => n.outattr, ens = () => n.ensureOutattr();
    return { f: { 'SSFSCREEN-T_LINENR': B.num3(oa, ens, 'T_LINENR'), 'SSFSCREEN-T_CELLNR': B.num3(oa, ens, 'T_CELLNR') } };
  },
  'SAPLSTXB:1007': ctx => {
    const n = ctx.node, oa = () => n.outattr, ens = () => n.ensureOutattr();
    const t = n.tableContext();
    return { f: { 'SSFSCREEN-T_NEWLINE': B.flag(oa, ens, 'T_NEWLINE'), 'SSFSCREEN-T_LINETYPE': B.leaf(oa, ens, 'T_LINETYPE', { values: t ? lineTypes(t.obj).map(x => [x, x]) : [] }), 'SSFSCREEN-T_NEWCELL': B.flag(oa, ens, 'T_NEWCELL'), 'SSFSCREEN-T_CELLNR': B.num3(oa, ens, 'T_CELLNR') } };
  },
  'SAPLSTXB:1015': ctx => {
    const n = ctx.node, oa = () => n.outattr, ens = () => n.ensureOutattr();
    const t = n.tableContext() || n.parent?.parent;
    return {
      f: {
        'SSFSCREEN-T_LINETYPE': {
          get: () => X.val(oa(), 'T_LINETYPE'), values: () => (t ? lineTypes(t.obj) : []).map(x => [x, x]),
          set: v => { X.set(ens(), 'T_LINETYPE', v); syncRowCells(ctx.form, n, t, v); },
        },
      },
    };
  },
  'SAPLSTXB:1016': ctx => eventBinding(ctx, 'H'),
  'SAPLSTXB:1017': ctx => eventBinding(ctx, 'F'),
  /* ---------------- texts ---------------- */
  ...Object.fromEntries(['1032', '1033', '1034', '1035', '1037'].map(d => ['SAPLSTXB:' + d, ctx => textBinding(ctx, d)])),
  /* ---------------- graphic / address / command / code ---------------- */
  'SAPLSTXB:1042': ctx => {
    const obj = () => ctx.node.type === 'WI' ? ctx.node.innerObj : ctx.node.obj;
    return graphicBinding(ctx, obj, obj, {});
  },
  'SAPLSTXB:1005': ctx => {
    const n = ctx.node, o = () => n.obj, oa = () => n.outattr, ens = () => n.ensureOutattr();
    const tctx = n.tableContext();
    return {
      f: {
        CB_AMODE_BREAK: { get: () => X.val(o(), 'APPMODE') !== 'N', set: v => X.set(o(), 'APPMODE', v ? 'B' : 'N') },
        'SSFSCREEN-GRSPBEFORE': B.dec(o, o, 'SP_BEFORE'), 'SSFSCREEN-U_GRSB': B.unit(o, o, 'U_SB', VL.unitV),
        'SSFSCREEN-GRSPAFTER': B.dec(o, o, 'SP_AFTER'), 'SSFSCREEN-U_GRSA': B.unit(o, o, 'U_SA', VL.unitV),
        'SSFSCREEN-PROTECT': B.flag(oa, ens, 'PROTECT'),
        'SSFSCREEN-GR_RELMODE': B.leaf(o, o, 'RELMODE', { values: VL.relmode }),
        'SSFSCREEN-BGR_HORIZ': B.leaf(o, o, 'ALIGNMENT', { values: VL.alignH }),
        'SSFSCREEN-GRMARGIN': B.dec(o, o, 'MARGIN'), 'SSFSCREEN-U_GRMARGIN': B.unit(o, o, 'U_MARGIN', VL.unitH),
      },
      ro: el => ['SSFSCREEN-GRSPBEFORE', 'SSFSCREEN-U_GRSB', 'SSFSCREEN-GRSPAFTER', 'SSFSCREEN-U_GRSA'].includes(el.n) && X.val(o(), 'APPMODE') === 'N',
      sub: { SUB_LINES: 'SAPLSTXB:1011', SUB_TABLE: tctx && n.parent === tctx && tctx.sub === 'S' ? 'SAPLSTXB:1006' : null },
    };
  },
  'SAPLSTXB:1052': ctx => addressBinding(ctx),
  'SAPLSTXB:1062': ctx => {
    const o = () => ctx.node.obj;
    const tb = itemTable(() => X.kid(o(), 'SPOOLATTR'), () => X.ensure(o(), 'SPOOLATTR'), {
      'G_SPOOL_ATTRIBUTES-PARAM': { get: r => X.val(r, 'PARAM'), set: (r, v) => X.set(r, 'PARAM', v.toUpperCase()) },
      'G_SPOOL_ATTRIBUTES-VALUE': { get: r => X.val(r, 'VALUE'), set: (r, v) => X.set(r, 'VALUE', v), lower: true },
    });
    return {
      f: {
        'SSFSCREEN-CM_NEWPAGE': B.flag(o, o, 'NEWPAGE'),
        'SSFSCREEN-CM_PAGE': { get: () => X.val(o(), 'PAGENAME', 'INAME'), set: v => X.setPath(o(), ['PAGENAME', 'INAME'], v), values: () => [['', ''], ...pageList(ctx.form)] },
        'SSFSCREEN-CM_RESETPA': B.leaf(o, o, 'RESETPAR', { values: APP.paraList(ctx.form, ctx.node) }),
        'SSFSCREEN-CM_PRCTL': B.leaf(o, o, 'PCONTROL'),
      },
      ro: el => el.n === 'SSFSCREEN-CM_PAGE' && X.val(o(), 'NEWPAGE') !== 'X',
      tc: { TC_SPOOL_ATTRIBUTES: tb },
      fc: tcCodes('TC_SPOOL_ATTRIBUTES', tb, ctx, { CHECK: env => APP.checkNode(ctx.node, env) }),
    };
  },
  'SAPLSTXB:1072': ctx => {
    const o = () => ctx.node.obj;
    const tin = plistTable(o, o, 'PLIST', 'I', 'G_HEADER_INPUT-OPD');
    const tout = plistTable(o, o, 'PLIST', 'O', 'G_HEADER_OUTPUT-OPD');
    return { tc: { TC_PARAMS_INPUT: tin, TC_PARAMS_OUTPUT: tout }, sub: { ABAP_EDITOR: codeEditorSub(() => X.kid(o(), 'CODE'), () => X.ensure(o(), 'CODE'), ctx, { dropEmpty: true }) }, fc: abapFc(ctx, () => X.kid(o(), 'CODE')) };
  },
  /* ---------------- sections ---------------- */
  'SAPLSTXB:1092': ctx => {
    const o = () => ctx.node.obj;
    const ot = () => X.val(o(), 'OTABTYPE');
    return {
      f: {
        'SSFSCREEN-OUT_LOOP': { get: () => ['L', 'D'].includes(X.val(o(), 'DATATYPE')), set: v => X.set(o(), 'DATATYPE', v ? 'L' : '') },
        'SSFSCREEN-OUT_SIMPLE': { get: () => !ot(), set: () => X.set(o(), 'OTABTYPE', '') },
        'SSFSCREEN-OUT_TABLE': { get: () => ot() === 'D', set: () => X.set(o(), 'OTABTYPE', 'D') },
        'SSFSCREEN-OUT_STRUCT': { get: () => ot() === 'S', set: () => X.set(o(), 'OTABTYPE', 'S') },
      },
    };
  },
  'SAPLSTXB:1093': ctx => dataBinding(ctx),
  'SAPLSTXB:1094': ctx => {
    const n = ctx.node, o = () => n.obj;
    const { tb, fc, tcName } = bindLineTypes(ctx, n, 'dyn');
    const pat = bindPattern(ctx, n);
    return {
      f: {
        'SSFSCREEN-OUT_WIDTH': B.dec(o, o, 'WIDTH'), 'SSFSCREEN-OUT_UWIDTH': B.unit(o, o, 'U_WIDTH', VL.unitH),
        'SSFSCREEN-BGR_HORIZ': B.leaf(o, o, 'APPMODE', { values: VL.tabAlign }),
        'SSFSCREEN-OUT_ALEFT': B.dec(o, o, 'LEFTMARGIN'), 'SSFSCREEN-OUT_AULEFT': B.unit(o, o, 'U_LEFT', VL.unitH),
        'SSFSCREEN-OUT_MHEIG': B.dec(o, o, 'MHEIGHT'), 'SSFSCREEN-OUT_MUHEIG': B.unit(o, o, 'U_MHEIGHT', VL.unitV),
      },
      tc: { [tcName]: tb }, fc: { ...fc, ...pat.fc },
      sub: { SUB_PATTERN: (host, env) => env.renderScreen('SAPLSTXB:1099', { w: 63, h: 6 }, pat) },
    };
  },
  'SAPLSTXB:1095': ctx => {
    const n = ctx.node, o = () => n.obj;
    const { tb, fc, tcName } = bindLineTypes(ctx, n, 'static');
    const pat = bindPattern(ctx, n);
    return {
      f: {
        'SSFSCREEN-OUT_WIDTH': B.dec(o, o, 'WIDTH'), 'SSFSCREEN-OUT_UWIDTH': B.unit(o, o, 'U_WIDTH', VL.unitH),
        'SSFSCREEN-BGR_HORIZ': B.leaf(o, o, 'APPMODE', { values: VL.tabAlign }),
        'SSFSCREEN-OUT_ALEFT': B.dec(o, o, 'LEFTMARGIN'), 'SSFSCREEN-OUT_AULEFT': B.unit(o, o, 'U_LEFT', VL.unitH),
        'SSFSCREEN-STRUC_VERT': { get: () => X.val(o(), 'VPOS_USED') === 'X' ? 'A' : 'C', set: v => X.set(o(), 'VPOS_USED', v === 'A' ? 'X' : ''), values: () => VL.vpos },
        'SSFSCREEN-OUT_VATOP': B.dec(o, o, 'TOP'), 'SSFSCREEN-OUT_VAUTOP': B.unit(o, o, 'U_TOP', VL.unitV),
      },
      ro: el => (['SSFSCREEN-OUT_VATOP', 'SSFSCREEN-OUT_VAUTOP'].includes(el.n) && X.val(o(), 'VPOS_USED') !== 'X'),
      tc: { [tcName]: tb }, fc: { ...fc, ...pat.fc },
      sub: { SUB_PATTERN: (host, env) => env.renderScreen('SAPLSTXB:1099', { w: 63, h: 6 }, pat) },
    };
  },
  'SAPLSTXB:1096': ctx => {
    const n = ctx.node, o = () => n.obj;
    const hasEv = t => n.children.some(c => c.type === 'EV' && c.sub === t);
    const toggleEv = (t, on) => {
      if (on && !hasEv(t)) {
        const ev = ctx.form.eventNode(t);
        const succ = n.succ || X.ensure(n.el, 'sf:SUCC');
        const it = X.mk(ctx.form.doc, 'sf:item'); it.appendChild(ev);
        const first = X.kids(succ, 'sf:item')[0];
        succ.insertBefore(it, t === 'H' ? first || null : null);
      }
      if (!on) for (const c of n.children.filter(c => c.type === 'EV' && c.sub === t)) ctx.form.removeNode(c);
    };
    const hdr = () => X.val(o(), 'OTABHEADER'), ftr = () => X.val(o(), 'OTABFOOTER');
    return {
      f: {
        'SSFSCREEN-OUT_HEADER': { get: () => hasEv('H'), set: v => { if (v === hasEv('H')) return; toggleEv('H', v); X.set(o(), 'OTABHEADER', v ? (hdr() || 'A') : ''); } },
        'SSFSCREEN-OUT_HSTART': { get: () => ['A', 'B'].includes(hdr()), set: v => { const b = ['A', 'P'].includes(hdr()); X.set(o(), 'OTABHEADER', v && b ? 'A' : v ? 'B' : b ? 'P' : ''); } },
        'SSFSCREEN-OUT_HBREAK': { get: () => ['A', 'P'].includes(hdr()), set: v => { const s = ['A', 'B'].includes(hdr()); X.set(o(), 'OTABHEADER', v && s ? 'A' : v ? 'P' : s ? 'B' : ''); } },
        'SSFSCREEN-OUT_FOOTER': { get: () => hasEv('F'), set: v => { if (v === hasEv('F')) return; toggleEv('F', v); X.set(o(), 'OTABFOOTER', v ? (ftr() || 'A') : ''); if (v && !X.val(o(), 'FHEIGHT')) { X.set(o(), 'FHEIGHT', '1.00'); X.set(o(), 'U_FHEIGHT', 'CM'); } } },
        'SSFSCREEN-OUT_FTOP': B.dec(o, o, 'FHEIGHT'), 'SSFSCREEN-OUT_FUTOP': B.unit(o, o, 'U_FHEIGHT', VL.unitV),
        'SSFSCREEN-OUT_FBREAK': { get: () => ['A', 'P'].includes(ftr()), set: v => { const e = ['A', 'E'].includes(ftr()); X.set(o(), 'OTABFOOTER', v && e ? 'A' : v ? 'P' : e ? 'E' : ''); } },
        'SSFSCREEN-OUT_FEND': { get: () => ['A', 'E'].includes(ftr()), set: v => { const b = ['A', 'P'].includes(ftr()); X.set(o(), 'OTABFOOTER', v && b ? 'A' : v ? 'E' : b ? 'P' : ''); } },
        'SSFSCREEN-OUT_MHEIG': B.dec(o, o, 'MHEIGHT'), 'SSFSCREEN-OUT_MUHEIG': B.unit(o, o, 'U_MHEIGHT', VL.unitV),
      },
      ro: el => (['SSFSCREEN-OUT_HSTART', 'SSFSCREEN-OUT_HBREAK'].includes(el.n) && !hasEv('H')) || (['SSFSCREEN-OUT_FTOP', 'SSFSCREEN-OUT_FUTOP', 'SSFSCREEN-OUT_FBREAK', 'SSFSCREEN-OUT_FEND'].includes(el.n) && !hasEv('F')),
      vis: el => (['SSFSCREEN-OUT_MHEIG', 'SSFSCREEN-OUT_MUHEIG'].includes(el.n) && n.sub === 'C') ? false : undefined,
    };
  },
  'SAPLSTXB:1100': ctx => {
    const o = () => ctx.node.obj;
    const tb = itemTable(() => X.kid(o(), 'CALC'), () => X.ensure(o(), 'CALC'), {
      'G_SECTION_CALCS-OPERATION': { get: r => X.val(r, 'OPERATION'), set: (r, v) => X.set(r, 'OPERATION', v), values: VL.calcOp },
      'G_SECTION_CALCS-SOURCENAME': { get: r => X.val(r, 'SOURCENAME'), set: (r, v) => X.set(r, 'SOURCENAME', v.toUpperCase()) },
      'G_SECTION_CALCS-TARGETNAME': { get: r => X.val(r, 'TARGETNAME'), set: (r, v) => X.set(r, 'TARGETNAME', v.toUpperCase()) },
      'G_SECTION_CALCS-EVENT': { get: r => X.val(r, 'EVENT'), set: (r, v) => X.set(r, 'EVENT', v), values: VL.calcEvt },
      'G_SECTION_CALCS-EVENTNAME': { get: r => X.val(r, 'EVENTNAME'), set: (r, v) => X.set(r, 'EVENTNAME', v.toUpperCase()) },
      'G_SECTION_CALCS-INIT': { check: true, el: 'INIT' },
      'G_SECTION_CALCS-RESET': { get: r => X.val(r, 'RESET'), set: (r, v) => X.set(r, 'RESET', v), values: VL.calcRes },
      'G_SECTION_CALCS-RESETNAME': { get: r => X.val(r, 'RESETNAME'), set: (r, v) => X.set(r, 'RESETNAME', v.toUpperCase()) },
    }, { init: it => { X.set(it, 'OPERATION', 'SUM'); X.set(it, 'EVENT', 'A'); } });
    return { tc: { TC_SECTIONCALCS: tb }, fc: tcCodes('TC_SECTIONCALCS', tb, ctx, { CHECK: env => APP.checkNode(ctx.node, env) }) };
  },
  'SAPLSTXB:1112': ctx => ({ vis: () => false }),
  'SAPLSTXB:1300': ctx => bind1300(ctx, ctx.node),
  'SAPLSTXB:1300-ALT': ctx => bind1300(ctx, ctx.node, { alternative: true }),
  /* ---------------- dialogs ---------------- */
  'SAPLSTXB:2020': ctx => ctx.dialog,
  'SAPLSTXB:3000': ctx => ctx.dialog, 'SAPLSTXB:3010': ctx => ctx.dialog,
};

function fmtDate(d) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${m[3]}.${m[2]}.${m[1]}` : d; }

function abapFc(ctx, getList) {
  return {
    CHECK: env => { const r = AbapEditor.check(X.lines(getList())); env.msg(r.ok ? 'S' : 'E', r.msg); },
    ED_PRETTY_PRINT: env => env.pai('Pretty Printer', () => { const l = getList(); if (l) X.setLines(l, AbapEditor.pretty(X.lines(l))); }),
    ED_INS_FRAME: env => APP.dialogPattern_abap(env, getList),
  };
}

function graphicBinding(ctx, g, ens, { background = false } = {}) {
  const keyEl = () => X.kid(g(), 'GKEYBDS'), keyEns = () => X.ensure(ens(), 'GKEYBDS');
  const nm = B.sym(() => g(), () => ens(), ['GKEYBDS', 'NAME']);
  const ob = B.sym(() => g(), () => ens(), ['GKEYBDS', 'OBJECT']);
  const id = B.sym(() => g(), () => ens(), ['GKEYBDS', 'ID']);
  const bt = () => X.val(keyEl(), 'BTYPE');
  const ui = ctx.ui; ui.sym ||= {};
  const symOn = k => ui.sym[k] ?? (k === 'NAME' ? nm.isSym() : k === 'OBJECT' ? ob.isSym() : id.isSym());
  const res = {
    get: () => { const v = X.val(g(), 'RESOLUTION'); return v ? String(+v) : ''; },
    set: v => X.set(v === '' && !g() ? null : ens(), 'RESOLUTION', v === '' ? '' : String(parseInt(v, 10) || 0).padStart(4, '0')),
    values: () => VL.resolution,
  };
  const bgr = () => X.kid(g(), 'BGR_EXT'), bgrEns = () => X.ensure(ens(), 'BGR_EXT');
  const f = {
    'SSFSCREEN-GR_NAME': nm.static, 'SSFSCREEN-GR_NAM_SYM': nm.dyn,
    'SSFSCREEN-GR_OBJECT': ob.static, 'SSFSCREEN-GR_OBJ_SYM': ob.dyn,
    'SSFSCREEN-GR_ID': id.static, 'SSFSCREEN-GR_ID_SYM': id.dyn,
    'RSSCG-BTYPE_BMON': { get: () => bt() === 'BMON', set: () => X.set(keyEns(), 'BTYPE', 'BMON') },
    'RSSCG-BTYPE_BCOL': { get: () => bt() === 'BCOL', set: () => X.set(keyEns(), 'BTYPE', 'BCOL') },
    'SSFSCREEN-RB_SYM': { get: () => /^&/.test(bt()) || ui.btSym, set: () => { ui.btSym = true; } },
    'SSFSCREEN-BGR_SYM': { get: () => /^&/.test(bt()) ? bt() : '', set: v => { v = v.trim(); if (v && !/^&.*&$/.test(v)) v = '&' + v.replace(/&/g, '') + '&'; X.set(keyEns(), 'BTYPE', v || 'BMON'); }, lower: true },
    'RSSCG-RESOLUTION': res,
    'RSSCG-RESIDENT': B.flag(g, ens, 'RESIDENT'),
  };
  if (background) {
    Object.assign(f, {
      'SSFSCREEN-BGR_PRT2': { get: () => X.val(bgr(), 'PRINTOUT'), set: v => X.set(bgrEns(), 'PRINTOUT', v), values: () => VL.bgrPrint },
      'SSFSCREEN-BGR_HORIZ': { get: () => X.val(bgr(), 'ALIGN_H'), set: v => X.set(bgrEns(), 'ALIGN_H', v), values: () => [['', ''], ...VL.alignH] },
      'SSFSCREEN-WLEFT': B.dec(bgr, bgrEns, 'MARGINH'), 'SSFSCREEN-U_WLEFT': B.unit(bgr, bgrEns, 'U_MARGINH', VL.unitH),
      'SSFSCREEN-BGR_VERT': { get: () => X.val(bgr(), 'ALIGN_V'), set: v => X.set(bgrEns(), 'ALIGN_V', v), values: () => [['', ''], ...VL.alignV] },
      'SSFSCREEN-WTOP': B.dec(bgr, bgrEns, 'MARGINV'), 'SSFSCREEN-U_WTOP': B.unit(bgr, bgrEns, 'U_MARGINV', VL.unitV),
    });
  }
  return {
    f,
    fc: {
      SYM_NAME_ON: env => { ui.sym.NAME = true; env.rerender(); }, SYM_NAME_OFF: env => { ui.sym.NAME = false; env.rerender(); },
      SYM_OBJ_ON: env => { ui.sym.OBJECT = true; env.rerender(); }, SYM_OBJ_OFF: env => { ui.sym.OBJECT = false; env.rerender(); },
      SYM_ID_ON: env => { ui.sym.ID = true; env.rerender(); }, SYM_ID_OFF: env => { ui.sym.ID = false; env.rerender(); },
      SYM_BTYPE: env => { ui.btSym = false; env.rerender(); },
    },
    vis: el => {
      const pairs = { NAME: [['SSFSCREEN-GR_NAME', 'GR_NAME'], ['SSFSCREEN-GR_NAM_SYM', 'GR_NAM_SYM']], OBJECT: [['SSFSCREEN-GR_OBJECT', 'GR_OBJECT'], ['SSFSCREEN-GR_OBJ_SYM', 'GR_OBJ_SYM']], ID: [['SSFSCREEN-GR_ID', 'GR_ID'], ['SSFSCREEN-GR_ID_SYM', 'GR_ID_SYM']] };
      for (const [k, [st, dy]] of Object.entries(pairs)) {
        if (st.includes(el.n)) return !symOn(k);
        if (dy.includes(el.n)) return symOn(k);
      }
      if (el.n === 'SSFSCREEN-BGR_SYM') return /^&/.test(bt()) || !!ui.btSym;
      if (['SSFSCREEN-BGR_ORIG', 'SSFSCREEN-BGR_RESIZE', 'RSSCG-AUTOHEIGHT', 'TEXT_SIZE', '%#AUTOTEXT003'].includes(el.n)) return false;
      if (background && ['SSFSCREEN-WLEFT', 'SSFSCREEN-U_WLEFT'].includes(el.n)) return true;
      return undefined;
    },
    ro: el => (background && ['SSFSCREEN-WLEFT', 'SSFSCREEN-U_WLEFT'].includes(el.n) && !X.val(bgr(), 'ALIGN_H')) || (background && ['SSFSCREEN-WTOP', 'SSFSCREEN-U_WTOP'].includes(el.n) && !X.val(bgr(), 'ALIGN_V')),
  };
}

function addressBinding(ctx) {
  const n = ctx.node;
  const o = () => n.type === 'WI' ? n.innerObj : n.obj;
  const ui = ctx.ui; ui.sym ||= {};
  const pair = (field, el) => { const s = B.sym(o, o, [el]); return s; };
  const S = {
    ADDRNUM: pair('AD_ADDRNUM', 'NUMB'), PERSNUM: pair('AD_PERSNUM', 'PERSON'), MAXL: pair('AD_MAXL', 'LINES'), SCTRY: pair('AD_SCTRY', 'FRCOUNTRY'),
    LANGCN: pair('AD_LANGCN', 'LANG4CNAME'), RECLANG: pair('AD_RECLANG', 'LANG'), LPRIO: pair('AD_LPRIO', 'PRIORITY'),
  };
  const symOn = k => ui.sym[k] ?? S[k].isSym();
  const at = () => X.val(o(), 'ADDRTYPE'), dl = () => X.val(o(), 'DELIVERY');
  const f = {
    'SSFSCREEN-AD_TYPE1': { get: () => at() === '1', set: () => X.set(o(), 'ADDRTYPE', '1') },
    'SSFSCREEN-AD_TYPE2': { get: () => at() === '2', set: () => X.set(o(), 'ADDRTYPE', '2') },
    'SSFSCREEN-AD_TYPE3': { get: () => at() === '3', set: () => X.set(o(), 'ADDRTYPE', '3') },
    'SSFSCREEN-AD_TYPEDYN': { get: () => /^&/.test(at()) || ui.atSym, set: () => { ui.atSym = true; } },
    'SSFSCREEN-AD_TYPESYM': { get: () => /^&/.test(at()) ? at() : '', set: v => { v = v.trim(); if (v && !/^&.*&$/.test(v)) v = '&' + v.replace(/&/g, '') + '&'; X.set(o(), 'ADDRTYPE', v || '1'); }, lower: true },
    'SSFSCREEN-AD_1_PBOX': { get: () => dl() === 'P', set: () => X.set(o(), 'DELIVERY', 'P') },
    'SSFSCREEN-AD_1_STR': { get: () => dl() === 'S', set: () => X.set(o(), 'DELIVERY', 'S') },
    'SSFSCREEN-AD_1_DYN': { get: () => /^&/.test(dl()) || ui.dlSym, set: () => { ui.dlSym = true; } },
    'SSFSCREEN-AD_1_SYM': { get: () => /^&/.test(dl()) ? dl() : '', set: v => { v = v.trim(); if (v && !/^&.*&$/.test(v)) v = '&' + v.replace(/&/g, '') + '&'; X.set(o(), 'DELIVERY', v || 'P'); }, lower: true },
    'SSFSCREEN-AD_STDPAR': B.leaf(o, o, 'ADDRPAR', { values: APP.paraList(ctx.form, n) }),
    'SSFSCREEN-AD_CNINREC': B.flag(o, o, 'CNAMEINREC'),
    'SSFSCREEN-AD_NOUP': B.flag(o, o, 'NOUPCITY'),
  };
  const map = { ADDRNUM: ['SSFSCREEN-AD_ADDRNUM', 'SSFSCREEN-AD_AN_SYM', 'AD_ADDRNUM', 'AD_ADDRNUM_SYM'], PERSNUM: ['SSFSCREEN-AD_PERSNUM', 'SSFSCREEN-AD_PN_SYM', 'AD_PERSNUM', 'AD_PERSNUM_SYM'],
    MAXL: ['SSFSCREEN-AD_MAXL', 'SSFSCREEN-AD_ML_SYM', 'AD_MAXL', 'AD_MAXL_SYM'], SCTRY: ['SSFSCREEN-AD_SCTRY', 'SSFSCREEN-AD_SC_SYM', 'AD_SCTRY', 'AD_SCTRY_SYM'],
    LANGCN: ['SSFSCREEN-AD_LANGCN', 'SSFSCREEN-AD_LC_SYM', 'AD_LANGCN', 'AD_LANGCN_SYM'], RECLANG: ['SSFSCREEN-AD_RECLANG', 'SSFSCREEN-AD_RL_SYM', 'AD_RECLANG', 'AD_RECLANG_SYM'],
    LPRIO: ['SSFSCREEN-AD_LPRIO', 'SSFSCREEN-AD_LP_SYM', 'AD_LPRIO', 'AD_LPRIO_SYM'] };
  const fc = { CHECK: env => APP.checkNode(n, env), RB_ADDRTYPE: () => {}, RB_ADDR2: () => {} };
  const codes = { ADDRNUM: 'ADDRNUM', PERSNUM: 'PERSNUM', MAXL: 'MAXL', SCTRY: 'SCTRY', LANGCN: 'FIXL', RECLANG: 'RECL', LPRIO: 'PRIO' };
  for (const [k, [st, dy]] of Object.entries(map)) {
    f[st] = S[k].static; f[dy] = S[k].dyn;
    fc['SYM_' + codes[k] + '_ON'] = env => { ui.sym[k] = true; env.rerender(); };
    fc['SYM_' + codes[k] + '_OFF'] = env => { ui.sym[k] = false; env.rerender(); };
  }
  return {
    f, fc,
    vis: el => {
      for (const [k, [st, dy, bst, bdy]] of Object.entries(map)) {
        if (el.n === st || el.n === bst) return !symOn(k);
        if (el.n === dy || el.n === bdy) return symOn(k);
      }
      if (el.n === 'SSFSCREEN-AD_TYPESYM') return /^&/.test(at()) || !!ui.atSym;
      if (el.n === 'SSFSCREEN-AD_1_SYM') return /^&/.test(dl()) || !!ui.dlSym;
      return undefined;
    },
  };
}

function textBinding(ctx, dyn) {
  const n = ctx.node, o = () => n.obj, form = ctx.form;
  const ui = ctx.ui; ui.sym ||= {};
  const ttype = () => TEXT_TYPE[X.val(o(), 'TTYPE')] || 'E';
  const f = {
    'SSFSCREEN-TEXTTYPE': {
      get: ttype, values: () => VL.textType,
      set: v => {
        const cur = ttype(); if (v === cur) return;
        APP.needConfirm('ttype', 'Change Text Node', 'Do you want to change the type of the text node? The text of the node will be lost.');
        X.set(o(), 'TTYPE', TEXT_TYPE_XML[v]);
        for (const k of ['TEXT', 'T_TEXT', 'TKEY', 'REF_NAME', 'REF_LANG', 'REF_STYLE', 'IGNORE', 'TABLINE']) X.remove(o(), k);
        if (v === 'E') form.setTextLines(o(), [{ f: '*', t: '' }]);
        if (v === 'I') { X.setPath(o(), ['TKEY', 'OBJECT'], 'TEXT'); X.setPath(o(), ['TKEY', 'ID'], 'ST'); }
      },
    },
    'SSFSCREEN-TEXTAPPM': B.leaf(o, o, 'APPMODE', { values: VL.appmode }),
    'SSFSCREEN-INCL_IGNO': B.flag(o, o, 'IGNORE'),
    'SSFSCREEN-INCL_PARA': B.path(o, o, ['TKEY', 'PAR'], { values: APP.paraList(form, n) }),
    'SSFSCREEN-INCL_NPARA': B.path(o, o, ['TKEY', 'NEWPAR'], { values: APP.paraList(form, n) }),
    'SSFSCREEN-INCL_STYLE': B.flag(o, o, 'REF_STYLE'),
  };
  const fc = { CHECK: env => APP.checkNode(n, env), EDIT: env => APP.fullscreenText(n, env), INFO: env => env.msg('I', 'Include texts are maintained with transaction SO10') };
  let pairs = {};
  if (dyn === '1033') {
    const s = { NAME: B.sym(o, o, ['TKEY', 'NAME']), OBJ: B.sym(o, o, ['TKEY', 'OBJECT']), ID: B.sym(o, o, ['TKEY', 'ID']), LANG: B.sym(o, o, ['TKEY', 'LANG']) };
    Object.assign(f, { 'SSFSCREEN-INCL_NAME': s.NAME.static, 'SSFSCREEN-I_NAM_SYM': s.NAME.dyn, 'SSFSCREEN-INCL_OBJ': s.OBJ.static, 'SSFSCREEN-I_OBJ_SYM': s.OBJ.dyn,
      'SSFSCREEN-INCL_ID': s.ID.static, 'SSFSCREEN-I_ID_SYM': s.ID.dyn, 'SSFSCREEN-INCL_LANG': s.LANG.static, 'SSFSCREEN-I_LANG_SYM': s.LANG.dyn });
    f['SSFSCREEN-INCL_NAME'].lower = true; f['SSFSCREEN-INCL_LANG'] = { ...s.LANG.static, values: () => APP.langList() };
    pairs = { NAME: [s.NAME, 'SSFSCREEN-INCL_NAME', 'SSFSCREEN-I_NAM_SYM', 'I_NAME', 'I_NAM_SYM', 'NAME'], OBJ: [s.OBJ, 'SSFSCREEN-INCL_OBJ', 'SSFSCREEN-I_OBJ_SYM', 'I_OBJ', 'I_OBJ_SYM', 'OBJ'],
      ID: [s.ID, 'SSFSCREEN-INCL_ID', 'SSFSCREEN-I_ID_SYM', 'I_ID', 'I_ID_SYM', 'ID'], LANG: [s.LANG, 'SSFSCREEN-INCL_LANG', 'SSFSCREEN-I_LANG_SYM', 'I_LANG', 'I_LANG_SYM', 'LANG'] };
  }
  if (dyn === '1035' || dyn === '1037') {
    /* REF_LANG holds a 1-char language key or a field name without ampersands (e.g. SY-LANGU) */
    const refLang = {
      static: { get: () => { const v = X.val(o(), 'REF_LANG'); return v.length > 1 ? '' : v; }, set: v => X.set(o(), 'REF_LANG', v) },
      dyn: { get: () => { const v = X.val(o(), 'REF_LANG'); return v.length > 1 ? v : ''; }, set: v => X.set(o(), 'REF_LANG', v.trim().replace(/&/g, '').toUpperCase()), lower: false },
      isSym: () => X.val(o(), 'REF_LANG').length > 1,
    };
    const s = { NAME: B.sym(o, o, ['REF_NAME']), LANG: refLang };
    Object.assign(f, { 'SSFSCREEN-TNAME': { ...s.NAME.static, values: () => APP.textModules().map(t => [t, t]) }, 'SSFSCREEN-I_NAM_SYM': s.NAME.dyn,
      'SSFSCREEN-INCL_LANG': { ...s.LANG.static, values: () => APP.langList() }, 'SSFSCREEN-I_LANG_SYM': s.LANG.dyn });
    pairs = { NAME: [s.NAME, 'SSFSCREEN-TNAME', 'SSFSCREEN-I_NAM_SYM', 'I_NAME', 'I_NAM_SYM', 'NAME', 'BUTTON1', 'BUTTON2'], LANG: [s.LANG, 'SSFSCREEN-INCL_LANG', 'SSFSCREEN-I_LANG_SYM', 'I_LANG', 'I_LANG_SYM', 'LANG'] };
    if (dyn === '1037') { pairs.NAME = null; f['SSFSCREEN-I_NAM_SYM'] = s.NAME.dyn; }
    fc.PICK = env => APP.copyTextModule(n, env);
  }
  for (const [k, p] of Object.entries(pairs)) if (p) { fc[`SYM_${p[5]}_ON`] = env => { ui.sym[k] = true; env.rerender(); }; fc[`SYM_${p[5]}_OFF`] = env => { ui.sym[k] = false; env.rerender(); }; }
  const cust = {};
  if (dyn === '1032') cust.EDITOR_CUSTOM_CONTROL = textEditorCtrl(ctx, n);
  if (dyn === '1035') cust.EDITOR_CUSTOM_CONTROL = textEditorCtrl(ctx, n, { readonly: true, linesGetter: () => APP.textModuleLines(X.val(o(), 'REF_NAME')) });
  return {
    f, fc, cust,
    vis: el => {
      if (el.n === 'USE_FULL_SCREEN_TEXTEDITOR') return false;
      for (const [k, p] of Object.entries(pairs)) {
        if (!p) continue;
        const on = ui.sym[k] ?? p[0].isSym();
        if (el.n === p[1] || el.n === p[3]) return !on;
        if (el.n === p[2] || el.n === p[4]) return on;
        if (p[6] && el.n === p[6]) return !on;
        if (p[7] && el.n === p[7]) return on;
      }
      return undefined;
    },
  };
}

function eventBinding(ctx, which) {
  const ev = ctx.node, t = ev.parent, o = () => t.obj;
  if (which === 'H') {
    const hdr = () => X.val(o(), 'OTABHEADER');
    return { f: {
      'SSFSCREEN-OUT_HSTART': { get: () => ['A', 'B'].includes(hdr()), set: v => { const b = ['A', 'P'].includes(hdr()); X.set(o(), 'OTABHEADER', v && b ? 'A' : v ? 'B' : b ? 'P' : ''); } },
      'SSFSCREEN-OUT_HBREAK': { get: () => ['A', 'P'].includes(hdr()), set: v => { const s = ['A', 'B'].includes(hdr()); X.set(o(), 'OTABHEADER', v && s ? 'A' : v ? 'P' : s ? 'B' : ''); } },
    } };
  }
  const ftr = () => X.val(o(), 'OTABFOOTER');
  return { f: {
    'SSFSCREEN-OUT_FTOP': B.dec(o, o, 'FHEIGHT'), 'SSFSCREEN-OUT_FUTOP': B.unit(o, o, 'U_FHEIGHT', VL.unitV),
    'SSFSCREEN-OUT_FBREAK': { get: () => ['A', 'P'].includes(ftr()), set: v => { const e = ['A', 'E'].includes(ftr()); X.set(o(), 'OTABFOOTER', v && e ? 'A' : v ? 'P' : e ? 'E' : ''); } },
    'SSFSCREEN-OUT_FEND': { get: () => ['A', 'E'].includes(ftr()), set: v => { const b = ['A', 'P'].includes(ftr()); X.set(o(), 'OTABFOOTER', v && b ? 'A' : v ? 'E' : b ? 'P' : ''); } },
  } };
}

function dataBinding(ctx) {
  const n = ctx.node, o = () => n.obj, form = ctx.form;
  const dt = () => X.val(o(), 'DATATYPE');
  const where = condTable(() => X.kid(o(), 'WCOND'), () => X.ensure(o(), 'WCOND'), ctx);
  /* sort criteria with "event on sort begin/end" nodes */
  const evFor = (field, t) => n.children.find(c => c.type === 'EV' && c.sub === t && X.val(c.obj, 'SFIELD') === field);
  const setEv = (field, t, on) => {
    const e = evFor(field, t);
    if (on && !e) {
      const node = form.eventNode(t, field);
      const succ = n.succ || X.ensure(n.el, 'sf:SUCC');
      const it = X.mk(form.doc, 'sf:item'); it.appendChild(node); succ.appendChild(it);
    }
    if (!on && e) form.removeNode(e);
  };
  const sort = itemTable(() => X.kid(o(), 'SORT'), () => X.ensure(o(), 'SORT'), {
    'G_SORT_FIELDS-NAME': { get: r => X.val(r, 'NAME'), set: (r, v) => { v = v.toUpperCase(); const old = X.val(r, 'NAME'); X.set(r, 'NAME', v); for (const t of ['S', 'E']) { const e = evFor(old, t); if (e) X.set(e.obj, 'SFIELD', v); } } },
    'G_SORT_FIELDS-ASCENDING': { get: r => X.val(r, 'DESCENDING') !== 'X', set: (r, v) => { if (v) { X.set(r, 'ASCENDING', 'X'); X.set(r, 'DESCENDING', ''); } } },
    'G_SORT_FIELDS-DESCENDING': { get: r => X.val(r, 'DESCENDING') === 'X', set: (r, v) => { if (v) { X.set(r, 'DESCENDING', 'X'); X.set(r, 'ASCENDING', ''); } } },
    'G_SORT_FIELDS-ATNEW': { get: r => X.val(r, 'ATNEW') === 'X', set: (r, v) => { X.set(r, 'ATNEW', v ? 'X' : ''); setEv(X.val(r, 'NAME'), 'S', v); } },
    'G_SORT_FIELDS-ATEND': { get: r => X.val(r, 'ATEND') === 'X', set: (r, v) => { X.set(r, 'ATEND', v ? 'X' : ''); setEv(X.val(r, 'NAME'), 'E', v); } },
  }, { init: it => X.set(it, 'ASCENDING', 'X') });
  const rmS = sort.remove; sort.remove = idxs => { const rows = sort.rows(); for (const i of idxs) for (const t of ['S', 'E']) setEv(X.val(rows[i], 'NAME'), t, false); rmS(idxs); };
  const codes = tcCodes('TC_OUTPUT_WHERE', where, ctx, {
    TC_CONDOR: env => env.pai('Insert OR', () => { const s = [...env.sel('TC_OUTPUT_WHERE')]; const at = s.length ? s[0] : where.rows().length; const l = X.ensure(o(), 'WCOND'); const it = X.mk(l.ownerDocument, 'item'); l.insertBefore(it, where.rows()[at] || null); X.set(it, 'LOP', 'OR'); where.fixLop(); }),
    TC_INSERT_SORT: env => env.pai('Insert sort criterion', () => { const s = [...env.sel('TC_SORT_FIELDS')]; sort.insertAt(s.length ? s[0] : sort.rows().length); }),
    TC_DELETE_SORT: env => { const s = [...env.sel('TC_SORT_FIELDS')]; if (!s.length) return env.msg('W', 'Select a sort criterion'); env.pai('Delete sort criterion', () => sort.remove(s)); env.sel('TC_SORT_FIELDS').clear(); },
    CHECK: env => APP.checkNode(n, env),
    DROP: env => env.rerender(),
  });
  return {
    f: {
      'SSFSCREEN-OUT_DO': { get: () => dt() === 'D', set: v => X.set(o(), 'DATATYPE', v ? 'D' : (n.sub === 'L' || n.sub === 'C' ? 'L' : '')) },
      'SSFSCREEN-OUT_LOOP': { get: () => dt() === 'L', set: v => X.set(o(), 'DATATYPE', v ? 'L' : '') },
      'SSFSCREEN-OUT_TNAME': B.leaf(o, o, 'TABNAME', { in: v => v.toUpperCase() }),
      'SSFSCREEN-OUT_TTYPE': B.leaf(o, o, 'TABHTYPE', { values: VL.tabhtype }),
      'SSFSCREEN-OUT_THEAD': B.leaf(o, o, 'TABHEADER', { in: v => v.toUpperCase() }),
      'SSFSCREEN-OUT_FLINE': B.leaf(o, o, 'FIRSTLINE', { in: v => v === '' ? '' : String(parseInt(v, 10) || 0).padStart(10, '0'), out: v => v ? String(+v) : '' }),
      'SSFSCREEN-OUT_LLINE': B.leaf(o, o, 'LASTLINE', { in: v => v === '' ? '' : String(parseInt(v, 10) || 0).padStart(10, '0'), out: v => v ? String(+v) : '' }),
      'SSFSCREEN-SORTEXIST': B.flag(o, o, 'SORTEXIST'),
    },
    tc: { TC_OUTPUT_WHERE: where, TC_SORT_FIELDS: sort },
    fc: codes,
    ro: el => ['SSFSCREEN-OUT_TNAME', 'SSFSCREEN-OUT_TTYPE', 'SSFSCREEN-OUT_THEAD', 'SSFSCREEN-OUT_FLINE', 'SSFSCREEN-OUT_LLINE'].includes(el.n) && dt() !== 'L',
    vis: el => (n.sub === 'C' && ['FRAME1', 'SSFSCREEN-OUT_DO'].includes(el.n)) ? false : undefined,
  };
}

/* a table line's cells follow its line type */
function syncRowCells(form, row, table, lineType) {
  if (!table) return;
  const want = cellsOf(table.obj, lineType).length;
  const cells = row.children.filter(c => c.kind === 'SE-E');
  if (cells.length > want) {
    APP.needConfirm('ltype', 'Change Line Type', `Line type ${lineType} has ${want} column(s). ${cells.length - want} cell node(s) and their content will be deleted. Do you want to change the line type?`);
    for (const c of cells.slice(want)) form.removeNode(c);
  }
  for (let i = cells.length; i < want; i++) form.insertNodeEl(form.createNode('SEE', row), row);
}
