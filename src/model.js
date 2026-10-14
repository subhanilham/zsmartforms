/* =====================================================================
   model.js — Smart Form / Text module / Smart Style document model
   ===================================================================== */
'use strict';

const OBJ_TAG = { PA: 'sf:PAGE', WI: 'sf:WINDOW', TI: 'sf:TEXT', GR: 'sf:GRAPHIC', AD: 'sf:ADDRESS', CM: 'sf:COMMAND',
  CO: 'sf:CODE', CD: 'sf:CONDITION', SE: 'sf:SECTION', EV: 'sf:EVENT' };
const OBJTYPE_OF_TAG = { PAGE: 'PA', WINDOW: 'WI', TEXT: 'TI', GRAPHIC: 'GR', ADDRESS: 'AD', COMMAND: 'CM', CODE: 'CO',
  CONDITION: 'CD', SECTION: 'SE', EVENT: 'EV', OUTATTR: 'OA' };

/* node "kind": NODETYPE plus subtype (window type / section type) */
const KIND_INFO = {
  'PA': { label: 'Page', icon: 'page', prefix: '%PAGE', capt: 'New Page' },
  'WI-M': { label: 'Main Window', icon: 'win_main', prefix: 'MAIN', capt: 'Main Window' },
  'WI-T': { label: 'Secondary Window', icon: 'win', prefix: '%WINDOW', capt: 'New Window' },
  'WI-C': { label: 'Copies Window', icon: 'win_copy', prefix: '%WINDOW', capt: 'New Window' },
  'WI-L': { label: 'Final Window', icon: 'win', prefix: '%WINDOW', capt: 'New Window' },
  'WI-G': { label: 'Graphic', icon: 'graphic', prefix: '%WINDOW', capt: 'New Window' },
  'WI-A': { label: 'Address', icon: 'address', prefix: '%WINDOW', capt: 'New Window' },
  'WI-': { label: 'Window', icon: 'win', prefix: '%WINDOW', capt: 'New Window' },
  'TI': { label: 'Text', icon: 'text', prefix: '%TEXT', capt: 'New Text' },
  'GR': { label: 'Graphic', icon: 'graphic', prefix: '%GRAPHIC', capt: 'New Graphic' },
  'AD': { label: 'Address', icon: 'address', prefix: '%ADDRESS', capt: 'New Address' },
  'CM': { label: 'Command', icon: 'command', prefix: '%COMMAND', capt: 'New Command' },
  'CO': { label: 'Program Lines', icon: 'code', prefix: '%CODE', capt: 'New Program Lines' },
  'CD': { label: 'Alternative', icon: 'condition', prefix: '%CONDITION', capt: 'New Alternative' },
  'EV': { label: 'Event', icon: 'event', prefix: '%EVENT', capt: 'New Event' },
  'SE-C': { label: 'Table', icon: 'sect_ctable', prefix: '%TABLE', capt: 'New Table' },
  'SE-S': { label: 'Template', icon: 'sect_struct', prefix: '%TEMPLATE', capt: 'New Template' },
  'SE-L': { label: 'Loop', icon: 'sect_loop', prefix: '%LOOP', capt: 'New Loop' },
  'SE-F': { label: 'Folder', icon: 'sect_folder', prefix: '%FOLDER', capt: 'New Folder' },
  'SE-R': { label: 'Line', icon: 'sect_row', prefix: '%ROW', capt: 'New Line' },
  'SE-E': { label: 'Cell', icon: 'sect_cell', prefix: '%CELL', capt: 'New Column' },
  'SE-T': { label: 'Table', icon: 'sect_table', prefix: '%SECTION', capt: 'New Section' },
  'SE-': { label: 'Section', icon: 'section', prefix: '%SECTION', capt: 'New Section' },
  'RP': { label: 'Pages and Windows', icon: 'folder' },
  'RC': { label: 'Process Control', icon: 'folder' },
};
const EV_LABEL = { H: 'Header', B: 'Main Area', F: 'Footer', S: 'Event on Sort Begin', E: 'Event on Sort End', '+': 'TRUE', '-': 'FALSE' };
const TEXT_TYPE = { '': 'E', I: 'I', R: 'M', D: 'D', T: 'T' };       /* XML TTYPE -> screen text type */
const TEXT_TYPE_XML = { E: '', I: 'I', M: 'R', D: 'D', T: 'T' };     /* screen -> XML */

class FNode {
  constructor(form, el, parent) {
    this.form = form; this.el = el; this.parent = parent; this.children = [];
    this.type = X.val(el, 'NODETYPE');
    const holder = X.kid(el, 'sf:OBJ');
    this.holder = holder;
    let obj = holder ? holder.firstElementChild : null;
    this.isRef = false;
    if (obj && obj.hasAttribute('IDREF')) { this.isRef = true; this.refEl = obj; obj = form.ids.get(obj.getAttribute('IDREF')) || obj; }
    this.obj = obj;
  }
  get outattr() { return X.path(this.el, 'sf:OUTATTR', 'sf:OUTATTR'); }
  get cond() { return X.path(this.el, 'sf:COND', 'sf:CONDITION'); }
  ensureOutattr() {
    let oa = this.outattr; if (oa) return oa;
    X.insertOrdered(this.el, this.form.outattrEl()); return this.outattr;
  }
  ensureCond() {
    let c = this.cond; if (c) return c;
    const f = this.form, doc = f.doc;
    const wrap = X.mk(doc, 'sf:COND'), cd = X.mk(doc, 'sf:CONDITION'); wrap.appendChild(cd);
    const { name } = f.nextAutoName('%CONDITION', 'CONDITION');
    X.setPath(cd, ['NAME', 'INAME'], name);
    X.newItem(X.ensure(cd, 'T_CAPTION'), { LANGU: f.lang, FORMNAME: f.name, OBJTYPE: 'CD', INAME: name });
    X.insertOrdered(this.el, wrap); return this.cond;
  }
  dropCondIfEmpty() {
    const c = this.cond; if (!c) return;
    if (!X.kids(X.kid(c, 'COND'), 'item').length && !X.kid(c, 'OCOND')) c.parentElement.remove();
  }
  get sub() {
    if (this.type === 'WI') return X.val(this.obj, 'WTYPE');
    if (this.type === 'SE') return X.val(this.obj, 'SECTTYPE');
    if (this.type === 'EV') return X.val(this.obj, 'EVTYPE');
    return null;
  }
  get kind() {
    if (this.type === 'WI' || this.type === 'SE') return this.type + '-' + (this.sub || '');
    return this.type;
  }
  get info() { return KIND_INFO[this.kind] || KIND_INFO[this.type] || { label: this.type, icon: 'section' }; }
  get name() { return X.val(this.obj, 'NAME', 'INAME'); }
  get caption() { return this.form.caption(this.obj); }
  /* the element whose SUCC holds this node's children */
  get succHost() {
    if (this.type === 'WI') {
      const pc = X.path(this.obj, 'sf:PROC_CTRL', 'sf:NODE');
      return pc && X.val(pc, 'NODETYPE') === 'RC' ? pc : null;
    }
    return ['RP', 'PA', 'CD', 'EV', 'SE', 'RC'].includes(this.type) ? this.el : null;
  }
  get succ() { const h = this.succHost; return h ? X.kid(h, 'sf:SUCC') : null; }
  /* graphic / address windows hold their single object directly in PROC_CTRL */
  get inner() {
    if (this.type !== 'WI') return null;
    const pc = X.path(this.obj, 'sf:PROC_CTRL', 'sf:NODE');
    return pc && X.val(pc, 'NODETYPE') !== 'RC' ? pc : null;
  }
  get innerObj() { const n = this.inner; return n ? X.path(n, 'sf:OBJ')?.firstElementChild : null; }
  get page() { let n = this; while (n && n.type !== 'PA') n = n.parent; return n; }
  get window() { let n = this; while (n && n.type !== 'WI') n = n.parent; return n; }
  get depth() { let d = 0; for (let n = this.parent; n; n = n.parent) d++; return d; }
  ancestors() { const a = []; for (let n = this.parent; n; n = n.parent) a.push(n); return a; }
  /* nearest section ancestor info as in CL_SSF_FB_UTILITIES=>CHECK_HIGHER_SECTIONS */
  higherSection() {
    let near = null, otab = '';
    for (let n = this.parent; n && n.type !== 'WI' && n.type !== 'PA'; n = n.parent) {
      if (n.type !== 'SE') continue;
      if (!near) near = n;
      if (!otab) otab = X.val(n.obj, 'OTABTYPE');
    }
    return { node: near, secttype: near ? (near.sub || '') : null, otabtype: otab };
  }
  /* table/template ancestor for output-option subscreens */
  tableContext() {
    for (let n = this.parent; n && n.type !== 'WI' && n.type !== 'PA'; n = n.parent) {
      if (n.type === 'SE' && ['S', 'C', ''].includes(n.sub || '') && X.val(n.obj, 'OTABTYPE')) return n;
    }
    return null;
  }
}

class SfForm {
  constructor(doc, meta = {}) {
    this.doc = doc; this.root = doc.documentElement; this.meta = meta;
    if (this.root.localName !== 'SMARTFORM') throw new Error('Not a Smart Form: root element ' + this.root.localName);
    this.header = X.kid(this.root, 'HEADER');
    this.iso = this.root.getAttributeNS(NS_SF, 'language') || 'EN';
    this.lang = LANG.sap(this.iso);
    this.isTextModule = X.val(this.header, 'FORMTYPE') === 'T';
    this.journal = new Journal(doc, label => Bus.emit('changed', this, label));
    this.rebuild();
  }
  get name() { return X.val(this.header, 'FORMNAME'); }
  get varItem() { return X.path(this.root, 'sf:VARHEADER', 'sf:item'); }
  get ctx() { const v = this.varItem; return { cpi: parseFloat(X.val(v, 'CPI')) || 10, lpi: parseFloat(X.val(v, 'LPI')) || 6 }; }
  rebuild() {
    this.reservedNames = null;
    this.ids = new Map();
    for (const el of this.doc.getElementsByTagNameNS(NS_SF, '*')) {
      const id = el.getAttribute('ID'); if (id) this.ids.set(id, el);
    }
    this.byEl = new Map(); this.all = [];
    const rpEl = X.path(this.varItem, 'sf:PAGETREE', 'sf:NODE');
    this.rp = rpEl ? this.build(rpEl, null) : null;
  }
  build(el, parent) {
    const n = new FNode(this, el, parent);
    this.byEl.set(el, n); this.all.push(n);
    const succ = n.succ;
    if (succ) for (const it of X.kids(succ, 'sf:item')) { const c = X.kid(it, 'sf:NODE'); if (c) n.children.push(this.build(c, n)); }
    return n;
  }
  node(el) { return this.byEl.get(el) || null; }
  get pages() { return this.rp ? this.rp.children.filter(c => c.type === 'PA') : []; }
  pageSize(page) {
    const pf = X.val(this.varItem, 'PAGEFORMAT') || 'DINA4';
    let [w, h] = PAGE_SIZES[pf] || PAGE_SIZES.DINA4;
    if (page && X.val(page.obj, 'PAGEORTN') === 'L') [w, h] = [h, w];
    return { w, h, format: pf };
  }

  /* ---------- captions (T_CAPTION per language) ---------- */
  caption(obj) {
    if (!obj) return '';
    const t = X.kids(X.kid(obj, 'T_CAPTION'), 'item').find(i => X.val(i, 'LANGU') === this.lang);
    if (t && X.kid(t, 'CAPTION')) return X.val(t, 'CAPTION');
    return X.val(obj, 'CAPTION');
  }
  setCaption(obj, v) {
    v = String(v ?? '').slice(0, 30);
    X.set(obj, 'CAPTION', v);
    const tc = X.ensure(obj, 'T_CAPTION');
    let row = X.kids(tc, 'item').find(i => X.val(i, 'LANGU') === this.lang);
    if (!row) row = X.newItem(tc, { LANGU: this.lang, FORMNAME: this.name, OBJTYPE: OBJTYPE_OF_TAG[obj.localName] || '', INAME: X.val(obj, 'NAME', 'INAME') });
    X.set(row, 'CAPTION', v);
  }

  /* ---------- text lines (TEXT / T_TEXT) ---------- */
  textLines(textObj) {
    const pick = list => X.kids(list, 'item').map(i => ({ f: X.val(i, 'TDFORMAT'), t: X.val(i, 'TDLINE') }));
    if (X.val(textObj, 'NOLANGUAGE') === 'X') return pick(X.kid(textObj, 'TEXT'));
    const tt = X.kid(textObj, 'T_TEXT');
    const rows = X.kids(tt, 'item').filter(i => X.val(i, 'SPRAS') === this.lang);
    if (rows.length) return rows.map(i => ({ f: X.val(i, 'TDFORMAT'), t: X.val(i, 'TDLINE') }));
    return pick(X.kid(textObj, 'TEXT'));
  }
  textLanguages(textObj) {
    return [...new Set(X.kids(X.kid(textObj, 'T_TEXT'), 'item').map(i => X.val(i, 'SPRAS')))];
  }
  setTextLines(textObj, lines) {
    const doc = this.doc;
    const writeText = () => {
      const t = X.ensure(textObj, 'TEXT');
      while (t.firstChild) t.firstChild.remove();
      for (const l of lines) { const it = X.mk(doc, 'item'); t.appendChild(it); X.set(it, 'TDFORMAT', l.f || '*'); if (l.t) X.set(it, 'TDLINE', l.t); }
      if (!lines.length) t.remove();
    };
    if (X.val(textObj, 'NOLANGUAGE') === 'X') { writeText(); return; }
    writeText();
    const tt = X.ensure(textObj, 'T_TEXT');
    const old = X.kids(tt, 'item');
    const mine = old.filter(i => X.val(i, 'SPRAS') === this.lang);
    const anchor = mine.length ? mine[mine.length - 1].nextSibling : null;
    const txtype = mine[0] ? X.val(mine[0], 'TXTYPE') : 'F';
    const iname = X.val(textObj, 'NAME', 'INAME');
    for (const m of mine) m.remove();
    lines.forEach((l, i) => {
      const it = X.mk(doc, 'item');
      tt.insertBefore(it, anchor && anchor.parentNode === tt ? anchor : null);
      X.set(it, 'SPRAS', this.lang); X.set(it, 'TXTYPE', txtype || 'F'); X.set(it, 'FORMNAME', this.name); X.set(it, 'INAME', iname);
      X.set(it, 'LINENR', String(i + 1).padStart(6, '0')); X.set(it, 'TDFORMAT', l.f || '*'); if (l.t) X.set(it, 'TDLINE', l.t);
    });
    if (!X.kids(tt, 'item').length) tt.remove();
  }

  /* ---------- names ---------- */
  allNamed(tag) { return [...this.doc.getElementsByTagNameNS(NS_SF, tag)].filter(o => !o.hasAttribute('IDREF')); }
  names(tag) { return new Set(this.allNamed(tag).map(o => X.val(o, 'NAME', 'INAME'))); }
  nextAutoName(prefix, tag) {
    let max = 0; const re = new RegExp('^' + prefix.replace(/[%]/g, '%') + '(\\d+)$');
    const tags = tag === 'OUTATTR' ? ['OUTATTR'] : [tag];
    for (const t of tags) for (const o of this.allNamed(t)) { const m = re.exec(X.val(o, 'NAME', 'INAME')); if (m) max = Math.max(max, +m[1]); }
    /* names handed out for nodes that are built but not inserted yet (a table creates its
       three events, a line its cells in one go): never give the same name twice */
    const res = (this.reservedNames ||= new Set());
    for (const r of res) { const m = re.exec(r); if (m) max = Math.max(max, +m[1]); }
    res.add(prefix + (max + 1));
    return { name: prefix + (max + 1), n: max + 1 };
  }
  nameError(name, obj) {
    if (!name) return 'Enter a name';
    if (name.length > 30) return 'Name is longer than 30 characters';
    if (!/^[A-Z%][A-Z0-9_%]*$/.test(name)) return 'Name may only contain A-Z, 0-9, _ and %';
    const clash = this.allNamed(obj.localName).some(o => o !== obj && X.val(o, 'NAME', 'INAME') === name);
    return clash ? `Node name ${name} already exists` : '';
  }
  rename(obj, newName) {
    const old = X.val(obj, 'NAME', 'INAME');
    if (old === newName) return;
    X.setPath(obj, ['NAME', 'INAME'], newName);
    for (const holder of ['T_CAPTION', 'T_TEXT']) for (const it of X.kids(X.kid(obj, holder), 'item')) if (X.val(it, 'INAME') === old) X.set(it, 'INAME', newName);
    if (obj.localName === 'PAGE') {
      for (const el of this.doc.getElementsByTagNameNS(NS_IFR, 'INAME')) {
        const p = el.parentElement?.localName;
        if ((p === 'NEXTPAGE' || p === 'PAGENAME') && el.textContent === old) el.textContent = newName;
      }
    }
  }

  /* ---------- node creation ---------- */
  outattrEl(extra = {}) {
    const doc = this.doc, { name } = this.nextAutoName('%OUTATTRIB', 'OUTATTR');
    const wrap = X.mk(doc, 'sf:OUTATTR'), oa = X.mk(doc, 'sf:OUTATTR'); wrap.appendChild(oa);
    X.setPath(oa, ['NAME', 'INAME'], name);
    for (const [k, v] of Object.entries(extra)) X.set(oa, k, v);
    for (const [k, v] of Object.entries({ U_WFRAME: 'PT', U_WBOXV: 'CM', U_WBOXH: 'CM', U_WLEFT: 'CM', U_WWIDTH: 'CM', U_WTOP: 'CM', U_WHEIGHT: 'CM' })) if (!X.kid(oa, k)) X.set(oa, k, v);
    const b = X.ensure(oa, 'BORDER');
    for (const side of ['LEFTATTR', 'TOPATTR', 'RIGHTATTR', 'BOTTOMATTR']) {
      const s = X.ensure(b, side);
      X.set(s, 'THICKNESS', '0.00'); X.set(s, 'THICKNESSU', 'PT'); X.set(s, 'DISTANCE', '0.00'); X.set(s, 'DISTANCEU', 'CM');
      const c = X.ensure(s, 'COLOR'); for (const k of ['RED', 'GREEN', 'BLUE', 'TRANS']) X.set(c, k, '000');
    }
    const tc = X.ensure(oa, 'T_CAPTION'); X.newItem(tc, { LANGU: this.lang, FORMNAME: this.name, OBJTYPE: 'OA', INAME: name });
    return wrap;
  }
  baseObj(tag, prefix, capt, objtype, fields) {
    const doc = this.doc, obj = X.mk(doc, 'sf:' + tag);
    const { name, n } = this.nextAutoName(prefix, tag);
    X.setPath(obj, ['NAME', 'INAME'], name);
    X.set(obj, 'CAPTION', `${capt} ${n}`);
    for (const [k, v] of Object.entries(fields || {})) {
      if (v && typeof v === 'object') { const e = X.ensure(obj, k); for (const [k2, v2] of Object.entries(v)) X.set(e, k2, v2); }
      else X.set(obj, k, v);
    }
    const tc = X.ensure(obj, 'T_CAPTION'); X.newItem(tc, { LANGU: this.lang, FORMNAME: this.name, OBJTYPE: objtype, INAME: name, CAPTION: `${capt} ${n}` });
    return obj;
  }
  nodeEl(type, obj, { outattr = null, succ = true } = {}) {
    const doc = this.doc, node = X.mk(doc, 'sf:NODE');
    X.set(node, 'NODETYPE', type);
    const holder = X.mk(doc, 'sf:OBJ'); holder.appendChild(obj); node.appendChild(holder);
    if (outattr) node.appendChild(outattr);
    if (succ) node.appendChild(X.mk(doc, 'sf:SUCC'));
    return node;
  }
  nextId() {
    let max = 0; for (const k of this.ids.keys()) { const n = parseInt(k, 10); if (n > max) max = n; }
    return String(max + 1) + ' ';
  }
  currentStyle(parentNode) {
    for (let n = parentNode; n; n = n.parent) {
      const s = X.val(n.outattr, 'STDSTYLE'); if (s) return s;
      if (n.type === 'TI') { const s2 = X.val(n.obj, 'STYLE_NAME'); if (s2) return s2; }
    }
    return X.val(this.varItem, 'STDSTYLE');
  }
  textsAreTranslatable() {
    let yes = 0, no = 0;
    for (const t of this.doc.getElementsByTagNameNS(NS_SF, 'TEXT')) { if (X.val(t, 'NOLANGUAGE') === 'X') no++; else yes++; if (yes + no > 200) break; }
    return yes >= no;
  }
  /* kind: NEW_xx fcode suffix: PA WI GR AD TI SEC SER SES CD SEL CO CM SEF */
  createNode(kind, parentNode, { wtype } = {}) {
    const doc = this.doc;
    const style = this.currentStyle(parentNode);
    const oaWin = () => this.outattrEl({ WLEFT: '2.00', WWIDTH: '6.00', WTOP: '2.00', WHEIGHT: '2.00' });
    switch (kind) {
      case 'PA': {
        const obj = this.baseObj('PAGE', '%PAGE', 'New Page', 'PA', { NUMB_MODE: 'I', NUMB_TYPE: 'A', PAGEORTN: 'P' });
        X.setPath(obj, ['NEXTPAGE', 'INAME'], X.val(obj, 'NAME', 'INAME'));
        return this.nodeEl('PA', obj);
      }
      case 'WI': {
        const obj = this.baseObj('WINDOW', '%WINDOW', 'New Window', 'WI', { WTYPE: wtype || 'T' });
        obj.setAttribute('ID', this.nextId()); this.ids.set(obj.getAttribute('ID'), obj);
        const pc = X.ensure(obj, 'sf:PROC_CTRL');
        const rc = X.mk(doc, 'sf:NODE'); rc.setAttribute('ID', this.nextIdAfter(obj.getAttribute('ID')));
        X.set(rc, 'NODETYPE', 'RC'); rc.appendChild(X.mk(doc, 'sf:SUCC')); pc.appendChild(rc);
        return this.nodeEl('WI', obj, { outattr: oaWin(), succ: true });
      }
      case 'GRW': case 'ADW': {      /* graphic / address window on a page */
        const isG = kind === 'GRW';
        const obj = this.baseObj('WINDOW', '%WINDOW', 'New Window', 'WI', { WTYPE: isG ? 'G' : 'A' });
        obj.setAttribute('ID', this.nextId()); this.ids.set(obj.getAttribute('ID'), obj);
        const pc = X.ensure(obj, 'sf:PROC_CTRL');
        pc.appendChild(this.createNode(isG ? 'GR' : 'AD', parentNode));
        return this.nodeEl('WI', obj, { outattr: oaWin(), succ: true });
      }
      case 'GR': {
        const obj = this.baseObj('GRAPHIC', '%GRAPHIC', 'New Graphic', 'GR', { GTYPE: 'B', GKEYBDS: { OBJECT: 'GRAPHICS', ID: 'BMAP', BTYPE: 'BMON' }, APPMODE: 'B', U_SB: 'CM', U_SA: 'CM', RELMODE: 'W', ALIGNMENT: 'L', U_MARGIN: 'CM', BGR_EXT: { MARGINH: '0.00', U_MARGINH: 'CM', MARGINV: '0.00', U_MARGINV: 'CM' } });
        return this.nodeEl('GR', obj, { outattr: this.outattrEl() });
      }
      case 'AD': {
        const obj = this.baseObj('ADDRESS', '%ADDRESS', 'New Address', 'AD', { DELIVERY: 'P', ADDRTYPE: '1', ADDRPAR: '*', LINES: '10' });
        return this.nodeEl('AD', obj, { outattr: this.outattrEl() });
      }
      case 'TI': {
        const nolang = !this.textsAreTranslatable();
        const obj = this.baseObj('TEXT', '%TEXT', 'New Text', 'TI', { NOLANGUAGE: nolang ? 'X' : '', APPMODE: 'P', STYLE_NAME: style, TEXT_AREA: { ENABLED: 'F', NCOLS: '0', NROWS: '0' } });
        this.setTextLines(obj, [{ f: '*', t: '' }]);
        return this.nodeEl('TI', obj, { outattr: this.outattrEl() });
      }
      case 'CO': return this.nodeEl('CO', this.baseObj('CODE', '%CODE', 'New Program Lines', 'CO'));
      case 'CM': return this.nodeEl('CM', this.baseObj('COMMAND', '%COMMAND', 'New Command', 'CM'));
      case 'CD': {
        const obj = this.baseObj('CONDITION', '%CONDITION', 'New Alternative', 'CD');
        const node = this.nodeEl('CD', obj, { outattr: this.outattrEl() });
        const succ = X.kid(node, 'sf:SUCC');
        for (const ev of ['+', '-']) {
          const it = X.mk(doc, 'sf:item'); succ.appendChild(it);
          it.appendChild(this.eventNode(ev));
        }
        return node;
      }
      case 'SEF': case 'SEL': case 'SER': case 'SEE': {
        const map = { SEF: ['F', '%FOLDER', 'New Folder'], SEL: ['L', '%LOOP', 'New Loop'], SER: ['R', '%ROW', 'New Line'], SEE: ['E', '%CELL', 'New Column'] }[kind];
        const f = { SECTTYPE: map[0] };
        if (kind === 'SEL') Object.assign(f, { DATATYPE: 'L', TABHTYPE: 'I' });
        Object.assign(f, { U_FHEIGHT: 'CM', PATTERN: { PATTNUM: '0000', FRAME: '0.00', U_FRAME: 'PT' }, U_WIDTH: 'CM', U_LEFT: 'CM', U_TOP: 'CM', U_SB: 'CM', U_SA: 'CM' });
        const obj = this.baseObj('SECTION', map[1], map[2], 'SE', f);
        return this.nodeEl('SE', obj, { outattr: ['SER', 'SEE'].includes(kind) ? this.outattrEl() : null });
      }
      case 'SES': {
        const obj = this.baseObj('SECTION', '%TEMPLATE', 'New Template', 'SE', { SECTTYPE: 'S', OTABTYPE: 'S', U_FHEIGHT: 'CM', PATTERN: { PATTNUM: '0000', FRAME: '0.00', U_FRAME: 'PT' }, USEBORDER: 'X', WIDTH: '10.00', U_WIDTH: 'CM', APPMODE: 'L', U_LEFT: 'CM', U_TOP: 'CM', U_SB: 'CM', U_SA: 'CM' });
        const st = X.ensure(obj, 'STATLINES'); X.newItem(st, { NAME: '%C1', LINEFROM: '001', LINETO: '001', LHEIGHT: '0.50', U_LHEIGHT: 'CM', SHADING: '000' });
        const cl = X.ensure(obj, 'CELLS'); this.addCell(cl, '%C1', 1, '10.00', 'CM');
        return this.nodeEl('SE', obj, { outattr: this.outattrEl() });
      }
      case 'SEC': {
        const obj = this.baseObj('SECTION', '%TABLE', 'New Table', 'SE', { SECTTYPE: 'C', DATATYPE: 'L', TABHTYPE: 'I', OTABTYPE: 'D', OTABHEADER: 'A', OTABFOOTER: 'A', FHEIGHT: '1.00', U_FHEIGHT: 'CM', PATTERN: { PATTNUM: '0000', FRAME: '0.00', U_FRAME: 'PT' }, USEBORDER: 'X', WIDTH: '10.00', U_WIDTH: 'CM', APPMODE: 'L', U_LEFT: 'CM', U_TOP: 'CM', U_SB: 'CM', U_SA: 'CM' });
        const dl = X.ensure(obj, 'DYNLINES'); X.newItem(dl, { NAME: '%LTYPE1', DEFAULTVAL: 'X', SHADING: '000' });
        const cl = X.ensure(obj, 'CELLS'); this.addCell(cl, '%LTYPE1', 1, '10.00', 'CM');
        const node = this.nodeEl('SE', obj, { outattr: this.outattrEl() });
        const succ = X.kid(node, 'sf:SUCC');
        for (const ev of ['H', 'B', 'F']) { const it = X.mk(doc, 'sf:item'); succ.appendChild(it); it.appendChild(this.eventNode(ev)); }
        return node;
      }
      default: throw new Error('Unknown node kind ' + kind);
    }
  }
  nextIdAfter(id) { const n = parseInt(id, 10) + 1; const s = String(n) + ' '; this.ids.set(s, null); return s; }
  eventNode(evtype, sfield) {
    const obj = this.baseObj('EVENT', '%EVENT', 'New Event', 'EV', { EVTYPE: evtype, SFIELD: sfield || '' });
    return this.nodeEl('EV', obj);
  }
  addCell(cellsEl, lineName, colnr, width, unit) {
    const it = X.newItem(cellsEl, { NAME: lineName, COLUMNNR: String(colnr).padStart(3, '0'), CWIDTH: width, U_CWIDTH: unit, SHADING: '000' });
    const b = X.ensure(it, 'BORDERS'); const bi = X.newItem(b, { IDX: '001', INTENSITY: '000' });
    for (const s of ['LLEFT', 'LTOP', 'LRIGHT', 'LBOTTOM']) { X.set(bi, s, '0.00'); X.set(bi, s + '_U', 'MM'); }
    for (const c of ['FILLCOLOR', 'CLEFT', 'CTOP', 'CRIGHT', 'CBOTTOM']) { const e = X.ensure(bi, c); for (const k of ['RED', 'GREEN', 'BLUE']) X.set(e, k, '000'); }
    return it;
  }

  /* ---------- tree surgery ---------- */
  succItemOf(node) { return node.el.parentElement; } /* sf:item */
  insertNodeEl(nodeEl, parent, ref = null, where = 'child') {
    const doc = this.doc;
    const item = X.mk(doc, 'sf:item'); item.appendChild(nodeEl);
    if (where === 'child') {
      let succ = parent.succ;
      if (!succ) { const host = parent.succHost; succ = X.mk(doc, 'sf:SUCC'); host.appendChild(succ); }
      succ.appendChild(item);
    } else {
      const refItem = this.succItemOf(ref);
      refItem.parentElement.insertBefore(item, where === 'before' ? refItem : refItem.nextSibling);
    }
    return nodeEl;
  }
  removeNode(node) {
    /* window definitions inside the removed subtree that are referenced from other pages keep living there */
    const inside = el => node.el.contains(el);
    const defs = [...node.el.getElementsByTagNameNS(NS_SF, 'WINDOW')].filter(w => w.hasAttribute('ID'));
    for (const def of defs) {
      const id = def.getAttribute('ID');
      const ref = [...this.doc.getElementsByTagNameNS(NS_SF, 'WINDOW')].find(w => w.getAttribute('IDREF') === id && !inside(w));
      if (ref) ref.parentElement.replaceChild(def, ref);
    }
    const item = this.succItemOf(node);
    item.remove();
  }
  /* deep copy of a node with fresh names, outattrs and ids */
  cloneNode(node, { asWindowRef = false } = {}) {
    if (node.type === 'WI' && asWindowRef) {
      const nodeEl = X.mk(this.doc, 'sf:NODE'); X.set(nodeEl, 'NODETYPE', 'WI');
      const holder = X.mk(this.doc, 'sf:OBJ'); const ref = X.mk(this.doc, 'sf:WINDOW');
      let idOwner = node.obj; if (!idOwner.getAttribute('ID')) { idOwner.setAttribute('ID', this.nextId()); }
      ref.setAttribute('IDREF', idOwner.getAttribute('ID')); holder.appendChild(ref); nodeEl.appendChild(holder);
      if (node.outattr) { const oa = node.outattr.parentElement.cloneNode(true); this.renewObj(oa.firstElementChild, '%OUTATTRIB', 'OUTATTR'); nodeEl.appendChild(oa); }
      nodeEl.appendChild(X.mk(this.doc, 'sf:SUCC'));
      return nodeEl;
    }
    const copy = node.el.cloneNode(true);
    if (node.type === 'PA') {
      /* a copied page shows the same windows (references), like SAP */
      for (const w of [...copy.getElementsByTagNameNS(NS_SF, 'WINDOW')]) {
        if (w.parentElement?.localName !== 'OBJ') continue;
        const id = w.getAttribute('ID') || w.getAttribute('IDREF');
        const orig = id && this.ids.get(id);
        if (orig && orig.isConnected && orig !== w) {
          const ref = X.mk(this.doc, 'sf:WINDOW'); ref.setAttribute('IDREF', id); w.parentElement.replaceChild(ref, w);
        }
      }
    }
    /* resolve remaining IDREF windows into real copies */
    for (const w of [...copy.getElementsByTagNameNS(NS_SF, 'WINDOW')]) {
      if (w.hasAttribute('IDREF')) { const src = this.ids.get(w.getAttribute('IDREF')); if (src && !(node.type === 'PA' && src.isConnected)) w.parentElement.replaceChild(src.cloneNode(true), w); }
    }
    const tags = ['PAGE', 'WINDOW', 'TEXT', 'GRAPHIC', 'ADDRESS', 'COMMAND', 'CODE', 'CONDITION', 'SECTION', 'EVENT', 'OUTATTR'];
    const prefixOf = { OUTATTR: '%OUTATTRIB', CONDITION: '%CONDITION', EVENT: '%EVENT' };
    const all = [copy, ...copy.getElementsByTagNameNS(NS_SF, '*')];
    for (const el of all) {
      if (el.hasAttribute && el.hasAttribute('IDREF')) continue;
      if (el.hasAttribute && el.hasAttribute('ID')) { const nid = this.nextId(); el.setAttribute('ID', nid); this.ids.set(nid, el); }
      if (el.namespaceURI !== NS_SF || !tags.includes(el.localName) || !X.kid(el, 'NAME')) continue;
      const nm = X.val(el, 'NAME', 'INAME');
      const tag = el.localName;
      const auto = /^%[A-Z]+\d+$/.test(nm) || prefixOf[tag];
      const taken = this.names(tag);
      if (!auto && !taken.has(nm)) continue;
      const prefix = prefixOf[tag] || (nm.match(/^(%?[A-Z_]*?)\d*$/)?.[1] || '%' + tag);
      this.renewObj(el, prefix, tag);
    }
    return copy;
  }
  renewObj(obj, prefix, tag) {
    const old = X.val(obj, 'NAME', 'INAME');
    let nm = this.nextAutoName(prefix, tag).name;
    /* names created in this clone are not yet in the document: add suffix until unique */
    const pending = this._pending ||= new Set();
    while (pending.has(tag + nm)) { const m = /^(.*?)(\d+)$/.exec(nm); nm = m[1] + (+m[2] + 1); }
    pending.add(tag + nm);
    X.setPath(obj, ['NAME', 'INAME'], nm);
    for (const h of ['T_CAPTION', 'T_TEXT']) for (const it of X.kids(X.kid(obj, h), 'item')) if (X.val(it, 'INAME') === old) X.set(it, 'INAME', nm);
  }
  endClone() { this._pending = null; }

  /* ---------- serialization ---------- */
  serialize() { return serializeXml(this.doc); }
}

/* ---------- Smart Style ---------- */
class SfStyle {
  constructor(doc, meta = {}) {
    this.doc = doc; this.root = doc.documentElement; this.meta = meta;
    if (this.root.localName !== 'SMARTSTYLE') throw new Error('Not a Smart Style: root element ' + this.root.localName);
    this.iso = this.root.getAttributeNS(NS_ST, 'language') || 'EN';
    this.lang = LANG.sap(this.iso);
    this.journal = new Journal(doc, label => Bus.emit('changed', this, label));
  }
  get header() { return X.kid(this.root, 'sf:HEADER'); }
  get name() { return X.val(this.header, 'STYLENAME'); }
  list(which) { return X.kids(X.kid(this.root, 'sf:' + which), 'item'); }
  paragraphs() { return this.list('PARAGRAPHS'); }
  strings() { return this.list('STRINGS'); }
  tabstops(par) { return this.list('TABSTOPS').filter(t => X.val(t, 'TDPARGRAPH') === par); }
  para(code) { return this.paragraphs().find(p => X.val(p, 'TDPARGRAPH') === code) || null; }
  str(code) { return this.strings().find(p => X.val(p, 'TDSTRING') === code) || null; }
  ensureList(which) {
    let l = X.kid(this.root, 'sf:' + which);
    if (!l) l = X.insertOrdered(this.root, X.mk(this.doc, 'sf:' + which, NS_ST));
    return l;
  }
  serialize() { return serializeXml(this.doc); }
}

function openDocument(text, meta) {
  const doc = parseXml(text);
  const r = doc.documentElement.localName;
  if (r === 'SMARTFORM') return new SfForm(doc, meta);
  if (r === 'SMARTSTYLE') return new SfStyle(doc, meta);
  throw new Error(`Unknown XML root "${r}". Expected SMARTFORM or SMARTSTYLE.`);
}
