import json, os, re
B = os.path.dirname(os.path.abspath(__file__))
src = lambda p: open(os.path.join(B, p), encoding='utf-8').read()
screens = json.load(open(os.path.join(B, 'data', 'screens.json'), encoding='utf-8'))
order = json.load(open(os.path.join(B, 'data', 'order2.json'), encoding='utf-8'))
samples = [src('demo/zsf_demo_invoice.xml'), src('demo/zsf_demo_style.xml')]
def js_json(o): return json.dumps(o, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
mods = ['core', 'icons', 'model', 'dynpro', 'abapeditor', 'texteditor', 'bindings', 'check', 'preview', 'formbuilder', 'stylebuilder', 'app']
js = '\n'.join(src(f'src/{m}.js') for m in mods)
html = f'''<title>ZSMARTFORMS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
{src('src/style.css')}
</style>
<div id="app">
  <nav class="menubar" aria-label="Menu"><span class="brand">ZSMARTFORMS</span><div id="menubar" style="display:flex;gap:2px"></div></nav>
  <div class="systb" id="sysbtns">
    <button type="button" class="tb-btn" data-fc="ENTER" title="Enter">ENTERICON</button>
    <span class="okcode"><input id="okcode" type="text" aria-label="Command field" placeholder="Command" spellcheck="false" autocomplete="off"></span>
    <button type="button" class="tb-btn" data-fc="SAVE" title="Save (Ctrl+S)">SAVEICON</button>
    <span class="tb-sep"></span>
    <button type="button" class="tb-btn" data-fc="BACK" title="Back (F3)">BACKICON</button>
    <button type="button" class="tb-btn" data-fc="EXIT" title="Exit (Shift+F3)">EXITICON</button>
    <button type="button" class="tb-btn" data-fc="CANC" title="Cancel (F12)">CANCICON</button>
    <span class="tb-sep"></span>
    <button type="button" class="tb-btn" data-fc="UNDO" title="Undo (Ctrl+Z)">UNDOICON</button>
    <button type="button" class="tb-btn" data-fc="REDO" title="Redo (Ctrl+Y)">REDOICON</button>
    <button type="button" class="tb-btn" data-fc="FIND" title="Find (Ctrl+F)">FINDICON</button>
  </div>
  <div class="titlebar"><h1 id="title">SAP Smart Forms: Initial Screen</h1><span class="mode-badge" id="modeBadge" aria-live="polite"><span class="mode-dot"></span><span id="modeText"></span></span></div>
  <div class="apptb" id="apptb" role="toolbar"></div>
  <main id="main"></main>
  <footer class="statusbar"><div id="msg" class="msg" role="status" aria-live="polite"></div><span id="sysinfo"></span></footer>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script>
const SCREENS = {js_json(screens)};
const ORDER = {js_json(order)};
window.SAMPLES = {js_json(samples)};
{js}
document.querySelectorAll('#sysbtns [data-fc]').forEach(b => {{ const m = {{ENTER:'enter',SAVE:'save',BACK:'back',EXIT:'exit',CANC:'cancel',UNDO:'undo',REDO:'redo',FIND:'search'}}[b.dataset.fc]; b.innerHTML = icon(m); }});
</script>
'''
for k in ['ENTERICON','SAVEICON','BACKICON','EXITICON','CANCICON','UNDOICON','REDOICON','FINDICON']: html = html.replace(k, '')
open(os.path.join(B, 'dist/zsmartforms.html'), 'w', encoding='utf-8').write(html)
# standalone page for SAP (SMW0 object ZSMARTFORMS_HTML, served by ZCL_SMARTFORMS_HTTP)
sap = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
       '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}[hidden]{display:none!important}</style></head><body>'
       + html + '</body></html>')
open(os.path.join(B, 'dist/zsmartforms_sap.html'), 'w', encoding='utf-8').write(sap)
print('built', len(html)//1024, 'KB')
