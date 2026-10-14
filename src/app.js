/* =====================================================================
   app.js — SAP GUI shell for ZSMARTFORMS: menu bar, system toolbar,
   title, application toolbar, status bar, initial screen (SAPMSSFO
   0100) with object library, dialogs, save / activate / up- & download.
   ===================================================================== */
'use strict';

const STD_ITF = `<item><IOTYPE>E</IOTYPE><NAME>DOCUMENT_OUTPUT_INFO</NAME><TYPING>TYPE</TYPING><TYPENAME>SSFCRESPD</TYPENAME><BYVALUE>X</BYVALUE><STANDARD>X</STANDARD></item><item><IOTYPE>E</IOTYPE><NAME>JOB_OUTPUT_INFO</NAME><TYPING>TYPE</TYPING><TYPENAME>SSFCRESCL</TYPENAME><BYVALUE>X</BYVALUE><STANDARD>X</STANDARD></item><item><IOTYPE>E</IOTYPE><NAME>JOB_OUTPUT_OPTIONS</NAME><TYPING>TYPE</TYPING><TYPENAME>SSFCRESOP</TYPENAME><BYVALUE>X</BYVALUE><STANDARD>X</STANDARD></item><item><IOTYPE>I</IOTYPE><NAME>ARCHIVE_INDEX</NAME><TYPING>TYPE</TYPING><TYPENAME>TOA_DARA</TYPENAME><OPTIONAL>X</OPTIONAL><BYVALUE>X</BYVALUE><STANDARD>X</STANDARD></item><item><IOTYPE>I</IOTYPE><NAME>ARCHIVE_INDEX_TAB</NAME><TYPING>TYPE</TYPING><TYPENAME>TSFDARA</TYPENAME><OPTIONAL>X</OPTIONAL><BYVALUE>X</BYVALUE><STANDARD>X</STANDARD></item><item><IOTYPE>I</IOTYPE><NAME>ARCHIVE_PARAMETERS</NAME><TYPING>TYPE</TYPING><TYPENAME>ARC_PARAMS</TYPENAME><OPTIONAL>X</OPTIONAL><BYVALUE>X</BYVALUE><STANDARD>X</STANDARD></item><item><IOTYPE>I</IOTYPE><NAME>CONTROL_PARAMETERS</NAME><TYPING>TYPE</TYPING><TYPENAME>SSFCTRLOP</TYPENAME><OPTIONAL>X</OPTIONAL><BYVALUE>X</BYVALUE><STANDARD>X</STANDARD></item><item><IOTYPE>I</IOTYPE><NAME>MAIL_APPL_OBJ</NAME><TYPING>TYPE</TYPING><TYPENAME>SWOTOBJID</TYPENAME><OPTIONAL>X</OPTIONAL><BYVALUE>X</BYVALUE><STANDARD>X</STANDARD></item><item><IOTYPE>I</IOTYPE><NAME>MAIL_RECIPIENT</NAME><TYPING>TYPE</TYPING><TYPENAME>SWOTOBJID</TYPENAME><OPTIONAL>X</OPTIONAL><BYVALUE>X</BYVALUE><STANDARD>X</STANDARD></item><item><IOTYPE>I</IOTYPE><NAME>MAIL_SENDER</NAME><TYPING>TYPE</TYPING><TYPENAME>SWOTOBJID</TYPENAME><OPTIONAL>X</OPTIONAL><BYVALUE>X</BYVALUE><STANDARD>X</STANDARD></item><item><IOTYPE>I</IOTYPE><NAME>OUTPUT_OPTIONS</NAME><TYPING>TYPE</TYPING><TYPENAME>SSFCOMPOP</TYPENAME><OPTIONAL>X</OPTIONAL><BYVALUE>X</BYVALUE><STANDARD>X</STANDARD></item><item><IOTYPE>I</IOTYPE><NAME>USER_SETTINGS</NAME><TYPING>TYPE</TYPING><TYPENAME>TDBOOL</TYPENAME><OPTIONAL>X</OPTIONAL><BYVALUE>X</BYVALUE><DEFAULTVAL>&apos;X&apos;</DEFAULTVAL><STANDARD>X</STANDARD></item><item><IOTYPE>X</IOTYPE><NAME>FORMATTING_ERROR</NAME><STANDARD>X</STANDARD></item><item><IOTYPE>X</IOTYPE><NAME>INTERNAL_ERROR</NAME><STANDARD>X</STANDARD></item><item><IOTYPE>X</IOTYPE><NAME>SEND_ERROR</NAME><STANDARD>X</STANDARD></item><item><IOTYPE>X</IOTYPE><NAME>USER_CANCELED</NAME><STANDARD>X</STANDARD></item>`;
const TYPE_LABEL = { SF: 'Form', SS: 'Style', TM: 'Text Module' };

const APP = {
  mode: 'show', screen: 'initial', doc: null, docType: null, dirty: false, inactive: false,
  lib: new Map(), styleCache: new Map(), commits: [], confirmed: new Set(), tcClip: null, lastText: null,
  settings: { fp: true, fl: false, editor: 'pc', unitH: 'CM', unitV: 'CM', undo: true, fpGraphics: true, tpLineHeight: '0.50', tpLineU: 'CM', backend: '', transport: '', devclass: '' },
  init: { type: 'SF', SF: '', SS: '', TM: '', filter: '', libType: 'ALL' },

  /* =============== boot =============== */
  async start() {
    try { const s = JSON.parse(localStorage.getItem('zsf.settings') || '{}'); Object.assign(this.settings, s); } catch {}
    /* opened from SAP (ICF service /sap/bc/zsmartforms): talk to the API next to the page */
    if (/^\/sap\/bc\/zsmartforms/i.test(location.pathname) && !this.settings.backend) this.settings.backend = location.origin + '/sap/bc/zsmartforms/api';
    try { const s = JSON.parse(localStorage.getItem('zsf.init') || '{}'); Object.assign(this.init, s, { filter: '' }); } catch {}
    this.bindKeys();
    await this.libLoad();
    if (!this.lib.size) this.loadSamples();
    this.go('initial');
    this.downloads = null;
    try { if (window.claude?.use) window.claude.use('downloads').then(d => { this.downloads = d; }).catch(() => {}); } catch {}
  },
  saveSettings() { try { localStorage.setItem('zsf.settings', JSON.stringify(this.settings)); } catch {} },
  saveInit() { try { localStorage.setItem('zsf.init', JSON.stringify({ ...this.init, filter: '' })); } catch {} },

  /* =============== object library (IndexedDB, per browser) =============== */
  key(type, name) { return type + ':' + String(name).toUpperCase(); },
  libGet(type, name) { return this.lib.get(this.key(type, name)) || null; },
  classify(text) {
    const head = text.slice(0, 4000);
    if (/<sf:SMARTSTYLE\b/.test(head)) return { type: 'SS', name: (/<STYLENAME>([^<]*)</.exec(text) || [])[1] || '', caption: (/<CAPTION>([^<]*)</.exec(text) || [])[1] || '' };
    if (/<sf:SMARTFORM\b/.test(head)) {
      const tm = /<FORMTYPE>T<\/FORMTYPE>/.test(head);
      return { type: tm ? 'TM' : 'SF', name: (/<FORMNAME>([^<]*)</.exec(text) || [])[1] || '', caption: (/<CAPTION>([^<]*)</.exec(text) || [])[1] || '' };
    }
    return null;
  },
  libPut(text, extra = {}) {
    const c = this.classify(text); if (!c || !c.name) throw new Error('File is neither a Smart Form nor a Smart Style XML');
    const k = this.key(c.type, c.name);
    const prev = this.lib.get(k);
    const e = { type: c.type, name: c.name, caption: decodeXml(c.caption), text, active: extra.active ?? text, modified: extra.modified ?? false, changed: extra.changed || Date.now(), source: extra.source || prev?.source || '' };
    this.lib.set(k, e); this.styleCache.delete(c.name.toUpperCase());
    this.dbPut(e);
    return e;
  },
  libDelete(type, name) { const k = this.key(type, name); this.lib.delete(k); this.dbDel(k); },
  idb() {
    if (this._idb) return this._idb;
    this._idb = new Promise(res => {
      try {
        const r = indexedDB.open('zsmartforms', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('lib');
        r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
      } catch { res(null); }
    });
    return this._idb;
  },
  async libLoad() {
    const db = await this.idb(); if (!db) return;
    await new Promise(res => {
      try {
        const tx = db.transaction('lib', 'readonly'); const st = tx.objectStore('lib'); const r = st.openCursor();
        r.onsuccess = () => { const c = r.result; if (c) { this.lib.set(c.key, c.value); c.continue(); } else res(); };
        r.onerror = () => res();
      } catch { res(); }
    });
  },
  async dbPut(e) { const db = await this.idb(); if (!db) return; try { db.transaction('lib', 'readwrite').objectStore('lib').put(e, this.key(e.type, e.name)); } catch {} },
  async dbDel(k) { const db = await this.idb(); if (!db) return; try { db.transaction('lib', 'readwrite').objectStore('lib').delete(k); } catch {} },
  async dbClear() { const db = await this.idb(); if (!db) return; try { db.transaction('lib', 'readwrite').objectStore('lib').clear(); } catch {} },
  loadSamples() {
    for (const t of (window.SAMPLES || [])) { try { this.libPut(t, { source: 'example' }); } catch (e) { console.warn(e); } }
  },
  allStyles() { const out = []; for (const e of this.lib.values()) if (e.type === 'SS') { const s = this.styleByName(e.name); if (s) out.push(s); } if (this.doc instanceof SfStyle && !out.includes(this.doc)) out.push(this.doc); return out; },
  styleByName(name) {
    if (!name) return null; name = name.toUpperCase();
    if (this.doc instanceof SfStyle && this.doc.name === name) return this.doc;
    if (this.styleCache.has(name)) return this.styleCache.get(name);
    const e = this.libGet('SS', name); let s = null;
    if (e) { try { s = new SfStyle(parseXml(e.text)); s.journal.dispose(); } catch { s = null; } }
    this.styleCache.set(name, s); return s;
  },
  styleFor(form, node) { return this.styleByName(node ? form.currentStyle(node) : X.val(form.varItem, 'STDSTYLE')); },
  styleNames() { const s = new Set(['SYSTEM']); for (const e of this.lib.values()) if (e.type === 'SS') s.add(e.name); if (this.doc instanceof SfForm) { const v = X.val(this.doc.varItem, 'STDSTYLE'); if (v) s.add(v); } return [...s].sort().map(n => [n, n + (this.libGet('SS', n) ? '  ' + this.libGet('SS', n).caption : '')]); },
  paraList(form, node) { const st = this.styleFor(form, node); return [['', ''], ...(st ? st.paragraphs().map(p => [X.val(p, 'TDPARGRAPH'), X.val(p, 'TDPARGRAPH') + '  ' + X.val(p, 'CAPTION')]) : [])]; },
  langList() { return [['', ''], ...['E', 'D', '뢚', 'R', 'T', 'F', 'S', 'I'].map(k => [k, `${LANG.iso(k)}`])]; },
  textModules() { return [...this.lib.values()].filter(e => e.type === 'TM').map(e => e.name).sort(); },
  textModuleLines(name) {
    const e = this.libGet('TM', name); if (!e) return null;
    try { const f = new SfForm(parseXml(e.text)); f.journal.dispose(); if (this.doc instanceof SfForm) { f.lang = this.doc.lang; } return f.rp ? f.textLines(f.rp.obj) : []; } catch { return null; }
  },
  fieldList(form) { return FB.fieldNames(); },

  /* =============== navigation =============== */
  go(screen) {
    this.screen = screen;
    const main = document.getElementById('main'); main.innerHTML = '';
    main.className = 'scr-' + screen;
    if (screen === 'initial') { this.doc = null; this.mode = 'show'; this.renderInitial(main); }
    else if (screen === 'form') { main.innerHTML = '<div id="fb" class="fb"></div>'; FB.render(); this.splitters(); }
    else if (screen === 'style') { main.innerHTML = '<div id="sb" class="sb"></div>'; SB.render(); this.splitters(); }
    else if (screen === 'preview') this.renderPreview(main);
    this.renderChrome();
  },
  openDoc(type, name, mode) {
    const e = this.libGet(type, name);
    if (!e && this.settings.backend) {
      this.msg('I', `Reading ${name.toUpperCase()} from SAP…`);
      return this.backendLoad(type, name.toUpperCase()).then(() => this.openDoc(type, name, mode)).catch(err => this.msg('E', `${TYPE_LABEL[type]} ${name.toUpperCase()}: ${err.message}`));
    }
    if (!e) return this.msg('E', `${TYPE_LABEL[type]} ${name.toUpperCase()} does not exist`);
    let doc;
    try { doc = openDocument(e.text); } catch (err) { return this.msg('E', `${name}: ${err.message}`); }
    this.doc = doc; this.docType = type; this.mode = mode; this.dirty = false; this.inactive = e.text !== e.active; this.confirmed.clear();
    if (doc instanceof SfForm) { FB.open(doc); this.go('form'); }
    else { SB.open(doc); this.go('style'); }
    this.msg('S', '');
  },
  setDirty(v) { this.dirty = v; if (v) this.inactive = true; this.renderChrome(); },
  statusText() { return this.inactive ? 'Inactive' : 'Active'; },
  builder() { return this.screen === 'form' ? FB : this.screen === 'style' ? SB : null; },
  rerender() { if (this.screen === 'form') FB.render(); else if (this.screen === 'style') SB.render(); else if (this.screen === 'initial') this.go('initial'); },

  /* =============== editors / focus =============== */
  registerCommit(fn) { this.commits.push(fn); if (this.commits.length > 40) this.commits.splice(0, this.commits.length - 40); },
  flushEditors() { const c = this.commits; this.commits = []; for (const f of c) { try { f(); } catch (e) { console.error(e); } } },
  captureFocus(host) {
    const a = document.activeElement; const st = {};
    for (const s of host.querySelectorAll('.pane, .tabpage, .tc-scroll, .te-body, .ab-ta')) { if (s.scrollTop || s.scrollLeft) st[this.pathOf(s, host)] = [s.scrollTop, s.scrollLeft]; }
    if (!a || !host.contains(a)) return { st };
    return { st, key: a.dataset.k ? `[data-k="${CSS.escape(a.dataset.k)}"]` : a.name ? `${a.tagName.toLowerCase()}[name="${CSS.escape(a.name)}"]` : null, ss: a.selectionStart, se: a.selectionEnd, idx: a.dataset.k || a.name ? 0 : [...host.querySelectorAll(a.tagName)].indexOf(a), tag: a.tagName,
      /* text editor paragraph being typed in: its not yet committed text survives a re-render */
      live: a.classList.contains('te-ta') ? a.value : null };
  },
  pathOf(el, host) { const p = []; for (let e = el; e && e !== host; e = e.parentElement) p.unshift([...e.parentElement.children].indexOf(e)); return p.join('.'); },
  restoreFocus(host, k) {
    if (!k) return;
    for (const [p, [t, l]] of Object.entries(k.st || {})) { let e = host; for (const i of p.split('.')) { e = e?.children[+i]; } if (e) { e.scrollTop = t; e.scrollLeft = l; } }
    let el = k.key ? host.querySelector(k.key) : (k.idx >= 0 && k.tag ? host.querySelectorAll(k.tag)[k.idx] : null);
    if (el && k.live != null && el.classList.contains('te-ta') && !el.readOnly && el.value !== k.live) { el.value = k.live; el.dispatchEvent(new Event('input')); }
    if (el && el.focus) { el.focus({ preventScroll: true }); try { if (k.ss != null && el.setSelectionRange) el.setSelectionRange(k.ss, k.se); } catch {} }
  },
  insertIntoFocusedText(str) {
    const t = this.lastText;
    if (!t || !t.isConnected || t.readOnly) return this.msg('W', 'Place the cursor in a text first');
    const s = t.selectionStart ?? t.value.length; t.value = t.value.slice(0, s) + str + t.value.slice(t.selectionEnd ?? s);
    t.focus(); t.setSelectionRange(s + str.length, s + str.length); t.dispatchEvent(new Event('input')); t.dispatchEvent(new Event('blur'));
  },
  clipboardText(t) { try { navigator.clipboard?.writeText(t).catch(() => {}); } catch {} },

  /* =============== messages =============== */
  msg(type, text, transient) {
    const el = document.getElementById('msg'); if (!el) return;
    el.className = 'msg msg-' + (type || 'S');
    el.innerHTML = text ? `${icon({ S: 'success', E: 'error', W: 'warning', I: 'info' }[type] || 'info')}<span>${esc(text)}</span>` : '';
    if (!transient && text) this.lastMsg = { type, text };
  },

  /* =============== chrome: menu, toolbars, title =============== */
  menus() {
    const s = this.screen, edit = this.mode === 'edit';
    const F = (label, fc, key, extra = {}) => ({ label, fc, key, ...extra });
    if (s === 'initial') return [
      ['Smart Forms', [F('Create', 'CREATE', 'F5'), F('Change', 'CHANGE', 'F6'), F('Display', 'DISPLAY', 'F7'), '-', F('Copy…', 'COPY', 'Ctrl+F5'), F('Rename…', 'RENAME', 'Ctrl+F6'), F('Delete', 'DELETE', 'Shift+F2'), '-', F('Exit', 'EXIT', 'Shift+F3')]],
      ['Goto', [F('Form', 'RB_SF'), F('Style', 'RB_ST'), F('Text Module', 'RB_TX')]],
      ['Utilities', [F('Upload Forms / Styles…', 'UPLOAD'), F('Download', 'DOWNLOAD'), F('Download All Changed Objects', 'DOWNLOAD_CHANGED'), '-', F('Settings…', 'SETTINGS'), F('Clear Library', 'LIBCLEAR')]],
      ['Help', [F('About ZSMARTFORMS', 'ABOUT')]],
    ];
    if (s === 'form') return [
      ['Form', [F('Other Form…', 'OTHER', 'Shift+F5'), F(edit ? 'Display' : 'Change', 'SWIT', 'Ctrl+F1'), F('Check', 'CHECKALL', 'Ctrl+F2'), F('Activate', 'ACTIVATE', 'Ctrl+F3'), F('Test', 'TEST', 'F8'), F('Print Preview', 'PREVIEW', 'Ctrl+Shift+F8'), '-', F('Save', 'SAVE', 'Ctrl+S', { disabled: !edit }), '-', F('Exit', 'EXIT', 'Shift+F3')]],
      ['Edit', [
        F('Node', null, null, { sub: [F('Create…', 'NODECREATE', 'F5', { disabled: !edit }), F('Cut', 'OB_CUT', 'Ctrl+X', { disabled: !edit }), F('Copy', 'OB_COPY', 'Ctrl+C'), F('Paste', 'OB_PASTE', 'Ctrl+V', { disabled: !edit }), F('Delete', 'NODEDELETE', 'Shift+F2', { disabled: !edit })] }),
        F('Subtree', null, null, { sub: [F('Expand', 'TREXPAND'), F('Collapse', 'TRCOLLAPSE')] }),
        '-', F('Undo', 'UNDO', 'Ctrl+Z', { disabled: !edit || !this.doc?.journal.undoStack.length }), F('Redo', 'REDO', 'Ctrl+Y', { disabled: !edit || !this.doc?.journal.redoStack.length }),
        '-', F('Find…', 'FIND', 'Ctrl+F'), F('Cancel', 'CANC', 'F12')]],
      ['Goto', [F('Back', 'BACK', 'F3'), F('Global Settings', 'GOTO_H01'), F('Form Interface', 'GOTO_H02'), F('Global Definitions', 'GOTO_H03')]],
      ['Utilities', [F('Settings…', 'SETTINGS'), F(this.settings.fp ? 'Form Painter off' : 'Form Painter on', 'FPTOGGLE', 'F9'), F(this.settings.fl ? 'Field List off' : 'Field List on', 'HLS_OPEN', 'Ctrl+F4'), F('Form Information', 'INFO'), '-',
        F('Upload…', 'UPLOAD_INTO', null, { disabled: !edit }), F('Download Form', 'DOWNLOAD'), F('Download Subtree', 'DOWNLOAD_SUB'), '-', F('Return to Active Version', 'REVERT', null, { disabled: !this.inactive }), F('Activate Without Check', 'ACTIVATE_NC')]],
      ['Environment', [F('Function Module Name', 'FMNAME'), F('Style', 'GOTO_STYLE')]],
    ];
    if (s === 'style') return [
      ['Smart Styles', [F('Other Style…', 'OTHER'), F(edit ? 'Display' : 'Change', 'SWIT', 'Ctrl+F1'), F('Check', 'CHECKALL', 'Ctrl+F2'), F('Activate', 'ACTIVATE', 'Ctrl+F3'), '-', F('Save', 'SAVE', 'Ctrl+S', { disabled: !edit }), '-', F('Exit', 'EXIT', 'Shift+F3')]],
      ['Edit', [F('Create Paragraph Format…', 'CREATE_PAR', null, { disabled: !edit }), F('Create Character Format…', 'CREATE_STR', null, { disabled: !edit }), F('Copy…', 'COPY', null, { disabled: !edit }), F('Rename…', 'RENAME', null, { disabled: !edit }), F('Delete', 'DELETE', null, { disabled: !edit }), '-',
        F('Undo', 'UNDO', 'Ctrl+Z', { disabled: !edit || !this.doc?.journal.undoStack.length }), F('Redo', 'REDO', 'Ctrl+Y', { disabled: !edit || !this.doc?.journal.redoStack.length }), '-', F('Cancel', 'CANC', 'F12')]],
      ['Goto', [F('Back', 'BACK', 'F3'), F('Header Data', 'GOTO_HDR')]],
      ['Utilities', [F('Upload…', 'UPLOAD_INTO', null, { disabled: !edit }), F('Download', 'DOWNLOAD'), '-', F('Return to Active Version', 'REVERT', null, { disabled: !this.inactive })]],
    ];
    if (s === 'preview') return [['Preview', [F('Back', 'BACK', 'F3')]]];
    return [];
  },
  apptb() {
    const s = this.screen, edit = this.mode === 'edit';
    const T = (fc, ic, tip, label, extra = {}) => ({ fc, ic, tip, label, ...extra });
    if (s === 'initial') return [T('UPLOAD', 'upload', 'Upload XML or ZIP files into the library', 'Upload'), T('DOWNLOAD_CHANGED', 'download', 'Download all changed objects as ZIP', 'Download Changed'), T('SETTINGS', 'tools', 'Settings')];
    if (s === 'form') return [T('SWIT', 'toggle', edit ? 'Display (Ctrl+F1)' : 'Change (Ctrl+F1)'), T('CHECKALL', 'check', 'Check (Ctrl+F2)'), T('ACTIVATE', 'activate', 'Activate (Ctrl+F3)'), T('TEST', 'test', 'Test (F8)'), '|',
      T('TREXPAND', 'expand', 'Expand subtree'), T('TRCOLLAPSE', 'collapse', 'Collapse subtree'), '|', T('HLS_OPEN', 'variable', 'Field List on/off (Ctrl+F4)', 'Field List', { on: this.settings.fl }), T('FPTOGGLE', 'page', 'Form Painter on/off (F9)', 'Form Painter', { on: this.settings.fp }), '|', T('PREVIEW', 'display', 'Print Preview (layout)', 'Preview'), T('DOWNLOAD', 'download', 'Download form XML', 'Download')];
    if (s === 'style') return [T('SWIT', 'toggle', edit ? 'Display (Ctrl+F1)' : 'Change (Ctrl+F1)'), T('CHECKALL', 'check', 'Check (Ctrl+F2)'), T('ACTIVATE', 'activate', 'Activate (Ctrl+F3)'), '|', T('DOWNLOAD', 'download', 'Download style XML', 'Download')];
    if (s === 'preview') return [];
    return [];
  },
  title() {
    if (this.screen === 'initial') return 'SAP Smart Forms: Initial Screen';
    if (this.screen === 'preview') return `Print Preview ${this.doc?.name || ''}`;
    if (!this.doc) return '';
    const what = this.doc instanceof SfStyle ? 'Smart Styles: Style' : this.doc.isTextModule ? 'SAP Smart Forms: Text Module' : 'SAP Smart Forms: Form';
    return `${what} ${this.doc.name} ${this.mode === 'edit' ? 'Change' : 'Display'}`;
  },
  updateTitle() { const t = document.getElementById('title'); if (t) t.textContent = this.title() + (this.dirty ? ' *' : ''); document.title = this.doc ? `${this.doc.name} – ZSMARTFORMS` : 'ZSMARTFORMS'; },
  renderChrome() {
    const mb = document.getElementById('menubar'); mb.innerHTML = '';
    for (const [label, items] of this.menus()) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mb-item'; b.textContent = label;
      b.onclick = e => { const r = b.getBoundingClientRect(); this.contextMenu(r.left, r.bottom, this.menuItems(items), { menubar: b }); };
      mb.appendChild(b);
    }
    const tb = document.getElementById('apptb'); tb.innerHTML = '';
    for (const t of this.apptb()) {
      if (t === '|') { const s = document.createElement('span'); s.className = 'tb-sep'; tb.appendChild(s); continue; }
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tb-btn' + (t.label ? ' lbl' : '') + (t.on ? ' on' : ''); b.title = t.tip; b.innerHTML = icon(t.ic) + (t.label ? `<span>${esc(t.label)}</span>` : '');
      b.onclick = () => this.fcode(t.fc); tb.appendChild(b);
    }
    const sys = document.getElementById('sysbtns');
    sys.querySelector('[data-fc=SAVE]').disabled = !(this.mode === 'edit' && this.doc);
    sys.querySelector('[data-fc=BACK]').disabled = this.screen === 'initial';
    this.updateTitle();
    this.applyMode();
    const si = document.getElementById('sysinfo');
    si.textContent = `${this.mode === 'edit' ? 'Change' : 'Display'} · ${this.lib.size} objects in library${this.settings.backend ? ' · SAP connected' : ''}`;
  },
  /* Change / Display get their own color scheme; the frame fades between them and the
     re-rendered work area plays a short cross-fade so the switch is visible but calm */
  applyMode() {
    const root = document.documentElement;
    const m = this.doc && this.screen !== 'initial' ? (this.mode === 'edit' ? 'edit' : 'show') : 'none';
    const txt = document.getElementById('modeText');
    if (txt) txt.textContent = m === 'edit' ? 'Change' : m === 'show' ? 'Display' : '';
    if (root.dataset.mode === m) return;
    const had = root.dataset.mode;
    root.dataset.mode = m;
    if (had && had !== 'none' && m !== 'none') {
      const main = document.getElementById('main');
      main.classList.remove('mode-swap'); void main.offsetWidth; main.classList.add('mode-swap');
    }
  },
  menuItems(items) { return items.map(i => i === '-' ? '-' : { label: i.label, key: i.key, disabled: i.disabled, sub: i.sub ? this.menuItems(i.sub) : null, fn: i.fc ? () => this.fcode(i.fc) : null }); },

  /* =============== function codes =============== */
  fcode(fc) {
    const s = this.screen, edit = this.mode === 'edit', b = this.builder();
    try {
      switch (fc) {
        case 'ENTER': return this.screen === 'initial' ? null : b?.render();
        case 'BACK': case 'EXIT': case 'CANC': case 'OTHER': return this.leave(fc);
        case 'SAVE': return this.save();
        case 'SWIT': return this.toggleMode();
        case 'CHECKALL': return this.checkAll();
        case 'ACTIVATE': return this.activate(true);
        case 'ACTIVATE_NC': return this.activate(false);
        case 'TEST': return this.test();
        case 'PREVIEW': return this.flushEditors(), this.go('preview');
        case 'UNDO': case 'REDO': {
          if (!edit || !this.doc) return;
          this.flushEditors();
          const l = fc === 'UNDO' ? this.doc.journal.undo() : this.doc.journal.redo();
          if (!l) return this.msg('W', fc === 'UNDO' ? 'Nothing to undo' : 'Nothing to redo');
          this.setDirty(true); b?.afterUndo(); return this.msg('S', `${fc === 'UNDO' ? 'Undone' : 'Redone'}: ${l}`);
        }
        case 'FPTOGGLE': this.settings.fp = !this.settings.fp; this.saveSettings(); FB.render(); return this.renderChrome();
        case 'HLS_OPEN': this.settings.fl = !this.settings.fl; this.saveSettings(); FB.render(); return this.renderChrome();
        case 'NODECREATE': case 'NODEDELETE': case 'OB_CUT': case 'OB_COPY': case 'OB_PASTE': case 'TREXPAND': case 'TRCOLLAPSE':
          if (s === 'form') return FB.fcode(fc); return;
        case 'CREATE_PAR': case 'CREATE_STR': case 'COPY': case 'RENAME': case 'DELETE':
          if (s === 'style') return SB.fcode(fc); if (s === 'initial') return this.initFcode(fc); return;
        case 'GOTO_H01': case 'GOTO_H02': case 'GOTO_H03': return FB.select({ g: fc.slice(5) });
        case 'GOTO_HDR': return SB.select({ k: 'HDR' });
        case 'GOTO_STYLE': { const n = FB.selNode(); const st = this.doc.currentStyle ? (n ? this.doc.currentStyle(n) : X.val(this.doc.varItem, 'STDSTYLE')) : ''; if (!this.libGet('SS', st)) return this.msg('E', `Style ${st} is not in the library`); return this.leave('STYLE:' + st); }
        case 'SETTINGS': return this.dialogSettings();
        case 'INFO': return this.dialogInfo();
        case 'FMNAME': return this.dialogFm();
        case 'FIND': return this.dialogFind();
        case 'UPLOAD': return this.upload();
        case 'UPLOAD_INTO': return this.uploadInto();
        case 'DOWNLOAD': return this.download();
        case 'DOWNLOAD_SUB': return this.downloadSubtree();
        case 'DOWNLOAD_CHANGED': return this.downloadChanged();
        case 'REVERT': return this.revert();
        case 'LIBCLEAR': return this.confirmDialog('Clear Library', 'Remove all objects from the library in this browser? Changed objects that were not downloaded are lost.', () => { this.lib.clear(); this.dbClear(); this.styleCache.clear(); this.go('initial'); this.msg('S', 'Library cleared'); });
        case 'ABOUT': return this.dialogAbout();
        case 'CREATE': case 'CHANGE': case 'DISPLAY': case 'RB_SF': case 'RB_ST': case 'RB_TX': return this.initFcode(fc);
      }
    } catch (e) { console.error(e); this.msg('E', e.message); }
  },
  toggleMode() {
    if (!this.doc) return;
    this.flushEditors();
    if (this.mode === 'edit' && this.dirty) {
      return this.choiceDialog('Display Form', `Data will be lost. Save ${this.doc.name} first?`, [['Yes', () => { this.save(); this.mode = 'show'; this.rerender(); this.renderChrome(); }], ['No', () => { this.reloadFromLib(); this.mode = 'show'; this.rerender(); this.renderChrome(); }]]);
    }
    this.mode = this.mode === 'edit' ? 'show' : 'edit';
    this.rerender(); this.renderChrome();
  },
  reloadFromLib() {
    const e = this.libGet(this.docType, this.doc.name); if (!e) return;
    const doc = openDocument(e.text); this.doc.journal.dispose(); this.doc = doc; this.dirty = false;
    if (doc instanceof SfForm) { const sel = FB.sel; FB.form = doc; FB.sel = sel.g ? sel : { g: 'P00' }; } else { SB.style = doc; }
  },
  leave(fc) {
    this.flushEditors();
    const go = () => {
      if (this.doc?.journal) this.doc.journal.dispose();
      if (fc.startsWith('STYLE:')) { this.init.type = 'SS'; this.init.SS = fc.slice(6); this.doc = null; this.openDoc('SS', fc.slice(6), 'show'); return; }
      if (this.screen === 'preview') { this.go(this.doc instanceof SfStyle ? 'style' : 'form'); return; }
      this.doc = null; this.dirty = false; this.go('initial');
      if (fc === 'OTHER') setTimeout(() => document.querySelector('#main input[name="SSFSCREEN-FNAME"]')?.focus(), 0);
    };
    if (this.screen === 'preview') return go();
    if (this.screen === 'initial') { if (fc === 'EXIT') this.msg('I', 'Close the browser tab to end the session'); return; }
    if (this.dirty) return this.choiceDialog(fc === 'CANC' ? 'Cancel Form Builder' : 'End Form Builder', `Do you want to save ${this.doc.name}?`, [['Yes', () => { if (this.save()) go(); }], ['No', go]]);
    go();
  },

  /* =============== save / activate =============== */
  save(noBackend) {
    if (!this.doc || this.mode !== 'edit') return false;
    this.flushEditors();
    const text = this.doc.serialize();
    const prev = this.libGet(this.docType, this.doc.name);
    this.libPut(text, { active: prev?.active ?? text, modified: true, changed: Date.now() });
    this.dirty = false; this.renderChrome();
    const what = TYPE_LABEL[this.docType];
    this.msg('S', `${what} ${this.doc.name} saved`);
    if (this.settings.backend && !noBackend) this.backendSave(this.docType, this.doc.name, text, false);
    return true;
  },
  checkAll() {
    this.flushEditors();
    if (this.doc instanceof SfStyle) { const r = this.checkStyle(this.doc); this.showCheck(r, `Check Style ${this.doc.name}`); return r; }
    const r = Check.run(this.doc); this.showCheck(r, `Check Form ${this.doc.name}`); return r;
  },
  checkStyle(s) {
    const out = [];
    if (!X.val(s.header, 'TDFIRSTPAR')) out.push({ type: 'E', text: 'No standard paragraph defined' });
    else if (!s.para(X.val(s.header, 'TDFIRSTPAR'))) out.push({ type: 'E', text: `Standard paragraph ${X.val(s.header, 'TDFIRSTPAR')} does not exist` });
    if (!X.val(s.header, 'TDFAMILY')) out.push({ type: 'E', text: 'Header data: no font family' });
    for (const p of s.paragraphs()) {
      const c = X.val(p, 'TDPARGRAPH');
      const lf = X.val(p, 'TDLFIRSTPA'); if (lf && !s.para(lf)) out.push({ type: 'E', text: `Paragraph ${c}: outline paragraph ${lf} does not exist` });
      const ls = X.val(p, 'TDLSTRING'); if (ls && !s.str(ls)) out.push({ type: 'E', text: `Paragraph ${c}: character format ${ls} does not exist` });
      const tabs = s.tabstops(c).map(t => toCm(X.val(t, 'TDTABPOS'), X.val(t, 'TDTABPOSU') || 'CM'));
      for (let i = 1; i < tabs.length; i++) if (tabs[i] <= tabs[i - 1]) out.push({ type: 'W', text: `Paragraph ${c}: tab ${i + 1} is not to the right of tab ${i}` });
      if (!X.val(p, 'CAPTION')) out.push({ type: 'W', text: `Paragraph ${c}: no description` });
    }
    return out;
  },
  showCheck(list, title) {
    const errs = list.filter(x => x.type === 'E').length, warns = list.length - errs;
    if (!list.length) { this.msg('S', `${this.doc.name}: no errors found`); return; }
    this.msg(errs ? 'E' : 'W', `${this.doc.name}: ${errs} error(s), ${warns} warning(s)`);
    const body = document.createElement('div'); body.className = 'errlist';
    const t = document.createElement('table'); t.innerHTML = '<thead><tr><th></th><th>Node</th><th>Message</th></tr></thead>';
    const tb = t.createTBody();
    for (const m of list.sort((a, b) => (a.type === 'E' ? 0 : 1) - (b.type === 'E' ? 0 : 1))) {
      const r = tb.insertRow(); const n = m.el && this.doc.node ? this.doc.node(m.el) : null;
      r.insertCell().innerHTML = icon(m.type === 'E' ? 'error' : 'warning');
      r.insertCell().textContent = n ? n.name : (m.nodeName || '');
      r.insertCell().textContent = m.text;
      if (n) { r.classList.add('link'); r.onclick = () => { this.closeModal(); FB.select({ el: n.el }); }; }
    }
    body.appendChild(t);
    this.modal({ title, body, wide: true, buttons: [['Close', null, true]] });
  },
  activate(withCheck) {
    if (!this.doc) return;
    this.flushEditors();
    if (withCheck) {
      const r = this.doc instanceof SfStyle ? this.checkStyle(this.doc) : Check.run(this.doc);
      if (r.some(x => x.type === 'E')) { this.showCheck(r, 'Activation not possible'); return; }
    }
    if (this.mode === 'edit' && this.dirty) this.save(true);
    const e = this.libGet(this.docType, this.doc.name);
    if (e) { e.active = e.text; this.dbPut(e); }
    this.inactive = false; this.renderChrome(); this.rerender();
    this.msg('S', `${TYPE_LABEL[this.docType]} ${this.doc.name} activated`);
    if (this.settings.backend && e) this.backendSave(this.docType, this.doc.name, e.text, true);
  },
  test() {
    if (!this.doc || this.doc instanceof SfStyle) return;
    if (this.dirty) return this.choiceDialog('Test Form', 'Form must be saved before test. Do you want to save?', [['Yes', () => { this.save(); this.test(); }], ['No', () => {}]]);
    if (this.settings.backend) return this.backendTest(this.doc.name);
    this.dialogFm('The function module is generated when the form is activated in SAP. Without an SAP connection, Test shows the call template; use Print Preview for the layout.');
  },
  revert() {
    const e = this.libGet(this.docType, this.doc.name); if (!e) return;
    this.confirmDialog('Return to Active Version', 'Inactive version will be deleted. Do you want to revert to the active version?', () => {
      this.libPut(e.active, { active: e.active, modified: e.modified });
      this.doc.journal.dispose(); this.dirty = false; this.inactive = false; this.openDoc(this.docType, this.doc.name, this.mode);
      this.msg('S', 'Active version restored');
    });
  },

  /* =============== SAP backend (ICF service of ZSMARTFORMS) =============== */
  api(method, path, body) {
    const base = this.settings.backend.replace(/\/$/, '');
    return fetch(base + path, { method, body, credentials: 'include', headers: { 'X-Requested-With': 'ZSMARTFORMS', ...(body ? { 'Content-Type': 'application/xml; charset=utf-8' } : {}) } });
  },
  /* JSON answer of the service; a non-JSON error (ICF error page after a short dump) is
     reduced to its text, e.g. "500 … ERROR: ASSIGN_TYPE_CONFLICT (termination: RABAX_STATE)" */
  async apiJson(r) {
    const raw = await r.text();
    let j = null;
    try { j = JSON.parse(raw); } catch (e) { j = null; }
    if (j && (r.ok || j.message)) return j;
    const txt = raw.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    const dump = /ERROR:\s*([A-Z0-9_]+)(\s*\(termination:[^)]*\))?/i.exec(txt);
    throw new Error(`HTTP ${r.status}${dump ? ` – ${dump[0]} (details in ST22)` : txt ? ` – ${txt.slice(0, 240)}` : ''}`);
  },
  async backendLoad(type, name) {
    const kind = type === 'SS' ? 'style' : 'form';
    const r = await this.api('GET', `/${kind}/${encodeURIComponent(name)}`);
    if (!r.ok) { const j = await this.apiJson(r); throw new Error(j.message || `HTTP ${r.status}`); }
    const text = await r.text();
    return this.libPut(text, { source: 'SAP', modified: false });
  },
  async backendSave(type, name, xml, activate) {
    const kind = type === 'SS' ? 'style' : 'form';
    const q = new URLSearchParams({ transport: this.settings.transport || '', devclass: this.settings.devclass || '', activate: activate ? 'X' : '' });
    try {
      this.msg('I', `Saving ${name} in SAP…`, true);
      const r = await this.api('PUT', `/${kind}/${encodeURIComponent(name)}?${q}`, xml);
      const j = await this.apiJson(r);
      const warn = !j.ok || (activate && !j.active);
      if (j.messages && j.messages.length) this.showCheck(j.messages.map(t => {
        /* "E: node: text" / "W: …" from the SAP check; unprefixed lines are errors unless the object got active */
        const m = /^([EWIAS]): ([\s\S]*)$/.exec(t);
        const type = m ? (m[1] === 'W' || m[1] === 'I' || m[1] === 'S' ? 'W' : 'E') : (j.ok && j.active ? 'W' : 'E');
        let text = m ? m[2] : t, hit = null, nodeName = '';
        const n = /^(%?[A-Z0-9_/]+): ([\s\S]*)$/.exec(text);
        if (n && this.doc && this.doc.all) {
          /* the check names either the node or its output-attribute object (%OUTATTRIBn) */
          hit = this.doc.all.find(x => x.name === n[1]) || this.doc.all.find(x => x.outattr && X.val(x.outattr, 'NAME', 'INAME') === n[1]) || null;
          if (hit) { nodeName = hit.name; text = n[2]; }
        }
        /* field-level check entries carry no text, only the screen field: name the tab instead */
        const f = /(?:^|, )FIELDNAME=([A-Z0-9_]+)/.exec(text);
        if (f && f[1] === 'OUTATTR' && hit && boxLocked(hit) && hasBox(hit)) text = BOX_IN_TABLE;
        else if (f && !/[a-z]/.test(text)) {
          const tab = { OUTATTR: 'Output Options', CONDITIONS: 'Conditions', GENERAL: 'General Attributes' }[f[1]] || f[1];
          text = `${type === 'W' ? 'Warning' : 'Error'} on tab ${tab} (SAP check, field ${f[1]})`;
        }
        if (m && m[1] === 'I') return { type: 'W', text: 'Info: ' + text, el: null, nodeName: '' };
        return { type, text, el: hit ? hit.el : null, nodeName };
      }), j.ok && j.active ? `SAP: ${name} activated – warnings` : j.ok ? `SAP: ${name} saved inactive` : `SAP: ${name} not saved`);
      /* the result line stays in the status bar: "saved and activated" / "saved inactive" */
      this.msg(j.ok ? (warn ? 'W' : 'S') : 'E', (j.message || `${name} saved in SAP`) + (j.ok && j.active && j.messages && j.messages.length ? ` – ${j.messages.length} warning(s)` : ''));
      if (j.ok) { const e = this.libGet(type, name); if (e) { e.modified = false; e.source = 'SAP'; if (j.active) e.active = e.text; this.dbPut(e); } this.renderChrome(); this.remote = null; }
      return !!j.ok;
    } catch (e) { this.msg('E', `Saving ${name} in SAP failed: ${e.message}`); return false; }
  },
  async backendDelete(type, name, quiet) {
    const kind = type === 'SS' ? 'style' : 'form';
    const q = new URLSearchParams({ transport: this.settings.transport || '' });
    try {
      if (!quiet) this.msg('I', `Deleting ${name} in SAP…`, true);
      const r = await this.api('DELETE', `/${kind}/${encodeURIComponent(name)}?${q}`);
      const j = await this.apiJson(r);
      const gone = j.ok || /does not exist/i.test(j.message || '');
      if (gone) { this.libDelete(type, name); if (this.remote) this.remote = this.remote.filter(o => !(o.name === name && (o.type === type || (type !== 'SS' && o.type !== 'SS')))); }
      if (this.screen === 'initial') this.go('initial');
      this.msg(j.ok ? 'S' : gone ? 'W' : 'E', j.ok ? j.message : gone ? `${name} did not exist in SAP – removed from the library` : j.message || `${name} not deleted`);
      return gone;
    } catch (e) { this.msg('E', `Deleting ${name} in SAP failed: ${e.message}`); return false; }
  },
  async backendTest(name) {
    try {
      const r = await this.api('GET', `/form/${encodeURIComponent(name)}/fm`);
      const j = await this.apiJson(r); this.msg('S', `Function module of ${name}: ${j.fm_name}`);
    } catch (e) { this.msg('E', `SAP call failed: ${e.message}`); }
  },

  /* =============== upload / download =============== */
  pickFiles(accept, multiple) {
    return new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple; i.style.display = 'none';
      i.onchange = () => { res([...i.files]); i.remove(); }; document.body.appendChild(i); i.click();
    });
  },
  async readFiles(files) {
    const out = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        if (!window.JSZip) { this.msg('E', 'ZIP support could not be loaded'); continue; }
        const z = await JSZip.loadAsync(f);
        for (const [p, entry] of Object.entries(z.files)) if (!entry.dir && /\.xml$/i.test(p)) out.push({ name: p, text: await entry.async('string') });
      } else out.push({ name: f.name, text: await f.text() });
    }
    return out;
  },
  async upload(files) {
    files = files || await this.pickFiles('.xml,.zip,application/xml,text/xml,application/zip', true);
    if (!files.length) return;
    this.msg('I', 'Reading files…');
    const items = await this.readFiles(files);
    let n = 0, bad = [], changedSkip = [];
    for (const it of items) {
      try {
        const c = this.classify(it.text); if (!c) { bad.push(it.name); continue; }
        parseXml(it.text);
        const prev = this.libGet(c.type, c.name);
        if (prev && prev.modified && prev.text !== it.text) changedSkip.push(c.name);
        this.libPut(it.text, { source: it.name, modified: false });
        n++;
      } catch (e) { bad.push(`${it.name} (${e.message})`); }
    }
    if (this.screen === 'initial') this.go('initial'); else this.renderChrome();
    this.msg(bad.length ? 'W' : 'S', `${n} object(s) loaded into the library${bad.length ? `; skipped: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? ` and ${bad.length - 3} more` : ''}` : ''}${changedSkip.length ? `; local changes replaced for ${changedSkip.join(', ')}` : ''}`);
  },
  async uploadInto() {
    const files = await this.pickFiles('.xml,application/xml,text/xml', false); if (!files.length) return;
    const text = await files[0].text();
    const c = this.classify(text); if (!c) return this.msg('E', 'File is neither a Smart Form nor a Smart Style XML');
    const want = this.doc instanceof SfStyle ? 'SS' : this.doc.isTextModule ? 'TM' : 'SF';
    if (c.type !== want) return this.msg('E', `The file contains a ${TYPE_LABEL[c.type]}, not a ${TYPE_LABEL[want]}`);
    this.confirmDialog('Upload Form', `Uploading of the form overwrites the current ${TYPE_LABEL[want].toLowerCase()} ${this.doc.name}. Continue?`, () => {
      const name = this.doc.name; const doc = parseXml(text);
      if (want !== 'SS') {
        const root = doc.documentElement; const old = X.val(X.kid(root, 'HEADER'), 'FORMNAME');
        X.set(X.kid(root, 'HEADER'), 'FORMNAME', name);
        if (old !== name) for (const el of [...doc.getElementsByTagNameNS(NS_IFR, 'FORMNAME')]) if (el.textContent === old) el.textContent = name;
      } else {
        const h = X.kid(doc.documentElement, 'sf:HEADER'); const old = X.val(h, 'STYLENAME'); X.set(h, 'STYLENAME', name);
        for (const el of [...doc.getElementsByTagNameNS(NS_IFR, 'STYLENAME')]) if (el.textContent === old) el.textContent = name;
      }
      this.doc.journal.dispose();
      const nd = openDocument(serializeXml(doc));
      this.doc = nd; this.dirty = true; this.inactive = true;
      if (nd instanceof SfForm) { FB.open(nd); } else SB.open(nd);
      this.rerender(); this.renderChrome(); this.msg('S', `${files[0].name} uploaded into ${name}. Save to keep it.`);
    });
  },
  fileName(type, name) { return name.toLowerCase().replace(/[\/\\]/g, '_') + (type === 'SS' ? '_style' : '') + '.xml'; },
  async offer(filename, data) {
    const d = this.downloads || (window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null);
    if (d) {
      try { await d.save({ filename, data }); this.msg('S', `${filename} saved`); }
      catch (e) { this.msg(e.code === 'declined' ? 'W' : 'E', e.code === 'declined' ? 'Download cancelled' : `Download failed: ${e.message || e.code}`); }
      return;
    }
    try {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); this.msg('S', `${filename} downloaded`);
    } catch { this.msg('E', 'Downloads are not available in this view'); }
  },
  /* one XML: hosted page may only save .txt (SAP's upload reads the content; pick "All files"), SAP-hosted page saves .xml */
  async offerXml(fileName, xml) {
    const d = this.downloads || (window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null);
    if (d) {
      try { await d.save({ filename: fileName + '.txt', data: xml }); this.msg('S', `${fileName}.txt saved. In SMARTFORMS → Utilities → Upload choose "All files (*.*)".`); }
      catch (e) { this.msg(e.code === 'declined' ? 'W' : 'E', e.code === 'declined' ? 'Download cancelled' : `Download failed: ${e.message || e.code}`); }
      return;
    }
    return this.offer(fileName, new Blob([xml], { type: 'application/xml;charset=utf-8' }));
  },
  async zip(entries, zipName) {
    if (!window.JSZip) return this.msg('E', 'ZIP support could not be loaded');
    const z = new JSZip(); for (const [n, t] of entries) z.file(n, t);
    const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return this.offer(zipName, blob);
  },
  async download() {
    this.flushEditors();
    if (this.doc) {
      const text = this.doc.serialize();
      const type = this.doc instanceof SfStyle ? 'SS' : this.doc.isTextModule ? 'TM' : 'SF';
      return this.offerXml(this.fileName(type, this.doc.name), text);
    }
    const t = this.init.type, name = (this.init[t] || '').toUpperCase();
    const e = this.libGet(t, name); if (!e) return this.msg('E', `Enter the name of an existing ${TYPE_LABEL[t].toLowerCase()}`);
    return this.offerXml(this.fileName(t, e.name), e.text);
  },
  async downloadSubtree() {
    const n = FB.selNode(); if (!n) return this.msg('W', 'Select a node');
    const xml = XML_DECL + new XMLSerializer().serializeToString(n.el).replace(/>([^<]+)</g, (m, t) => '>' + t.replace(/'/g, '&apos;').replace(/"/g, '&quot;') + '<');
    return this.offerXml(`${this.doc.name.toLowerCase()}_${n.name.toLowerCase().replace(/%/g, '')}.xml`, xml);
  },
  async downloadChanged() {
    const ch = [...this.lib.values()].filter(e => e.modified);
    if (!ch.length) return this.msg('W', 'No changed objects in the library');
    return this.zip(ch.map(e => [(e.type === 'SS' ? 'styles/' : e.type === 'TM' ? 'textmodules/' : 'forms/') + this.fileName(e.type, e.name), e.text]), 'zsmartforms_changed.zip');
  },

  /* =============== initial screen =============== */
  initFcode(fc) {
    const st = this.init;
    if (fc.startsWith('RB_')) { st.type = { RB_SF: 'SF', RB_ST: 'SS', RB_TX: 'TM' }[fc]; this.saveInit(); return this.go('initial'); }
    const t = st.type, name = (st[t] || '').trim().toUpperCase();
    if (!name) return this.msg('E', `Enter a ${TYPE_LABEL[t].toLowerCase()} name`);
    if (fc === 'DISPLAY' || fc === 'CHANGE') return this.openDoc(t, name, fc === 'CHANGE' ? 'edit' : 'show');
    if (fc === 'CREATE') {
      if (this.libGet(t, name)) return this.msg('E', `${TYPE_LABEL[t]} ${name} already exists`);
      if (!/^[YZ][A-Z0-9_\/]*$/.test(name)) return this.msg('E', `${name}: names in the customer namespace start with Y or Z`);
      this.libPut(this.template(t, name), { modified: true, active: '' });
      return this.openDoc(t, name, 'edit');
    }
    if (fc === 'DELETE') {
      const local = this.libGet(t, name);
      if (!this.settings.backend) {
        if (!local) return this.msg('E', `${TYPE_LABEL[t]} ${name} does not exist`);
        return this.confirmDialog('Delete Form or Text', `Delete ${TYPE_LABEL[t].toLowerCase()} ${name} from the library?`, () => { this.libDelete(t, name); this.go('initial'); this.msg('S', `${name} deleted`); });
      }
      /* connected: delete like SMARTFORMS does — in SAP, then in the library */
      return this.confirmDialog(t === 'SS' ? 'Delete Style' : 'Delete Form or Text', `Do you really want to delete ${TYPE_LABEL[t].toLowerCase()} ${name} in SAP?`, () => this.backendDelete(t, name));
    }
    if (fc === 'COPY' || fc === 'RENAME') {
      const e = this.libGet(t, name); if (!e) return this.msg('E', `${TYPE_LABEL[t]} ${name} does not exist`);
      const stt = { from: name, to: '' };
      this.screenDialog(fc === 'COPY' ? `Copy ${TYPE_LABEL[t]}` : `Rename ${TYPE_LABEL[t]}`, 'SAPLSTXB:3010', { f: { 'SSFSCREEN-FNAME': { get: () => stt.from }, 'SSFSCREEN-FNAME_NEW': { get: () => stt.to, set: v => { stt.to = v.toUpperCase(); } } }, ro: el => el.n === 'SSFSCREEN-FNAME' }, () => {
        const to = stt.to.trim(); if (!to) return this.msg('E', 'Enter a target name');
        if (this.libGet(t, to)) return this.msg('E', `Target ${TYPE_LABEL[t].toLowerCase()} ${to} already exists`);
        const doc = parseXml(e.text);
        const fld = t === 'SS' ? 'STYLENAME' : 'FORMNAME';
        for (const el of [...doc.getElementsByTagNameNS(NS_IFR, fld)]) if (el.textContent === name) el.textContent = to;
        const xml = serializeXml(doc);
        this.libPut(xml, { modified: true, active: '' });
        if (fc === 'RENAME') this.libDelete(t, name);
        st[t] = to; this.saveInit(); this.go('initial'); this.msg('S', `${name} ${fc === 'COPY' ? 'copied to' : 'renamed to'} ${to}`);
        /* connected: the copy is created in SAP (inactive, like SMARTFORMS), a rename removes the old object there */
        if (this.settings.backend) (async () => {
          const ok = await this.backendSave(t, to, xml, false);
          if (ok && fc === 'RENAME') await this.backendDelete(t, name, true);
        })();
      }, { local: true });
    }
  },
  template(type, name) {
    const today = new Date().toISOString().slice(0, 10), time = new Date().toTimeString().slice(0, 8);
    const hdr = `<FIRSTUSER>ZSMARTFORMS</FIRSTUSER><FIRSTDATE>${today}</FIRSTDATE><FIRSTTIME>${time}</FIRSTTIME><LASTUSER>ZSMARTFORMS</LASTUSER><LASTDATE>${today}</LASTDATE><LASTTIME>${time}</LASTTIME>`;
    if (type === 'SS') return `${XML_DECL}<sf:SMARTSTYLE xmlns:sf="${NS_ST}" xmlns="${NS_IFR}" sf:language="EN"><sf:HEADER><STYLENAME>${name}</STYLENAME><MASTERLANG>E</MASTERLANG><VERSION>00001</VERSION>${hdr}<LANGU>E</LANGU><CAPTION>Style ${name}</CAPTION><V_CAPTION>Style ${name}</V_CAPTION><CPI>10.00</CPI><LPI>6.00</LPI><TDTABDIST>1.00</TDTABDIST><TDTABDISTU>CM</TDTABDISTU><ACTIVE>A</ACTIVE><TDFAMILY>HELVE</TDFAMILY><TDHEIGHT>100</TDHEIGHT><TDULPOS>0.00</TDULPOS><TDULTHICK>0.00</TDULTHICK><TDULGREY>000</TDULGREY><RED>000</RED><GREEN>000</GREEN><BLUE>000</BLUE><TRANS>000</TRANS></sf:HEADER></sf:SMARTSTYLE>`;
    if (type === 'TM') return `${XML_DECL}<sf:SMARTFORM xmlns:sf="${NS_SF}" xmlns="${NS_IFR}" sf:language="EN"><HEADER><FORMNAME>${name}</FORMNAME><CAPTION>${name}</CAPTION><FORMTYPE>T</FORMTYPE><MASTERLANG>E</MASTERLANG><LANGVECTOR>*</LANGVECTOR><VERSION>00001</VERSION>${hdr}</HEADER><sf:VARHEADER><sf:item><PAGEFORMAT>DINA4</PAGEFORMAT><STDSTYLE>SYSTEM</STDSTYLE><sf:PAGETREE><sf:NODE><NODETYPE>TI</NODETYPE><sf:OBJ><sf:TEXT><NAME><INAME>%TEXT1</INAME></NAME><CAPTION>${name}</CAPTION><TEXT><item><TDFORMAT>*</TDFORMAT></item></TEXT><STYLE_NAME>SYSTEM</STYLE_NAME><T_CAPTION><item><LANGU>E</LANGU><FORMNAME>${name}</FORMNAME><OBJTYPE>TI</OBJTYPE><INAME>%TEXT1</INAME><CAPTION>${name}</CAPTION></item></T_CAPTION><T_TEXT><item><SPRAS>E</SPRAS><TXTYPE>F</TXTYPE><FORMNAME>${name}</FORMNAME><INAME>%TEXT1</INAME><LINENR>000001</LINENR><TDFORMAT>*</TDFORMAT></item></T_TEXT></sf:TEXT></sf:OBJ></sf:NODE></sf:PAGETREE></sf:item></sf:VARHEADER></sf:SMARTFORM>`;
    const skel = `${XML_DECL}<sf:SMARTFORM xmlns:sf="${NS_SF}" xmlns="${NS_IFR}" sf:language="EN"><HEADER><FORMNAME>${name}</FORMNAME><CAPTION>${name}</CAPTION><MASTERLANG>E</MASTERLANG><LANGVECTOR>*</LANGVECTOR><VERSION>00001</VERSION>${hdr}</HEADER><INTERFACE>${STD_ITF}</INTERFACE><sf:VARHEADER><sf:item><PAGEFORMAT>DINA4</PAGEFORMAT><CPI>10.00</CPI><LPI>6.00</LPI><STDSTYLE>SYSTEM</STDSTYLE><sf:PAGETREE><sf:NODE><NODETYPE>RP</NODETYPE><sf:SUCC/></sf:NODE></sf:PAGETREE></sf:item></sf:VARHEADER></sf:SMARTFORM>`;
    const f = new SfForm(parseXml(skel)); f.journal.dispose();
    const pg = f.createNode('PA', f.rp); f.insertNodeEl(pg, f.rp); f.rebuild();
    const page = f.pages[0];
    const w = f.createNode('WI', page, { wtype: 'M' }); f.insertNodeEl(w, page);
    const wo = X.path(w, 'sf:OBJ').firstElementChild; f.rename(wo, 'MAIN'); f.setCaption(wo, 'Main Window');
    const oa = X.path(w, 'sf:OUTATTR', 'sf:OUTATTR'); X.set(oa, 'WLEFT', '2.00'); X.set(oa, 'WTOP', '2.00'); X.set(oa, 'WWIDTH', '17.00'); X.set(oa, 'WHEIGHT', '25.00');
    return f.serialize();
  },
  renderInitial(main) {
    const st = this.init;
    const wrap = document.createElement('div'); wrap.className = 'initial';
    const left = document.createElement('div'); left.className = 'init-left pane';
    const b = {
      f: {
        RB_SF: { get: () => st.type === 'SF', set: () => { st.type = 'SF'; this.saveInit(); this.go('initial'); } },
        RB_ST: { get: () => st.type === 'SS', set: () => { st.type = 'SS'; this.saveInit(); this.go('initial'); } },
        RB_TX: { get: () => st.type === 'TM', set: () => { st.type = 'TM'; this.saveInit(); this.go('initial'); } },
        'SSFSCREEN-FNAME': { get: () => st.SF, set: v => { st.SF = v.toUpperCase(); this.saveInit(); }, f4: inp => this.f4(inp, 'SF') },
        'SSFSCREENS-SNAME': { get: () => st.SS, set: v => { st.SS = v.toUpperCase(); this.saveInit(); }, f4: inp => this.f4(inp, 'SS') },
        'SSFSCREEN-TNAME': { get: () => st.TM, set: v => { st.TM = v.toUpperCase(); this.saveInit(); }, f4: inp => this.f4(inp, 'TM') },
        SF_HOMEPAGE: { get: () => 'Smart Forms web editor · XML round-trip to SAP' },
      },
      fc: { DISPLAY: () => this.initFcode('DISPLAY'), CHANGE: () => this.initFcode('CHANGE'), CREATE: () => this.initFcode('CREATE') },
      ro: el => ({ 'SSFSCREEN-FNAME': st.type !== 'SF', 'SSFSCREENS-SNAME': st.type !== 'SS', 'SSFSCREEN-TNAME': st.type !== 'TM' })[el.n] || false,
      vis: el => el.n === 'SF_HOMEPAGE' ? false : undefined,
    };
    const env = { edit: true, pai: (l, fn) => { try { fn(); } catch (e) { this.msg('E', e.message); } }, rerender: () => this.go('initial'), sel: () => new Set(), msg: (t, x) => this.msg(t, x), renderScreen: () => document.createElement('div') };
    const scr = Dynpro.render('SAPMSSFO:0100', b, env, { fit: { w: 60, h: 7 } });
    scr.classList.add('init-scr');
    left.appendChild(scr);
    for (const inp of scr.querySelectorAll('input[type=text]')) {
      inp.addEventListener('input', () => { const k = { 'SSFSCREEN-FNAME': 'SF', 'SSFSCREENS-SNAME': 'SS', 'SSFSCREEN-TNAME': 'TM' }[inp.name]; if (k) { st[k] = inp.value.toUpperCase(); this.saveInit(); } });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.initFcode(e.ctrlKey ? 'CHANGE' : 'DISPLAY'); } });
    }
    const note = document.createElement('div'); note.className = 'init-note';
    note.innerHTML = `<p><b>${this.lib.size}</b> objects in this browser's library. Upload the ZIP from <code>ZSF_EXPORT_ALL</code> or single XML files exported with SMARTFORMS → Utilities → Download.</p><p>Changed objects are downloaded as ZIP and uploaded into SAP with SMARTFORMS → Utilities → Upload${this.settings.backend ? ' or saved directly through the connected SAP service' : ''}.</p>`;
    left.appendChild(note);
    const drop = document.createElement('div'); drop.className = 'dropzone'; drop.innerHTML = `${icon('upload')}<span>Drop XML or ZIP files here</span>`;
    drop.onclick = () => this.upload();
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); this.upload([...e.dataTransfer.files]); };
    left.appendChild(drop);
    wrap.appendChild(left);
    wrap.appendChild(this.libraryPanel());
    main.appendChild(wrap);
  },
  libraryPanel() {
    const st = this.init;
    const box = document.createElement('div'); box.className = 'lib pane';
    const all = [...this.lib.values()];
    const counts = { ALL: all.length, SF: all.filter(e => e.type === 'SF').length, SS: all.filter(e => e.type === 'SS').length, TM: all.filter(e => e.type === 'TM').length, MOD: all.filter(e => e.modified).length };
    const head = document.createElement('div'); head.className = 'lib-head';
    head.innerHTML = `<div class="pane-title">${icon('library')} Object Library</div>`;
    const tabs = document.createElement('div'); tabs.className = 'seg';
    const segs = [['ALL', 'All'], ['SF', 'Forms'], ['SS', 'Styles'], ['TM', 'Text Modules'], ['MOD', 'Changed']];
    if (this.settings.backend) { segs.push(['SAP', 'In SAP']); counts.SAP = this.remote ? this.remote.length : '…'; }
    for (const [k, l] of segs) {
      const b = document.createElement('button'); b.type = 'button'; b.className = st.libType === k ? 'on' : ''; b.innerHTML = `${l} <span class="cnt">${counts[k]}</span>`;
      b.onclick = () => { st.libType = k; this.saveInit(); this.go('initial'); }; tabs.appendChild(b);
    }
    const flt = document.createElement('input'); flt.type = 'search'; flt.id = 'lib-filter'; flt.placeholder = 'Filter by name or description'; flt.value = st.filter || ''; flt.className = 'lib-filter';
    head.append(tabs, flt); box.appendChild(head);
    const tw = document.createElement('div'); tw.className = 'lib-scroll';
    const t = document.createElement('table'); t.className = 'lib-table';
    t.innerHTML = '<thead><tr><th>Type</th><th>Name</th><th>Description</th><th>Status</th></tr></thead>';
    const tb = t.createTBody();
    const draw = () => {
      tb.innerHTML = '';
      const q = (st.filter || '').toUpperCase();
      const src = st.libType === 'SAP' ? (this.remote || []).map(o => ({ type: o.type, name: o.name, caption: o.caption, remote: true, devclass: o.devclass, text: null })) : all;
      const rows = src.filter(e => (st.libType === 'ALL' || st.libType === 'SAP' || (st.libType === 'MOD' ? e.modified : e.type === st.libType)) && (!q || e.name.includes(q) || (e.caption || '').toUpperCase().includes(q))).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
      for (const e of rows.slice(0, 600)) {
        const r = tb.insertRow(); r.tabIndex = 0;
        if (st[e.type] === e.name && st.type === e.type) r.classList.add('sel');
        r.insertCell().innerHTML = `${icon(e.type === 'SS' ? 'style' : e.type === 'TM' ? 'text' : 'page')}<span class="typ">${TYPE_LABEL[e.type]}</span>`;
        r.insertCell().innerHTML = `<b>${esc(e.name)}</b>`;
        r.insertCell().textContent = e.caption || '';
        r.insertCell().innerHTML = e.remote ? `<span class="pill ex">${esc(e.devclass || 'SAP')}</span>` : e.modified ? `<span class="pill mod">changed</span>` : e.source === 'example' ? `<span class="pill ex">example</span>` : e.source === 'SAP' ? `<span class="pill ex">SAP</span>` : '';
        const pick = () => { st.type = e.type; st[e.type] = e.name; this.saveInit(); };
        r.onclick = () => { pick(); this.go('initial'); };
        r.ondblclick = () => { pick(); this.openDoc(e.type, e.name, 'show'); };
        r.onkeydown = ev => { if (ev.key === 'Enter') { pick(); this.openDoc(e.type, e.name, ev.ctrlKey ? 'edit' : 'show'); } };
        r.oncontextmenu = ev => { ev.preventDefault(); pick(); this.contextMenu(ev.clientX, ev.clientY, [
          { label: 'Display', icon: 'display', fn: () => this.openDoc(e.type, e.name, 'show') }, { label: 'Change', icon: 'change', fn: () => this.openDoc(e.type, e.name, 'edit') }, '-',
          { label: 'Download', icon: 'download', hidden: e.remote, fn: () => this.offerXml(this.fileName(e.type, e.name), e.text) },
          { label: 'Copy…', icon: 'copy', hidden: e.remote, fn: () => this.initFcode('COPY') }, { label: 'Rename…', icon: 'rename', hidden: e.remote, fn: () => this.initFcode('RENAME') }, { label: this.settings.backend ? 'Delete in SAP…' : 'Delete from library', icon: 'delete', hidden: e.remote && !this.settings.backend, fn: () => this.initFcode('DELETE') },
          { label: 'Remove from library only', icon: 'delete', hidden: !this.settings.backend || e.remote, fn: () => { this.libDelete(e.type, e.name); this.go('initial'); this.msg('S', `${e.name} removed from the library (still in SAP)`); } }]); };
      }
      if (!rows.length) { const r = tb.insertRow(); const c = r.insertCell(); c.colSpan = 4; c.className = 'empty'; c.textContent = all.length ? 'No object matches the filter' : 'The library is empty. Upload the export ZIP to start.'; }
      if (rows.length > 600) { const r = tb.insertRow(); const c = r.insertCell(); c.colSpan = 4; c.className = 'empty'; c.textContent = `${rows.length - 600} more – refine the filter`; }
    };
    flt.oninput = () => { st.filter = flt.value; draw(); };
    if (st.libType === 'SAP' && this.settings.backend) {
      flt.placeholder = 'Search in SAP, e.g. ZHR* — Enter';
      flt.onkeydown = ev => { if (ev.key === 'Enter') { this.remote = null; this.loadRemote(flt.value); } };
      if (!this.remote && !this.remoteLoading) this.loadRemote(st.filter);
    }
    draw();
    tw.appendChild(t); box.appendChild(tw);
    return box;
  },
  async remoteList(type, search) {
    const q = new URLSearchParams({ type: type || '', search: search || '' });
    const r = await this.api('GET', `/list?${q}`);
    return this.apiJson(r);
  },
  async f4(inp, type) {
    let list = [...this.lib.values()].filter(e => e.type === type).map(e => [e.name, e.caption]);
    if (this.settings.backend) {
      try {
        const remote = await this.remoteList(type, inp.value || '');
        const have = new Set(list.map(x => x[0]));
        for (const o of remote) if (!have.has(o.name)) list.push([o.name, `${o.caption || ''}${o.devclass ? '  · ' + o.devclass : ''}`]);
      } catch (e) { this.msg('W', `SAP list not available: ${e.message}`); }
    }
    list.sort((a, b) => a[0].localeCompare(b[0]));
    this.popupList(inp, `${TYPE_LABEL[type]} (${list.length})`, list, inp.value.toUpperCase(), v => { this.init[type] = v; this.init.type = type; this.saveInit(); this.go('initial'); }, { filter: true });
  },

  async loadRemote(search) {
    this.remoteLoading = true;
    try { this.remote = await this.remoteList('', (search || '').includes('*') ? search : (search ? search + '*' : '')); }
    catch (e) { this.remote = []; this.msg('E', `SAP list: ${e.message}`); }
    this.remoteLoading = false;
    if (this.screen === 'initial') this.go('initial');
  },

  /* =============== preview =============== */
  renderPreview(main) {
    const d = document.createElement('div'); d.className = 'preview pane';
    const n = document.createElement('div'); n.className = 'pv-note'; n.innerHTML = `${icon('info')}<span>Layout preview of all pages with static content. Fields are shown as <code>&amp;FIELD&amp;</code>; loops, conditions and page breaks need the runtime in SAP (Test, F8).</span>`;
    d.appendChild(n);
    try { d.appendChild(Preview.render(this.doc)); } catch (e) { console.error(e); d.appendChild(document.createTextNode(e.message)); }
    main.appendChild(d);
  },

  /* =============== keyboard =============== */
  bindKeys() {
    document.addEventListener('keydown', e => {
      if (document.querySelector('.modal-back')) { if (e.key === 'Escape' || e.key === 'F12') { e.preventDefault(); this.closeModal(); } return; }
      const inInput = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      const k = (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + e.key;
      const map = { 'F3': 'BACK', 'Shift+F3': 'EXIT', 'F12': 'CANC', 'Ctrl+s': 'SAVE', 'Ctrl+S': 'SAVE', 'Ctrl+F1': 'SWIT', 'Ctrl+F2': 'CHECKALL', 'Ctrl+F3': 'ACTIVATE', 'F8': 'TEST', 'F9': 'FPTOGGLE', 'Ctrl+F4': 'HLS_OPEN', 'F5': this.screen === 'initial' ? 'CREATE' : 'NODECREATE', 'F6': 'CHANGE', 'F7': 'DISPLAY', 'Shift+F2': 'NODEDELETE', 'Ctrl+Shift+F8': 'PREVIEW', 'Shift+F5': 'OTHER' };
      if (!inInput) { map['Ctrl+z'] = 'UNDO'; map['Ctrl+y'] = 'REDO'; map['Ctrl+Shift+Z'] = 'REDO'; }
      let fc = map[k];
      if (!fc) return;
      if (this.screen === 'initial' && !['CREATE', 'CHANGE', 'DISPLAY', 'EXIT'].includes(fc)) return;
      if (this.screen !== 'initial' && ['CHANGE', 'DISPLAY'].includes(fc)) return;
      if (this.screen === 'style' && ['NODECREATE', 'NODEDELETE', 'TEST', 'FPTOGGLE', 'HLS_OPEN', 'PREVIEW'].includes(fc)) return;
      e.preventDefault();
      if (inInput && e.target.dispatchEvent) e.target.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => this.fcode(fc), 0);
    });
    const cmd = document.getElementById('okcode');
    cmd.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const v = cmd.value.trim().toUpperCase(); cmd.value = '';
      if (!v) return this.fcode('ENTER');
      if (v === '/N' || v === '/NSMARTFORMS' || v === 'SMARTFORMS' || v === 'ZSMARTFORMS') { if (this.screen !== 'initial') return this.leave('BACK'); return; }
      if (v === 'SMARTSTYLES' || v === '/NSMARTSTYLES') { this.init.type = 'SS'; return this.screen === 'initial' ? this.go('initial') : this.leave('BACK'); }
      const known = ['SAVE', 'BACK', 'EXIT', 'CANC', 'SWIT', 'CHECKALL', 'ACTIVATE', 'TEST', 'PREVIEW', 'UNDO', 'REDO', 'SETTINGS', 'DOWNLOAD', 'UPLOAD', 'INFO', 'FMNAME'];
      if (known.includes(v)) return this.fcode(v);
      this.msg('E', `Function code ${v} is not supported`);
    });
    document.querySelectorAll('#sysbtns [data-fc]').forEach(b => b.onclick = () => this.fcode(b.dataset.fc));
    document.addEventListener('focusin', e => { if (e.target.matches('.te textarea, .te input.te-ln')) this.lastText = e.target; });
    window.addEventListener('beforeunload', e => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } });
  },
  splitters() {
    for (const sp of document.querySelectorAll('.fb-split')) {
      sp.onmousedown = e => {
        e.preventDefault();
        const prev = sp.previousElementSibling, next = sp.nextElementSibling; const x0 = e.clientX;
        const right = sp.dataset.for === 'right';
        const target = right ? next : prev; const w0 = target.getBoundingClientRect().width;
        const mv = ev => { const d = ev.clientX - x0; target.style.flexBasis = Math.max(180, w0 + (right ? -d : d)) + 'px'; };
        const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); if (this.screen === 'form' && right) FB.render(); };
        document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      };
    }
  },

  /* =============== popups / dialogs =============== */
  contextMenu(x, y, items, opt = {}) {
    this.closeMenus();
    const mk = (list, px, py, level) => {
      const m = document.createElement('div'); m.className = 'ctx'; m.setAttribute('role', 'menu'); m.dataset.level = level;
      const vis = list.filter(i => i === '-' || !i.hidden);
      vis.forEach((it, idx) => {
        if (it === '-') { if (idx > 0 && idx < vis.length - 1 && vis[idx - 1] !== '-') { const s = document.createElement('div'); s.className = 'ctx-sep'; m.appendChild(s); } return; }
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ctx-item'; b.setAttribute('role', 'menuitem'); b.disabled = !!it.disabled;
        b.innerHTML = `<span class="ci">${it.icon ? icon(it.icon) : ''}</span><span class="cl">${esc(it.label)}</span><span class="ck">${it.sub ? '▸' : esc(it.key || '')}</span>`;
        if (it.sub) {
          const open = () => { for (const o of document.querySelectorAll('.ctx')) if (+o.dataset.level > level) o.remove(); const r = b.getBoundingClientRect(); mk(it.sub, r.right - 2, r.top - 4, level + 1); };
          b.onmouseenter = open; b.onclick = open;
        } else {
          b.onmouseenter = () => { for (const o of document.querySelectorAll('.ctx')) if (+o.dataset.level > level) o.remove(); };
          b.onclick = () => { this.closeMenus(); it.fn && it.fn(); };
        }
        m.appendChild(b);
      });
      document.body.appendChild(m);
      const r = m.getBoundingClientRect();
      m.style.left = Math.max(4, Math.min(px, innerWidth - r.width - 4)) + 'px';
      m.style.top = Math.max(4, Math.min(py, innerHeight - r.height - 4)) + 'px';
      m.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
      m.addEventListener('keydown', e => {
        const bs = [...m.querySelectorAll('button:not(:disabled)')]; const i = bs.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length]?.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length]?.focus(); }
        if (e.key === 'Escape') { e.preventDefault(); this.closeMenus(); }
        if (e.key === 'ArrowRight') document.activeElement.onmouseenter?.();
      });
      return m;
    };
    mk(items, x, y, 0);
    setTimeout(() => { const off = e => { if (!e.target.closest('.ctx')) { this.closeMenus(); document.removeEventListener('mousedown', off, true); } }; document.addEventListener('mousedown', off, true); }, 0);
  },
  closeMenus() { document.querySelectorAll('.ctx, .popup-list').forEach(m => m.remove()); },
  popupList(anchor, title, list, cur, cb, opt = {}) {
    this.closeMenus();
    const p = document.createElement('div'); p.className = 'popup-list';
    p.innerHTML = `<div class="pl-title">${esc(title)}</div>`;
    let f = null;
    if (opt.filter || list.length > 12) { f = document.createElement('input'); f.type = 'search'; f.placeholder = 'Filter'; f.className = 'pl-filter'; p.appendChild(f); }
    const ul = document.createElement('div'); ul.className = 'pl-items'; p.appendChild(ul);
    const draw = () => {
      ul.innerHTML = ''; const q = (f?.value || '').toUpperCase();
      for (const [k, t] of list.filter(([k, t]) => !q || String(k).toUpperCase().includes(q) || String(t || '').toUpperCase().includes(q)).slice(0, 400)) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pl-item' + (k === cur ? ' on' : '');
        b.innerHTML = `<b>${esc(k || '(none)')}</b><span>${esc(t && t !== k ? t : '')}</span>`;
        b.onclick = () => { p.remove(); cb(k); }; ul.appendChild(b);
      }
    };
    draw(); if (f) f.oninput = draw;
    document.body.appendChild(p);
    const r = (anchor?.getBoundingClientRect?.() || { left: innerWidth / 2, bottom: innerHeight / 3 }); const pr = p.getBoundingClientRect();
    p.style.left = Math.max(4, Math.min(r.left, innerWidth - pr.width - 4)) + 'px';
    p.style.top = Math.max(4, Math.min(r.bottom + 2, innerHeight - pr.height - 4)) + 'px';
    (f || ul.querySelector('.on') || ul.firstChild)?.focus();
    p.addEventListener('keydown', e => { if (e.key === 'Escape') p.remove(); if (e.key === 'Enter' && e.target === f) ul.firstChild?.click(); });
    setTimeout(() => { const off = e => { if (!e.target.closest('.popup-list')) { p.remove(); document.removeEventListener('mousedown', off, true); } }; document.addEventListener('mousedown', off, true); }, 0);
  },
  modal({ title, body, buttons = [], wide = false, onKeyEnter = null }) {
    this.closeModal(); this.closeMenus();
    const back = document.createElement('div'); back.className = 'modal-back';
    const m = document.createElement('div'); m.className = 'modal' + (wide ? ' wide' : ''); m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', title);
    m.innerHTML = `<div class="modal-title"><span>${esc(title)}</span><button type="button" class="tb-btn small mx" title="Close (Esc)">${icon('cancel')}</button></div>`;
    const bd = document.createElement('div'); bd.className = 'modal-body'; bd.appendChild(body); m.appendChild(bd);
    const ft = document.createElement('div'); ft.className = 'modal-foot';
    let first = null;
    for (const [label, fn, primary, ic] of buttons) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (primary ? ' primary' : '');
      b.innerHTML = (ic ? icon(ic) : primary ? icon('enter') : icon('cancel')) + `<span>${esc(label)}</span>`;
      b.onclick = () => { this.flushDialogInputs(m); if (fn) { const keep = fn(); if (keep === false) return; } this.closeModal(); };
      ft.appendChild(b); if (primary && !first) first = b;
    }
    m.appendChild(ft);
    m.querySelector('.mx').onclick = () => this.closeModal();
    back.appendChild(m); document.body.appendChild(back);
    m.addEventListener('keydown', e => { if (e.key === 'Enter' && !/TEXTAREA|BUTTON/.test(e.target.tagName) && first) { e.preventDefault(); e.target.dispatchEvent(new Event('change', { bubbles: true })); first.click(); } });
    setTimeout(() => (m.querySelector('input:not([readonly]):not([type=checkbox]):not([type=radio]), select, textarea') || first)?.focus(), 0);
    return m;
  },
  flushDialogInputs(m) { const a = document.activeElement; if (a && m.contains(a) && /INPUT|SELECT/.test(a.tagName)) a.dispatchEvent(new Event('change', { bubbles: true })); },
  closeModal() { document.querySelectorAll('.modal-back').forEach(m => m.remove()); },
  confirmDialog(title, text, onYes, onNo) {
    const p = document.createElement('p'); p.className = 'confirm-text'; p.textContent = text;
    this.modal({ title, body: p, buttons: [['Yes', () => { onYes(); }, true, 'enter'], ['No', () => { onNo && onNo(); }, false, 'cancel']] });
  },
  choiceDialog(title, text, choices) {
    const p = document.createElement('p'); p.className = 'confirm-text'; p.textContent = text;
    this.modal({ title, body: p, buttons: [...choices.map(([l, f], i) => [l, f, i === 0, i === 0 ? 'enter' : 'reset']), ['Cancel', null, false, 'cancel']] });
  },
  needConfirm(key, title, text) { if (this.confirmed.has(key)) { this.confirmed.delete(key); return; } const e = new Error(text); e.confirm = { key, title, text }; throw e; },
  askConfirm(c, retry) { this.confirmDialog(c.title, c.text, () => { this.confirmed.add(c.key); retry(); }, () => { this.rerender(); this.msg('I', 'Not changed'); }); },
  promptText(title, label, initial, cb) {
    const d = document.createElement('div'); d.className = 'prompt';
    d.innerHTML = `<label>${esc(label)}<input type="text" id="prompt-in" class="dyn-field" value="${esc(initial || '')}"></label>`;
    this.modal({ title, body: d, buttons: [['Continue', () => cb(d.querySelector('input').value), true]] });
  },
  /* dialog that shows a dynpro; local = bindings act on local state (no undo journal) */
  screenDialog(title, key, binding, onOk, opt = {}) {
    const holder = document.createElement('div'); holder.className = 'dlg-scr';
    const env = {
      edit: opt.edit ?? (opt.local ? true : this.mode === 'edit'),
      pai: (l, fn) => { if (opt.local) { try { fn(); } catch (e) { this.msg('E', e.message); } draw(); } else { const b = this.builder(); b.pai(l, fn); setTimeout(draw, 0); } },
      rerender: () => setTimeout(draw, 0), sel: tc => (holder._sel ||= new Map()).get(tc) || (holder._sel.set(tc, new Set()), holder._sel.get(tc)), msg: (t, x) => this.msg(t, x),
      renderScreen: (k, fit, b) => Dynpro.render(k, b || {}, env, { fit }),
    };
    const draw = () => { const keep = this.captureFocus(holder); holder.innerHTML = ''; const b = typeof binding === 'function' ? binding() : binding; holder.appendChild(Dynpro.render(key, b, env, { fit: opt.fit })); this.restoreFocus(holder, keep); };
    draw();
    this.modal({ title, body: holder, wide: opt.wide, buttons: onOk ? [['Continue', () => onOk(), true], ['Cancel', null]] : [['Close', null, true]] });
  },
  promptScreen(title, key, roVals, inputField, cb, initial = '', values = null) {
    const st = { v: initial };
    const f = {}; for (const [k, v] of Object.entries(roVals)) f[k] = { get: () => v };
    f[inputField] = { get: () => st.v, set: v => { st.v = v; }, values: values ? () => values : undefined };
    this.screenDialog(title, key, { f, ro: el => el.n !== inputField }, () => { const v = String(st.v || '').trim(); if (!v) { this.msg('E', 'Make an entry in all required fields'); return false; } cb(v); }, { local: true });
  },
  dialogField(fields, cb) {
    const d = document.createElement('div'); d.className = 'prompt';
    d.innerHTML = `<label>Field name<input type="text" id="field-in" class="dyn-field" placeholder="e.g. GS_HEADER-VBELN" spellcheck="false"></label><div class="pl-items fl-pick"></div>`;
    const inp = d.querySelector('input'), list = d.querySelector('.pl-items');
    const draw = () => { list.innerHTML = ''; const q = inp.value.toUpperCase(); for (const [k, t] of fields.filter(([k]) => !q || k.toUpperCase().includes(q)).slice(0, 200)) { const b = document.createElement('button'); b.type = 'button'; b.className = 'pl-item'; b.innerHTML = `<b>${esc(k)}</b><span>${esc(t)}</span>`; b.onclick = () => { inp.value = k + (/^SFSY-/.test(k) ? '' : ''); inp.focus(); }; b.ondblclick = () => { this.closeModal(); cb(k); }; list.appendChild(b); } };
    inp.oninput = draw; draw();
    this.modal({ title: 'Insert Field', body: d, buttons: [['Continue', () => cb(inp.value.trim().toUpperCase()), true]] });
  },
  dialog1014(node, env) {
    this.screenDialog('Box and Shading', 'SAPLSTXB:1014', () => bind1014(FB.ctx(), node), null, { edit: this.mode === 'edit' });
  },
  dialogLanguages(ctx, env) {
    const h = ctx.form.header; const master = X.val(h, 'MASTERLANG');
    const cur = X.val(h, 'LANGVECTOR'); const set = new Set(cur === '*' ? [] : [...cur]);
    const langs = ['E', 'D', '뢚', 'R', 'T', 'F', 'S', 'I', 'P', 'K', '1', 'J', 'N', 'L', 'U'];
    const d = document.createElement('div'); d.className = 'lang-grid';
    for (const k of langs) { const l = document.createElement('label'); l.className = 'dyn-check static'; l.innerHTML = `<input type="checkbox" ${set.has(k) || k === master ? 'checked' : ''} ${k === master ? 'disabled' : ''} data-k="${esc(k)}"> ${esc(LANG.iso(k))}${k === master ? ' (original language)' : ''}`; d.appendChild(l); }
    this.modal({ title: 'Translate to Languages', body: d, buttons: [['Continue', () => { const v = master + [...d.querySelectorAll('input:checked')].map(i => i.dataset.k).filter(k => k !== master).join(''); FB.pai('Languages', () => X.set(h, 'LANGVECTOR', v)); }, true], ['Cancel', null]] });
  },
  dialogRename(ctx, row, env) {
    const from = X.val(row, 'NAME'); const st = { to: from };
    this.screenDialog('Rename Parameter', 'SAPLSTXB:2020', { f: { PARAMETER_FROM: { get: () => from }, PARAMETER_TO: { get: () => st.to, set: v => { st.to = v.toUpperCase(); } } }, ro: el => el.n === 'PARAMETER_FROM' }, () => {
      const to = st.to.trim(); if (!to || to === from) return;
      if (!/^<?[A-Z_][A-Z0-9_]*>?$/.test(to)) { this.msg('E', `${to} is not a valid name`); return false; }
      let n = 0;
      FB.pai(`Rename ${from}`, () => {
        for (const l of ['INTERFACE', 'GDATA', 'FSYMBOLS']) if (X.kids(X.kid(ctx.form.root, l), 'item').some(i => i !== row && X.val(i, 'NAME') === to)) throw new Error(`${to} already exists`);
        X.set(row, 'NAME', to); n = Check.renameField(ctx.form, from, to);
      });
      this.msg('S', `${from} renamed to ${to}; ${n} usage(s) replaced`);
    }, { local: true });
  },
  dialogPattern(node, env) {
    const sect = node.obj;
    const patterns = [
      ['Grid', (lt, li, ci, n, m) => [1, 1, 1, 1]],
      ['Outer frame', (lt, li, ci, n, m) => [ci === 0, li === 0, ci === n - 1, li === m - 1]],
      ['Outer frame and columns', (lt, li, ci, n, m) => [1, li === 0, 1, li === m - 1]],
      ['Outer frame and lines', (lt, li, ci, n, m) => [ci === 0, 1, ci === n - 1, 1]],
      ['Horizontal lines', (lt, li, ci, n, m) => [0, li === 0, 0, 1]],
      ['Header line separated', (lt, li, ci, n, m) => [ci === 0, li === 0, ci === n - 1, li === 0 || li === m - 1]],
      ['Column lines only', (lt, li, ci, n, m) => [ci > 0, 0, 0, 0]],
      ['No lines', () => [0, 0, 0, 0]],
    ];
    const dyn = node.kind !== 'SE-S';
    const lines = (dyn ? X.kids(X.kid(sect, 'DYNLINES'), 'item') : X.kids(X.kid(sect, 'STATLINES'), 'item')).map(i => X.val(i, 'NAME'));
    const grid = document.createElement('div'); grid.className = 'pat-grid';
    let chosen = 0;
    patterns.forEach(([label, fn], i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'pat' + (i === 0 ? ' on' : '');
      const sv = []; const m = 3, n = 3;
      for (let li = 0; li < m; li++) for (let ci = 0; ci < n; ci++) { const [l, t, r, bt] = fn(null, li, ci, n, m); const x = 6 + ci * 20, y = 6 + li * 12; if (l) sv.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 12}"/>`); if (t) sv.push(`<line x1="${x}" y1="${y}" x2="${x + 20}" y2="${y}"/>`); if (r) sv.push(`<line x1="${x + 20}" y1="${y}" x2="${x + 20}" y2="${y + 12}"/>`); if (bt) sv.push(`<line x1="${x}" y1="${y + 12}" x2="${x + 20}" y2="${y + 12}"/>`); }
      b.innerHTML = `<svg viewBox="0 0 72 48" width="72" height="48"><rect x="6" y="6" width="60" height="36" fill="var(--paper)" stroke="var(--line-soft)" stroke-dasharray="2 2"/><g stroke="var(--fg)" stroke-width="1.5">${sv.join('')}</g></svg><span>${esc(label)}</span>`;
      b.onclick = () => { chosen = i; grid.querySelectorAll('.pat').forEach((x, k) => x.classList.toggle('on', k === i)); };
      grid.appendChild(b);
    });
    const opt = document.createElement('div'); opt.className = 'pat-opt';
    opt.innerHTML = `<label>Line width <input type="text" id="pat-w" class="dyn-field" value="${esc(X.val(sect, 'PATTERN', 'FRAME') || '0.50')}" size="6"></label> <select id="pat-u" class="dyn-field">${VL.unitAll.map(([u]) => `<option ${u === (X.val(sect, 'PATTERN', 'U_FRAME') || 'PT') ? 'selected' : ''}>${u}</option>`).join('')}</select>`;
    const body = document.createElement('div'); body.append(grid, opt);
    this.modal({ title: 'Table Pattern', body, wide: true, buttons: [['Apply', () => {
      const w = normDec(opt.querySelector('#pat-w').value) || '0.50', u = opt.querySelector('#pat-u').value;
      FB.pai('Table pattern', () => {
        const pat = X.ensure(sect, 'PATTERN'); X.set(pat, 'PATTNUM', '0000'); X.set(pat, 'BORDER', [1, 2, 3, 5].includes(chosen) ? 'X' : ''); X.set(pat, 'FRAME', w); X.set(pat, 'U_FRAME', u);
        const m = lines.length;
        lines.forEach((ln, li) => {
          const cells = cellsOf(sect, ln);
          cells.forEach((c, ci) => {
            const bi = X.kids(X.kid(c, 'BORDERS'), 'item')[0] || X.newItem(X.ensure(c, 'BORDERS'), { IDX: '001', INTENSITY: '000' });
            const flags = patterns[chosen][1](ln, li, ci, cells.length, m);
            ['LLEFT', 'LTOP', 'LRIGHT', 'LBOTTOM'].forEach((s2, k) => { X.set(bi, s2, flags[k] ? w : '0.00'); X.set(bi, s2 + '_U', u); });
          });
        });
      });
    }, true], ['Cancel', null]] });
  },
  dialogPattern_abap(env, getList) { env.pai('Insert comment', () => { const l = getList(); if (!l) return; const lines = X.lines(l); X.setLines(l, ['*----------------------------------------------------------------------*', '*', '*----------------------------------------------------------------------*', ...lines]); }); },
  copyTextModule(n, env) {
    const name = X.val(n.obj, 'REF_NAME'); const lines = this.textModuleLines(name);
    if (!lines) return this.msg('E', `Text module ${name} is not in the library`);
    FB.pai('Copy text module', () => {
      const o = n.obj; X.set(o, 'TTYPE', '');
      for (const k of ['REF_NAME', 'REF_LANG', 'REF_STYLE']) X.remove(o, k);
      FB.form.setTextLines(o, lines.map(l => ({ f: l.f, t: l.t })));
    });
    this.msg('S', `Text of module ${name} copied into ${n.name}`);
  },
  fullscreenText(n, env) {
    const f = FB.form;
    const host = document.createElement('div'); host.className = 'te-full';
    const lines = n.type === 'TI' && X.val(n.obj, 'TTYPE') === 'R' ? (this.textModuleLines(X.val(n.obj, 'REF_NAME')) || []) : f.textLines(n.obj);
    const ro = X.val(n.obj, 'TTYPE') === 'R';
    host.appendChild(TextEditor.create({ lines, edit: this.mode === 'edit' && !ro, style: this.styleFor(f, n), fields: () => FB.fieldNames(), onCommit: nl => FB.pai('Text', () => f.setTextLines(n.obj, nl)) }));
    this.modal({ title: `Text Editor – ${n.name}`, body: host, wide: true, buttons: [['Close', () => this.flushEditors(), true]] });
  },
  checkNode(node, env) {
    const r = Check.run(FB.form, node);
    if (!r.length) return this.msg('S', `${node.name}: no errors found`);
    this.showCheck(r, `Check ${node.name}`);
  },
  checkForm() { return this.checkAll(); },
  dialogSettings(tab = 'SET_GENER') {
    const s = { ...this.settings };
    const holder = document.createElement('div'); holder.className = 'settings';
    const tabs = [['SET_GENER', 'General', 'SAPLSTXB:2031'], ['SET_FP', 'Form Painter', 'SAPLSTXB:2032'], ['SET_TP', 'Table Painter', 'SAPLSTXB:2034'], ['SET_EDIT', 'Editor', 'SAPLSTXB:2033'], ['SET_SAP', 'SAP Connection', null]];
    const env = { edit: true, pai: (l, fn) => { try { fn(); } catch (e) { this.msg('E', e.message); } draw(); }, rerender: () => draw(), sel: () => new Set(), msg: (t, x) => this.msg(t, x), renderScreen: () => document.createElement('div') };
    const B2 = {
      'SAPLSTXB:2031': { f: { 'SSFSCREEN-SET_P_FMT': { get: () => 'DINA4' }, 'SSFSCREEN-SET_UNIT_H': { get: () => s.unitH, set: v => { s.unitH = v.toUpperCase(); }, values: () => VL.unitH }, 'SSFSCREEN-SET_UNIT_V': { get: () => s.unitV, set: v => { s.unitV = v.toUpperCase(); }, values: () => VL.unitV }, 'SSFSCREEN-UNDO_REDO': { get: () => s.undo, set: v => { s.undo = v; } } }, ro: el => el.n === 'SSFSCREEN-SET_P_FMT' },
      'SAPLSTXB:2032': { f: { CB_SETTINGS_FP_ON: { get: () => s.fp, set: v => { s.fp = v; } }, CB_SETTINGS_FP_GRAPHICICON: { get: () => s.fpGraphics, set: v => { s.fpGraphics = v; } }, CB_SETTINGS_FP_TOOLBAR: { get: () => true, set: () => {} } } },
      'SAPLSTXB:2034': { f: { I_SETTINGS_TP_LINE_HEIGHT: { get: () => s.tpLineHeight, set: v => { s.tpLineHeight = normDec(v) || '0.50'; } }, I_SETTINGS_TP_LINE_U_HEIGHT: { get: () => s.tpLineU, set: v => { s.tpLineU = v.toUpperCase(); }, values: () => VL.unitV }, CB_SETTINGS_TP_TOOLBAR: { get: () => true, set: () => {} } } },
      'SAPLSTXB:2033': { f: { 'SSFSCREEN-SET_ED_TE': { get: () => s.editor === 'pc', set: () => { s.editor = 'pc'; } }, 'SSFSCREEN-SET_ED_TC': { get: () => s.editor === 'line', set: () => { s.editor = 'line'; } } } },
    };
    let cur = tab;
    const draw = () => {
      holder.innerHTML = '';
      const strip = document.createElement('div'); strip.className = 'tabstrip';
      for (const [id, l] of tabs) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (id === cur ? ' on' : ''); b.textContent = l; b.onclick = () => { cur = id; draw(); }; strip.appendChild(b); }
      holder.appendChild(strip);
      const page = document.createElement('div'); page.className = 'tabpage';
      const t = tabs.find(x => x[0] === cur);
      if (t[2]) page.appendChild(Dynpro.render(t[2], B2[t[2]], env, { fit: { w: 75, h: 8 } }));
      else {
        page.innerHTML = `<div class="sap-conn"><p>Used when this editor is opened from SAP through the ZSMARTFORMS service: objects are read from SAP, and Save / Activate write the XML back without the SMARTFORMS upload dialog. The published page outside SAP cannot reach your SAP system.</p>
          <label>Service URL<input type="text" id="set-be" class="dyn-field wide" spellcheck="false" placeholder="https://host:port/sap/bc/zsmartforms" value="${esc(s.backend)}"></label>
          <label>Transport request<input type="text" id="set-tr" class="dyn-field upper" maxlength="20" value="${esc(s.transport)}"></label>
          <label>Package<input type="text" id="set-dc" class="dyn-field upper" maxlength="30" value="${esc(s.devclass)}"></label></div>`;
        page.querySelector('#set-be').onchange = e => { s.backend = e.target.value.trim(); };
        page.querySelector('#set-tr').onchange = e => { s.transport = e.target.value.trim().toUpperCase(); };
        page.querySelector('#set-dc').onchange = e => { s.devclass = e.target.value.trim().toUpperCase(); };
      }
      holder.appendChild(page);
    };
    draw();
    this.modal({ title: 'Settings', body: holder, wide: true, buttons: [['Continue', () => { Object.assign(this.settings, s); this.saveSettings(); this.rerender(); this.renderChrome(); this.msg('S', 'Settings saved'); }, true], ['Cancel', null]] });
  },
  dialogInfo() {
    const f = this.doc; if (!(f instanceof SfForm)) return;
    const cnt = {}; for (const n of f.all) { const l = n.info.label; cnt[l] = (cnt[l] || 0) + 1; }
    const h = f.header;
    const d = document.createElement('div'); d.className = 'info-grid';
    const rows = [['Form', f.name], ['Description', X.val(h, 'CAPTION')], ['Package', X.val(h, 'DEVCLASS')], ['Original language', LANG.iso(X.val(h, 'MASTERLANG'))], ['Translation', X.val(h, 'LANGVECTOR') === '*' ? 'All languages' : [...X.val(h, 'LANGVECTOR')].map(LANG.iso).join(', ')],
      ['Created', `${X.val(h, 'FIRSTUSER')} ${fmtDate(X.val(h, 'FIRSTDATE'))} ${X.val(h, 'FIRSTTIME')}`], ['Last changed', `${X.val(h, 'LASTUSER')} ${fmtDate(X.val(h, 'LASTDATE'))} ${X.val(h, 'LASTTIME')}`],
      ['Default style', X.val(f.varItem, 'STDSTYLE')], ['Page format', X.val(f.varItem, 'PAGEFORMAT')], ['XML size', `${(f.serialize().length / 1024).toFixed(1)} KB`], ['Language of this XML', f.iso]];
    d.innerHTML = rows.map(([k, v]) => `<div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>`).join('') + `<div class="k">Nodes</div><div class="v">${Object.entries(cnt).sort().map(([k, v]) => `${esc(k)}: <b>${v}</b>`).join(' · ')}</div>`;
    this.modal({ title: 'Form Information', body: d, wide: true, buttons: [['Close', null, true]] });
  },
  dialogFm(note) {
    const f = this.doc; if (!(f instanceof SfForm)) return;
    const d = document.createElement('div'); d.className = 'fm';
    d.innerHTML = `<p>${esc(note || 'The function module name is generated by SAP (/1BCDWB/SF########) and differs between systems. Determine it at runtime:')}</p>`;
    const pre = document.createElement('pre'); pre.className = 'code'; pre.textContent = Check.callSnippet(f); d.appendChild(pre);
    this.modal({ title: 'Function Module Name', body: d, wide: true, buttons: [['Copy Code', () => { this.clipboardText(pre.textContent); this.msg('S', 'Call template copied'); return false; }, false, 'copy'], ['Close', null, true]] });
  },
  dialogFind() {
    if (!(this.doc instanceof SfForm)) return;
    this.promptText('Find', 'Search in node names, descriptions, texts and program lines', this._lastFind || '', q => {
      this._lastFind = q; q = q.toUpperCase(); if (!q) return;
      const hits = FB.form.all.filter(n => n.type !== 'RP' && ((n.name || '').toUpperCase().includes(q) || (n.caption || '').toUpperCase().includes(q) || (n.type === 'TI' && FB.form.textLines(n.obj).some(l => (l.t || '').toUpperCase().includes(q))) || (n.type === 'CO' && X.lines(X.kid(n.obj, 'CODE')).some(l => l.toUpperCase().includes(q)))));
      if (!hits.length) return this.msg('W', `${q} not found`);
      const d = document.createElement('div'); d.className = 'errlist';
      const t = document.createElement('table'); t.innerHTML = '<thead><tr><th></th><th>Node</th><th>Description</th><th>Type</th></tr></thead>'; const tb = t.createTBody();
      for (const n of hits) { const r = tb.insertRow(); r.className = 'link'; r.insertCell().innerHTML = icon(FB.iconOf(n)); r.insertCell().textContent = n.name; r.insertCell().textContent = n.caption; r.insertCell().textContent = n.info.label; r.onclick = () => { this.closeModal(); FB.select({ el: n.el }); }; }
      d.appendChild(t);
      this.modal({ title: `Find: ${hits.length} hit(s)`, body: d, wide: true, buttons: [['Close', null, true]] });
    });
  },
  dialogAbout() {
    const d = document.createElement('div'); d.className = 'about';
    d.innerHTML = `<p><b>ZSMARTFORMS</b> rebuilds transaction SMARTFORMS (Form Builder, Style Builder, text modules) on top of the Smart Forms XML that SAP downloads and uploads.</p>
      <ul><li>Screens, tabs, fields and menus follow SAPLSTXB / SAPLSTXBS of SAP_BASIS 740.</li><li>The XML is the only source of truth: parts you do not touch are written back unchanged.</li><li>The library lives in this browser only. Download changed objects as ZIP and upload them in SAP, or connect the ZSMARTFORMS service under Settings.</li></ul>`;
    this.modal({ title: 'About ZSMARTFORMS', body: d, buttons: [['Close', null, true]] });
  },
};

function decodeXml(s) { return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, '&'); }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => APP.start()); else APP.start();
