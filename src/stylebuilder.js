/* =====================================================================
   stylebuilder.js — SAP Smart Styles Style Builder (SAPLSTXBS 0100):
   style tree (header data, paragraph formats, character formats),
   attribute tabs 2011/2012/2021–2024/2031, preview.
   ===================================================================== */
'use strict';

const FONT_DESCR = { COURIER: 'Courier', HELVE: 'Helvetica', TIMES: 'Times', LETGOTH: 'Letter Gothic', LNPRINT: 'Line Printer', OCRA: 'OCR-A', OCRB: 'OCR-B',
  COURCYR: 'Courier Cyrillic', HELVCYR: 'Helvetica Cyrillic', TIMECYR: 'Times Cyrillic', A_SIMP: 'Arial Unicode (simplified)', ANDALE_J: 'Andale Japanese', ARIAL: 'Arial' };
const STD_FONTS = ['COURIER', 'HELVE', 'TIMES', 'LETGOTH', 'LNPRINT', 'OCRA', 'OCRB', 'COURCYR', 'HELVCYR', 'TIMECYR', 'A_SIMP'];
const FONT_PROP = [['  ', 'Normal'], ['X ', 'Bold'], [' X', 'Italic'], ['XX', 'Bold Italic'], ['**', 'Retain'], ['X*', 'Bold, italic retained'], ['*X', 'Italic, bold retained'], [' *', 'Not bold, italic retained'], ['* ', 'Not italic, bold retained']];
const JUSTIFY = [['LEFT', 'Left-aligned'], ['CENTER', 'Centered'], ['RIGHT', 'Right-aligned'], ['BLOCK', 'Justified']];
const TAB_JUSTIFY = [['LEFT', 'Left-aligned'], ['RIGHT', 'Right-aligned'], ['CENTER', 'Centered'], ['SIGN', 'Sign'], ['DECIMAL', 'Decimal point']];
const NUMBERING = [['', 'None'], ['A', 'Arabic numerals'], ['C', 'Fixed character'], ['L', 'Letters'], ['L+', 'Letters (uppercase)'], ['R', 'Roman numerals'], ['R+', 'Roman numerals (uppercase)']];
const STYLE_TAB_TEXT = { SCR_SET: 'Standard Settings', SCR_HEAD: 'Administration', SCR_PARA_MARGIN: 'Indents and Spacing', SCR_FONT: 'Font', SCR_PARA_TAB: 'Tabs', SCR_PARA_NEST: 'Numbering and Outline' };

const SB = {
  style: null, sel: { k: 'HDR' }, tabOf: new Map(), tcSel: new Map(), expanded: new Set(['PARS', 'STRS']), timer: 0,
  open(style) { this.style = style; this.sel = { k: 'HDR' }; this.tabOf = new Map(); this.tcSel = new Map(); this.expanded = new Set(['PARS', 'STRS']); },
  key() { return this.sel.k + (this.sel.code ? ':' + this.sel.code : ''); },
  item() {
    const s = this.style;
    if (this.sel.k === 'HDR' || this.sel.k === 'ROOT') return s.header;
    if (this.sel.k === 'PAR') return s.para(this.sel.code);
    if (this.sel.k === 'STR') return s.str(this.sel.code);
    return null;
  },
  select(sel) { APP.flushEditors(); this.sel = sel; this.render(); },
  pai(label, fn) {
    if (APP.mode !== 'edit') { APP.msg('W', 'Switch to change mode first (Ctrl+F1)'); return false; }
    try { this.style.journal.tx(label, fn); }
    catch (e) { if (e.confirm) { APP.askConfirm(e.confirm, () => this.pai(label, fn)); return false; } APP.msg('E', e.message || String(e)); this.schedule(); return false; }
    APP.setDirty(true); this.schedule(); return true;
  },
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.render(), 0); },
  afterUndo() { if (this.sel.code && !this.item()) this.sel = { k: 'HDR' }; this.render(); },
  env() {
    const self = this, key = this.key();
    return {
      edit: APP.mode === 'edit', pai: (l, f) => self.pai(l, f), rerender: () => self.schedule(), msg: (t, x) => APP.msg(t, x),
      sel: tc => { const k = key + '|' + tc; let s = self.tcSel.get(k); if (!s) { s = new Set(); self.tcSel.set(k, s); } return s; },
      renderScreen: (k, fit, b) => Dynpro.render(k, b || self.binding(k), self.env(), { fit }),
    };
  },

  render() {
    const host = document.getElementById('sb'); if (!host || !this.style) return;
    if (this.sel.code && !this.item()) this.sel = { k: 'HDR' };
    const keep = APP.captureFocus(host);
    if (!host.firstChild) host.innerHTML = `<div class="sb-tree pane"></div><div class="fb-split"></div><div class="sb-center pane"></div>`;
    this.renderTree(host.querySelector('.sb-tree'));
    this.renderNode(host.querySelector('.sb-center'));
    APP.restoreFocus(host, keep);
    APP.updateTitle();
  },
  renderTree(box) {
    const s = this.style, st = box.scrollTop; box.innerHTML = '';
    const head = document.createElement('div'); head.className = 'pane-title'; head.innerHTML = `${icon('style')} Style ${esc(s.name)}`; box.appendChild(head);
    const ul = document.createElement('ul'); ul.className = 'tree'; ul.tabIndex = 0;
    const row = (sel, ic, name, text, depth, hasKids) => {
      const li = document.createElement('li');
      const r = document.createElement('div'); r.className = 'tree-row'; r.style.paddingLeft = (4 + depth * 16) + 'px';
      const k = sel.k + (sel.code ? ':' + sel.code : '');
      if (k === this.key()) r.classList.add('sel');
      const open = this.expanded.has(sel.k);
      const tw = document.createElement('span'); tw.className = 'twisty' + (hasKids ? (open ? ' open' : ' closed') : '');
      tw.onclick = e => { e.stopPropagation(); if (open) this.expanded.delete(sel.k); else this.expanded.add(sel.k); this.render(); };
      r.appendChild(tw); r.insertAdjacentHTML('beforeend', icon(ic));
      const lab = document.createElement('span'); lab.className = 'tree-lab'; lab.innerHTML = (name ? `<b>${esc(name)}</b> ` : '') + esc(text || ''); r.appendChild(lab);
      r.onclick = () => this.select(sel);
      r.ondblclick = () => { if (hasKids) { if (open) this.expanded.delete(sel.k); else this.expanded.add(sel.k); this.render(); } };
      r.oncontextmenu = e => { e.preventDefault(); this.select(sel); this.menu(e.clientX, e.clientY); };
      li.appendChild(r); return { li, open };
    };
    const root = row({ k: 'ROOT' }, 'style', s.name, X.val(s.header, 'CAPTION'), 0, false); ul.appendChild(root.li);
    ul.appendChild(row({ k: 'HDR' }, 'header', '', 'Header Data', 1, false).li);
    const pars = s.paragraphs(), strs = s.strings();
    const p = row({ k: 'PARS' }, 'folder', '', 'Paragraph Formats', 1, pars.length > 0); ul.appendChild(p.li);
    if (p.open) { const sub = document.createElement('ul'); for (const it of pars) sub.appendChild(row({ k: 'PAR', code: X.val(it, 'TDPARGRAPH') }, 'para', X.val(it, 'TDPARGRAPH'), X.val(it, 'CAPTION'), 2, false).li); p.li.appendChild(sub); }
    const c = row({ k: 'STRS' }, 'folder', '', 'Character Formats', 1, strs.length > 0); ul.appendChild(c.li);
    if (c.open) { const sub = document.createElement('ul'); for (const it of strs) sub.appendChild(row({ k: 'STR', code: X.val(it, 'TDSTRING') }, 'charfmt', X.val(it, 'TDSTRING'), X.val(it, 'CAPTION'), 2, false).li); c.li.appendChild(sub); }
    box.appendChild(ul); box.scrollTop = st;
    ul.addEventListener('keydown', e => {
      const keys = [{ k: 'ROOT' }, { k: 'HDR' }, { k: 'PARS' }, ...(this.expanded.has('PARS') ? pars.map(i => ({ k: 'PAR', code: X.val(i, 'TDPARGRAPH') })) : []), { k: 'STRS' }, ...(this.expanded.has('STRS') ? strs.map(i => ({ k: 'STR', code: X.val(i, 'TDSTRING') })) : [])];
      const i = keys.findIndex(x => x.k + (x.code ? ':' + x.code : '') === this.key());
      if (e.key === 'ArrowDown' && i < keys.length - 1) { e.preventDefault(); this.select(keys[i + 1]); setTimeout(() => document.querySelector('.sb-tree .tree')?.focus()); }
      if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); this.select(keys[i - 1]); setTimeout(() => document.querySelector('.sb-tree .tree')?.focus()); }
      if (e.key === 'Delete') { e.preventDefault(); this.fcode('DELETE'); }
    });
  },
  menu(x, y) {
    const edit = APP.mode === 'edit', k = this.sel.k;
    const items = [];
    if (edit && (k === 'PARS' || k === 'PAR')) items.push({ label: 'Create Node', icon: 'create', fn: () => this.fcode('CREATE_PAR') });
    if (edit && (k === 'STRS' || k === 'STR')) items.push({ label: 'Create Node', icon: 'create', fn: () => this.fcode('CREATE_STR') });
    if (edit && (k === 'PAR' || k === 'STR')) {
      items.push({ label: 'Copy', icon: 'copy', fn: () => this.fcode('COPY') });
      items.push({ label: 'Rename', icon: 'rename', fn: () => this.fcode('RENAME') });
      items.push({ label: 'Delete', icon: 'delete', fn: () => this.fcode('DELETE') });
    }
    items.push({ label: 'Expand', icon: 'expand', fn: () => { this.expanded.add('PARS'); this.expanded.add('STRS'); this.render(); } });
    items.push({ label: 'Collapse', icon: 'collapse', fn: () => { this.expanded.clear(); this.render(); } });
    APP.contextMenu(x, y, items);
  },
  fcode(fc) {
    const s = this.style, k = this.sel.k;
    const isPar = fc === 'CREATE_PAR' || (fc !== 'CREATE_STR' && (k === 'PAR' || k === 'PARS'));
    const codeOk = (v, list) => { v = v.trim().toUpperCase(); if (!/^[A-Z0-9][A-Z0-9_]?$/.test(v)) throw new Error('Enter a name of one or two characters (A-Z, 0-9)'); if (list.some(i => X.val(i, isPar ? 'TDPARGRAPH' : 'TDSTRING') === v)) throw new Error(`${isPar ? 'Paragraph format' : 'Character format'} ${v} already exists`); return v; };
    if (fc === 'CREATE_PAR' || fc === 'CREATE_STR') {
      APP.promptScreen(isPar ? 'Create Paragraph Format' : 'Create Character Format', 'SAPLSTXBS:0120', { 'SSFSCREENS-SNODE_TEXT': isPar ? 'Paragraph Format' : 'Character Format' }, 'POPUP_NODE_NAME', v => {
        let code; if (!this.pai('Create', () => { code = codeOk(v, isPar ? s.paragraphs() : s.strings()); this.createItem(isPar, code); })) return;
        this.expanded.add(isPar ? 'PARS' : 'STRS'); this.sel = { k: isPar ? 'PAR' : 'STR', code }; this.render();
      });
    } else if (fc === 'COPY' || fc === 'RENAME') {
      const it = this.item(); if (!it || (k !== 'PAR' && k !== 'STR')) return APP.msg('W', 'Select a paragraph or character format');
      const old = this.sel.code;
      APP.promptScreen(fc === 'COPY' ? 'Copy Node' : 'Rename Node', 'SAPLSTXBS:0130', { 'SSFSCREENS-SOLD_TEXT': 'Old name', POPUP_OLD_NAME: old, 'SSFSCREENS-SNEW_TEXT': 'New name' }, 'POPUP_NEW_NAME', v => {
        let code;
        if (!this.pai(fc === 'COPY' ? 'Copy' : 'Rename', () => {
          code = codeOk(v, isPar ? s.paragraphs() : s.strings());
          const field = isPar ? 'TDPARGRAPH' : 'TDSTRING';
          let target = it;
          if (fc === 'COPY') { target = it.cloneNode(true); }
          else it.remove();
          X.set(target, field, code);
          this.insertSorted(isPar ? 'PARAGRAPHS' : 'STRINGS', target, field);
          if (isPar) for (const t of s.list('TABSTOPS').filter(t => X.val(t, 'TDPARGRAPH') === old)) {
            if (fc === 'COPY') { const c = t.cloneNode(true); X.set(c, 'TDPARGRAPH', code); t.parentNode.insertBefore(c, null); } else X.set(t, 'TDPARGRAPH', code);
          }
          if (fc === 'RENAME' && isPar) { if (X.val(s.header, 'TDFIRSTPAR') === old) X.set(s.header, 'TDFIRSTPAR', code); for (const p of s.paragraphs()) if (X.val(p, 'TDLFIRSTPA') === old) X.set(p, 'TDLFIRSTPA', code); }
          if (fc === 'RENAME' && !isPar) for (const p of s.paragraphs()) if (X.val(p, 'TDLSTRING') === old) X.set(p, 'TDLSTRING', code);
          if (isPar) this.sortTabstops();
        })) return;
        this.sel = { k, code }; this.render();
      });
    } else if (fc === 'DELETE') {
      const it = this.item(); if (!it || (k !== 'PAR' && k !== 'STR')) return APP.msg('W', 'Select a paragraph or character format');
      const code = this.sel.code;
      if (isPar && X.val(s.header, 'TDFIRSTPAR') === code) return APP.msg('E', `${code} is the standard paragraph and cannot be deleted`);
      APP.confirmDialog('Delete Node', `Delete ${isPar ? 'paragraph format' : 'character format'} ${code}?`, () => {
        if (this.pai('Delete', () => { it.remove(); if (isPar) for (const t of s.list('TABSTOPS').filter(t => X.val(t, 'TDPARGRAPH') === code)) t.remove(); for (const w of ['PARAGRAPHS', 'STRINGS', 'TABSTOPS']) { const l = X.kid(s.root, 'sf:' + w); if (l && !l.children.length) l.remove(); } })) { this.sel = { k: isPar ? 'PARS' : 'STRS' }; this.render(); }
      });
    }
  },
  insertSorted(list, it, field) {
    const l = this.style.ensureList(list);
    const v = X.val(it, field);
    const after = X.kids(l, 'item').find(x => X.val(x, field) > v);
    l.insertBefore(it, after || null);
  },
  sortTabstops() {
    const l = X.kid(this.style.root, 'sf:TABSTOPS'); if (!l) return;
    const items = X.kids(l, 'item');
    const sorted = [...items].sort((a, b) => (X.val(a, 'TDPARGRAPH') + X.val(a, 'TDPOSITION')).localeCompare(X.val(b, 'TDPARGRAPH') + X.val(b, 'TDPOSITION')));
    if (sorted.every((x, i) => x === items[i])) return;
    for (const x of sorted) l.appendChild(x);
  },
  createItem(isPar, code) {
    const s = this.style, doc = s.doc;
    const it = X.mk(doc, 'item');
    const lang = X.val(s.header, 'LANGU') || s.lang;
    const fields = isPar
      ? { ACTIVE: 'A', STYLENAME: s.name, TDPARGRAPH: code, TDPJUSTIFY: 'LEFT', TDPLDIST: '1.00', TDPLDISTU: 'LN', TDPTOP: '0.00', TDPTOPU: 'LN', TDPBOT: '0.00', TDPBOTU: 'LN',
        TDPLEFT: '0.00', TDPLEFTU: 'CM', TDPRIGHT: '0.00', TDPRIGHTU: 'CM', TDPENTRY: '0.00', TDPENTRYU: 'CM', TDNUMLEFT: '0.00', TDNUMOUTL: '00', TDLDEPTH: '00',
        TDLFIRSTIN: '0', TDLNEXTIND: '0', TDLCOUNT: '0', TDHEIGHT: '000', TDBOLD: '*', TDITALIC: '*', TDUNDERLIN: '*', TDULPOS: '0.00', TDULTHICK: '0.00', TDULGREY: '000',
        RED: '000', GREEN: '000', BLUE: '000', TRANS: '000', LANGU: lang, CAPTION: '' }
      : { ACTIVE: 'A', STYLENAME: s.name, TDSTRING: code, TDMARK: '*', TDSUPER: '*', TDSUB: '*', TDSUDIST: '0.00', TDHIDDEN: '*', TDPROTLINE: '*', TDHEIGHT: '000', TDBOLD: '*', TDITALIC: '*',
        TDUNDERLIN: '*', TDULPOS: '0.00', TDULTHICK: '0.00', TDULGREY: '000', RED: '000', GREEN: '000', BLUE: '000', TRANS: '000', LANGU: lang, CAPTION: '' };
    const l = s.ensureList(isPar ? 'PARAGRAPHS' : 'STRINGS'); l.appendChild(it); it.remove();
    for (const [k, v] of Object.entries(fields)) { if (v === '') continue; const e = X.mk(doc, k); e.textContent = v; it.appendChild(e); }
    this.insertSorted(isPar ? 'PARAGRAPHS' : 'STRINGS', it, isPar ? 'TDPARGRAPH' : 'TDSTRING');
    if (isPar && !X.val(s.header, 'TDFIRSTPAR')) X.set(s.header, 'TDFIRSTPAR', code);
  },

  tabs() {
    switch (this.sel.k) {
      case 'HDR': case 'ROOT': return [['SCR_SET', 'SAPLSTXBS:2011'], ['SCR_HEAD', 'SAPLSTXBS:2012']];
      case 'PAR': return [['SCR_PARA_MARGIN', 'SAPLSTXBS:2021'], ['SCR_FONT', 'SAPLSTXBS:2022'], ['SCR_PARA_TAB', 'SAPLSTXBS:2023'], ['SCR_PARA_NEST', 'SAPLSTXBS:2024']];
      case 'STR': return [['SCR_SET', 'SAPLSTXBS:2031'], ['SCR_FONT', 'SAPLSTXBS:2022']];
    }
    return [];
  },
  renderNode(box) {
    const st = box.scrollTop; box.innerHTML = '';
    const s = this.style, k = this.sel.k;
    const kindText = { ROOT: 'Style', HDR: 'Header Data', PARS: 'Paragraph Formats', STRS: 'Character Formats', PAR: 'Paragraph Format', STR: 'Character Format' }[k];
    const it = this.item();
    const hdr = Dynpro.render('SAPLSTXBS:0100', {
      f: {
        'SSFSCREENS-SNODE_TEXT': { get: () => kindText },
        'SSFSCREENS-SNODE_NAME': { get: () => this.sel.code || s.name },
        'SSFSCREENS-STATUS': { get: () => APP.statusText() },
        'SSFSCREENS-SNODE_CAPT': (k === 'PAR' || k === 'STR' || k === 'HDR' || k === 'ROOT') ? { get: () => X.val(it, 'CAPTION'), set: v => X.set(it, 'CAPTION', v.slice(0, 30)), lower: true } : { get: () => '' },
      },
      vis: el => el.n === 'SCR_PREVIEW_TITLE' ? false : undefined,
    }, this.env(), { fit: { w: 72, h: 2 } });
    hdr.classList.add('node-hdr'); box.appendChild(hdr);
    const tabs = this.tabs(); const key = this.key();
    let cur = this.tabOf.get(this.sel.k); if (!tabs.some(t => t[0] === cur)) cur = tabs[0]?.[0];
    if (tabs.length) {
      const strip = document.createElement('div'); strip.className = 'tabstrip';
      for (const [id] of tabs) { const t = document.createElement('button'); t.type = 'button'; t.className = 'tab' + (id === cur ? ' on' : ''); t.textContent = STYLE_TAB_TEXT[id]; t.onclick = () => { this.tabOf.set(this.sel.k, id); this.render(); }; strip.appendChild(t); }
      box.appendChild(strip);
      const page = document.createElement('div'); page.className = 'tabpage';
      const scr = tabs.find(t => t[0] === cur)[1];
      try { page.appendChild(Dynpro.render(scr, this.binding(scr), this.env())); } catch (e) { console.error(e); page.textContent = e.message; }
      box.appendChild(page);
    } else {
      const d = document.createElement('div'); d.className = 'empty';
      d.textContent = k === 'PARS' ? `${s.paragraphs().length} paragraph formats. Right-click to create one.` : k === 'STRS' ? `${s.strings().length} character formats. Right-click to create one.` : '';
      box.appendChild(d);
    }
    /* preview */
    const pv = document.createElement('fieldset'); pv.className = 'sb-preview';
    pv.innerHTML = '<legend>Preview</legend>';
    const sample = 'The quick brown fox jumps over the lazy dog. Əlifba: ƏəĞğIıÖöÜüŞşÇç 0123456789';
    const lines = k === 'PAR' ? [{ f: this.sel.code, t: sample }] : k === 'STR' ? [{ f: '*', t: `Default text <${this.sel.code}>${sample}</>` }] : [{ f: '*', t: sample }];
    const pvEl = TextEditor.renderPreview(TextEditor.toParas(lines), s);
    const src = k === 'PAR' ? s.para(this.sel.code) : k === 'STR' ? s.str(this.sel.code) : s.header;
    if (src && ['RED', 'GREEN', 'BLUE'].every(c => +X.val(src, c) > 200) && (k !== 'STR' || X.val(src, 'USED') === 'X')) pvEl.style.background = '#3d4b59';
    pv.appendChild(pvEl);
    box.appendChild(pv);
    box.scrollTop = st;
  },

  /* ---------- bindings ---------- */
  binding(scr) {
    const s = this.style, it = () => this.item(), k = this.sel.k;
    const isHdr = k === 'HDR' || k === 'ROOT';
    const leaf = (name, opt) => B.leaf(it, it, name, opt);
    const dec = name => B.dec(it, it, name);
    const unit = (name, list) => B.unit(it, it, name, list);
    const paraVals = () => s.paragraphs().map(p => [X.val(p, 'TDPARGRAPH'), X.val(p, 'CAPTION')]);
    const strVals = () => [['', ''], ...s.strings().map(p => [X.val(p, 'TDSTRING'), X.val(p, 'CAPTION')])];
    const fonts = () => { const set = new Set(STD_FONTS); for (const st of APP.allStyles()) for (const x of [st.header, ...st.paragraphs(), ...st.strings()]) { const v = X.val(x, 'TDFAMILY'); if (v) set.add(v); } return [...(isHdr ? [] : [['', '']]), ...[...set].sort().map(f => [f, `${f}  ${FONT_DESCR[f] || ''}`])]; };
    const tri = name => ({ get: () => X.val(it(), name) === 'X', set: v => X.set(it(), name, v ? 'X' : (isHdr ? '' : '*')) });
    const colorHex = () => '#' + ['RED', 'GREEN', 'BLUE'].map(c => (+X.val(it(), c) || 0).toString(16).padStart(2, '0')).join('');
    const font = {
      'SSFSCREENS-TDFAMILY': leaf('TDFAMILY', { values: fonts() }),
      'SSFSCREENS-SFNT_DESCR': { get: () => FONT_DESCR[X.val(it(), 'TDFAMILY')] || (X.val(it(), 'TDFAMILY') ? '' : 'Inherited') },
      'SSFSCREENS-LOC_HEIGHT': { get: () => { const h = +X.val(it(), 'TDHEIGHT'); return h ? (h / 10).toFixed(1) : ''; }, set: v => { const n = v === '' ? 0 : parseFloat(v.replace(',', '.')); if (!(n >= 0 && n <= 99.9)) throw new Error('Font size: 1.0 – 99.9 pt'); X.set(it(), 'TDHEIGHT', String(Math.round(n * 10)).padStart(3, '0')); } },
      'SSFSCREENS-SFNT_PROP': {
        get: () => { const b = X.val(it(), 'TDBOLD') || ' ', i = X.val(it(), 'TDITALIC') || ' '; return b + i; },
        set: v => { X.set(it(), 'TDBOLD', v[0].trim()); X.set(it(), 'TDITALIC', v[1].trim()); },
        values: () => FONT_PROP.filter(([key]) => !isHdr || !key.includes('*')),
      },
      'SSFSCREENS-TDUNDERLIN': tri('TDUNDERLIN'),
      'SSFSCREENS-USED': { get: () => X.val(it(), 'USED') === 'X', set: v => X.set(it(), 'USED', v ? 'X' : '') },
    };
    const fc = {
      FULINEM: env => this.dialogUnderline(env),
      FUSED: () => {},
    };
    const cust = { COLOR_CONTAINER: (host, env) => host.appendChild(colorPicker(colorHex, hex => { const h = hex.replace('#', ''); ['RED', 'GREEN', 'BLUE'].forEach((c, i) => X.set(it(), c, String(parseInt(h.slice(i * 2, i * 2 + 2), 16)).padStart(3, '0'))); X.set(it(), 'TRANS', X.val(it(), 'TRANS') || '000'); X.set(it(), 'USED', 'X'); }, env, 'Color')) };
    switch (scr) {
      case 'SAPLSTXBS:2011': return {
        f: { ...font,
          'SSFSCREENS-TDFIRSTPAR': leaf('TDFIRSTPAR', { values: paraVals() }),
          'SSFSCREENS-CPI': dec('CPI'), 'SSFSCREENS-LPI': dec('LPI'),
          'SSFSCREENS-TDTABDIST': dec('TDTABDIST'), 'SSFSCREENS-TDTABDISTU': unit('TDTABDISTU', VL.unitH),
          'SSFSCREENS-STDFORMAT': { get: () => X.val(it(), 'STDFORMAT') === 'X', set: v => X.set(it(), 'STDFORMAT', v ? 'X' : '') },
        },
        fc, cust, vis: el => el.n === 'STREPLACE' ? false : undefined,
      };
      case 'SAPLSTXBS:2012': {
        const h = () => s.header;
        const ro = n => ({ get: () => X.val(h(), n) });
        return { f: { 'SSFSCREENS-DEVC': ro('DEVCLASS'), 'SSFSCREENS-FIRSTUSER': ro('FIRSTUSER'), 'SSFSCREENS-LASTUSER': ro('LASTUSER'), 'SSFSCREENS-FIRSTDATE': { get: () => fmtDate(X.val(h(), 'FIRSTDATE')) }, 'SSFSCREENS-LASTDATE': { get: () => fmtDate(X.val(h(), 'LASTDATE')) }, 'SSFSCREENS-FIRSTTIME': ro('FIRSTTIME'), 'SSFSCREENS-LASTTIME': ro('LASTTIME') } };
      }
      case 'SAPLSTXBS:2021': return {
        f: {
          'SSFSCREENS-TDPJUSTIFY': leaf('TDPJUSTIFY', { values: JUSTIFY }),
          'SSFSCREENS-TDPLEFT': dec('TDPLEFT'), 'SSFSCREENS-TDPLEFTU': unit('TDPLEFTU', VL.unitH),
          'SSFSCREENS-TDPENTRY': dec('TDPENTRY'), 'SSFSCREENS-TDPENTRYU': unit('TDPENTRYU', VL.unitH),
          'SSFSCREENS-TDPRIGHT': dec('TDPRIGHT'), 'SSFSCREENS-TDPRIGHTU': unit('TDPRIGHTU', VL.unitH),
          'SSFSCREENS-TDPTOP': dec('TDPTOP'), 'SSFSCREENS-TDPTOPU': unit('TDPTOPU', VL.unitV),
          'SSFSCREENS-TDPLDIST': dec('TDPLDIST'), 'SSFSCREENS-TDPLDISTU': unit('TDPLDISTU', VL.unitV),
          'SSFSCREENS-TDPBOT': dec('TDPBOT'), 'SSFSCREENS-TDPBOTU': unit('TDPBOTU', VL.unitV),
          'SSFSCREENS-TDPPROTPAG': B.flag(it, it, 'TDPPROTPAG'), 'SSFSCREENS-TDPPROTNEX': B.flag(it, it, 'TDPPROTNEX'),
        },
      };
      case 'SAPLSTXBS:2022': return { f: font, fc, cust, ro: el => el.n === 'SCR_FULINE_MORE' ? false : undefined };
      case 'SAPLSTXBS:2023': {
        const code = this.sel.code;
        const tl = () => X.kid(s.root, 'sf:TABSTOPS');
        const renum = () => { s.tabstops(code).forEach((t, i) => X.set(t, 'TDPOSITION', String(i + 1).padStart(2, '0'))); };
        const tb = itemTable(tl, () => s.ensureList('TABSTOPS'), {
          'SCR_TAB-TDPOSITION': { get: r => String(+X.val(r, 'TDPOSITION')), ro: true },
          'SCR_TAB-TDTABPOS': { get: r => X.val(r, 'TDTABPOS'), set: (r, v) => X.set(r, 'TDTABPOS', normDec(v) || '0.00') },
          'SCR_TAB-TDTABPOSU': { get: r => X.val(r, 'TDTABPOSU'), set: (r, v) => X.set(r, 'TDTABPOSU', v), values: VL.unitH },
          'SCR_TAB-TJUSTIFY': { get: r => X.val(r, 'TDTJUSTIFY'), set: (r, v) => X.set(r, 'TDTJUSTIFY', v), values: TAB_JUSTIFY },
        }, {
          filter: r => X.val(r, 'TDPARGRAPH') === code,
          insertAfter: l => { const mine = X.kids(l, 'item').filter(r => X.val(r, 'TDPARGRAPH') === code); if (mine.length) return mine[mine.length - 1]; const later = X.kids(l, 'item').find(r => X.val(r, 'TDPARGRAPH') > code); return later ? later.previousElementSibling : X.kids(l, 'item').slice(-1)[0] || null; },
          init: r => { for (const [k2, v] of [['ACTIVE', 'A'], ['STYLENAME', s.name], ['TDPARGRAPH', code], ['TDPOSITION', '99'], ['TDTABPOS', '0.00'], ['TDTABPOSU', 'CM'], ['TDTJUSTIFY', 'LEFT']]) X.set(r, k2, v); },
        });
        const add0 = tb.add, ins0 = tb.insertAt, rm0 = tb.remove;
        tb.add = () => { const r = add0(); renum(); return r; };
        tb.insertAt = i => { const r = ins0(i); renum(); return r; };
        tb.remove = idx => { rm0(idx); renum(); };
        const selRows = env => [...env.sel('SCR_TC_TAB')].sort((a, b) => a - b);
        return {
          tc: { SCR_TC_TAB: tb },
          fc: {
            TAB_INSERT: env => env.pai('Insert tab', () => { const sr = selRows(env); if (sr.length) tb.insertAt(sr[0]); else tb.add(); }),
            TAB_DELETE: env => { const sr = selRows(env); if (!sr.length) return env.msg('W', 'Select a tab position'); env.pai('Delete tab', () => tb.remove(sr)); env.sel('SCR_TC_TAB').clear(); },
          },
        };
      }
      case 'SAPLSTXBS:2024': return {
        f: {
          'SSFSCREENS-TDLFIRSTPA': leaf('TDLFIRSTPA', { values: [['', ''], ...paraVals()] }),
          'SSFSCREENS-TDLDEPTH': { get: () => String(+X.val(it(), 'TDLDEPTH') || 0) },
          'SSFSCREENS-SNEST_CNT': {
            get: () => { const t = X.val(it(), 'TDNUMBERIN'); return t + (X.val(it(), 'TDUPPER') === 'X' && 'LR'.includes(t) && t ? '+' : ''); },
            set: v => { X.set(it(), 'TDNUMBERIN', v.replace('+', '')); X.set(it(), 'TDUPPER', v.endsWith('+') ? 'X' : ''); },
            values: () => NUMBERING,
          },
          'SSFSCREENS-TDNUMFIXC': leaf('TDNUMFIXC', { lower: true }), 'SSFSCREENS-TDLFIRSTC': leaf('TDLFIRSTC', { lower: true }), 'SSFSCREENS-TDLLASTC': leaf('TDLLASTC', { lower: true }),
          'SSFSCREENS-TDNUMOUTL': B.leaf(it, it, 'TDNUMOUTL', { in: v => String(parseInt(v, 10) || 0).padStart(2, '0'), out: v => String(+v || 0) }),
          'SSFSCREENS-TDNUMLEFT': dec('TDNUMLEFT'), 'SSFSCREENS-TDNUMLEFTU': unit('TDNUMLEFTU', VL.unitH),
          'SSFSCREENS-SNEST_OFST': { get: () => 'Left Margin', values: () => [['Left Margin', 'Left Margin']] },
          'SSFSCREENS-TDLSTRING': leaf('TDLSTRING', { values: strVals() }),
          'SSFSCREENS-TDLCHAINED': B.flag(it, it, 'TDLCHAINED'),
        },
        ro: el => (el.g2 === 'NP1' || el.g3 === 'NP1') && !X.val(it(), 'TDNUMBERIN') && el.n !== 'SSFSCREENS-SNEST_CNT',
      };
      case 'SAPLSTXBS:2031': return {
        f: {
          'SSFSCREENS-TDSUPER': tri('TDSUPER'), 'SSFSCREENS-TDSUB': tri('TDSUB'),
          'SSFSCREENS-TDPROTLINE': tri('TDPROTLINE'), 'SSFSCREENS-TDHIDDEN': tri('TDHIDDEN'), 'SSFSCREENS-TDMARK': tri('TDMARK'),
          'SSFSCREENS-TDBARCODE': leaf('TDBARCODE', { values: [['', ''], ...[...new Set(APP.allStyles().flatMap(st => st.strings().map(x => X.val(x, 'TDBARCODE')).filter(Boolean)))].map(b => [b, b])] }),
          'SSFSCREENS-SBC_DESCR': { get: () => X.val(it(), 'TDBARCODE') ? 'System bar code (definition in SE73)' : '' },
        },
      };
    }
    return {};
  },
  dialogUnderline(env) {
    const it = this.item(); if (!it) return;
    const st = { pos: X.val(it, 'TDULPOS'), posu: X.val(it, 'TDULPOSU'), th: X.val(it, 'TDULTHICK'), thu: X.val(it, 'TDULTHICKU'), gr: String(+X.val(it, 'TDULGREY') || 0) };
    const b = { f: {
      'SSFSCREENS-TDULPOS': { get: () => st.pos, set: v => { st.pos = v; } }, 'SSFSCREENS-TDULPOSU': { get: () => st.posu, set: v => { st.posu = v.toUpperCase(); }, values: () => VL.unitV },
      'SSFSCREENS-TDULTHICK': { get: () => st.th, set: v => { st.th = v; } }, 'SSFSCREENS-TDULTHICKU': { get: () => st.thu, set: v => { st.thu = v.toUpperCase(); }, values: () => VL.unitV },
      'SSFSCREENS-TDULGREY': { get: () => st.gr, set: v => { st.gr = v; } },
    } };
    APP.screenDialog('Underline', 'SAPLSTXBS:0160', b, () => this.pai('Underline', () => {
      X.set(it, 'TDULPOS', normDec(st.pos) || '0.00'); X.set(it, 'TDULPOSU', st.posu); X.set(it, 'TDULTHICK', normDec(st.th) || '0.00'); X.set(it, 'TDULTHICKU', st.thu);
      const g = parseInt(st.gr, 10) || 0; if (g < 0 || g > 100) throw new Error('Brightness: 0 – 100'); X.set(it, 'TDULGREY', String(g).padStart(3, '0'));
    }), { local: true });
  },
};
