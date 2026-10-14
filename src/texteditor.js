/* =====================================================================
   texteditor.js — SAPscript text editor for text nodes / text modules.
   Two modes like SAP:  PC editor (paragraph rows + WYSIWYG preview) and
   line editor (format column + 132-char lines).
   Storage stays TDFORMAT/TDLINE; untouched paragraphs keep their
   original line split byte-for-byte.
   ===================================================================== */
'use strict';

const TextEditor = (() => {
  const MAXLEN = 132;
  const isCont = f => f === '=' || f === ' ' || f === '';

  /* group stored lines into paragraphs: a paragraph = first line + continuation lines */
  function toParas(lines) {
    const out = [];
    for (const l of lines) {
      if (isCont(l.f) && out.length && !/^\/[:*]/.test(out[out.length - 1].f)) {
        const p = out[out.length - 1];
        p.text += (l.f === '=' ? '' : ' ') + (l.t || '');
        p.orig.push(l);
      } else out.push({ f: isCont(l.f) ? '*' : l.f, text: l.t || '', orig: [l] });
    }
    return out;
  }
  /* split paragraph text into 132-char lines with "=" continuation (no trailing blanks lost) */
  function splitPara(f, text) {
    const res = []; let rest = text, first = true;
    while (rest.length > MAXLEN) {
      let cut = rest.lastIndexOf(' ', MAXLEN);
      if (cut <= 0) cut = MAXLEN;
      while (cut > 1 && rest[cut - 1] === ' ') cut--;
      if (cut <= 0) cut = MAXLEN;
      res.push({ f: first ? f : '=', t: rest.slice(0, cut) });
      rest = rest.slice(cut); first = false;
    }
    res.push({ f: first ? f : '=', t: rest });
    return res;
  }
  function fromParas(paras) {
    const out = [];
    for (const p of paras) {
      const o = p.orig;
      if (o && toParas(o).length === 1 && toParas(o)[0].text === p.text && (toParas(o)[0].f === p.f)) out.push(...o);
      else out.push(...splitPara(p.f || '*', p.text));
    }
    return out.map(l => ({ f: l.f, t: (l.t || '').replace(/\s+$/, '') }));
  }

  /* ---------- SAPscript inline markup ---------- */
  function tokens(text) {
    const out = []; let i = 0;
    const re = /<\(>|<\)>|<\/>|<[A-Z0-9_]{1,2}>|&[^&\s]+&|,,|<>/g; let m;
    while ((m = re.exec(text))) {
      if (m.index > i) out.push({ t: 'txt', v: text.slice(i, m.index) });
      const v = m[0];
      if (v === '</>' || v === '<>') out.push({ t: 'end', v });
      else if (v === '<(>') out.push({ t: 'rawon', v }); else if (v === '<)>') out.push({ t: 'rawoff', v });
      else if (v === ',,') out.push({ t: 'tab', v });
      else if (v[0] === '&') out.push({ t: 'fld', v });
      else out.push({ t: 'cf', v, code: v.slice(1, -1) });
      i = re.lastIndex;
    }
    if (i < text.length) out.push({ t: 'txt', v: text.slice(i) });
    return out;
  }
  function hlText(text) {
    return tokens(text).map(k => {
      if (k.t === 'txt') return esc(k.v);
      if (k.t === 'fld') return `<span class="te-fld">${esc(k.v)}</span>`;
      if (k.t === 'tab') return `<span class="te-tab">${esc(k.v)}</span>`;
      return `<span class="te-tag">${esc(k.v)}</span>`;
    }).join('');
  }
  const FONT = { HELVE: 'Arial, Helvetica, sans-serif', TIMES: '"Times New Roman", Times, serif', COURIER: '"Courier New", Courier, monospace', COURCYR: '"Courier New", monospace', LETGOTH: '"Letter Gothic", monospace', LNPRINT: 'monospace' };
  const fontOf = fam => FONT[fam] || (/COUR/.test(fam || '') ? FONT.COURIER : /TIM/.test(fam || '') ? FONT.TIMES : FONT.HELVE);
  const rgb = it => { const r = X.val(it, 'RED'), g = X.val(it, 'GREEN'), b = X.val(it, 'BLUE'); return r || g || b ? `rgb(${+r || 0},${+g || 0},${+b || 0})` : ''; };
  function cssPara(style, code) {
    const css = {}; if (!style) return css;
    const h = style.header; const p = style.para(code === '*' ? X.val(h, 'TDFIRSTPAR') : code) || style.para(X.val(h, 'TDFIRSTPAR'));
    const src = p || h;
    css.fontFamily = fontOf(X.val(src, 'TDFAMILY') || X.val(h, 'TDFAMILY'));
    const ht = +X.val(src, 'TDHEIGHT') || +X.val(h, 'TDHEIGHT') || 100; css.fontSize = (ht / 10) + 'pt';
    if (X.val(src, 'TDBOLD') === 'X') css.fontWeight = '700';
    if (X.val(src, 'TDITALIC') === 'X') css.fontStyle = 'italic';
    if (X.val(src, 'TDUNDERLIN') === 'X') css.textDecoration = 'underline';
    const col = rgb(src); if (col) css.color = col;
    if (p) {
      css.textAlign = { LEFT: 'left', RIGHT: 'right', CENTER: 'center', BLOCK: 'justify' }[X.val(p, 'TDPJUSTIFY')] || 'left';
      const cm = (v, u) => toCm(v || 0, u || 'CM', style.ctx || { cpi: +X.val(h, 'CPI') || 10, lpi: +X.val(h, 'LPI') || 6 });
      css.paddingLeft = (cm(X.val(p, 'TDPLEFT'), X.val(p, 'TDPLEFTU')) * 37.8) + 'px';
      css.textIndent = (cm(X.val(p, 'TDPENTRY'), X.val(p, 'TDPENTRYU')) * 37.8) + 'px';
      css.marginTop = (cm(X.val(p, 'TDPTOP'), X.val(p, 'TDPTOPU')) * 37.8) + 'px';
      css.marginBottom = (cm(X.val(p, 'TDPBOT'), X.val(p, 'TDPBOTU')) * 37.8) + 'px';
    }
    return css;
  }
  function cssStr(style, code) {
    const s = style && style.str(code); if (!s) return null;
    const css = {};
    if (X.val(s, 'TDFAMILY')) css.fontFamily = fontOf(X.val(s, 'TDFAMILY'));
    if (+X.val(s, 'TDHEIGHT')) css.fontSize = (+X.val(s, 'TDHEIGHT') / 10) + 'pt';
    if (X.val(s, 'TDBOLD') === 'X') css.fontWeight = '700'; else if (X.val(s, 'TDBOLD') === '*') { } else if (X.val(s, 'TDBOLD') === '') { }
    if (X.val(s, 'TDITALIC') === 'X') css.fontStyle = 'italic';
    if (X.val(s, 'TDUNDERLIN') === 'X') css.textDecoration = 'underline';
    if (X.val(s, 'TDSUPER') === 'X') css.verticalAlign = 'super';
    if (X.val(s, 'TDSUB') === 'X') css.verticalAlign = 'sub';
    if (X.val(s, 'TDBARCODE')) { css.fontFamily = '"Libre Barcode 39", monospace'; css.letterSpacing = '1px'; }
    if (X.val(s, 'TDHIDDEN') === 'X') css.opacity = '.35';
    if (X.val(s, 'USED') === 'X') { const c = rgb(s); if (c) css.color = c; }
    return css;
  }
  function renderPreview(paras, style) {
    const box = document.createElement('div'); box.className = 'te-preview';
    for (const p of paras) {
      if (/^\/[:*]/.test(p.f)) {
        const d = document.createElement('div'); d.className = p.f === '/*' ? 'te-pv-comment' : 'te-pv-cmd'; d.textContent = p.f + ' ' + p.text; box.appendChild(d); continue;
      }
      const d = document.createElement('div'); d.className = 'te-pv-par';
      Object.assign(d.style, cssPara(style, p.f === '/' || p.f === '/(' || p.f === '/E' ? '*' : p.f));
      if (p.f === '/') d.classList.add('te-pv-lf');
      const stack = []; let cur = d; let raw = false;
      for (const k of tokens(p.text)) {
        if (raw && k.t !== 'rawoff') { cur.appendChild(document.createTextNode(k.v)); continue; }
        if (k.t === 'txt') cur.appendChild(document.createTextNode(k.v));
        else if (k.t === 'tab') { const s = document.createElement('span'); s.className = 'te-pv-tab'; s.textContent = ' '; cur.appendChild(s); }
        else if (k.t === 'fld') { const s = document.createElement('span'); s.className = 'te-pv-fld'; s.textContent = k.v; cur.appendChild(s); }
        else if (k.t === 'cf') { const s = document.createElement('span'); const css = cssStr(style, k.code); if (css) Object.assign(s.style, css); else s.className = 'te-pv-unknown'; s.title = k.v; cur.appendChild(s); stack.push(cur); cur = s; }
        else if (k.t === 'end') { if (stack.length) cur = stack.pop(); }
        else if (k.t === 'rawon') raw = true; else if (k.t === 'rawoff') raw = false;
      }
      if (!d.childNodes.length) d.innerHTML = '&nbsp;';
      box.appendChild(d);
    }
    return box;
  }

  /* ---------- the control ---------- */
  function create({ lines, edit, style, fields, onCommit, mode }) {
    const root = document.createElement('div'); root.className = 'te';
    let paras = toParas(lines.length ? lines : [{ f: '*', t: '' }]);
    let curMode = mode || APP.settings?.editor || 'pc';
    let focusIdx = 0, focusEl = null;
    const paraCodes = () => {
      const l = style ? style.paragraphs().map(p => [X.val(p, 'TDPARGRAPH'), X.val(p, 'CAPTION')]) : [];
      return [['*', 'Default Paragraph'], ...l];
    };
    const strCodes = () => style ? style.strings().map(s => [X.val(s, 'TDSTRING'), X.val(s, 'CAPTION')]) : [];
    const commit = () => {
      const nl = fromParas(paras);
      const empty = ls => !ls.length || (ls.length === 1 && !ls[0].t && (ls[0].f || '*') === '*');
      const same = (empty(nl) && empty(lines)) || (nl.length === lines.length && nl.every((l, i) => (l.f || '') === (lines[i].f || '') && (l.t || '') === (lines[i].t || '')));
      if (!same) { lines = nl; onCommit(nl); }
    };

    /* toolbar */
    const bar = document.createElement('div'); bar.className = 'te-bar';
    const mkSel = (title, opts, cls) => { const s = document.createElement('select'); s.className = 'te-sel ' + (cls || ''); s.title = title; for (const [k, t] of opts) { const o = document.createElement('option'); o.value = k; o.textContent = k ? `${k}  ${t || ''}` : t; s.appendChild(o); } return s; };
    const pSel = mkSel('Paragraph format', paraCodes(), 'te-psel');
    const cSel = mkSel('Character format', [['', 'Character Formats'], ...strCodes()], 'te-csel');
    pSel.disabled = cSel.disabled = !edit;
    pSel.onchange = () => { const p = paras[focusIdx]; if (p && !/^\/[:*]/.test(p.f)) { p.f = pSel.value; commit(); draw(); } };
    cSel.onchange = () => { const code = cSel.value; cSel.value = ''; if (!code || !focusEl) return; wrapSel(`<${code}>`, '</>'); };
    const b = (ic, tip, fn, needEdit = true) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'tb-btn'; x.innerHTML = icon(ic); x.title = tip; x.disabled = needEdit && !edit; x.onclick = fn; bar.appendChild(x); return x; };
    bar.append(pSel, cSel);
    b('variable', 'Insert Field (Ctrl+Shift+F)', () => insertField());
    b('more', 'Insert Symbol / Command…', () => insertSymbol());
    b('insert_row', 'Insert Line Below', () => { paras.splice(focusIdx + 1, 0, { f: paras[focusIdx]?.f && !/^\//.test(paras[focusIdx].f) ? paras[focusIdx].f : '*', text: '' }); commit(); draw(focusIdx + 1); });
    b('delete_row', 'Delete Line', () => { if (paras.length > 1) { paras.splice(focusIdx, 1); } else paras[0] = { f: '*', text: '' }; commit(); draw(Math.max(0, focusIdx - 1)); });
    b('pretty', 'Remove formatting from selection', () => stripFormat());
    const sep = document.createElement('span'); sep.className = 'tb-sep'; bar.appendChild(sep);
    const modeBtn = b('toggle', '', () => { commit(); curMode = curMode === 'pc' ? 'line' : 'pc'; draw(); }, false);
    const pvBtn = b('display', 'Preview on/off', () => { root.classList.toggle('te-nopv'); }, false);
    const info = document.createElement('span'); info.className = 'te-info'; bar.appendChild(info);

    const body = document.createElement('div'); body.className = 'te-body';
    const pv = document.createElement('div'); pv.className = 'te-pvwrap';
    root.append(bar, body, pv);

    function wrapSel(a, z) {
      const t = focusEl; if (!t) return;
      const s = t.selectionStart, e = t.selectionEnd; const v = t.value;
      t.value = v.slice(0, s) + a + v.slice(s, e) + z + v.slice(e);
      t.setSelectionRange(s + a.length, e + a.length); t.dispatchEvent(new Event('input')); t.focus(); syncFocus(); commit(); drawPreview();
    }
    function insertAt(str) { const t = focusEl; if (!t) return; const s = t.selectionStart; t.value = t.value.slice(0, s) + str + t.value.slice(t.selectionEnd); t.setSelectionRange(s + str.length, s + str.length); t.dispatchEvent(new Event('input')); t.focus(); syncFocus(); commit(); drawPreview(); }
    function stripFormat() { const t = focusEl; if (!t) return; const s = t.selectionStart, e = t.selectionEnd; const mid = t.value.slice(s, e).replace(/<\/>|<[A-Z0-9_]{1,2}>/g, ''); t.value = t.value.slice(0, s) + mid + t.value.slice(e); t.dispatchEvent(new Event('input')); syncFocus(); commit(); drawPreview(); }
    function insertField() {
      APP.dialogField(fields ? fields() : [], name => { if (name) insertAt('&' + name.replace(/^&|&$/g, '') + '&'); });
    }
    function insertSymbol() {
      APP.popupList(bar, 'Insert', [['&DATE&', 'System symbol: date'], ['&TIME&', 'System symbol: time'], ['&PAGE&', 'Current page'], ['&SFSY-PAGE&', 'Smart Forms: page'], ['&SFSY-FORMPAGES&', 'Smart Forms: total pages'], ['&SFSY-JOBPAGES&', 'Smart Forms: pages in job'], ['&SFSY-DATE&', 'Smart Forms: date'], ['&SFSY-TIME&', 'Smart Forms: time'], ['&SFSY-USERNAME&', 'Smart Forms: user'],
        [',,', 'Tab'], ['<(>', 'Protect begin (raw)'], ['<)>', 'Protect end'], ['/:', 'Command line'], ['/*', 'Comment line'], ['/', 'Line feed']], '', v => {
        if (['/:', '/*', '/'].includes(v)) { paras.splice(focusIdx + 1, 0, { f: v, text: '' }); commit(); draw(focusIdx + 1); }
        else insertAt(v);
      });
    }
    function syncFocus() {
      const p = paras[focusIdx];
      pSel.value = p && !/^\/[:*(E]/.test(p.f) && p.f !== '/' ? (paraCodes().some(([k]) => k === p.f) ? p.f : p.f) : '*';
      if (p && ![...pSel.options].some(o => o.value === p.f) && p.f) { const o = document.createElement('option'); o.value = p.f; o.textContent = p.f; pSel.appendChild(o); pSel.value = p.f; }
      info.textContent = `Line ${focusIdx + 1} / ${paras.length}` + (style ? `   Style ${style.name}` : '   (style not loaded)');
    }
    function drawPreview() { pv.innerHTML = ''; pv.appendChild(renderPreview(paras, style)); }

    function draw(focusTo) {
      body.innerHTML = '';
      modeBtn.title = curMode === 'pc' ? 'Switch to line editor' : 'Switch to PC editor';
      modeBtn.innerHTML = icon('toggle') + `<span class="tb-lbl">${curMode === 'pc' ? 'Line Editor' : 'PC Editor'}</span>`;
      root.dataset.mode = curMode;
      if (curMode === 'pc') drawPc(); else drawLine();
      drawPreview();
      if (focusTo != null) { const t = body.querySelectorAll('textarea,input.te-ln')[focusTo]; if (t) { t.focus(); } }
      syncFocus();
    }

    /* PC editor: one autosizing row per paragraph */
    function drawPc() {
      paras.forEach((p, i) => {
        const row = document.createElement('div'); row.className = 'te-row' + (/^\/\*/.test(p.f) ? ' te-comment' : /^\/:/.test(p.f) ? ' te-cmd' : '');
        const fmt = document.createElement('span'); fmt.className = 'te-fmt'; fmt.textContent = p.f; fmt.title = 'Paragraph format';
        if (edit) fmt.onclick = () => { focusIdx = i; APP.popupList(fmt, 'Paragraph format', [...paraCodes(), ['/', 'Line feed'], ['/:', 'Command'], ['/*', 'Comment'], ['/(', 'Raw line'], ['/E', 'Text element']], p.f, v => { p.f = v; commit(); draw(i); }); };
        const cell = document.createElement('div'); cell.className = 'te-cell';
        const pre = document.createElement('pre'); pre.className = 'te-hl'; pre.innerHTML = hlText(p.text) + '\n';
        const ta = document.createElement('textarea'); ta.className = 'te-ta'; ta.value = p.text; ta.rows = 1; ta.spellcheck = false; ta.readOnly = !edit;
        const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.max(20, ta.scrollHeight) + 'px'; };
        ta.addEventListener('input', () => { p.text = ta.value.replace(/\n/g, ' '); pre.innerHTML = hlText(p.text) + '\n'; fit(); drawPreview(); });
        ta.addEventListener('focus', () => { focusIdx = i; focusEl = ta; syncFocus(); row.classList.add('focus'); });
        ta.addEventListener('blur', () => { row.classList.remove('focus'); commit(); });
        ta.addEventListener('keydown', e => {
          if (!edit) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            const s = ta.selectionStart; const before = ta.value.slice(0, s), after = ta.value.slice(ta.selectionEnd);
            p.text = before; delete p.orig;
            const nf = e.shiftKey ? '/' : (/^\//.test(p.f) && p.f !== '/' ? '*' : (p.f === '/' ? (prevFormat(i) || '*') : p.f));
            paras.splice(i + 1, 0, { f: nf, text: after }); commit(); draw(i + 1);
            const t = body.querySelectorAll('textarea')[i + 1]; t?.setSelectionRange(0, 0);
          } else if (e.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0 && i > 0) {
            e.preventDefault(); const prev = paras[i - 1]; const pos = prev.text.length; prev.text += p.text; delete prev.orig; paras.splice(i, 1); commit(); draw(i - 1);
            const t = body.querySelectorAll('textarea')[i - 1]; t?.setSelectionRange(pos, pos);
          } else if (e.key === 'ArrowUp' && i > 0 && !ta.value.slice(0, ta.selectionStart).includes('\n') && ta.selectionStart < 1) { e.preventDefault(); body.querySelectorAll('textarea')[i - 1]?.focus(); }
          else if (e.key === 'ArrowDown' && i < paras.length - 1 && ta.selectionStart >= ta.value.length) { e.preventDefault(); body.querySelectorAll('textarea')[i + 1]?.focus(); }
          else if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); insertField(); }
          else if (e.ctrlKey && e.key === 'b' && strCodes().some(([k]) => k === 'B')) { e.preventDefault(); wrapSel('<B>', '</>'); }
        });
        cell.append(pre, ta); row.append(fmt, cell); body.appendChild(row);
        requestAnimationFrame(fit);
      });
    }
    function prevFormat(i) { for (let k = i - 1; k >= 0; k--) if (!/^\//.test(paras[k].f)) return paras[k].f; return '*'; }

    /* line editor: stored lines exactly as SAPscript line editor shows them */
    function drawLine() {
      const ls = fromParas(paras);
      const grid = document.createElement('div'); grid.className = 'te-grid';
      const ruler = document.createElement('div'); ruler.className = 'te-ruler'; ruler.textContent = '  ' + '----+----1----+----2----+----3----+----4----+----5----+----6----+----7----+----8----+----9----+----0----+----1----+----2----+----3--'.slice(0, MAXLEN);
      grid.appendChild(ruler);
      const rebuild = () => { paras = toParas(ls); commit(); };
      ls.forEach((l, i) => {
        const row = document.createElement('div'); row.className = 'te-lrow';
        const f = document.createElement('input'); f.className = 'te-lf upper'; f.maxLength = 2; f.value = l.f; f.readOnly = !edit;
        const t = document.createElement('input'); t.className = 'te-ln'; t.maxLength = MAXLEN; t.value = l.t; t.readOnly = !edit; t.spellcheck = false;
        f.onchange = () => { l.f = f.value.toUpperCase(); rebuild(); drawPreview(); };
        t.oninput = () => { l.t = t.value; };
        t.onchange = () => { l.t = t.value; rebuild(); drawPreview(); };
        t.addEventListener('focus', () => { focusEl = t; focusIdx = Math.max(0, toParas(ls.slice(0, i + 1)).length - 1); syncFocus(); });
        t.addEventListener('keydown', e => {
          if (!edit) return;
          if (e.key === 'Enter') { e.preventDefault(); const s = t.selectionStart; const a = t.value.slice(0, s), z = t.value.slice(s); l.t = a; ls.splice(i + 1, 0, { f: '', t: z }); paras = toParas(ls); commit(); draw(); grid.parentNode && body.querySelectorAll('input.te-ln')[i + 1]?.focus(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); body.querySelectorAll('input.te-ln')[i + 1]?.focus(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); body.querySelectorAll('input.te-ln')[i - 1]?.focus(); }
          else if (e.key === 'Backspace' && t.selectionStart === 0 && t.selectionEnd === 0 && i > 0) { e.preventDefault(); const p = ls[i - 1]; const pos = p.t.length; p.t = (p.t + t.value).slice(0, MAXLEN); ls.splice(i, 1); paras = toParas(ls); commit(); draw(); const el = body.querySelectorAll('input.te-ln')[i - 1]; el?.focus(); el?.setSelectionRange(pos, pos); }
        });
        row.append(f, t); grid.appendChild(row);
      });
      body.appendChild(grid);
    }
    draw();
    root.commit = commit;
    APP.registerCommit?.(commit);
    return root;
  }
  return { create, toParas, fromParas, splitPara, renderPreview, tokens, cssPara, cssStr, fontOf };
})();
