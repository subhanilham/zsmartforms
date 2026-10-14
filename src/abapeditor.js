/* =====================================================================
   abapeditor.js — ABAP editor control (program lines, global types,
   initialization, form routines). Line numbers, keyword highlighting,
   syntax check of block structure, Pretty Printer (keywords upper case,
   SAP indentation by 2).
   ===================================================================== */
'use strict';

const AbapEditor = (() => {
  const KW = ('ADD AND APPEND APPENDING AS ASCENDING ASSIGN ASSIGNING AT AUTHORITY-CHECK BEGIN BETWEEN BINARY BREAK-POINT BY BYTE CALL CASE CATCH ' +
    'CHANGING CHECK CLASS CLEAR CLOSE COLLECT COMMIT COMPUTE CONCATENATE CONDENSE CONSTANTS CONTINUE CONV CORRESPONDING CREATE DATA DEFAULT ' +
    'DEFINE DELETE DESCENDING DESCRIBE DIVIDE DO ELSE ELSEIF END END-OF-DEFINITION ENDCASE ENDCLASS ENDDO ENDFORM ENDFUNCTION ENDIF ENDLOOP ' +
    'ENDMETHOD ENDMODULE ENDSELECT ENDTRY ENDWHILE ENDAT ENDON ENDPROVIDE ENTRIES EQ EXCEPTIONS EXIT EXPORTING FIELD FIELD-SYMBOLS FIND FOR FORM FREE FROM ' +
    'FUNCTION GE GET GT IF IMPORTING IN INDEX INITIAL INNER INSERT INTO IS JOIN KEY LE LEFT LENGTH LIKE LINE LINES LOOP LT MESSAGE METHOD MODIFY ' +
    'MOVE MOVE-CORRESPONDING MULTIPLY NE NEW NOT OCCURS OF OFFSET ON OR ORDER OTHERS OVERLAY PACK PERFORM RAISE RAISING RANGE RANGES READ REF REFRESH REPLACE ' +
    'RETURN RETURNING SEARCH SELECT SELECT-OPTIONS SET SHIFT SINGLE SIZE SORT SPLIT STANDARD STATICS STRUCTURE SUBMIT SUBTRACT SUM TABLE TABLES ' +
    'TO TRANSFER TRANSLATE TRY TYPE TYPES UNASSIGN UNPACK UP UPDATE USING VALUE WHEN WHERE WHILE WITH WORK WRITE ZONE ABS BOUND REDUCE COND SWITCH ' +
    'LINE_EXISTS LINES STRLEN XSDBOOL UPPER LOWER TO_UPPER TO_LOWER DIV MOD BIT-AND IS NOT ASSIGNED SUPPLIED REQUESTED SORTED HASHED UNIQUE NON-UNIQUE ' +
    'RESPECTING BLANKS SEPARATED UNTIL VARYING CO CN CA NA CS NS CP NP BT NB DECIMALS CURRENCY UNIT EDIT MASK NO-ZERO NO-GAP NO-SIGN TIME DATE ZERO ' +
    'IMPORT EXPORT MEMORY ID SHARED BUFFER PROTECTED PRIVATE PUBLIC SECTION DEFINITION IMPLEMENTATION METHODS CLASS-METHODS EVENTS INTERFACE ENDINTERFACE ' +
    'INHERITING FINAL ABSTRACT REDEFINITION LET PARAMETERS NEXT SKIP ULINE CONVERT TIME STAMP GROUP GROUPS MEMBERS ENDENHANCEMENT ENHANCEMENT ASSERT ' +
    'FETCH CURSOR OPEN PACKAGE UP TO ROWS HAVING DISTINCT COUNT MAX MIN AVG CAST').split(' ');
  const KWSET = new Set(KW);
  const OPEN = { IF: 'ENDIF', LOOP: 'ENDLOOP', DO: 'ENDDO', WHILE: 'ENDWHILE', CASE: 'ENDCASE', TRY: 'ENDTRY', FORM: 'ENDFORM', SELECT: 'ENDSELECT',
    METHOD: 'ENDMETHOD', CLASS: 'ENDCLASS', FUNCTION: 'ENDFUNCTION', AT: 'ENDAT', DEFINE: 'END-OF-DEFINITION', INTERFACE: 'ENDINTERFACE', PROVIDE: 'ENDPROVIDE', ON: 'ENDON' };
  const CLOSE = Object.fromEntries(Object.entries(OPEN).map(([k, v]) => [v, k]));
  const MIDDLE = new Set(['ELSE', 'ELSEIF', 'WHEN', 'CATCH', 'CLEANUP']);

  /* split statement text; strips comments and literals */
  function scan(lines) {
    const stmts = []; let cur = { text: '', line: 0 };
    lines.forEach((raw, i) => {
      if (/^\*/.test(raw)) return;
      let s = '', q = null;
      for (let k = 0; k < raw.length; k++) {
        const c = raw[k];
        if (q) { if (c === q) { if (raw[k + 1] === q) { k++; continue; } q = null; } s += ' '; continue; }
        if (c === '"') break;
        if (c === "'" || c === '`' || c === '|') { q = c; s += ' '; continue; }
        if (c === '.') { cur.text += s; if (!cur.line) cur.line = i + 1; if (cur.text.trim()) stmts.push(cur); cur = { text: '', line: 0 }; s = ''; continue; }
        if (c === ':' ) { s += ' '; continue; }
        s += c;
      }
      if (s.trim() && !cur.line) cur.line = i + 1;
      cur.text += s + ' ';
    });
    if (cur.text.trim()) stmts.push({ ...cur, open: true });
    return stmts;
  }
  function firstWord(t) { return (t.trim().split(/\s+/)[0] || '').toUpperCase(); }

  function check(lines) {
    const stmts = scan(lines);
    const stack = [];
    for (const st of stmts) {
      if (st.open) return { ok: false, line: st.line, msg: `Line ${st.line}: statement is not terminated with a period` };
      let w = firstWord(st.text);
      const words = st.text.trim().toUpperCase().split(/\s+/);
      if (w === 'AT' && !/^AT\s+(NEW|END|FIRST|LAST|SELECTION-SCREEN|LINE-SELECTION|USER-COMMAND|PF\d+)/i.test(st.text.trim())) continue;
      if (w === 'SELECT' && (words.includes('SINGLE') || /\bINTO\s+(CORRESPONDING\s+FIELDS\s+OF\s+)?TABLE\b/i.test(st.text) || /\bUP\s+TO\s+1\s+ROWS\b/i.test(st.text) && /\bINTO\b/i.test(st.text) === false)) continue;
      if (w === 'SELECT' && /\bCOUNT\s*\(\s*\*\s*\)/i.test(st.text) && !/\bGROUP\b/i.test(st.text)) continue;
      if (w === 'CLASS' && /\b(DEFINITION\s+(DEFERRED|LOAD)|LOCAL\s+FRIENDS)\b/i.test(st.text)) continue;
      if (w === 'INTERFACE' && /\b(DEFERRED|LOAD)\b/i.test(st.text)) continue;
      if (w === 'ON' && !/^ON\s+CHANGE\s+OF/i.test(st.text.trim())) continue;
      if (w === 'DATA' && /^DATA\s*\(/i.test(st.text.trim())) continue;
      if (w === 'LOOP' && /\bLOOP\s+AT\s+SCREEN\b/i.test(st.text)) { stack.push({ w, line: st.line }); continue; }
      if (OPEN[w]) { stack.push({ w, line: st.line }); continue; }
      if (CLOSE[w]) {
        const top = stack.pop();
        if (!top) return { ok: false, line: st.line, msg: `Line ${st.line}: ${w} without ${CLOSE[w]}` };
        if (OPEN[top.w] !== w) return { ok: false, line: st.line, msg: `Line ${st.line}: ${w} found, but ${OPEN[top.w]} expected for ${top.w} in line ${top.line}` };
        continue;
      }
      if (MIDDLE.has(w)) {
        const top = stack[stack.length - 1];
        const want = { ELSE: ['IF'], ELSEIF: ['IF'], WHEN: ['CASE'], CATCH: ['TRY'], CLEANUP: ['TRY'] }[w];
        if (!top || !want.includes(top.w)) return { ok: false, line: st.line, msg: `Line ${st.line}: ${w} is only allowed inside ${want.join('/')}` };
      }
    }
    if (stack.length) { const t = stack[stack.length - 1]; return { ok: false, line: t.line, msg: `Line ${t.line}: ${t.w} is not closed (${OPEN[t.w]} missing)` }; }
    return { ok: true, msg: 'No syntax errors found' };
  }

  /* Pretty Printer: keywords upper case, indentation */
  function pretty(lines) {
    const out = []; let ind = 0; let cont = false; let pendingDedentAfter = false;
    for (const raw of lines) {
      if (/^\*/.test(raw)) { out.push(raw); continue; }
      const t = raw.trim();
      if (!t) { out.push(''); continue; }
      const up = upperKw(t);
      const w = firstWord(t.replace(/^[\s,]*/, ''));
      let myInd = ind;
      if (!cont) {
        if (CLOSE[w]) { ind = Math.max(0, ind - 2); myInd = ind; }
        else if (MIDDLE.has(w)) myInd = Math.max(0, ind - 2);
      } else myInd = ind + 2;
      out.push(' '.repeat(myInd) + up);
      const code = stripLit(t);
      const ends = /\.\s*$/.test(code);
      if (!cont && OPEN[w] && !isSingle(w, t)) ind += 2;
      cont = !ends && !/^\*/.test(t);
    }
    return out;
  }
  function isSingle(w, t) {
    if (w === 'SELECT' && (/\bSINGLE\b/i.test(t) || /\bTABLE\b/i.test(t))) return true;
    if (w === 'AT' && !/^AT\s+(NEW|END|FIRST|LAST)/i.test(t)) return true;
    if (w === 'CLASS' && /DEFERRED|LOAD/i.test(t)) return true;
    if (w === 'ON' && !/^ON\s+CHANGE/i.test(t)) return true;
    return false;
  }
  function stripLit(t) { return t.replace(/'(?:[^']|'')*'|`[^`]*`|\|[^|]*\|/g, '""').replace(/".*$/, ''); }
  function upperKw(t) {
    let out = '', i = 0;
    while (i < t.length) {
      const c = t[i];
      if (c === '"') { out += t.slice(i); break; }
      if (c === "'" || c === '`' || c === '|') { let j = i + 1; while (j < t.length && !(t[j] === c && t[j + 1] !== c)) { if (t[j] === c) j++; j++; } out += t.slice(i, j + 1); i = j + 1; continue; }
      const m = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(t.slice(i));
      if (m) { const word = m[0]; const prev = t[i - 1]; out += (KWSET.has(word.toUpperCase()) && prev !== '-' && prev !== '>' && prev !== '~') ? word.toUpperCase() : word; i += word.length; continue; }
      out += c; i++;
    }
    return out;
  }

  /* --- highlighting --- */
  function hl(line) {
    if (/^\*/.test(line)) return `<span class="ab-c">${esc(line)}</span>`;
    let out = '', i = 0;
    while (i < line.length) {
      const c = line[i];
      if (c === '"') { out += `<span class="ab-c">${esc(line.slice(i))}</span>`; break; }
      if (c === "'" || c === '`' || c === '|') { let j = i + 1; while (j < line.length && line[j] !== c) j++; out += `<span class="ab-s">${esc(line.slice(i, j + 1))}</span>`; i = j + 1; continue; }
      const m = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(line.slice(i));
      if (m) { const word = m[0]; const prev = line[i - 1]; out += (KWSET.has(word.toUpperCase()) && prev !== '-' && prev !== '>' && prev !== '~') ? `<span class="ab-k">${esc(word)}</span>` : esc(word); i += word.length; continue; }
      const n = /^\d+/.exec(line.slice(i));
      if (n) { out += `<span class="ab-n">${n[0]}</span>`; i += n[0].length; continue; }
      out += esc(c); i++;
    }
    return out;
  }

  /* --- the control --- */
  function create(lines, editable, onCommit, opts = {}) {
    const root = document.createElement('div'); root.className = 'abap-ed';
    const bar = document.createElement('div'); bar.className = 'ab-bar';
    const pos = document.createElement('span'); pos.className = 'ab-pos';
    const gut = document.createElement('div'); gut.className = 'ab-gutter';
    const wrap = document.createElement('div'); wrap.className = 'ab-wrap';
    const pre = document.createElement('pre'); pre.className = 'ab-hl'; pre.setAttribute('aria-hidden', 'true');
    const ta = document.createElement('textarea'); ta.className = 'ab-ta'; ta.spellcheck = false; ta.wrap = 'off';
    ta.value = lines.join('\n'); ta.readOnly = !editable;
    const btn = (ic, tip, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tb-btn'; b.innerHTML = icon(ic); b.title = tip; b.onclick = fn; bar.appendChild(b); return b; };
    let dirty = false;
    const commit = () => { if (!dirty) return; dirty = false; onCommit(ta.value.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, ''))); };
    btn('check', 'Check (Ctrl+F2)', () => { commit(); const r = check(ta.value.split('\n')); APP.msg(r.ok ? 'S' : 'E', r.msg); if (!r.ok && r.line) gotoLine(r.line); });
    if (editable) {
      btn('pretty', 'Pretty Printer (Shift+F1)', () => { ta.value = pretty(ta.value.split('\n')).join('\n'); dirty = true; render(); commit(); });
      btn('pattern', 'Insert comment frame', () => { insertAtLine(['*----------------------------------------------------------------------*', '*', '*----------------------------------------------------------------------*']); });
      btn('cut', 'Cut lines', () => document.execCommand && (ta.focus(), document.execCommand('cut')));
      btn('copy', 'Copy lines', () => document.execCommand && (ta.focus(), document.execCommand('copy')));
      btn('paste', 'Paste', async () => { try { const t = await navigator.clipboard.readText(); insertText(t); } catch { APP.msg('W', 'Use Ctrl+V to paste'); } });
      btn('undo', 'Undo (Ctrl+Z)', () => { ta.focus(); document.execCommand && document.execCommand('undo'); });
      const c1 = btn('variable', 'Comment lines (Ctrl+<)', () => toggleComment(true));
      const c2 = btn('reset', 'Uncomment lines (Ctrl+>)', () => toggleComment(false));
    }
    btn('search', 'Find (Ctrl+F)', () => findDlg());
    bar.appendChild(pos);
    const body = document.createElement('div'); body.className = 'ab-body';
    wrap.append(pre, ta); body.append(gut, wrap); root.append(bar, body);

    function render() {
      const ls = ta.value.split('\n');
      pre.innerHTML = ls.map(hl).join('\n') + '\n';
      gut.innerHTML = ls.map((_, i) => `<div>${i + 1}</div>`).join('');
      updPos();
    }
    function updPos() {
      const v = ta.value.slice(0, ta.selectionStart); const ln = v.split('\n').length; const col = v.length - v.lastIndexOf('\n');
      pos.textContent = `Ln ${ln}, Col ${col}   ${ta.value.split('\n').length} lines${editable ? '' : '   (display)'}`;
    }
    function gotoLine(n) {
      const ls = ta.value.split('\n'); let p = 0; for (let i = 0; i < n - 1 && i < ls.length; i++) p += ls[i].length + 1;
      ta.focus(); ta.setSelectionRange(p, p + (ls[n - 1] || '').length);
      ta.scrollTop = Math.max(0, (n - 4) * 16);
    }
    function selLines() {
      const v = ta.value; const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1; let e = v.indexOf('\n', Math.max(ta.selectionEnd - (ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === '\n' ? 1 : 0), ta.selectionStart)); if (e < 0) e = v.length;
      return { s, e };
    }
    function toggleComment(on) {
      const { s, e } = selLines(); const block = ta.value.slice(s, e).split('\n').map(l => on ? '*' + l : l.replace(/^\*/, '')).join('\n');
      ta.value = ta.value.slice(0, s) + block + ta.value.slice(e); ta.setSelectionRange(s, s + block.length); dirty = true; render(); commit();
    }
    function insertAtLine(ls) { const { s } = selLines(); ta.value = ta.value.slice(0, s) + ls.join('\n') + '\n' + ta.value.slice(s); dirty = true; render(); commit(); }
    function insertText(t) { const a = ta.selectionStart; ta.value = ta.value.slice(0, a) + t + ta.value.slice(ta.selectionEnd); ta.setSelectionRange(a + t.length, a + t.length); dirty = true; render(); commit(); }
    function findDlg() { APP.promptText('Find', 'Search term', root.dataset.lastFind || '', q => findNext(q)); }
    function findNext(q) {
      if (!q) return; root.dataset.lastFind = q;
      const v = ta.value.toUpperCase(); let i = v.indexOf(q.toUpperCase(), ta.selectionEnd); if (i < 0) i = v.indexOf(q.toUpperCase());
      if (i < 0) return APP.msg('W', `${q} not found`);
      ta.focus(); ta.setSelectionRange(i, i + q.length); const ln = ta.value.slice(0, i).split('\n').length; ta.scrollTop = Math.max(0, (ln - 4) * 16);
    }
    ta.addEventListener('input', () => { dirty = true; render(); });
    ta.addEventListener('blur', commit);
    ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gut.scrollTop = ta.scrollTop; });
    ta.addEventListener('keyup', updPos); ta.addEventListener('click', updPos);
    ta.addEventListener('keydown', e => {
      if (!editable) return;
      if (e.key === 'Tab') { e.preventDefault(); insertText('  '); }
      else if (e.key === 'Enter') {
        const v = ta.value; const ls = v.lastIndexOf('\n', ta.selectionStart - 1) + 1; const ind = /^\s*/.exec(v.slice(ls))[0];
        e.preventDefault(); insertText('\n' + ind);
      } else if (e.key === 'F1' && e.shiftKey) { e.preventDefault(); ta.value = pretty(ta.value.split('\n')).join('\n'); dirty = true; render(); commit(); }
      else if (e.key === 'F2' && e.ctrlKey) { e.preventDefault(); commit(); const r = check(ta.value.split('\n')); APP.msg(r.ok ? 'S' : 'E', r.msg); }
      else if ((e.key === '<' || e.key === ',') && e.ctrlKey) { e.preventDefault(); toggleComment(true); }
      else if ((e.key === '>' || e.key === '.') && e.ctrlKey) { e.preventDefault(); toggleComment(false); }
      else if (e.key === 'f' && e.ctrlKey) { e.preventDefault(); findDlg(); }
      else if (e.key === 's' && e.ctrlKey) { commit(); }
    });
    render();
    root.commit = commit;
    APP.registerCommit?.(commit);
    return root;
  }
  return { create, check, pretty, scan };
})();
