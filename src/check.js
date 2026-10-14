/* =====================================================================
   check.js — form check (Form > Check / node Check), rename of
   interface parameters / global data with usage replacement, and the
   ABAP call snippet of Environment > Function Module Name.
   ===================================================================== */
'use strict';

const Check = {
  SYS: new Set(['SFSY', 'SY', 'SYST', 'SPACE', 'TEXT']),
  /* names a text or condition can refer to */
  knownNames(form) {
    const s = new Set(Check.SYS);
    for (const l of ['INTERFACE', 'GDATA', 'FSYMBOLS']) for (const i of X.kids(X.kid(form.root, l), 'item')) s.add(X.val(i, 'NAME').toUpperCase());
    for (const n of form.all) if (n.type === 'SE') { const h = X.val(n.obj, 'TABHEADER'); if (h) s.add(h.toUpperCase()); }
    /* variables declared inside program lines / initialization (DATA x / FIELD-SYMBOLS <x>) */
    const decl = lines => { for (const l of lines) { const m = /^\s*(?:DATA|STATICS|CONSTANTS|FIELD-SYMBOLS)\s*:?\s*(<?[A-Z0-9_]+>?)/i.exec(l); if (m) s.add(m[1].toUpperCase()); } };
    decl(X.lines(X.kid(form.root, 'GCODING')));
    for (const n of form.all) if (n.type === 'CO') decl(X.lines(X.kid(n.obj, 'CODE')));
    return s;
  },
  rootOf(field) { return field.replace(/^&|&$/g, '').replace(/\(.*$/, '').replace(/[+](\d+)$/, '').split(/[-+(]/)[0].toUpperCase(); },
  run(form, scope = null) {
    const out = [];
    const E = (node, text) => out.push({ type: 'E', el: node?.el || null, text });
    const W = (node, text) => out.push({ type: 'W', el: node?.el || null, text });
    const known = Check.knownNames(form);
    const seenEl = new Set();
    const nodes = (scope ? [scope, ...form.all.filter(n => n.ancestors().includes(scope))] : form.all).filter(n => { if (seenEl.has(n.el)) return false; seenEl.add(n.el); return true; });
    if (!scope && !form.isTextModule) {
      /* interface */
      const names = new Map();
      for (const i of X.kids(X.kid(form.root, 'INTERFACE'), 'item')) {
        const nm = X.val(i, 'NAME'), io = X.val(i, 'IOTYPE');
        if (!nm) { E(null, 'Form interface: parameter without a name'); continue; }
        if (names.has(nm)) E(null, `Form interface: parameter ${nm} is defined twice`); names.set(nm, 'I');
        if (io !== 'X' && !X.val(i, 'TYPENAME') && !['TYPE ANY', 'TYPE ANY TABLE', 'TYPE STANDARD TABLE'].includes(X.val(i, 'TYPING')) && X.val(i, 'TYPING')) E(null, `Form interface: parameter ${nm} has no type (C20 Type specification required)`);
        if (X.val(i, 'TYPING') === 'TYPE REF TO' && io === 'T') E(null, `Form interface: table parameter ${nm} cannot be typed TYPE REF TO`);
      }
      for (const i of X.kids(X.kid(form.root, 'GDATA'), 'item')) {
        const nm = X.val(i, 'NAME');
        if (!nm) { E(null, 'Global data: variable without a name'); continue; }
        if (names.has(nm)) E(null, `Global data: ${nm} already exists ${names.get(nm) === 'I' ? 'in the form interface' : 'in global data'}`); names.set(nm, 'G');
        if (!X.val(i, 'TYPENAME')) E(null, `Global data: variable ${nm} has no type`);
        if (X.val(i, 'CONSTANT') === 'X' && !X.val(i, 'DEFAULTVAL')) E(null, `Global data: constant ${nm} needs a default value`);
      }
      for (const i of X.kids(X.kid(form.root, 'FSYMBOLS'), 'item')) if (!/^<[A-Z0-9_]+>$/i.test(X.val(i, 'NAME'))) E(null, `Field symbols: ${X.val(i, 'NAME')} must be written as <NAME> (C17)`);
      /* ABAP areas */
      for (const [list, what] of [['GTYPES', 'Global Definitions - Types'], ['GCODING', 'Global Definitions - Initialization'], ['FCODING', 'Global Definitions - Form Routines']]) {
        const r = AbapEditor.check(X.lines(X.kid(form.root, list)));
        if (!r.ok) E(null, `${what}: ${r.msg}`);
      }
      /* pages / windows */
      const pages = form.pages;
      if (!pages.length) E(null, 'The form has no page');
      const pnames = new Set(pages.map(p => p.name));
      const mains = new Set(form.all.filter(n => n.type === 'WI' && n.sub === 'M').map(n => n.name));
      if (!mains.size) W(null, 'The form has no main window');

      for (const p of pages) {
        const nx = X.val(p.obj, 'NEXTPAGE', 'INAME');
        if (nx && !pnames.has(nx)) E(p, `Page ${p.name}: next page ${nx} does not exist`);
        if (!nx) W(p, `Page ${p.name}: no next page specified`);
        const { w, h } = form.pageSize(p);
        for (const win of p.children.filter(c => c.type === 'WI')) {
          const oa = win.outattr; if (!oa) continue;
          const g = k => toCm(X.val(oa, k) || 0, X.val(oa, 'U_' + k) || 'CM', form.ctx);
          if (g('WLEFT') + g('WWIDTH') > w + 0.005 || g('WTOP') + g('WHEIGHT') > h + 0.005) W(win, `Window ${win.name} on page ${p.name} lies outside the page`);
          if (g('WWIDTH') <= 0 || g('WHEIGHT') <= 0) E(win, `Window ${win.name} on page ${p.name} has no size`);
        }
        const mw = p.children.filter(c => c.type === 'WI' && c.sub === 'M');
        if (mw.length > 1) E(p, `Page ${p.name} contains more than one main window`);
      }
      /* main window must have the same width on all pages */
      const mwW = new Set(form.all.filter(n => n.type === 'WI' && n.sub === 'M' && n.outattr).map(n => toCm(X.val(n.outattr, 'WWIDTH'), X.val(n.outattr, 'U_WWIDTH'), form.ctx).toFixed(2)));
      if (mwW.size > 1) W(null, 'The main window has different widths on different pages');
    }
    for (const n of nodes) {
      const o = n.obj;
      if (typeof boxLocked === 'function' && boxLocked(n) && hasBox(n)) E(n, `${n.name}: ${BOX_IN_TABLE} (at runtime: SSFCOMPOSER 197 "Table processing not allowed; frames are active")`);
      /* conditions */
      for (const c of [n.cond, n.type === 'CD' ? o : null]) {
        if (!c) continue;
        for (const r of X.kids(X.kid(c, 'COND'), 'item')) {
          if (X.val(r, 'LOP') === 'OR' && !X.kid(r, 'COP')) continue;
          if (!X.val(r, 'OP1')) E(n, `${n.name}: condition without a field name`);
          const f1 = X.val(r, 'OP1'); if (f1 && !/^['\d]/.test(f1) && !known.has(Check.rootOf(f1))) W(n, `${n.name}: field ${f1} in condition is unknown`);
        }
        const pg = X.val(c, 'OCOND', 'PAGENAME', 'INAME'); if (pg && !form.pages.some(p => p.name === pg)) E(n, `${n.name}: condition refers to unknown page ${pg}`);
      }
      if (n.type === 'TI') {
        const t = X.val(o, 'TTYPE');
        if (t === 'I' && !X.val(o, 'TKEY', 'NAME')) E(n, `Text ${n.name}: include text has no name`);
        if (t === 'R' && !X.val(o, 'REF_NAME')) E(n, `Text ${n.name}: text module name is missing`);
        if (t === 'R' && X.val(o, 'REF_NAME') && !/^&/.test(X.val(o, 'REF_NAME')) && APP.lib.size && !APP.libGet('TM', X.val(o, 'REF_NAME'))) W(n, `Text ${n.name}: text module ${X.val(o, 'REF_NAME')} is not in the library`);
        if (t === 'D' && !X.val(o, 'REF_NAME')) E(n, `Text ${n.name}: dynamic text needs a field name`);
        if (!t) {
          for (const l of form.textLines(o)) {
            for (const m of (l.t || '').matchAll(/&([^&\s]+)&/g)) {
              const root = Check.rootOf(m[1]);
              if (root && !known.has(root) && !/^\d/.test(root)) W(n, `Text ${n.name}: field &${m[1]}& is not defined`);
            }
            const opens = ((l.t || '').match(/<[A-Z0-9_]{1,2}>/g) || []).length, closes = ((l.t || '').match(/<\/>/g) || []).length;
            if (closes > opens) W(n, `Text ${n.name}: character format end </> without start`);
          }
        }
      }
      if (n.type === 'CO') {
        const r = AbapEditor.check(X.lines(X.kid(o, 'CODE')));
        if (!r.ok) E(n, `Program lines ${n.name}: ${r.msg}`);
        for (const p of X.kids(X.kid(o, 'PLIST'), 'item')) { const v = X.val(p, 'OPD'); if (v && !known.has(Check.rootOf(v))) E(n, `Program lines ${n.name}: ${X.val(p, 'OUTIN') === 'O' ? 'output' : 'input'} parameter ${v} is not defined`); }
      }
      if (n.type === 'CM') {
        if (X.val(o, 'NEWPAGE') === 'X') {
          const pg = X.val(o, 'PAGENAME', 'INAME');
          if (pg && !form.pages.some(p => p.name === pg)) E(n, `Command ${n.name}: page ${pg} does not exist`);
          if (n.window && n.window.sub !== 'M') E(n, `Command ${n.name}: no new page allowed in secondary window (C21)`);
          if (n.ancestors().some(a => a.kind === 'SE-C')) E(n, `Command ${n.name}: no new page allowed in table (C22)`);
        }
      }
      if (n.type === 'SE') {
        const dt = X.val(o, 'DATATYPE');
        if (dt === 'L') {
          if (!X.val(o, 'TABNAME')) E(n, `${n.info.label} ${n.name}: internal table is missing`);
          else if (!known.has(Check.rootOf(X.val(o, 'TABNAME')))) W(n, `${n.info.label} ${n.name}: internal table ${X.val(o, 'TABNAME')} is not defined`);
          if (!X.val(o, 'TABHEADER')) E(n, `${n.info.label} ${n.name}: work area / field symbol is missing`);
        }
        if (n.sub === 'C' || n.sub === 'S') {
          const tw = toCm(X.val(o, 'WIDTH') || 0, X.val(o, 'U_WIDTH') || 'CM', form.ctx);
          const ltypes = n.sub === 'C' ? X.kids(X.kid(o, 'DYNLINES'), 'item') : X.kids(X.kid(o, 'STATLINES'), 'item');
          if (!ltypes.length) E(n, `${n.info.label} ${n.name}: no line type defined`);
          for (const lt of ltypes) {
            const nm = X.val(lt, 'NAME');
            const cells = cellsOf(o, nm);
            if (!cells.length && !X.val(lt, 'REFERENCE')) E(n, `${n.info.label} ${n.name}: line type ${nm} has no cells`);
            const sum = cells.reduce((s, c) => s + toCm(X.val(c, 'CWIDTH') || 0, X.val(c, 'U_CWIDTH') || 'CM', form.ctx), 0);
            if (sum > tw + 0.005) E(n, `${n.info.label} ${n.name}: line type ${nm} (${sum.toFixed(2)} cm) is wider than the table (${tw.toFixed(2)} cm)`);
            else if (sum < tw - 0.005 && cells.length) W(n, `${n.info.label} ${n.name}: line type ${nm} (${sum.toFixed(2)} cm) is narrower than the table (${tw.toFixed(2)} cm)`);
          }
          if (n.sub === 'C' && !ltypes.some(l => X.val(l, 'DEFAULTVAL') === 'X')) W(n, `Table ${n.name}: no default line type`);
        }
        if (n.sub === 'R') {
          const t = n.ancestors().find(a => a.kind === 'SE-C');
          const lt = X.val(n.outattr, 'T_LINETYPE');
          if (!lt) E(n, `Line ${n.name}: no line type assigned`);
          else if (t && !lineTypes(t.obj).includes(lt)) E(n, `Line ${n.name}: line type ${lt} does not exist in table ${t.name}`);
          else if (t && cellsOf(t.obj, lt).length !== n.children.filter(c => c.kind === 'SE-E').length) E(n, `Line ${n.name}: number of cells differs from line type ${lt}`);
          if (!t) E(n, `Line ${n.name} is not inside a table`);
        }
        for (const c of X.kids(X.kid(o, 'CALC'), 'item')) {
          if (!X.val(c, 'SOURCENAME') || !X.val(c, 'TARGETNAME')) E(n, `${n.name}: calculation needs a field and a target field`);
          else if (!known.has(Check.rootOf(X.val(c, 'TARGETNAME')))) W(n, `${n.name}: target field ${X.val(c, 'TARGETNAME')} of the calculation is not defined`);
        }
      }
      if (n.type === 'GR' || (n.type === 'WI' && n.sub === 'G')) {
        const g = n.type === 'GR' ? o : n.innerObj;
        if (!X.val(g, 'GKEYBDS', 'NAME')) E(n, `Graphic ${n.name}: no graphic name`);
      }
      if ((n.type === 'AD' || (n.type === 'WI' && n.sub === 'A')) && !X.val(n.type === 'AD' ? o : n.innerObj, 'NUMB')) E(n, `Address ${n.name}: address number is missing`);
    }
    return out;
  },

  /* ---------- rename of an interface / global data name everywhere ---------- */
  renameField(form, from, to) {
    const re = new RegExp(`(^|[^A-Za-z0-9_<>-])${from.replace(/[<>]/g, m => '\\' + m)}(?=$|[^A-Za-z0-9_])`, 'gi');
    const reAmp = new RegExp(`&${from.replace(/[<>]/g, m => '\\' + m)}(?=[&+(-])`, 'gi');
    let count = 0;
    const fix = (el, amp) => {
      const v = el.textContent; let nv = amp ? v.replace(reAmp, () => { count++; return '&' + to; }) : v.replace(re, (m, p) => { count++; return p + to; });
      if (nv !== v) el.textContent = nv;
    };
    const exact = el => { const v = el.textContent; const r = new RegExp(`^${from.replace(/[<>]/g, m => '\\' + m)}(?=$|[-+(])`, 'i'); if (r.test(v)) { el.textContent = v.replace(r, to); count++; } };
    for (const el of form.doc.getElementsByTagNameNS(NS_IFR, '*')) {
      const n = el.localName, p = el.parentElement?.parentElement?.localName;
      if (n === 'TDLINE') fix(el, true);
      else if (n === 'item' && ['CODE', 'GCODING', 'FCODING', 'GTYPES'].includes(el.parentElement?.localName) && !el.children.length) fix(el, false);
      else if (['OP1', 'OP2', 'OPD', 'TABNAME', 'TABHEADER', 'SOURCENAME', 'TARGETNAME', 'SFIELD', 'VALUE', 'UNIT'].includes(n)) exact(el);
      else if (n === 'NAME' && p === 'SORT') exact(el);
      else if (['NAME', 'ID', 'OBJECT', 'LANG', 'NUMB', 'PERSON', 'LINES', 'ADDRTYPE', 'REF_NAME', 'BTYPE'].includes(n) && /&/.test(el.textContent)) fix(el, true);
      else if (n === 'REF_LANG') exact(el);
    }
    return count;
  },

  /* ---------- ABAP call template (Environment > Function Module Name) ---------- */
  callSnippet(form) {
    const name = form.name;
    const itf = X.kids(X.kid(form.root, 'INTERFACE'), 'item');
    const std = new Set(['ARCHIVE_INDEX', 'ARCHIVE_INDEX_TAB', 'ARCHIVE_PARAMETERS', 'CONTROL_PARAMETERS', 'MAIL_APPL_OBJ', 'MAIL_RECIPIENT', 'MAIL_SENDER', 'OUTPUT_OPTIONS', 'USER_SETTINGS', 'DOCUMENT_OUTPUT_INFO', 'JOB_OUTPUT_INFO', 'JOB_OUTPUT_OPTIONS']);
    const own = io => itf.filter(i => X.val(i, 'IOTYPE') === io && X.val(i, 'STANDARD') !== 'X' && !std.has(X.val(i, 'NAME')));
    const pad = (s, n) => s + ' '.repeat(Math.max(1, n - s.length));
    const w = Math.max(20, ...itf.map(i => X.val(i, 'NAME').length + 2));
    const L = [];
    L.push(`DATA: lv_fm_name TYPE rs38l_fnam.`, ``);
    L.push(`CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME'`, `  EXPORTING`, `    formname           = '${name}'`, `  IMPORTING`, `    fm_name            = lv_fm_name`, `  EXCEPTIONS`, `    no_form            = 1`, `    no_function_module = 2`, `    OTHERS             = 3.`, `IF sy-subrc <> 0.`, `  MESSAGE ID sy-msgid TYPE sy-msgty NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4.`, `ENDIF.`, ``);
    L.push(`CALL FUNCTION lv_fm_name`);
    const imp = own('I'), exp = own('E'), tab = own('T');
    L.push(`  EXPORTING`, `    ${pad('control_parameters', w)}= ls_control`, `    ${pad('output_options', w)}= ls_options`, `    ${pad('user_settings', w)}= abap_true`);
    for (const i of imp) L.push(`${X.val(i, 'OPTIONAL') === 'X' || X.val(i, 'DEFAULTVAL') ? '*' : ' '}   ${pad(X.val(i, 'NAME').toLowerCase(), w)}= ${'"' + ' ' + X.val(i, 'TYPING') + ' ' + X.val(i, 'TYPENAME')}`);
    L.push(`  IMPORTING`, `    ${pad('job_output_info', w)}= ls_job_info`);
    for (const i of exp) L.push(`    ${pad(X.val(i, 'NAME').toLowerCase(), w)}= "${X.val(i, 'TYPING')} ${X.val(i, 'TYPENAME')}`);
    if (tab.length) { L.push(`  TABLES`); for (const i of tab) L.push(`${X.val(i, 'OPTIONAL') === 'X' ? '*' : ' '}   ${pad(X.val(i, 'NAME').toLowerCase(), w)}= "${X.val(i, 'TYPING')} ${X.val(i, 'TYPENAME')}`); }
    L.push(`  EXCEPTIONS`);
    const exc = itf.filter(i => X.val(i, 'IOTYPE') === 'X');
    exc.forEach((i, k) => L.push(`    ${pad(X.val(i, 'NAME').toLowerCase(), w)}= ${k + 1}`));
    L.push(`    ${pad('OTHERS', w)}= ${exc.length + 1}.`);
    return L.join('\n');
  },
};
