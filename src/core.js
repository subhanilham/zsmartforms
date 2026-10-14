/* =====================================================================
   core.js — XML helpers, units, languages, undo journal
   The XML document is the only source of truth. Every edit is a DOM
   mutation; untouched parts serialize byte-identically.
   ===================================================================== */
'use strict';

const NS_SF = 'urn:sap-com:SmartForms:2000:internal-structure';
const NS_ST = 'urn:sap-com:SmartForms:2000:style-internal-structure';
const NS_IFR = 'urn:sap-com:sdixml-ifr:2000';
const XML_DECL = '<?xml version="1.0" encoding="utf-8"?>';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- element names: "sf:X" = SmartForms/Style namespace, "X" = ifr namespace ---------- */
const X = {
  nameOf(el) { return el.namespaceURI === NS_IFR || !el.namespaceURI ? el.localName : 'sf:' + el.localName; },
  matches(el, name) {
    if (name.startsWith('sf:')) return el.localName === name.slice(3) && (el.namespaceURI === NS_SF || el.namespaceURI === NS_ST);
    return el.localName === name && (el.namespaceURI === NS_IFR || !el.namespaceURI);
  },
  kids(el, name) { return el ? [...el.children].filter(c => !name || X.matches(c, name)) : []; },
  kid(el, name) { if (!el) return null; for (const c of el.children) if (X.matches(c, name)) return c; return null; },
  path(el, ...names) { for (const n of names) { el = X.kid(el, n); if (!el) return null; } return el; },
  val(el, ...names) { const e = names.length ? X.path(el, ...names) : el; return e ? e.textContent : ''; },
  sfNs(el) { const r = (el.ownerDocument || el).documentElement; return r.namespaceURI; },
  mk(doc, name, sfNs) {
    if (name.startsWith('sf:')) return doc.createElementNS(sfNs || doc.documentElement.namespaceURI, 'sf:' + name.slice(3));
    return doc.createElementNS(NS_IFR, name);
  },
  /* path stack for ordering context: resets at sf:NODE */
  stack(el) {
    const out = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const n = X.nameOf(e);
      if (n === 'sf:NODE') { out.unshift('NODE'); break; }
      out.unshift(n);
    }
    return out;
  },
  orderFor(parent) {
    const st = X.stack(parent);
    const key = st.slice(-2).join('/');
    return ORDER[key] || ORDER[st[st.length - 1]] || null;
  },
  /* insert child respecting SAP element order */
  insertOrdered(parent, child) {
    const order = X.orderFor(parent);
    const cn = X.nameOf(child);
    let ref = null;
    if (order) {
      const idx = order.indexOf(cn);
      if (idx >= 0) {
        for (const sib of parent.children) {
          const si = order.indexOf(X.nameOf(sib));
          if (si > idx) { ref = sib; break; }
        }
      } else {
        ref = X.kid(parent, 'T_CAPTION') || X.kid(parent, 'T_TEXT') || null;
      }
    }
    parent.insertBefore(child, ref);
    return child;
  },
  ensure(parent, name) {
    let c = X.kid(parent, name);
    if (!c) c = X.insertOrdered(parent, X.mk(parent.ownerDocument, name, X.sfNs(parent)));
    return c;
  },
  ensurePath(el, ...names) { for (const n of names) el = X.ensure(el, n); return el; },
  /* set leaf value; '' or null removes the element (SDIXML omits initial values) */
  set(parent, name, v) {
    let c = X.kid(parent, name);
    if (v === '' || v === null || v === undefined || v === false) { if (c) c.remove(); return; }
    if (v === true) v = 'X';
    if (!c) c = X.insertOrdered(parent, X.mk(parent.ownerDocument, name, X.sfNs(parent)));
    if (c.textContent !== String(v)) c.textContent = String(v);
  },
  setPath(el, names, v) {
    const last = names[names.length - 1];
    if (v === '' || v === null || v === undefined || v === false) {
      const p = X.path(el, ...names.slice(0, -1)); if (p) X.set(p, last, ''); return;
    }
    X.set(X.ensurePath(el, ...names.slice(0, -1)), last, v);
  },
  remove(parent, name) { const c = X.kid(parent, name); if (c) c.remove(); },
  /* list of <item> rows -> plain objects (field order kept separately) */
  rows(listEl) { return X.kids(listEl, 'item'); },
  newItem(listEl, fields) {
    const it = X.mk(listEl.ownerDocument, 'item');
    listEl.appendChild(it);
    for (const [k, v] of Object.entries(fields)) if (v !== '' && v != null) X.set(it, k, v);
    return it;
  },
  setLines(listEl, lines) {
    while (listEl.firstChild) listEl.firstChild.remove();
    for (const l of lines) { const it = X.mk(listEl.ownerDocument, 'item'); if (l !== '') it.textContent = l; listEl.appendChild(it); }
  },
  lines(listEl) { return X.kids(listEl, 'item').map(i => i.textContent); },
};

function parseXml(text) {
  const doc = new DOMParser().parseFromString(String(text).replace(/^﻿/, ''), 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('Not well-formed XML: ' + err.textContent.split('\n')[0].slice(0, 200));
  return doc;
}
/* Byte-faithful serializer: SAP writes ' and " in text content as entities. */
function serializeXml(doc) {
  let s = new XMLSerializer().serializeToString(doc);
  s = s.replace(/^<\?xml[^>]*\?>\s*/, '');
  s = s.replace(/>([^<]+)</g, (m, t) => '>' + t.replace(/'/g, '&apos;').replace(/"/g, '&quot;') + '<');
  return XML_DECL + s;
}

/* ---------- languages: SAP 1-char key <-> ISO ---------- */
const LANG = (() => {
  const pairs = '0 SR 1 ZH 2 TH 3 KO 4 RO 5 SL 6 HR 7 MS 8 UK 9 ET A AR B HE C CS D DE E EN F FR G EL H HU I IT J JA K DA L PL M ZF N NL O NO P PT Q SK R RU S ES T TR U FI V SV W BG X LT Y LV Z Z1 a AF b IS c CA d SH i ID 뢚 AZ 뢌 KK'.split(' ');
  const toIso = {}, toSap = {};
  for (let i = 0; i < pairs.length; i += 2) { toIso[pairs[i]] = pairs[i + 1]; toSap[pairs[i + 1]] = pairs[i]; }
  return { iso: k => toIso[k] || k, sap: iso => toSap[(iso || '').toUpperCase()] || iso };
})();

/* ---------- units ---------- */
const UNIT_CM = { CM: 1, MM: .1, IN: 2.54, PT: 2.54 / 72, TW: 2.54 / 1440 };
const UNITS_H = ['CH', 'CM', 'MM', 'IN', 'PT', 'TW'];
const UNITS_V = ['LN', 'CM', 'MM', 'IN', 'PT', 'TW'];
const UNITS_ALL = ['CH', 'LN', 'CM', 'MM', 'IN', 'PT', 'TW'];
function toCm(v, u, ctx) {
  const n = parseFloat(String(v).replace(',', '.')); if (!isFinite(n)) return 0;
  u = (u || 'CM').toUpperCase();
  if (u === 'CH') return n * 2.54 / (ctx?.cpi || 10);
  if (u === 'LN') return n * 2.54 / (ctx?.lpi || 6);
  return n * (UNIT_CM[u] ?? 1);
}
function fromCm(cm, u, ctx) {
  u = (u || 'CM').toUpperCase();
  if (u === 'CH') return cm / 2.54 * (ctx?.cpi || 10);
  if (u === 'LN') return cm / 2.54 * (ctx?.lpi || 6);
  return cm / (UNIT_CM[u] ?? 1);
}
const dec2 = n => (Math.round(n * 100) / 100).toFixed(2);
/* SAP decimal input: accepts "1,5" / "1.5"; returns '' for empty */
function normDec(v, decimals = 2) {
  const t = String(v ?? '').trim(); if (!t) return '';
  const n = parseFloat(t.replace(/\s/g, '').replace(',', '.'));
  if (!isFinite(n)) throw new Error(`"${t}" is not a valid number`);
  return n.toFixed(decimals);
}
const PAGE_SIZES = { DINA4: [21, 29.7], DINA5: [14.8, 21], DINA3: [29.7, 42], DINA6: [10.5, 14.8], LETTER: [21.59, 27.94], LEGAL: [21.59, 35.56], EXECUTIV: [18.42, 26.67], X_65_80: [16.51, 20.32], X_65_132: [33.53, 16.51] };

/* ---------- undo journal based on MutationObserver ---------- */
class Journal {
  constructor(doc, onChange) {
    this.doc = doc; this.onChange = onChange;
    this.undoStack = []; this.redoStack = [];
    this.mo = new MutationObserver(() => {});
    this.mo.observe(doc, { subtree: true, childList: true, characterData: true, characterDataOldValue: true, attributes: true, attributeOldValue: true });
    this.applying = false;
  }
  /* run fn as one undoable step */
  tx(label, fn) {
    this.mo.takeRecords();
    let result, failed = true;
    try { result = fn(); failed = false; }
    finally {
      const recs = this.mo.takeRecords();
      if (failed && recs.length) {
        /* PAI error: roll back the partial change, keep history clean */
        this.applying = true;
        try { this.revert(recs.map(Journal.snap)); } finally { this.mo.takeRecords(); this.applying = false; }
      } else if (recs.length && !this.applying) {
        this.undoStack.push({ label, recs: recs.map(Journal.snap) });
        if (this.undoStack.length > 200) this.undoStack.shift();
        this.redoStack = [];
        this.onChange?.(label);
      }
    }
    return result;
  }
  static snap(r) {
    return { type: r.type, target: r.target, added: [...r.addedNodes], removed: [...r.removedNodes], prev: r.previousSibling, next: r.nextSibling,
      oldValue: r.oldValue, attr: r.attributeName, attrNs: r.attributeNamespace, newValue: r.type === 'characterData' ? r.target.data : r.type === 'attributes' ? r.target.getAttributeNS(r.attributeNamespace, r.attributeName) : null };
  }
  revert(recs) {
    for (let i = recs.length - 1; i >= 0; i--) {
      const r = recs[i];
      if (r.type === 'characterData') r.target.data = r.oldValue;
      else if (r.type === 'attributes') { if (r.oldValue === null) r.target.removeAttributeNS(r.attrNs, r.attr); else r.target.setAttributeNS(r.attrNs, r.attr, r.oldValue); }
      else {
        for (const n of r.added) if (n.parentNode === r.target) r.target.removeChild(n);
        const before = r.next && r.next.parentNode === r.target ? r.next : (r.prev && r.prev.parentNode === r.target ? r.prev.nextSibling : null);
        for (const n of r.removed) r.target.insertBefore(n, before);
      }
    }
  }
  replay(recs) {
    for (const r of recs) {
      if (r.type === 'characterData') r.target.data = r.newValue;
      else if (r.type === 'attributes') { if (r.newValue === null) r.target.removeAttributeNS(r.attrNs, r.attr); else r.target.setAttributeNS(r.attrNs, r.attr, r.newValue); }
      else {
        for (const n of r.removed) if (n.parentNode === r.target) r.target.removeChild(n);
        const before = r.next && r.next.parentNode === r.target ? r.next : (r.prev && r.prev.parentNode === r.target ? r.prev.nextSibling : (r.prev ? null : r.target.firstChild));
        for (const n of r.added) r.target.insertBefore(n, before);
      }
    }
  }
  undo() {
    const s = this.undoStack.pop(); if (!s) return null;
    this.applying = true; this.mo.takeRecords();
    try { this.revert(s.recs); } finally { this.mo.takeRecords(); this.applying = false; }
    this.redoStack.push(s); this.onChange?.('undo'); return s.label;
  }
  redo() {
    const s = this.redoStack.pop(); if (!s) return null;
    this.applying = true; this.mo.takeRecords();
    try { this.replay(s.recs); } finally { this.mo.takeRecords(); this.applying = false; }
    this.undoStack.push(s); this.onChange?.('redo'); return s.label;
  }
  dispose() { this.mo.disconnect(); }
}

/* small event bus */
const Bus = { h: {}, on(e, f) { (this.h[e] ||= []).push(f); }, emit(e, ...a) { for (const f of this.h[e] || []) f(...a); } };
