/* =====================================================================
   formbuilder.js — SAP Smart Forms Form Builder (SAPLSTXB 0100):
   navigation tree, node screen with tabstrip, Form Painter,
   Field List, Table Painter, create/cut/copy/paste/delete, drag&drop.
   ===================================================================== */
'use strict';

const PROC = ['TI', 'GR', 'AD', 'SEC', 'SES', 'SEL', 'CD', 'CO', 'CM', 'SEF'];
const NEW_LABEL = { PA: 'Page', WI: 'Window', GR: 'Graphic', AD: 'Address', TI: 'Text', SEC: 'Table', SER: 'Table Line', SES: 'Template',
  CD: 'Alternative', SEL: 'Loop', CO: 'Program Lines', CM: 'Command', SEF: 'Folder' };
const TAB_TEXT = { TAB_PROPERTIES: 'General Attributes', TAB_OUTPUT_TABLE: 'Table', TAB_OUTPUT_STRUCT: 'Template', TAB_OUTPUT_LOOP: 'Data',
  TAB_OUTPUT_CALCS: 'Calculations', TAB_EVENT: 'Events', TAB_INPUT_FIELDS: 'Web Properties', TAB_OUTOPT: 'Output Options', TAB_CONDITION: 'Conditions',
  TAB_IMPORT: 'Import', TAB_EXPORT: 'Export', TAB_TABLES: 'Tables', TAB_EXCEPTIONS: 'Exceptions', TAB_GLOBAL_DATA: 'Global Data', TAB_GLOBAL_CONS: 'Types',
  TAB_GLOBAL_FIELD: 'Field Symbols', TAB_GLOBAL_INIT: 'Initialization', TAB_GLOBAL_FORM: 'Form Routines', TAB_GLOBAL_CURR: 'Currency/Quant. Fields',
  TAB_BACKGROUND: 'Background Picture', TAB_EDITOR: 'Text', TAB_MGMT: 'Management' };
const GLOBAL_NODES = { H00: 'Global Settings', H01: 'Form Attributes', H02: 'Form Interface', H03: 'Global Definitions', P00: 'Pages and Windows' };
const SFSY = [['PAGE', 'Current page number'], ['FORMPAGES', 'Total number of pages in form'], ['JOBPAGES', 'Total number of pages in print job'],
  ['COPYCOUNT', 'Copy counter (1 = original)'], ['COPYCOUNT0', 'Copy counter (0 = original)'], ['DATE', 'Date'], ['TIME', 'Time'], ['USERNAME', 'User name'],
  ['PAGENAME', 'Page name'], ['WINDOWNAME', 'Window name'], ['XSF', 'XSF output active'], ['XDF', 'XDF output active'], ['SUBRC', 'Return value']];

const FB = {
  form: null, sel: { g: 'H01' }, expanded: new Set(), uiState: new WeakMap(), tabOf: new Map(), tcSel: new Map(), clip: null,
  fpZoom: 0, fpPageEl: null, refreshTimer: 0,

  open(form) {
    this.form = form; this.sel = { g: 'H01' }; this.expanded = new Set(['H00', 'P00']); this.tabOf = new Map(); this.tcSel = new Map(); this.uiState = new WeakMap();
    if (form.isTextModule) { this.sel = { el: form.rp?.el }; }
    for (const p of form.pages) { this.expanded.add(p.el); }
    if (form.pages[0]) this.fpPageEl = form.pages[0].el;
  },
  /* ---------- selection ---------- */
  selNode() { if (!this.sel.el) return null; let n = this.form.node(this.sel.el); if (!n && this.sel.el.isConnected) { this.form.rebuild(); n = this.form.node(this.sel.el); } return n; },
  selKey() { return this.sel.g || this.sel.el; },
  select(s, opts = {}) {
    APP.flushEditors();
    if (s instanceof FNode) s = { el: s.el };
    this.sel = s;
    const n = this.selNode();
    if (n) { for (const a of n.ancestors()) this.expanded.add(a.el); if (n.page) this.fpPageEl = n.page.el; this.expanded.add('P00'); }
    if (s.g && ['H01', 'H02', 'H03'].includes(s.g)) this.expanded.add('H00');
    this.render(opts);
  },
  ui(key) { const k = typeof key === 'string' ? (this['_g' + key] ||= {}) : key; if (typeof key === 'string') return k; let u = this.uiState.get(key); if (!u) { u = {}; this.uiState.set(key, u); } return u; },

  /* ---------- PAI ---------- */
  pai(label, fn) {
    const f = this.form;
    if (APP.mode !== 'edit') { APP.msg('W', 'Switch to change mode first (Ctrl+F1)'); return false; }
    try { f.journal.tx(label, fn); }
    catch (e) { f.endClone?.(); if (e.confirm) { APP.askConfirm(e.confirm, () => this.pai(label, fn)); return false; } APP.msg('E', e.message || String(e)); this.scheduleRender(); return false; }
    f.endClone?.();
    APP.setDirty(true);
    this.scheduleRender();
    return true;
  },
  scheduleRender() { clearTimeout(this.refreshTimer); this.refreshTimer = setTimeout(() => this.render(), 0); },
  afterUndo() { this.form.rebuild(); if (this.sel.el && !this.sel.el.isConnected) this.sel = { g: 'P00' }; this.render(); },

  /* ---------- whole builder ---------- */
  render(opts = {}) {
    const f = this.form; if (!f) return;
    f.rebuild();
    if (this.sel.el && !this.form.node(this.sel.el)) this.sel = { g: f.isTextModule ? null : 'P00', el: f.isTextModule ? f.rp?.el : undefined };
    const host = document.getElementById('fb'); if (!host) return;
    const keep = APP.captureFocus(host);
    if (!host.firstChild) host.innerHTML = `<div class="fb-left"><div class="fb-tree pane"></div><div class="fb-fl pane"></div></div><div class="fb-split" data-for="left"></div><div class="fb-center pane"></div><div class="fb-split" data-for="right"></div><div class="fb-right pane"></div>`;
    host.classList.toggle('no-fp', !APP.settings.fp || f.isTextModule);
    host.classList.toggle('no-fl', !APP.settings.fl || f.isTextModule);
    host.classList.toggle('tm', f.isTextModule);
    if (!f.isTextModule) this.renderTree(host.querySelector('.fb-tree'));
    else host.querySelector('.fb-tree').innerHTML = '';
    if (APP.settings.fl && !f.isTextModule) this.renderFieldList(host.querySelector('.fb-fl'));
    this.renderNode(host.querySelector('.fb-center'));
    if (APP.settings.fp && !f.isTextModule) this.renderPainter(host.querySelector('.fb-right'));
    APP.restoreFocus(host, keep);
    APP.updateTitle();
  },

  /* =================================================================
     navigation tree
     ================================================================= */
  label(n) {
    if (n.type === 'EV') {
      const t = n.sub; let l = EV_LABEL[t] || 'Event';
      if (t === 'S' || t === 'E') l += ' ' + X.val(n.obj, 'SFIELD');
      return { name: '', text: l };
    }
    if (n.type === 'RC') return { name: '', text: 'Process Control' };
    return { name: n.name, text: n.caption };
  },
  iconOf(n) {
    if (n.type === 'EV') return n.sub === '+' ? 'ev_true' : n.sub === '-' ? 'ev_false' : 'event';
    if (n.type === 'WI' && n.sub === 'C') return 'win_copy';
    return n.info.icon;
  },
  renderTree(box) {
    const st = box.scrollTop;
    const keys = []; const html = [];
    const selKey = this.selKey();
    const edit = APP.mode === 'edit';
    const row = (key, ic, name, text, hasKids, depth, extra = {}) => {
      const i = keys.length; keys.push(key);
      const open = this.expanded.has(key);
      const cls = 'tree-row' + (selKey === key ? ' sel' : '') + (extra.ref ? ' ref' : '');
      const tip = esc((name ? name + ' ' : '') + (text || '') + (extra.tip ? '  —  ' + extra.tip : ''));
      html.push(`<li role="treeitem"${hasKids ? ` aria-expanded="${open}"` : ''}><div class="${cls}" data-i="${i}" style="padding-left:${4 + depth * 16}px" title="${tip}"${extra.drag ? ' draggable="true"' : ''}><span class="twisty${hasKids ? (open ? ' open' : ' closed') : ''}"></span>${icon(ic)}${extra.cond ? `<span class="cond-mark">${icon('cond_marker')}</span>` : ''}<span class="tree-lab">${name ? `<b>${esc(name)}</b> ` : ''}${esc(text || '')}</span></div>`);
      return open;
    };
    const close = () => html.push('</li>');
    html.push(`<div class="pane-title">${icon('folder_open')} Form ${esc(this.form.name)}</div><ul class="tree" role="tree" tabindex="0">`);
    if (row('H00', 'globals', '', GLOBAL_NODES.H00, true, 0)) {
      html.push('<ul>'); for (const [k, ic] of [['H01', 'header'], ['H02', 'interface'], ['H03', 'globals']]) { row(k, ic, '', GLOBAL_NODES[k], false, 1); close(); } html.push('</ul>');
    }
    close();
    const walk = (n, depth) => {
      const { name, text } = this.label(n);
      const kids = n.children;
      const open = row(n.el, this.iconOf(n), name, text, kids.length > 0, depth, { cond: !!n.cond, ref: n.isRef, tip: n.info.label + (n.isRef ? ' (also used on other pages)' : ''), drag: edit && (this.deletable(n) || n.type === 'WI') });
      if (open && kids.length) { html.push('<ul>'); for (const c of kids) walk(c, depth + 1); html.push('</ul>'); }
      close();
    };
    if (row('P00', 'folder', '', GLOBAL_NODES.P00, !!this.form.rp?.children.length, 0) && this.form.rp) { html.push('<ul>'); for (const c of this.form.rp.children) walk(c, 1); html.push('</ul>'); }
    close();
    html.push('</ul>');
    box.innerHTML = html.join('');
    this.treeKeys = keys;
    const keyOf = el => { const r = el.closest('.tree-row'); return r ? keys[+r.dataset.i] : undefined; };
    const selOf = k => typeof k === 'string' ? { g: k } : { el: k };
    const toggle = k => { if (this.expanded.has(k)) this.expanded.delete(k); else this.expanded.add(k); this.render(); };
    const ul = box.querySelector('.tree');
    ul.onclick = e => { const k = keyOf(e.target); if (k === undefined) return; if (e.target.classList.contains('twisty')) return toggle(k); this.select(selOf(k)); };
    ul.ondblclick = e => { const k = keyOf(e.target); if (k !== undefined && !e.target.classList.contains('twisty')) toggle(k); };
    ul.oncontextmenu = e => { const k = keyOf(e.target); if (k === undefined) return; e.preventDefault(); this.select(selOf(k)); this.treeMenu(e.clientX, e.clientY); };
    ul.addEventListener('keydown', e => this.treeKey(e));
    if (edit) {
      const nodeOf = el => { const k = keyOf(el); return k && typeof k !== 'string' ? this.form.node(k) : (k === 'P00' ? this.form.rp : null); };
      ul.addEventListener('dragstart', e => { const n = nodeOf(e.target); if (!n || n.type === 'RP') return; this.drag = n; e.dataTransfer.effectAllowed = 'copyMove'; e.dataTransfer.setData('text/plain', n.name); });
      ul.addEventListener('dragend', () => { this.drag = null; ul.querySelectorAll('.drop').forEach(r => r.classList.remove('drop')); });
      ul.addEventListener('dragover', e => { const n = nodeOf(e.target); if (!this.drag || !n || n === this.drag) return; e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; ul.querySelectorAll('.drop').forEach(r => r.classList.remove('drop')); e.target.closest('.tree-row').classList.add('drop'); });
      ul.addEventListener('drop', e => { const n = nodeOf(e.target); e.preventDefault(); ul.querySelectorAll('.drop').forEach(r => r.classList.remove('drop')); if (n) this.dropOn(n, e); });
    }
    box.scrollTop = st;
    const selRow = box.querySelector('.tree-row.sel');
    if (selRow) { const r = selRow.getBoundingClientRect(), bb = box.getBoundingClientRect(); if (r.top < bb.top + 30 || r.bottom > bb.bottom) selRow.scrollIntoView({ block: 'nearest' }); }
  },
  visibleKeys() {
    const out = ['H00']; if (this.expanded.has('H00')) out.push('H01', 'H02', 'H03');
    out.push('P00');
    const walk = n => { out.push(n.el); if (this.expanded.has(n.el)) n.children.forEach(walk); };
    if (this.expanded.has('P00') && this.form.rp) this.form.rp.children.forEach(walk);
    return out;
  },
  treeKey(e) {
    const keys = this.visibleKeys(); const i = keys.indexOf(this.selKey());
    const go = k => { e.preventDefault(); this.select(typeof k === 'string' ? { g: k } : { el: k }); setTimeout(() => document.querySelector('.fb-tree .tree')?.focus(), 0); };
    if (e.key === 'ArrowDown' && i < keys.length - 1) go(keys[i + 1]);
    else if (e.key === 'ArrowUp' && i > 0) go(keys[i - 1]);
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.expanded.add(this.selKey()); this.render(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (this.expanded.has(this.selKey())) { this.expanded.delete(this.selKey()); this.render(); } else { const n = this.selNode(); if (n?.parent) go(n.parent.type === 'RP' ? 'P00' : n.parent.el); } }
    else if (e.key === 'Delete') { e.preventDefault(); this.fcode('NODEDELETE'); }
    else if (e.key === 'x' && e.ctrlKey) { e.preventDefault(); this.fcode('OB_CUT'); }
    else if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); this.fcode('OB_COPY'); }
    else if (e.key === 'v' && e.ctrlKey) { e.preventDefault(); this.fcode('OB_PASTE'); }
  },
  expandAll(on, from) {
    const start = from || null;
    const walk = n => { if (on) this.expanded.add(n.el); else this.expanded.delete(n.el); n.children.forEach(walk); };
    if (!start) { if (on) { this.expanded.add('H00'); this.expanded.add('P00'); } this.form.rp?.children.forEach(walk); if (!on) { this.expanded.delete('H00'); } }
    else walk(start);
    this.render();
  },

  /* ---------- placement rules (LSTXBF16 / LSTXBO02) ---------- */
  inTableArea(p) {
    for (let n = p; n && n.type !== 'WI'; n = n.parent) {
      if (n.kind === 'SE-R' || n.kind === 'SE-E') return false;
      if (n.type === 'EV' && n.parent?.kind === 'SE-C' && 'HBF'.includes(n.sub)) return true;
    }
    return false;
  },
  allowedChildren(p) {
    if (!p) return new Set();
    if (p.type === 'RP') return new Set(['PA']);
    if (p.type === 'PA') return new Set(['WI', 'GR', 'AD']);
    if (p.type === 'WI') return ['G', 'A'].includes(p.sub) ? new Set() : new Set(PROC);
    if (p.type === 'CD' || p.kind === 'SE-C' || p.kind === 'SE-R') return new Set();
    if (!['EV', 'SE'].includes(p.type)) return new Set();
    let s = new Set(PROC);
    let otab = false; for (let n = p; n && n.type !== 'WI'; n = n.parent) if (n.type === 'SE' && X.val(n.obj, 'OTABTYPE')) { otab = true; break; }
    if (otab) { s.delete('SEC'); s.delete('SES'); }
    if (p.type === 'EV' && p.parent?.kind === 'SE-C' && 'HBF'.includes(p.sub)) s = new Set(['SER', 'SEL', 'SEF', 'CM']);
    else if (this.inTableArea(p)) s.add('SER');
    return s;
  },
  /* where would "Create <kind>" on node n put the new node? */
  placement(kind, n) {
    if (!n) return null;
    if (n.type === 'RP') return kind === 'PA' ? { parent: n, where: 'child' } : null;
    if (this.allowedChildren(n).has(kind)) return { parent: n, where: 'child' };
    if (n.parent && this.allowedChildren(n.parent).has(kind) && !(n.type === 'EV' && n.parent.type !== 'SE') && !(n.type === 'EV' && 'HBF+-'.includes(n.sub)) && n.kind !== 'SE-E') return { parent: n.parent, ref: n, where: 'after' };
    return null;
  },
  targetNode() { if (this.sel.g === 'P00') return this.form.rp; return this.selNode(); },

  /* ---------- node operations ---------- */
  createNode(kind, n = this.targetNode(), place = null) {
    const f = this.form; const pl = place || this.placement(kind, n);
    if (!pl) return APP.msg('E', `${NEW_LABEL[kind]} cannot be created here`);
    let created = null;
    const ok = this.pai(`Create ${NEW_LABEL[kind]}`, () => {
      const k = pl.parent.type === 'PA' && kind === 'GR' ? 'GRW' : pl.parent.type === 'PA' && kind === 'AD' ? 'ADW' : kind;
      const el = f.createNode(k, pl.parent);
      if (k === 'WI' && !f.all.some(x => x.type === 'WI' && X.val(x.obj, 'WTYPE') === 'M')) { /* first window of a form becomes main window */
        const obj = X.path(el, 'sf:OBJ').firstElementChild; X.set(obj, 'WTYPE', 'M'); X.setPath(obj, ['NAME', 'INAME'], 'MAIN'); f.setCaption(obj, 'Main Window');
        for (const it of X.kids(X.kid(obj, 'T_CAPTION'), 'item')) X.set(it, 'INAME', 'MAIN');
      }
      f.insertNodeEl(el, pl.parent, pl.ref || null, pl.where);
      if (pl.parent.kind === 'SE-R' || kind === 'SER') { /* new table line gets the default line type and its cells */ }
      created = el;
      if (kind === 'SER') {
        f.rebuild(); const row = f.node(el); const t = row.ancestors().find(a => a.kind === 'SE-C');
        if (t) { const lt = X.kids(X.kid(t.obj, 'DYNLINES'), 'item').find(i => X.val(i, 'DEFAULTVAL') === 'X') || X.kids(X.kid(t.obj, 'DYNLINES'), 'item')[0]; if (lt) { X.set(row.ensureOutattr(), 'T_LINETYPE', X.val(lt, 'NAME')); syncRowCells(f, row, t, X.val(lt, 'NAME')); } }
      }
    });
    if (ok && created) { this.expanded.add(pl.parent.type === 'RP' ? 'P00' : pl.parent.el); this.sel = { el: created }; this.tabOf.set(created, null); this.scheduleRender(); APP.msg('S', `${NEW_LABEL[kind]} created`); }
  },
  deletable(n) { return n && n.type !== 'RP' && !(n.type === 'EV' && 'HBF+-'.includes(n.sub)) && n.kind !== 'SE-E'; },
  deleteNode(n = this.selNode()) {
    if (!this.deletable(n)) return APP.msg('E', n ? `Node ${this.label(n).text} cannot be deleted` : 'Select a node');
    const next = n.parent && n.parent.type !== 'RP' ? n.parent.el : null;
    const sibs = n.parent ? n.parent.children : []; const i = sibs.indexOf(n);
    const nextSel = sibs[i + 1] || sibs[i - 1];
    if (this.pai(`Delete ${n.name}`, () => {
      if (n.type === 'SE' && n.parent?.kind === 'SE-C' && n.type === 'EV') return;
      this.form.removeNode(n);
    })) { this.sel = nextSel ? { el: nextSel.el } : next ? { el: next } : { g: 'P00' }; APP.msg('S', `Node ${n.name} deleted`); }
  },
  copyNode(n = this.selNode(), cut = false) {
    if (!n || n.type === 'RP') return APP.msg('W', 'Select a node');
    if (!this.deletable(n) && cut) return APP.msg('E', 'This node cannot be cut');
    this.clip = { el: n.el.cloneNode(true), type: n.type, kind: n.kind, srcEl: n.el, srcPage: n.page?.el, name: n.name, isWindow: n.type === 'WI', winObj: n.type === 'WI' ? n.obj : null, cut };
    APP.clipboardText(this.form.serialize ? n.el.outerHTML : '');
    if (cut) { this.deleteNode(n); APP.msg('S', `${n.name} cut`); } else APP.msg('S', `${n.name} copied to clipboard`);
  },
  kindCode(c) { return { PA: 'PA', WI: 'WI', TI: 'TI', GR: 'GR', AD: 'AD', CO: 'CO', CM: 'CM', CD: 'CD' }[c.type] || ({ 'SE-C': 'SEC', 'SE-S': 'SES', 'SE-L': 'SEL', 'SE-F': 'SEF', 'SE-R': 'SER' }[c.kind]) || 'SEF'; },
  pasteNode(n = this.targetNode()) {
    const c = this.clip; if (!c) return APP.msg('W', 'Clipboard is empty');
    const f = this.form;
    let code = this.kindCode(c);
    if (c.type === 'WI' && ['G', 'A'].includes(X.val(X.path(c.el, 'sf:OBJ')?.firstElementChild, 'WTYPE'))) code = 'WI';
    const pl = this.placement(code, n);
    if (!pl) return APP.msg('E', 'The clipboard content cannot be inserted here');
    let created = null;
    this.pai('Paste', () => {
      let el;
      const srcNode = c.srcEl.isConnected ? f.node(c.srcEl) : null;
      if (c.isWindow && !c.cut && srcNode && pl.parent.type === 'PA' && pl.parent.el !== c.srcPage &&
          !pl.parent.children.some(w => w.type === 'WI' && w.name === c.name)) {
        el = f.cloneNode(srcNode, { asWindowRef: true });      /* same window on another page */
      } else if (c.cut) {
        el = f.doc.importNode(c.el, true);
        if (c.isWindow) { /* re-resolve window IDREF into real object if the original was removed */
          for (const w of [...el.getElementsByTagNameNS(NS_SF, 'WINDOW')]) if (w.hasAttribute('IDREF') && !f.ids.get(w.getAttribute('IDREF'))?.isConnected) {}
        }
      } else {
        const tmp = f.doc.importNode(c.el, true);
        const holder = X.mk(f.doc, 'sf:item'); holder.appendChild(tmp);
        const fake = new FNode(f, tmp, null);
        el = f.cloneNode(fake);
      }
      f.insertNodeEl(el, pl.parent, pl.ref || null, pl.where);
      created = el;
      if (c.cut) this.clip = { ...c, cut: false, el: c.el.cloneNode(true) };
    });
    if (created) { this.sel = { el: created }; this.expanded.add(pl.parent.type === 'RP' ? 'P00' : pl.parent.el); APP.msg('S', 'Inserted from clipboard'); }
  },
  moveNode(n, target, where, copy) {
    const f = this.form;
    if (!n || !target || n === target) return;
    if (target.ancestors().includes(n)) return APP.msg('E', 'A node cannot be moved into its own subtree');
    const code = this.kindCode(n);
    const parent = where === 'child' ? target : target.parent;
    if (!this.allowedChildren(parent).has(code) && !(parent.type === 'RP' && code === 'PA')) return APP.msg('E', `${n.info.label} cannot be placed ${where === 'child' ? 'under' : 'after'} ${this.label(target).text}`);
    if (!copy && !this.deletable(n)) return APP.msg('E', 'This node cannot be moved');
    let created = null;
    this.pai(copy ? 'Copy node' : 'Move node', () => {
      let el;
      if (copy) {
        if (n.type === 'WI' && parent.type === 'PA' && parent !== n.page && !parent.children.some(w => w.type === 'WI' && w.name === n.name)) el = f.cloneNode(n, { asWindowRef: true });
        else el = f.cloneNode(n);
      } else {
        if (n.type === 'WI' && !n.isRef && n.obj.hasAttribute('ID')) {
          /* the window definition moves with the node; nothing else to do */
        }
        el = n.el; f.succItemOf(n).remove();
      }
      f.insertNodeEl(el, parent, where === 'child' ? null : target, where);
      created = el;
    });
    if (created) { this.sel = { el: created }; this.expanded.add(parent.type === 'RP' ? 'P00' : parent.el); }
  },
  dropOn(n, e) {
    const src = this.drag; this.drag = null; if (!src || src === n) return;
    const copy = e.ctrlKey || e.altKey;
    const code = this.kindCode(src);
    const canChild = this.allowedChildren(n).has(code) || (n.type === 'RP' && code === 'PA'), canAfter = n.parent && (this.allowedChildren(n.parent).has(code) || (n.parent.type === 'RP' && code === 'PA'));
    const items = [];
    if (canChild) items.push({ label: 'Under the node', fn: () => this.moveNode(src, n, 'child', copy) });
    if (canAfter) items.push({ label: 'After the node', fn: () => this.moveNode(src, n, 'after', copy) });
    if (!items.length) return APP.msg('E', `${src.info.label} cannot be placed at ${this.label(n).text || 'this node'}`);
    if (items.length === 1) items[0].fn(); else APP.contextMenu(e.clientX, e.clientY, items);
  },
  treeMenu(x, y) {
    const n = this.targetNode(); const edit = APP.mode === 'edit';
    if (this.sel.g && this.sel.g !== 'P00') return APP.contextMenu(x, y, [{ label: 'Expand', icon: 'expand', fn: () => { this.expanded.add(this.sel.g); this.render(); } }, { label: 'Collapse', icon: 'collapse', fn: () => { this.expanded.delete(this.sel.g); this.render(); } }]);
    const items = [];
    if (edit && n) {
      const can = k => !!this.placement(k, n);
      const cr = k => ({ label: NEW_LABEL[k], icon: { PA: 'page', WI: 'win', GR: 'graphic', AD: 'address', TI: 'text', SEC: 'sect_ctable', SER: 'sect_row', SES: 'sect_struct', CD: 'condition', SEL: 'sect_loop', CO: 'code', CM: 'command', SEF: 'sect_folder' }[k], hidden: !can(k), fn: () => this.createNode(k, n) });
      const flow = [cr('CD'), cr('SEL'), cr('CO'), cr('CM')];
      const create = [cr('PA'), cr('WI'), cr('GR'), cr('AD'), cr('TI'), '-', cr('SEC'), cr('SER'), cr('SES'), { label: 'Flow Logic', sub: flow, hidden: flow.every(i => i.hidden) }, cr('SEF')];
      items.push({ label: 'Create', icon: 'create', sub: create, hidden: create.every(i => i === '-' || i.hidden) });
      if (n.type !== 'RP') {
        items.push({ label: 'Cut', icon: 'cut', hidden: !this.deletable(n), fn: () => this.copyNode(n, true) });
        items.push({ label: 'Copy', icon: 'copy', hidden: n.kind === 'SE-E' || (n.type === 'EV' && 'HBF+-'.includes(n.sub)), fn: () => this.copyNode(n) });
      }
      items.push({ label: 'Paste', icon: 'paste', disabled: !this.clip, fn: () => this.pasteNode(n) });
      if (n.type !== 'RP') items.push({ label: 'Delete', icon: 'delete', hidden: !this.deletable(n), fn: () => this.deleteNode(n) });
      items.push('-');
    } else if (n && n.type !== 'RP') items.push({ label: 'Copy', icon: 'copy', fn: () => this.copyNode(n) });
    items.push({ label: 'Expand', icon: 'expand', fn: () => this.expandAll(true, n?.type === 'RP' ? null : n) });
    items.push({ label: 'Collapse', icon: 'collapse', fn: () => this.expandAll(false, n?.type === 'RP' ? null : n) });
    APP.contextMenu(x, y, items);
  },
  /* Edit > Node > Create (F5): dialog 2001 */
  dialogCreate() {
    const n = this.targetNode(); if (!n || n.type === 'RP' && false) return APP.msg('W', 'Select a node');
    if (this.sel.g && this.sel.g !== 'P00') return APP.msg('W', 'Select a node in Pages and Windows');
    const list = where => {
      const out = [];
      const ref = where === 'child' ? n : n.parent;
      if (!ref) return out;
      for (const k of ['PA', 'WI', 'GR', 'AD', 'TI', 'SEC', 'SER', 'SES', 'SEL', 'CD', 'CO', 'CM', 'SEF']) {
        const ok = where === 'child' ? this.allowedChildren(n).has(k) || (n.type === 'RP' && k === 'PA') : (n.type !== 'RP' && (this.allowedChildren(n.parent).has(k) || (n.parent.type === 'RP' && k === 'PA')) && !(n.type === 'EV' && 'HBF+-'.includes(n.sub)) && n.kind !== 'SE-E');
        if (ok) out.push([k, NEW_LABEL[k]]);
      }
      return out;
    };
    const st = { rel: list('child').length && !list('after').length ? 'child' : 'after', before: '', after: '', child: '' };
    const lists = { before: list('after'), after: list('after'), child: list('child') };
    for (const k of Object.keys(lists)) st[k] = lists[k][0]?.[0] || '';
    if (!lists.after.length && lists.child.length) st.rel = 'child';
    const cap = this.label(n.type === 'RP' ? { type: 'RP' } : n).text || 'Pages and Windows';
    const binding = {
      f: {
        TEXT1: { get: () => cap }, TEXT2: { get: () => cap }, TEXT3: { get: () => cap },
        LIST_SIBLING1: { get: () => st.before, set: v => { st.before = v; st.rel = 'before'; }, values: () => lists.before },
        LIST_SIBLING: { get: () => st.after, set: v => { st.after = v; st.rel = 'after'; }, values: () => lists.after },
        LIST_CHILD: { get: () => st.child, set: v => { st.child = v; st.rel = 'child'; }, values: () => lists.child },
        RB_RELATION_SIBLING1: { get: () => st.rel === 'before', set: () => { st.rel = 'before'; } },
        RB_RELATION_SIBLING: { get: () => st.rel === 'after', set: () => { st.rel = 'after'; } },
        RB_RELATION_CHILD: { get: () => st.rel === 'child', set: () => { st.rel = 'child'; } },
      },
      ro: el => (el.n.includes('SIBLING') && !lists.after.length) || (el.n.includes('CHILD') && !lists.child.length),
    };
    APP.screenDialog('Create Node', 'SAPLSTXB:2001', binding, () => {
      const kind = st[st.rel === 'before' ? 'before' : st.rel]; if (!kind) return APP.msg('E', 'Choose a node type');
      if (st.rel === 'child') this.createNode(kind, n, { parent: n, where: 'child' });
      else {
        const parent = n.parent;
        if (st.rel === 'before') {
          const sib = parent.children[parent.children.indexOf(n) - 1];
          if (sib) this.createNode(kind, n, { parent, ref: sib, where: 'after' });
          else this.createNode(kind, n, { parent, ref: n, where: 'before' });
        } else this.createNode(kind, n, { parent, ref: n, where: 'after' });
      }
    }, { local: true });
  },
  fcode(fc) {
    const n = this.selNode();
    switch (fc) {
      case 'NODECREATE': return this.dialogCreate();
      case 'NODEDELETE': return this.deleteNode();
      case 'OB_CUT': return this.copyNode(n, true);
      case 'OB_COPY': return this.copyNode(n);
      case 'OB_PASTE': return this.pasteNode();
      case 'TREXPAND': return this.expandAll(true, this.sel.g ? null : n);
      case 'TRCOLLAPSE': return this.expandAll(false, this.sel.g ? null : n);
    }
  },

  /* =================================================================
     node screen: header (0100) + tabstrip + subscreen
     ================================================================= */
  tabs() {
    const s = this.sel, n = this.selNode(), f = this.form;
    if (f.isTextModule) return [['TAB_EDITOR', 'SAPLSTXB:1600'], ['TAB_MGMT', 'SAPLSTXB:1610']];
    if (s.g === 'H01') return [['TAB_PROPERTIES', 'SAPLSTXB:1202'], ['TAB_OUTOPT', 'SAPLSTXB:1000']];
    if (s.g === 'H02') return [['TAB_IMPORT', 'SAPLSTXB:1212'], ['TAB_EXPORT', 'SAPLSTXB:1213'], ['TAB_TABLES', 'SAPLSTXB:1215'], ['TAB_EXCEPTIONS', 'SAPLSTXB:1214']];
    if (s.g === 'H03') return [['TAB_GLOBAL_DATA', 'SAPLSTXB:1222'], ['TAB_GLOBAL_CONS', 'SAPLSTXB:1223'], ['TAB_GLOBAL_FIELD', 'SAPLSTXB:1226'], ['TAB_GLOBAL_INIT', 'SAPLSTXB:1225'], ['TAB_GLOBAL_FORM', 'SAPLSTXB:1224'], ['TAB_GLOBAL_CURR', 'SAPLSTXB:1227']];
    if (!n) return [];
    const C = ['TAB_CONDITION', 'SAPLSTXB:1300'], O = scr => ['TAB_OUTOPT', scr], P = scr => ['TAB_PROPERTIES', scr];
    switch (n.kind) {
      case 'PA': return [P('SAPLSTXB:1012'), O('SAPLSTXB:1001'), ['TAB_BACKGROUND', 'SAPLSTXB:1013']];
      case 'WI-G': return [P('SAPLSTXB:1042'), O('SAPLSTXB:1002'), C];
      case 'WI-A': return [P('SAPLSTXB:1052'), O('SAPLSTXB:1003'), C];
      case 'TI': {
        const t = X.val(n.obj, 'TTYPE');
        const scr = { '': '1032', I: '1033', R: '1035', D: '1037' }[t] || '1032';
        const tabs = [P('SAPLSTXB:' + scr), O('SAPLSTXB:1010'), C];
        return tabs;
      }
      case 'GR': return [P('SAPLSTXB:1042'), O('SAPLSTXB:1005'), C];
      case 'AD': return [P('SAPLSTXB:1052'), O('SAPLSTXB:1010'), C];
      case 'CM': return [P('SAPLSTXB:1062'), C];
      case 'CO': return [P('SAPLSTXB:1072'), C];
      case 'CD': return [P('SAPLSTXB:1300-ALT'), O('SAPLSTXB:1010'), C];
      case 'SE-L': return [['TAB_OUTPUT_LOOP', 'SAPLSTXB:1093'], ['TAB_OUTPUT_CALCS', 'SAPLSTXB:1100'], O('SAPLSTXB:1010'), C];
      case 'SE-C': return [['TAB_OUTPUT_TABLE', 'SAPLSTXB:1094'], ['TAB_OUTPUT_LOOP', 'SAPLSTXB:1093'], ['TAB_OUTPUT_CALCS', 'SAPLSTXB:1100'], ['TAB_EVENT', 'SAPLSTXB:1096'], O('SAPLSTXB:1010'), C];
      case 'SE-S': return [['TAB_OUTPUT_STRUCT', 'SAPLSTXB:1095'], O('SAPLSTXB:1010'), C];
      case 'SE-F': return [O('SAPLSTXB:1010'), C];
      case 'SE-R': return [O('SAPLSTXB:1010'), C];
      case 'SE-E': return [O('SAPLSTXB:1010')];
      case 'SE-T': case 'SE-': return [P('SAPLSTXB:1092'), ['TAB_OUTPUT_LOOP', 'SAPLSTXB:1093'], ['TAB_OUTPUT_CALCS', 'SAPLSTXB:1100'], ['TAB_EVENT', 'SAPLSTXB:1096'], O('SAPLSTXB:1010'), C];
      case 'EV': {
        if (n.parent?.kind === 'SE-C' && n.sub === 'H') return [P('SAPLSTXB:1016')];
        if (n.parent?.kind === 'SE-C' && n.sub === 'F') return [P('SAPLSTXB:1017')];
        return [P('SAPLSTXB:1112')];
      }
    }
    if (n.type === 'WI') return [P('SAPLSTXB:1022'), O('SAPLSTXB:1002'), C];
    return [P('SAPLSTXB:1500')];
  },
  ctx() {
    const n = this.selNode();
    const key = this.sel.g ? this.sel.g : n?.el;
    return { form: this.form, node: n, ui: typeof key === 'string' ? this.ui(key) : this.ui(key), fb: this };
  },
  env(scrKey) {
    const self = this;
    const selKey = this.selKey();
    return {
      edit: APP.mode === 'edit',
      pai: (label, fn) => self.pai(label, fn),
      rerender: () => self.scheduleRender(),
      sel: tc => { const k = (typeof selKey === 'string' ? selKey : 'n') + '|' + tc; let m = self.tcSel.get(selKey); if (!m) { m = new Map(); self.tcSel.set(selKey, m); } let s = m.get(tc); if (!s) { s = new Set(); m.set(tc, s); } return s; },
      msg: (t, x) => APP.msg(t, x),
      renderScreen: (key, fit, binding) => self.renderScreen(key, fit, binding),
    };
  },
  bindingFor(key) {
    const fn = BIND[key]; if (!fn) return {};
    try { return fn(this.ctx()) || {}; } catch (e) { console.error(e); APP.msg('E', `Screen ${key}: ${e.message}`); return {}; }
  },
  renderScreen(key, fit, binding) {
    const real = key === 'SAPLSTXB:1300-ALT' ? 'SAPLSTXB:1300' : key;
    let b = binding || this.bindingFor(key);
    /* Table Painter instead of line-type details */
    if ((key === 'SAPLSTXB:1094' || key === 'SAPLSTXB:1095') && this.ctx().ui.painter) return this.renderScreen('SAPLSTXB:1097', fit, this.bind1097());
    if (key === 'SAPLSTXB:1610') b = this.bind1610();
    if (key === 'SAPLSTXB:1600') b = this.bind1600();
    return Dynpro.render(real, b, this.env(key), { fit });
  },
  renderNode(box) {
    const st = box.scrollTop;
    box.innerHTML = '';
    const f = this.form, n = this.selNode(), s = this.sel;
    if (!n && !s.g) { box.innerHTML = '<div class="empty">Select a node</div>'; return; }
    /* header 0100 / 0200 */
    const hdrKey = f.isTextModule ? 'SAPLSTXB:0200' : 'SAPLSTXB:0100';
    const hdr = Dynpro.render(hdrKey, this.headerBinding(), this.env(hdrKey), { fit: { w: 80, h: 2 } });
    hdr.classList.add('node-hdr');
    box.appendChild(hdr);
    /* tabstrip */
    const tabs = this.tabs();
    const key = this.selKey();
    let cur = this.tabOf.get(key);
    if (!tabs.some(t => t[0] === cur)) cur = tabs[0]?.[0];
    const strip = document.createElement('div'); strip.className = 'tabstrip'; strip.setAttribute('role', 'tablist');
    for (const [id] of tabs) {
      const t = document.createElement('button'); t.type = 'button'; t.className = 'tab' + (id === cur ? ' on' : ''); t.setAttribute('role', 'tab');
      t.textContent = TAB_TEXT[id] || id;
      if (id === 'TAB_CONDITION' && n && (n.cond)) t.insertAdjacentHTML('afterbegin', icon('cond_marker'));
      t.onclick = () => { APP.flushEditors(); this.tabOf.set(key, id); this.render(); };
      strip.appendChild(t);
    }
    if (tabs.length) box.appendChild(strip);
    const page = document.createElement('div'); page.className = 'tabpage';
    const scrKey = tabs.find(t => t[0] === cur)?.[1];
    if (scrKey) {
      try { page.appendChild(this.renderScreen(scrKey)); }
      catch (e) { console.error(e); page.innerHTML = `<div class="err">${esc(e.stack || e.message)}</div>`; }
    }
    box.appendChild(page);
    box.scrollTop = st;
  },
  headerBinding() {
    const f = this.form, n = this.selNode(), s = this.sel;
    const status = { get: () => APP.statusText() };
    if (s.g) {
      return { f: {
        TEXT_FOR_NODE: { get: () => GLOBAL_NODES[s.g] },
        'SSFSCREEN-INAME': { get: () => f.name },
        TEXT_FOR_STATUS: status,
        'SSFSCREEN-CAPTION': { get: () => X.val(f.header, 'CAPTION'), set: v => X.set(f.header, 'CAPTION', v.slice(0, 30)), lower: true },
      }, ro: el => el.n === 'SSFSCREEN-INAME' };
    }
    if (f.isTextModule) {
      return { f: {
        'SSFSCREEN-INAME': { get: () => f.name },
        'SSFSCREEN-CAPTION': { get: () => X.val(f.header, 'CAPTION'), set: v => { X.set(f.header, 'CAPTION', v.slice(0, 30)); } },
      }, ro: el => el.n === 'SSFSCREEN-INAME' };
    }
    const evNode = n.type === 'EV';
    return { f: {
      TEXT_FOR_NODE: { get: () => n.info.label },
      'SSFSCREEN-INAME': { get: () => n.name, set: v => { v = v.trim().toUpperCase(); const err = f.nameError(v, n.obj); if (err) throw new Error(err); f.rename(n.obj, v); } },
      TEXT_FOR_STATUS: status,
      'SSFSCREEN-CAPTION': { get: () => n.caption, set: v => f.setCaption(n.obj, v), lower: true },
    }, ro: el => el.n === 'SSFSCREEN-INAME' && (evNode || n.isRef) };
  },
  /* text module screens */
  bind1600() {
    const f = this.form, n = f.rp;
    const ctx = { form: f, node: n, ui: this.ui(n.el), fb: this };
    return { cust: { EDITOR_CUSTOM_CONTROL: textEditorCtrl(ctx, n) }, fc: { EDIT: env => APP.fullscreenText(n, env) }, vis: el => el.n === 'USE_FULL_SCREEN_TEXTEDITOR' ? false : undefined };
  },
  bind1610() {
    const f = this.form, n = f.rp, oa = () => n.outattr, ens = () => n.ensureOutattr();
    return { f: {
      'SSFSCREEN-STDSTYLE': { get: () => X.val(n.obj, 'STYLE_NAME') || X.val(f.varItem, 'STDSTYLE'), set: v => { v = v.toUpperCase(); X.set(n.obj, 'STYLE_NAME', v); X.set(f.varItem, 'STDSTYLE', v); }, values: () => APP.styleNames() },
      'SSFSCREEN-WWIDTH': B.dec(oa, ens, 'WWIDTH'), 'SSFSCREEN-U_WWIDTH': B.unit(oa, ens, 'U_WWIDTH', VL.unitH),
    } };
  },

  /* =================================================================
     Table Painter (1097)
     ================================================================= */
  bind1097() {
    const ctx = this.ctx(), n = ctx.node, self = this;
    return {
      fc: { TPAINT: () => { ctx.ui.painter = false; self.scheduleRender(); } },
      cust: { TABLEPAINTER: (host, env) => host.appendChild(this.tablePainter(n, env)) },
      sub: { SUB_BORDER: (host, env) => { if (n.kind === 'SE-C' || n.kind === 'SE-S') return env.renderScreen('SAPLSTXB:1099', { w: 63, h: 6 }, bindPattern(ctx, n)); return null; } },
    };
  },
  tablePainter(n, env) {
    const sect = n.obj, f = this.form, dyn = n.kind !== 'SE-S';
    const wrap = document.createElement('div'); wrap.className = 'tp';
    const lines = dyn ? X.kids(X.kid(sect, 'DYNLINES'), 'item') : X.kids(X.kid(sect, 'STATLINES'), 'item');
    const ctx = f.ctx;
    const pxcm = 34;
    const tw = toCm(X.val(sect, 'WIDTH') || '10', X.val(sect, 'U_WIDTH') || 'CM', ctx);
    const head = document.createElement('div'); head.className = 'tp-ruler'; head.style.width = (tw * pxcm) + 'px';
    for (let i = 0; i <= Math.floor(tw); i++) { const t = document.createElement('span'); t.style.left = (i * pxcm) + 'px'; t.textContent = i; head.appendChild(t); }
    wrap.appendChild(head);
    lines.forEach((ln, li) => {
      const name = X.val(ln, 'NAME');
      const row = document.createElement('div'); row.className = 'tp-row'; row.style.width = (tw * pxcm) + 'px';
      if (X.val(ln, 'DEFAULTVAL') === 'X') row.classList.add('def');
      const cells = cellsOf(sect, name);
      let x = 0;
      cells.forEach((c, ci) => {
        const w = toCm(X.val(c, 'CWIDTH'), X.val(c, 'U_CWIDTH') || 'CM', ctx);
        const cell = document.createElement('div'); cell.className = 'tp-cell'; cell.style.left = (x * pxcm) + 'px'; cell.style.width = Math.max(4, w * pxcm) + 'px';
        cell.title = `${name} · cell ${ci + 1} · ${X.val(c, 'CWIDTH')} ${X.val(c, 'U_CWIDTH')}`;
        { const bi = X.kids(X.kid(c, 'BORDERS'), 'item')[0], fc = X.kid(bi, 'FILLCOLOR'); const sh = +X.val(bi, 'INTENSITY') || +X.val(c, 'SHADING') || 0;
          if (sh) cell.style.background = `color-mix(in srgb, ${Preview.rgb(fc && X.val(fc, 'USED') === 'X' ? fc : null, '#000')} ${Math.min(100, sh)}%, transparent)`; }
        const bi = X.kids(X.kid(c, 'BORDERS'), 'item')[0];
        if (bi) for (const [s, css] of [['LLEFT', 'borderLeft'], ['LTOP', 'borderTop'], ['LRIGHT', 'borderRight'], ['LBOTTOM', 'borderBottom']]) { const t = parseFloat(X.val(bi, s)); if (t > 0) cell.style[css] = Math.max(1, Math.round(toCm(t, X.val(bi, s + '_U') || 'MM') * 37.8)) + 'px solid #000'; }
        if (ci === 0) { const l = document.createElement('span'); l.className = 'tp-name'; l.textContent = name + (dyn ? '' : ` (${+X.val(ln, 'LINEFROM')}-${+X.val(ln, 'LINETO')})`); cell.appendChild(l); }
        if (env.edit) {
          const hdl = document.createElement('span'); hdl.className = 'tp-hdl'; cell.appendChild(hdl);
          hdl.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            const x0 = e.clientX, w0 = w, next = cells[ci + 1], wn0 = next ? toCm(X.val(next, 'CWIDTH'), X.val(next, 'U_CWIDTH') || 'CM', ctx) : 0;
            const ghost = cell; const nextEl = cell.nextSibling;
            const mv = ev => { const d = (ev.clientX - x0) / pxcm; const nw = Math.max(.1, w0 + d); ghost.style.width = nw * pxcm + 'px'; if (next && nextEl) { nextEl.style.left = (parseFloat(ghost.style.left) + nw * pxcm) + 'px'; nextEl.style.width = Math.max(4, (wn0 - (nw - w0)) * pxcm) + 'px'; } };
            const up = ev => {
              document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
              const d = (ev.clientX - x0) / pxcm; if (Math.abs(d) < .02) return;
              let nw = Math.max(.1, w0 + d), nn = next ? Math.max(.1, wn0 - (nw - w0)) : 0;
              env.pai('Change cell width', () => {
                X.set(c, 'CWIDTH', fromCm(nw, X.val(c, 'U_CWIDTH') || 'CM', ctx).toFixed(2));
                if (next) X.set(next, 'CWIDTH', fromCm(nn, X.val(next, 'U_CWIDTH') || 'CM', ctx).toFixed(2));
              });
            };
            document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
          });
          cell.addEventListener('contextmenu', e => {
            e.preventDefault();
            const items = [
              { label: 'Insert', sub: [{ label: 'Empty Line Underneath', fn: () => env.pai('Insert line', () => { const l = X.kid(sect, dyn ? 'DYNLINES' : 'STATLINES'); const tb = lineTable(this.ctx(), n, dyn ? 'dyn' : 'static'); const idx = lines.indexOf(ln) + 1; tb.insertAt(idx); }) }] },
              { label: 'Split', sub: [{ label: 'Cell', fn: () => env.pai('Split cell', () => { const half = (parseFloat(X.val(c, 'CWIDTH')) / 2).toFixed(2); X.set(c, 'CWIDTH', half); const nc = c.cloneNode(true); c.after(nc); renumberCells(sect, name); }) }] },
              { label: 'Delete', sub: [
                { label: 'Cell', disabled: cells.length < 2, fn: () => env.pai('Delete cell', () => { c.remove(); renumberCells(sect, name); }) },
                { label: 'Line', disabled: lines.length < 2, fn: () => env.pai('Delete line', () => { for (const x of cellsOf(sect, name)) x.remove(); ln.remove(); }) }] },
              { label: 'Rename', fn: () => APP.promptScreen('Rename Lines', 'SAPLSTXB:2060', { 'SSFSCREEN-T_LINETYPE': name }, 'SSFSCREEN-T_RENAMETO', v => env.pai('Rename line type', () => { const tb = lineTable(this.ctx(), n, dyn ? 'dyn' : 'static'); tb.col[(dyn ? 'G_OUTPUT_DYNTAB-' : 'G_OUTPUT_STRUCT-') + 'NAME'].set(ln, v); })) },
            ];
            if (dyn) items.push({ label: 'Default Line', fn: () => env.pai('Default line', () => { for (const it of lines) X.set(it, 'DEFAULTVAL', it === ln ? 'X' : ''); }) });
            else {
              items.push({ label: 'Interval', fn: () => APP.promptScreen('Interval', 'SAPLSTXB:2040', { 'SSFSCREEN-T_LINETYPE': name, 'SSFSCREEN-T_LINEFROM': String(+X.val(ln, 'LINEFROM')) }, 'SSFSCREEN-T_LINETO', v => env.pai('Interval', () => X.set(ln, 'LINETO', String(parseInt(v, 10) || 1).padStart(3, '0'))), String(+X.val(ln, 'LINETO'))) });
              items.push({ label: 'Reference', fn: () => APP.promptScreen('Reference', 'SAPLSTXB:2050', { 'SSFSCREEN-T_LINETYPE': name }, 'SSFSCREEN-T_REFLTYPE', v => env.pai('Reference', () => X.set(ln, 'REFERENCE', v)), X.val(ln, 'REFERENCE'), lines.map(l => X.val(l, 'NAME')).filter(x => x !== name).map(x => [x, x])) });
            }
            APP.contextMenu(e.clientX, e.clientY, items);
          });
        }
        row.appendChild(cell);
        x += w;
      });
      if (x > tw + 0.005) { row.classList.add('too-wide'); row.title = `Line type ${name} is wider than the table (${x.toFixed(2)} cm > ${tw.toFixed(2)} cm)`; }
      wrap.appendChild(row);
    });
    const info = document.createElement('div'); info.className = 'tp-info'; info.textContent = `Table width ${X.val(sect, 'WIDTH')} ${X.val(sect, 'U_WIDTH')}. Drag a cell's right edge to resize; right-click a cell for Insert / Split / Delete / Rename${dyn ? ' / Default Line' : ' / Interval / Reference'}.`;
    wrap.appendChild(info);
    return wrap;
  },

  /* =================================================================
     Field List
     ================================================================= */
  renderFieldList(box) {
    const f = this.form; box.innerHTML = '';
    const head = document.createElement('div'); head.className = 'pane-title'; head.innerHTML = `${icon('variable')} Field List`;
    const close = document.createElement('button'); close.className = 'tb-btn small'; close.innerHTML = icon('cancel'); close.title = 'Field List off'; close.onclick = () => { APP.settings.fl = false; APP.saveSettings(); this.render(); };
    head.appendChild(close); box.appendChild(head);
    const ul = document.createElement('ul'); ul.className = 'tree fl';
    const groups = [
      ['Import Interface', X.kids(X.kid(f.root, 'INTERFACE'), 'item').filter(i => X.val(i, 'IOTYPE') === 'I').map(i => [X.val(i, 'NAME'), `${X.val(i, 'TYPING')} ${X.val(i, 'TYPENAME')}`])],
      ['Export Interface', X.kids(X.kid(f.root, 'INTERFACE'), 'item').filter(i => X.val(i, 'IOTYPE') === 'E').map(i => [X.val(i, 'NAME'), `${X.val(i, 'TYPING')} ${X.val(i, 'TYPENAME')}`])],
      ['Table Interface', X.kids(X.kid(f.root, 'INTERFACE'), 'item').filter(i => X.val(i, 'IOTYPE') === 'T').map(i => [X.val(i, 'NAME'), `${X.val(i, 'TYPING')} ${X.val(i, 'TYPENAME')}`])],
      ['Global Data', X.kids(X.kid(f.root, 'GDATA'), 'item').map(i => [X.val(i, 'NAME'), `${X.val(i, 'TYPING')} ${X.val(i, 'TYPENAME')}`])],
      ['Field Symbols', X.kids(X.kid(f.root, 'FSYMBOLS'), 'item').map(i => [X.val(i, 'NAME'), `${X.val(i, 'TYPING')} ${X.val(i, 'TYPENAME')}`])],
      ['System Fields', SFSY.map(([k, t]) => ['SFSY-' + k, t])],
    ];
    this.flOpen ||= new Set(['Import Interface', 'Global Data']);
    for (const [g, items] of groups) {
      const li = document.createElement('li');
      const open = this.flOpen.has(g);
      li.innerHTML = `<div class="tree-row"><span class="twisty ${items.length ? (open ? 'open' : 'closed') : ''}"></span>${icon('folder')}<span class="tree-lab">${esc(g)}</span></div>`;
      li.firstChild.onclick = () => { if (open) this.flOpen.delete(g); else this.flOpen.add(g); this.renderFieldList(box); };
      if (open) {
        const sub = document.createElement('ul');
        for (const [nm, t] of items) {
          const r = document.createElement('li');
          r.innerHTML = `<div class="tree-row fl-item" draggable="true" style="padding-left:24px">${icon('variable')}<span class="tree-lab"><b>${esc(nm)}</b> <span class="muted">${esc(t)}</span></span></div>`;
          const row = r.firstChild;
          row.title = `Drag into a text, or double-click to insert &${nm}&`;
          row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', `&${nm}&`); e.dataTransfer.effectAllowed = 'copy'; });
          row.addEventListener('dblclick', () => APP.insertIntoFocusedText(`&${nm}&`));
          sub.appendChild(r);
        }
        li.appendChild(sub);
      }
      ul.appendChild(li);
    }
    box.appendChild(ul);
  },
  fieldNames() {
    const f = this.form; const out = [];
    for (const i of X.kids(X.kid(f.root, 'INTERFACE'), 'item')) out.push([X.val(i, 'NAME'), `${X.val(i, 'TYPING')} ${X.val(i, 'TYPENAME')}`]);
    for (const i of X.kids(X.kid(f.root, 'GDATA'), 'item')) out.push([X.val(i, 'NAME'), `${X.val(i, 'TYPING')} ${X.val(i, 'TYPENAME')}`]);
    for (const i of X.kids(X.kid(f.root, 'FSYMBOLS'), 'item')) out.push([X.val(i, 'NAME'), `${X.val(i, 'TYPING')} ${X.val(i, 'TYPENAME')}`]);
    for (const [k, t] of SFSY) out.push(['SFSY-' + k, t]);
    return out;
  },

  /* =================================================================
     Form Painter
     ================================================================= */
  renderPainter(box) {
    const f = this.form;
    const st = { t: box.scrollTop, l: box.scrollLeft };
    box.innerHTML = '';
    const pages = f.pages; if (!pages.length) { box.innerHTML = '<div class="empty">No pages</div>'; return; }
    let page = pages.find(p => p.el === this.fpPageEl) || pages[0];
    const n = this.selNode(); if (n?.page) page = n.page;
    this.fpPageEl = page.el;
    const bar = document.createElement('div'); bar.className = 'fp-bar';
    const psel = document.createElement('select'); psel.className = 'fp-page';
    for (const p of pages) { const o = document.createElement('option'); o.value = p.name; o.textContent = `${p.name}  ${p.caption}`; if (p === page) o.selected = true; psel.appendChild(o); }
    psel.onchange = () => { const p = pages.find(x => x.name === psel.value); this.fpPageEl = p.el; this.select({ el: p.el }); };
    const bt = (ic, tip, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tb-btn small'; b.innerHTML = icon(ic); b.title = tip; b.onclick = fn; bar.appendChild(b); };
    bar.insertAdjacentHTML('beforeend', `<span class="fp-title">Form Painter</span>`);
    bar.appendChild(psel);
    bt('expand', 'Zoom in', () => { this.fpZoom = (this.fpZoom || this.fitZoom) * 1.2; this.render(); });
    bt('collapse', 'Zoom out', () => { this.fpZoom = (this.fpZoom || this.fitZoom) / 1.2; this.render(); });
    bt('display', 'Automatic Zoom', () => { this.fpZoom = 0; this.render(); });
    bt('cancel', 'Form Painter off (F9)', () => { APP.settings.fp = false; APP.saveSettings(); this.render(); });
    box.appendChild(bar);
    const { w, h, format } = f.pageSize(page);
    const avail = Math.max(240, (box.clientWidth || 420) - 36);
    this.fitZoom = avail / (w * 37.8);
    const z = this.fpZoom || this.fitZoom; const pxcm = 37.8 * z;
    const scroll = document.createElement('div'); scroll.className = 'fp-scroll';
    const sheet = document.createElement('div'); sheet.className = 'fp-sheet'; sheet.style.width = (w * pxcm) + 'px'; sheet.style.height = (h * pxcm) + 'px';
    sheet.title = `${page.name} · ${format} ${X.val(page.obj, 'PAGEORTN') === 'L' ? 'Landscape' : 'Portrait'}`;
    /* background picture */
    const bg = X.path(page.obj, 'sf:BACKGROUND', 'sf:GRAPHIC');
    if (bg && X.val(bg, 'GKEYBDS', 'NAME')) { const d = document.createElement('div'); d.className = 'fp-bg'; d.innerHTML = `${icon('graphic')} Background picture ${esc(X.val(bg, 'GKEYBDS', 'NAME'))}`; sheet.appendChild(d); }
    const ctx = f.ctx; const edit = APP.mode === 'edit';
    const wins = page.children.filter(c => c.type === 'WI');
    const selWin = n ? (n.type === 'WI' ? n : n.window) : null;
    for (const win of wins) {
      const oa = win.outattr; if (!oa) continue;
      const g = k => toCm(X.val(oa, k) || 0, X.val(oa, 'U_' + k) || 'CM', ctx);
      const L = g('WLEFT'), T = g('WTOP'), W = g('WWIDTH'), H = g('WHEIGHT');
      const d = document.createElement('div'); d.className = 'fp-win wt-' + (win.sub || 'T');
      if (selWin && selWin.el === win.el) d.classList.add('sel');
      d.style.left = (L * pxcm) + 'px'; d.style.top = (T * pxcm) + 'px'; d.style.width = Math.max(6, W * pxcm) + 'px'; d.style.height = Math.max(6, H * pxcm) + 'px';
      const lab = document.createElement('span'); lab.className = 'fp-lab'; lab.textContent = win.name; d.appendChild(lab);
      if (win.sub === 'G') { const gi = document.createElement('div'); gi.className = 'fp-gr'; gi.innerHTML = icon('graphic') + `<span>${esc(X.val(win.innerObj, 'GKEYBDS', 'NAME') || '')}</span>`; d.appendChild(gi); }
      if (win.sub === 'A') { const gi = document.createElement('div'); gi.className = 'fp-gr'; gi.innerHTML = icon('address'); d.appendChild(gi); }
      d.title = `${win.name} ${win.caption}\n${X.val(oa, 'WLEFT')} ${X.val(oa, 'U_WLEFT')} / ${X.val(oa, 'WTOP')} ${X.val(oa, 'U_WTOP')} · ${X.val(oa, 'WWIDTH')} ${X.val(oa, 'U_WWIDTH')} × ${X.val(oa, 'WHEIGHT')} ${X.val(oa, 'U_WHEIGHT')}`;
      if (L + W > w + 0.001 || T + H > h + 0.001 || L < 0 || T < 0) d.classList.add('outside');
      d.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (!(selWin && selWin.el === win.el)) { this.select({ el: win.el }); return; }
        if (!edit) return;
        const mode = e.target.classList.contains('fp-h') ? e.target.dataset.h : 'move';
        const x0 = e.clientX, y0 = e.clientY; const r0 = { L, T, W, H };
        let r = { ...r0 };
        const snap = v => Math.round(v * 20) / 20;
        const mv = ev => {
          const dx = (ev.clientX - x0) / pxcm, dy = (ev.clientY - y0) / pxcm;
          r = { ...r0 };
          if (mode === 'move') { r.L = snap(r0.L + dx); r.T = snap(r0.T + dy); }
          if (mode.includes('e')) r.W = Math.max(.1, snap(r0.W + dx));
          if (mode.includes('s')) r.H = Math.max(.1, snap(r0.H + dy));
          if (mode.includes('w')) { r.L = snap(r0.L + dx); r.W = Math.max(.1, snap(r0.W - dx)); }
          if (mode.includes('n')) { r.T = snap(r0.T + dy); r.H = Math.max(.1, snap(r0.H - dy)); }
          d.style.left = r.L * pxcm + 'px'; d.style.top = r.T * pxcm + 'px'; d.style.width = r.W * pxcm + 'px'; d.style.height = r.H * pxcm + 'px';
          APP.msg('I', `${win.name}: left ${r.L.toFixed(2)} cm, top ${r.T.toFixed(2)} cm, width ${r.W.toFixed(2)} cm, height ${r.H.toFixed(2)} cm`, true);
        };
        const up = () => {
          document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
          if (r.L === r0.L && r.T === r0.T && r.W === r0.W && r.H === r0.H) return;
          this.pai(mode === 'move' ? 'Move window' : 'Resize window', () => {
            const o = win.ensureOutattr();
            const put = (k, cm) => { const u = X.val(o, 'U_' + k) || 'CM'; X.set(o, 'U_' + k, u); X.set(o, k, fromCm(cm, u, ctx).toFixed(2)); };
            if (r.L !== r0.L) put('WLEFT', r.L); if (r.T !== r0.T) put('WTOP', r.T); if (r.W !== r0.W) put('WWIDTH', r.W); if (r.H !== r0.H) put('WHEIGHT', r.H);
          });
        };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      });
      d.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); this.select({ el: win.el }); this.fpMenu(e.clientX, e.clientY, page, win); });
      if (edit && selWin && selWin.el === win.el) for (const hh of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) { const k = document.createElement('span'); k.className = 'fp-h fp-h-' + hh; k.dataset.h = hh; d.appendChild(k); }
      sheet.appendChild(d);
    }
    sheet.addEventListener('contextmenu', e => { e.preventDefault(); this.fpMenu(e.clientX, e.clientY, page, null); });
    sheet.addEventListener('mousedown', e => { if (e.target === sheet) this.select({ el: page.el }); });
    scroll.appendChild(sheet); box.appendChild(scroll);
    const leg = document.createElement('div'); leg.className = 'fp-legend'; leg.textContent = `${format} ${w.toFixed(1)} × ${h.toFixed(1)} cm · zoom ${Math.round(z * 100)}%`;
    box.appendChild(leg);
    box.scrollTop = st.t; box.scrollLeft = st.l;
  },
  fpMenu(x, y, page, win) {
    const edit = APP.mode === 'edit';
    const items = [];
    if (edit) {
      items.push({ label: 'Create', icon: 'create', sub: [{ label: 'Window', icon: 'win', fn: () => this.createNode('WI', page) }, { label: 'Graphic', icon: 'graphic', fn: () => this.createNode('GR', page) }, { label: 'Address', icon: 'address', fn: () => this.createNode('AD', page) }] });
      if (win) { items.push({ label: 'Cut', icon: 'cut', fn: () => this.copyNode(win, true) }, { label: 'Copy', icon: 'copy', fn: () => this.copyNode(win) }); }
      items.push({ label: 'Paste', icon: 'paste', disabled: !this.clip, fn: () => this.pasteNode(page) });
      if (win) items.push({ label: 'Delete', icon: 'delete', fn: () => this.deleteNode(win) });
      items.push('-');
    }
    items.push({ label: 'Settings…', icon: 'tools', fn: () => APP.dialogSettings('SET_FP') });
    APP.contextMenu(x, y, items);
  },
};
