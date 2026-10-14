/* =====================================================================
   icons.js — small SAP-like icon set (16px SVG), keyed by our names,
   SAP icon names (ICON_xxx) and two-character SAP icon ids (@xx@).
   ===================================================================== */
'use strict';

const ICON_SVG = (() => {
  const s = (body, extra = '') => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true" ${extra}>${body}</svg>`;
  const doc = (fill = 'var(--ic-paper)', stroke = 'var(--ic-line)') => `<path d="M3.5 1.5h6l3 3v10h-9z" fill="${fill}" stroke="${stroke}"/><path d="M9.5 1.5v3h3" fill="none" stroke="${stroke}"/>`;
  const win = (fill) => `<rect x="1.5" y="2.5" width="13" height="11" fill="var(--ic-paper)" stroke="var(--ic-line)"/><rect x="1.5" y="2.5" width="13" height="3" fill="${fill}" stroke="var(--ic-line)"/>`;
  return {
    page: s(doc()),
    win: s(win('var(--ic-blue)') + '<text x="8" y="12.3" font-size="6.5" text-anchor="middle" fill="var(--ic-line)" font-family="Arial" font-weight="700">B</text>'),
    win_main: s(win('var(--ic-blue)') + '<text x="8" y="12.3" font-size="6.5" text-anchor="middle" fill="var(--ic-line)" font-family="Arial" font-weight="700">A</text>'),
    win_copy: s(win('var(--ic-blue)') + '<text x="8" y="12.6" font-size="7" text-anchor="middle" fill="var(--ic-line)" font-family="Arial" font-weight="700">Σ</text>'),
    graphic: s('<rect x="1.5" y="2.5" width="13" height="11" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M2.5 12.5l3.5-4 2.5 2.5 2-2 3 3.5z" fill="var(--ic-green)"/><circle cx="11" cy="5.5" r="1.5" fill="var(--ic-yellow)"/>'),
    address: s('<rect x="1.5" y="3.5" width="13" height="9" rx="1" fill="var(--ic-paper)" stroke="var(--ic-line)"/><circle cx="5" cy="7" r="1.6" fill="var(--ic-blue)"/><path d="M2.8 11c.4-1.6 4-1.6 4.4 0" fill="var(--ic-blue)"/><path d="M8.5 6.5h4.5M8.5 8.5h4.5M8.5 10.5h3" stroke="var(--ic-line)"/>'),
    text: s(doc() + '<path d="M5 6.5h5M5 8.5h6M5 10.5h6M5 12.5h4" stroke="var(--ic-line)"/><path d="M10.5 9.5l4-4 1 1-4 4-1.5.5z" fill="var(--ic-orange)" stroke="var(--ic-line)" stroke-width=".6"/>'),
    command: s('<path d="M2 3h5v3H2zM9 10h5v3H9zM2 10h5v3H2z" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M4.5 6v4M7 11.5h2M4.5 8h7v2" fill="none" stroke="var(--ic-blue)" stroke-width="1.2"/>'),
    code: s('<path d="M8 1.5l6 3.5v6L8 14.5 2 11V5z" fill="var(--ic-purple)" stroke="var(--ic-line)" stroke-width=".8"/><path d="M8 1.5v13M2 5l6 3.5L14 5" fill="none" stroke="var(--ic-paper)" stroke-width=".8"/>'),
    condition: s('<path d="M8 1.5l6.5 6.5L8 14.5 1.5 8z" fill="var(--ic-yellow)" stroke="var(--ic-line)"/><text x="8" y="11" font-size="8" text-anchor="middle" fill="var(--ic-line)" font-family="Arial" font-weight="700">?</text>'),
    cond_marker: s('<path d="M8 2l6 6-6 6-6-6z" fill="var(--ic-yellow)" stroke="var(--ic-line)"/><path d="M5.5 8h5M8 5.5v5" stroke="var(--ic-line)"/>'),
    section: s('<rect x="2" y="2" width="12" height="12" fill="var(--ic-paper)" stroke="var(--ic-line)" stroke-dasharray="2 1"/>'),
    sect_folder: s('<path d="M1.5 4.5h5l1.5 1.5h6.5v7.5h-13z" fill="var(--ic-yellow)" stroke="var(--ic-line)"/>'),
    sect_loop: s('<path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2" fill="none" stroke="var(--ic-blue)" stroke-width="2"/><path d="M13.5 2.5v4h-4z" fill="var(--ic-blue)"/>'),
    sect_table: s('<rect x="1.5" y="2.5" width="13" height="11" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M1.5 5.5h13M1.5 8.5h13M1.5 11h13M6 2.5v11" stroke="var(--ic-line)"/><path d="M11 9l3 3" stroke="var(--ic-green)" stroke-width="2"/>'),
    sect_ctable: s('<rect x="1.5" y="2.5" width="13" height="11" fill="var(--ic-paper)" stroke="var(--ic-line)"/><rect x="1.5" y="2.5" width="13" height="3" fill="var(--ic-blue)"/><path d="M1.5 8.5h13M1.5 11h13M6 2.5v11M10.5 2.5v11" stroke="var(--ic-line)"/>'),
    sect_struct: s('<rect x="1.5" y="2.5" width="13" height="11" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M1.5 6.5h13M1.5 10h13M8 2.5v11M4.5 6.5v7" stroke="var(--ic-orange)" stroke-width="1.2"/>'),
    sect_row: s('<rect x="1.5" y="5.5" width="13" height="5" fill="var(--ic-blue-l)" stroke="var(--ic-line)"/><path d="M6 5.5v5M10.5 5.5v5" stroke="var(--ic-line)"/>'),
    sect_cell: s('<rect x="4.5" y="4.5" width="7" height="7" fill="var(--ic-green-l)" stroke="var(--ic-line)"/>'),
    event: s('<path d="M9.5 1.5L4 9h4l-1.5 5.5L12 7H8z" fill="var(--ic-yellow)" stroke="var(--ic-line)" stroke-width=".8" stroke-linejoin="round"/>'),
    ev_true: s('<circle cx="8" cy="8" r="5" fill="var(--ic-led-green)" stroke="var(--ic-line)" stroke-width=".8"/><circle cx="6.5" cy="6.5" r="1.4" fill="#fff" opacity=".6"/>'),
    ev_false: s('<circle cx="8" cy="8" r="5" fill="var(--ic-led-red)" stroke="var(--ic-line)" stroke-width=".8"/><circle cx="6.5" cy="6.5" r="1.4" fill="#fff" opacity=".6"/>'),
    folder: s('<path d="M1.5 4.5h5l1.5 1.5h6.5v7.5h-13z" fill="var(--ic-yellow)" stroke="var(--ic-line)"/>'),
    folder_open: s('<path d="M1.5 4.5h5l1.5 1.5h5v2" fill="var(--ic-yellow)" stroke="var(--ic-line)"/><path d="M1.5 13.5l2-5.5h11.5l-2 5.5z" fill="var(--ic-yellow)" stroke="var(--ic-line)"/>'),
    header: s(doc('var(--ic-paper)') + '<path d="M5 6h6M5 8h6M5 10h3" stroke="var(--ic-blue)"/>'),
    interface: s('<rect x="1.5" y="4.5" width="5" height="7" fill="var(--ic-paper)" stroke="var(--ic-line)"/><rect x="9.5" y="4.5" width="5" height="7" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M6.5 8h3" stroke="var(--ic-green)" stroke-width="2"/>'),
    globals: s('<circle cx="8" cy="8" r="6" fill="var(--ic-blue-l)" stroke="var(--ic-line)"/><path d="M2 8h12M8 2c-3 3-3 9 0 12M8 2c3 3 3 9 0 12" fill="none" stroke="var(--ic-line)" stroke-width=".8"/>'),
    style: s('<path d="M3 13l1-3 7-7 2 2-7 7z" fill="var(--ic-orange)" stroke="var(--ic-line)"/><path d="M2 14h12" stroke="var(--ic-line)"/>'),
    para: s('<path d="M7 2.5h6M10.5 2.5v11M8 2.5v11" stroke="var(--ic-line)" stroke-width="1.3"/><path d="M8 2.5a3 3 0 0 0 0 6" fill="var(--ic-line)"/>'),
    charfmt: s('<text x="8" y="12.5" font-size="11" text-anchor="middle" fill="var(--ic-line)" font-family="Georgia,serif" font-weight="700">A</text><path d="M3 14.5h10" stroke="var(--ic-orange)" stroke-width="1.5"/>'),
    /* toolbar */
    toggle: s('<path d="M2.5 11.5l7-7 2 2-7 7h-2z" fill="var(--ic-yellow)" stroke="var(--ic-line)"/><circle cx="11.5" cy="11.5" r="3" fill="var(--ic-paper)" stroke="var(--ic-line)"/><circle cx="11.5" cy="11.5" r="1" fill="var(--ic-line)"/>'),
    check: s('<path d="M2 3h8v10H2z" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M6.5 9l2.5 3 5-7" fill="none" stroke="var(--ic-green)" stroke-width="2"/>'),
    activate: s('<circle cx="8" cy="8" r="6" fill="var(--ic-orange)" stroke="var(--ic-line)" stroke-width=".8"/><path d="M8 4v4.5" stroke="#fff" stroke-width="1.6"/><path d="M5.3 6a3.5 3.5 0 1 0 5.4 0" fill="none" stroke="#fff" stroke-width="1.4"/>'),
    test: s('<path d="M6 1.5h4M7 1.5v4.5L3 13.5h10L9 6V1.5" fill="var(--ic-blue-l)" stroke="var(--ic-line)"/><path d="M4.5 10.5h7" stroke="var(--ic-blue)" stroke-width="2"/>'),
    expand: s('<rect x="2.5" y="2.5" width="11" height="11" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M5 8h6M8 5v6" stroke="var(--ic-line)" stroke-width="1.5"/>'),
    collapse: s('<rect x="2.5" y="2.5" width="11" height="11" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M5 8h6" stroke="var(--ic-line)" stroke-width="1.5"/>'),
    variable: s('<text x="8" y="12" font-size="10" text-anchor="middle" fill="var(--ic-blue)" font-family="Georgia,serif" font-style="italic" font-weight="700">x</text><path d="M2.5 3v10M13.5 3v10" stroke="var(--ic-line)"/>'),
    arrow_right: s('<path d="M2 6h7V3l5 5-5 5v-3H2z" fill="var(--ic-blue)"/>'),
    arrow_left: s('<path d="M14 6H7V3L2 8l5 5v-3h7z" fill="var(--ic-blue)"/>'),
    save: s('<path d="M2.5 2.5h9l2 2v9h-11z" fill="var(--ic-blue)" stroke="var(--ic-line)" stroke-width=".8"/><rect x="4.5" y="2.5" width="6" height="4" fill="var(--ic-paper)"/><rect x="4.5" y="9" width="7" height="4.5" fill="var(--ic-paper)"/>'),
    back: s('<circle cx="8" cy="8" r="6.5" fill="var(--ic-green)"/><path d="M9.5 4.5L6 8l3.5 3.5" fill="none" stroke="#fff" stroke-width="2"/>'),
    exit: s('<circle cx="8" cy="8" r="6.5" fill="var(--ic-orange)"/><path d="M5 8h6" stroke="#fff" stroke-width="2.2"/>'),
    cancel: s('<circle cx="8" cy="8" r="6.5" fill="var(--ic-led-red)"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" stroke-width="2"/>'),
    enter: s('<circle cx="8" cy="8" r="6.5" fill="var(--ic-green)"/><path d="M4.5 8.5l2.5 2.5 4.5-5" fill="none" stroke="#fff" stroke-width="2"/>'),
    create: s(doc() + '<path d="M11 10v5M8.5 12.5h5" stroke="var(--ic-green)" stroke-width="2"/>'),
    change: s('<path d="M2.5 11.5l8-8 2 2-8 8h-2z" fill="var(--ic-yellow)" stroke="var(--ic-line)"/><path d="M9.5 4.5l2 2" stroke="var(--ic-line)"/>'),
    display: s('<circle cx="7" cy="7" r="4.5" fill="var(--ic-paper)" stroke="var(--ic-line)" stroke-width="1.5"/><path d="M10.5 10.5l4 4" stroke="var(--ic-line)" stroke-width="2"/>'),
    copy: s('<rect x="2.5" y="2.5" width="8" height="9" fill="var(--ic-paper)" stroke="var(--ic-line)"/><rect x="5.5" y="5.5" width="8" height="9" fill="var(--ic-paper)" stroke="var(--ic-line)"/>'),
    cut: s('<circle cx="4.5" cy="12" r="2" fill="none" stroke="var(--ic-line)" stroke-width="1.3"/><circle cx="11.5" cy="12" r="2" fill="none" stroke="var(--ic-line)" stroke-width="1.3"/><path d="M5.5 10.5L11 2M10.5 10.5L5 2" stroke="var(--ic-line)" stroke-width="1.3"/>'),
    paste: s('<rect x="2.5" y="3" width="9" height="11" rx="1" fill="var(--ic-orange)" stroke="var(--ic-line)"/><rect x="5" y="1.5" width="4" height="3" fill="var(--ic-paper)" stroke="var(--ic-line)"/><rect x="7" y="7" width="7" height="8" fill="var(--ic-paper)" stroke="var(--ic-line)"/>'),
    rename: s('<rect x="1.5" y="5" width="13" height="6" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M4 7v2M10 3.5v9M8.5 3.5h3M8.5 12.5h3" stroke="var(--ic-line)"/>'),
    delete: s('<path d="M4 5h8l-1 9H5z" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M3 4h10M6.5 2.5h3" stroke="var(--ic-line)" stroke-width="1.2"/><path d="M6.5 7v5M9.5 7v5" stroke="var(--ic-line)"/>'),
    insert_row: s('<rect x="1.5" y="3.5" width="13" height="9" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M1.5 8h13" stroke="var(--ic-line)"/><path d="M8 5v6M5 8h6" stroke="var(--ic-green)" stroke-width="2"/>'),
    delete_row: s('<rect x="1.5" y="3.5" width="13" height="9" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M5 8h6" stroke="var(--ic-led-red)" stroke-width="2.2"/>'),
    insert_col: s('<rect x="2.5" y="1.5" width="11" height="13" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M8 1.5v13" stroke="var(--ic-line)"/><path d="M8 5v6M5 8h6" stroke="var(--ic-green)" stroke-width="2"/>'),
    delete_col: s('<rect x="2.5" y="1.5" width="11" height="13" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M5 8h6" stroke="var(--ic-led-red)" stroke-width="2.2"/>'),
    undo: s('<path d="M4 6h6a3.5 3.5 0 0 1 0 7H6" fill="none" stroke="var(--ic-blue)" stroke-width="1.8"/><path d="M1.5 6L5.5 2.5v7z" fill="var(--ic-blue)"/>'),
    redo: s('<path d="M12 6H6a3.5 3.5 0 0 0 0 7h4" fill="none" stroke="var(--ic-blue)" stroke-width="1.8"/><path d="M14.5 6L10.5 2.5v7z" fill="var(--ic-blue)"/>'),
    info: s('<circle cx="8" cy="8" r="6.5" fill="var(--ic-blue)"/><path d="M8 7v5" stroke="#fff" stroke-width="1.8"/><circle cx="8" cy="4.6" r="1.1" fill="#fff"/>'),
    warning: s('<path d="M8 1.5l7 12.5H1z" fill="var(--ic-yellow)" stroke="var(--ic-line)" stroke-width=".8"/><path d="M8 6v4.5" stroke="var(--ic-line)" stroke-width="1.6"/><circle cx="8" cy="12" r=".9" fill="var(--ic-line)"/>'),
    error: s('<circle cx="8" cy="8" r="6.5" fill="var(--ic-led-red)"/><path d="M8 4v5" stroke="#fff" stroke-width="1.8"/><circle cx="8" cy="11.5" r="1.1" fill="#fff"/>'),
    success: s('<circle cx="8" cy="8" r="6.5" fill="var(--ic-green)"/><path d="M4.5 8.5l2.5 2.5 4.5-5" fill="none" stroke="#fff" stroke-width="2"/>'),
    more: s('<rect x="2.5" y="2.5" width="11" height="11" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M5 6h6M5 8.5h6M5 11h4" stroke="var(--ic-line)"/><path d="M11 10l2.5 2.5-2.5 2.5" fill="none" stroke="var(--ic-green)" stroke-width="1.5"/>'),
    takeover: s('<path d="M2 6h6V3l5 5-5 5v-3H2z" fill="var(--ic-green)"/>'),
    sort_up: s('<path d="M4 13V3M2 5l2-2.5L6 5" fill="none" stroke="var(--ic-line)" stroke-width="1.3"/><text x="11" y="7" font-size="5.5" text-anchor="middle" font-family="Arial" fill="var(--ic-blue)">A</text><text x="11" y="13.5" font-size="5.5" text-anchor="middle" font-family="Arial" fill="var(--ic-blue)">Z</text>'),
    sort_down: s('<path d="M4 3v10M2 11l2 2.5 2-2.5" fill="none" stroke="var(--ic-line)" stroke-width="1.3"/><text x="11" y="7" font-size="5.5" text-anchor="middle" font-family="Arial" fill="var(--ic-blue)">Z</text><text x="11" y="13.5" font-size="5.5" text-anchor="middle" font-family="Arial" fill="var(--ic-blue)">A</text>'),
    prev: s('<path d="M10 3L5 8l5 5" fill="none" stroke="var(--ic-line)" stroke-width="2"/>'),
    next: s('<path d="M6 3l5 5-5 5" fill="none" stroke="var(--ic-line)" stroke-width="2"/>'),
    first: s('<path d="M12 3L7 8l5 5M7 3L2 8l5 5" fill="none" stroke="var(--ic-line)" stroke-width="1.8"/>'),
    last: s('<path d="M4 3l5 5-5 5M9 3l5 5-5 5" fill="none" stroke="var(--ic-line)" stroke-width="1.8"/>'),
    pretty: s('<path d="M2 3h12M4 6h10M4 9h8M2 12h10" stroke="var(--ic-line)" stroke-width="1.3"/><path d="M12 9.5l3 3" stroke="var(--ic-orange)" stroke-width="2"/>'),
    pattern: s('<path d="M2 3h12M2 3v10M2 13h12M14 3v10M2 6.5h12M2 10h12M6.5 3v10M10.5 3v10" stroke="var(--ic-line)"/><rect x="2" y="3" width="12" height="3.5" fill="var(--ic-blue-l)" opacity=".7"/>'),
    tablepainter: s('<rect x="1.5" y="2.5" width="13" height="11" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M1.5 6h13M6 2.5v11" stroke="var(--ic-line)"/><path d="M9 13l5-5 1 1-5 5h-1z" fill="var(--ic-orange)"/>'),
    or: s('<rect x="1" y="4" width="14" height="8" rx="2" fill="var(--ic-paper)" stroke="var(--ic-line)"/><text x="8" y="10.5" font-size="6.5" text-anchor="middle" font-family="Arial" font-weight="700" fill="var(--ic-blue)">OR</text>'),
    struct: s('<path d="M3 2.5v11M3 5h4M3 10h4" stroke="var(--ic-line)" stroke-width="1.2"/><rect x="7" y="3" width="7" height="4" fill="var(--ic-blue-l)" stroke="var(--ic-line)"/><rect x="7" y="8" width="7" height="4" fill="var(--ic-blue-l)" stroke="var(--ic-line)"/>'),
    double: s('<path d="M2 4h12M2 8h12M2 12h12" stroke="var(--ic-line)" stroke-width="1.3"/>'),
    concat: s('<path d="M2 5h5M9 5h5M2 10h12" stroke="var(--ic-line)" stroke-width="1.3"/><path d="M7 5c1 0 1 5 2 5" fill="none" stroke="var(--ic-orange)"/>'),
    move: s('<path d="M2 8h12M11 5l3 3-3 3M5 5L2 8l3 3" fill="none" stroke="var(--ic-line)" stroke-width="1.4"/>'),
    search: s('<circle cx="7" cy="7" r="4" fill="none" stroke="var(--ic-line)" stroke-width="1.6"/><path d="M10 10l4 4" stroke="var(--ic-line)" stroke-width="2"/>'),
    tools: s('<path d="M3 13l6-6M10.5 2.5a3 3 0 1 0 3 3l-2 .5-1.5-1.5z" fill="var(--ic-paper)" stroke="var(--ic-line)" stroke-width="1.3"/>'),
    border_outside: s('<rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="var(--ic-line)" stroke-width="2"/><path d="M8 3v10M3 8h10" stroke="var(--ic-line)" stroke-dasharray="1 1"/>'),
    border_inside: s('<rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="var(--ic-line)" stroke-dasharray="1 1"/><path d="M8 2.5v11M2.5 8h11" stroke="var(--ic-line)" stroke-width="2"/>'),
    border_left: s('<rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="var(--ic-line)" stroke-dasharray="1 1"/><path d="M2.5 2.5v11" stroke="var(--ic-line)" stroke-width="2.2"/>'),
    border_right: s('<rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="var(--ic-line)" stroke-dasharray="1 1"/><path d="M13.5 2.5v11" stroke="var(--ic-line)" stroke-width="2.2"/>'),
    border_top: s('<rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="var(--ic-line)" stroke-dasharray="1 1"/><path d="M2.5 2.5h11" stroke="var(--ic-line)" stroke-width="2.2"/>'),
    border_bottom: s('<rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="var(--ic-line)" stroke-dasharray="1 1"/><path d="M2.5 13.5h11" stroke="var(--ic-line)" stroke-width="2.2"/>'),
    shading: s('<rect x="2.5" y="2.5" width="11" height="11" fill="var(--ic-blue-l)" stroke="var(--ic-line)"/><path d="M3 9l6-6M3 13l10-10M7 13l6-6" stroke="var(--ic-blue)" stroke-width=".8"/>'),
    reset: s('<path d="M4 7a4.5 4.5 0 1 1 1.3 5.2" fill="none" stroke="var(--ic-line)" stroke-width="1.6"/><path d="M1.5 4.5l3 3 2.5-3.5z" fill="var(--ic-line)"/>'),
    upload: s('<path d="M3 11v3h10v-3" fill="none" stroke="var(--ic-line)" stroke-width="1.4"/><path d="M8 2l4 4H9.5v5h-3V6H4z" fill="var(--ic-blue)"/>'),
    download: s('<path d="M3 11v3h10v-3" fill="none" stroke="var(--ic-line)" stroke-width="1.4"/><path d="M8 11l4-4H9.5V2h-3v5H4z" fill="var(--ic-blue)"/>'),
    library: s('<rect x="1.5" y="2.5" width="3" height="11" fill="var(--ic-blue)" stroke="var(--ic-line)" stroke-width=".7"/><rect x="5" y="2.5" width="3" height="11" fill="var(--ic-orange)" stroke="var(--ic-line)" stroke-width=".7"/><path d="M9 3.5l3-1 3 10.5-3 1z" fill="var(--ic-green)" stroke="var(--ic-line)" stroke-width=".7"/>'),
    f4: s('<rect x="2.5" y="2.5" width="11" height="11" rx="1" fill="var(--ic-paper)" stroke="var(--ic-line)"/><path d="M5 6h6M5 8.5h6M5 11h4" stroke="var(--ic-line)"/>'),
  };
})();
const ICON_BY_SAPNAME = {
  ICON_CHECK: 'check', ICON_COLUMN_RIGHT: 'next', ICON_COLUMN_LEFT: 'prev', ICON_INSERT_ROW: 'insert_row', ICON_DELETE_ROW: 'delete_row',
  ICON_SYSTEM_CUT: 'cut', ICON_SYSTEM_COPY: 'copy', ICON_SYSTEM_PASTE: 'paste', ICON_RENAME: 'rename', ICON_SYSTEM_UNDO: 'undo',
  ICON_CHANGE_TEXT: 'text', ICON_ABAP: 'code', ICON_TOOLS: 'tools', ICON_REPLACE: 'change', ICON_ENTER_MORE: 'more', ICON_SET_SUM: 'win_copy',
  ICON_ARROW_LEFT: 'arrow_left', ICON_ARROW_RIGHT: 'arrow_right', ICON_PLANNING_IN: 'insert_col', ICON_PLANNING_OUT: 'delete_col',
  ICON_PAGE_LEFT: 'first', ICON_PAGE_RIGHT: 'last', ICON_DISPLAY: 'display', ICON_CHANGE: 'change', ICON_CREATE: 'create', ICON_INFORMATION: 'info',
  ICON_NEXT_VALUE: 'next', ICON_PREVIOUS_VALUE: 'prev', ICON_SORT_UP: 'sort_up', ICON_SORT_DOWN: 'sort_down', ICON_MESSAGE_WARNING: 'warning',
  ICON_TOGGLE_DISPLAY_CHANGE: 'toggle', ICON_ACTIVATE: 'activate', ICON_TEST: 'test', ICON_EXPAND: 'expand', ICON_COLLAPSE: 'collapse',
  ICON_VARIABLE: 'variable', ICON_COPY_OBJECT: 'copy', ICON_DELETE: 'delete', ICON_SEARCH: 'search', ICON_SEARCH_NEXT: 'search',
};
const ICON_BY_ID = {
  '0D': 'prev', '0E': 'next', '0F': 'last', '0G': 'first', '0H': 'next', '0I': 'prev', '0Q': 'change', '0S': 'info', '0Y': 'create',
  '0Z': 'change', '10': 'display', '11': 'delete', '17': 'insert_row', '18': 'delete_row', '1A': 'warning', '1F': 'more', '2T': 'cut',
  '2U': 'copy', '2V': 'paste', '2W': 'reset', '37': 'takeover', '38': 'check', '3E': 'sort_up', '3F': 'sort_down', '40': 'move',
  '45': 'pretty', '4F': 'rename', '57': 'double', '8B': 'or', '8U': 'insert_col', '8V': 'delete_col', '9S': 'tablepainter',
  '9T': 'pattern', '9U': 'struct', 'CH': 'concat', '0V': 'create', 'GU': 'insert_row',
};
/* one SVG sprite; icon() returns a cheap <use> reference (big trees render thousands of icons) */
let ICON_SPRITE_DONE = false;
function iconSprite() {
  if (ICON_SPRITE_DONE || typeof document === 'undefined' || !document.body) return ICON_SPRITE_DONE;
  const parts = [];
  for (const [k, svg] of Object.entries(ICON_SVG)) {
    const m = /^<svg([^>]*)>([\s\S]*)<\/svg>$/.exec(svg); if (!m) continue;
    const vb = (/viewBox="([^"]*)"/.exec(m[1]) || [, '0 0 16 16'])[1];
    parts.push(`<symbol id="ic-${k}" viewBox="${vb}">${m[2]}</symbol>`);
  }
  const holder = document.createElement('div'); holder.style.display = 'none'; holder.setAttribute('aria-hidden', 'true');
  holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  document.body.prepend(holder);
  ICON_SPRITE_DONE = true; return true;
}
function icon(name) {
  if (!name) return '';
  const k = ICON_SVG[name] ? name : ICON_BY_SAPNAME[name] || ICON_BY_ID[name];
  if (!k) return '';
  if (iconSprite()) return `<svg class="ic" aria-hidden="true"><use href="#ic-${k}"/></svg>`;
  return ICON_SVG[k] || '';
}
/* SAP screen text with icon prefix: "@38\QCheck@ Label" -> {icon, tip, text} */
function parseIconText(tx) {
  const m = /^@([0-9A-Z]{2})(?:\\Q([^@]*))?@\s*(.*)$/.exec(tx || '');
  if (!m) return { icon: null, tip: '', text: tx || '' };
  return { icon: m[1], tip: m[2] || '', text: m[3] || '' };
}
