// === START OF COMPLETE xocoflow_logic.js ===
// Version: 1.7.5 - Verified Complete Code with All Functions
"use strict";

console.log("Xocoflow Script: Initializing (v1.7.5)...");

// --- Constants ---
const DRAWFLOW_CONTAINER_ID = "drawflow";
const MAX_HISTORY_STATES = 50;
const LOCALSTORAGE_NODES_KEY = 'xocoflowCustomNodeTypes';
const CORS_PROXY = 'https://api.allorigins.win/get?url=';

// --- Application State ---
let editor;
let currentProjectName = 'proyecto_sin_titulo';
let selectedNodeId = null;
let historyStack = [];
let historyIndex = -1;
let customNodeTypes = {};
let copiedNodeData = null;
let nodeIntervals = {};

// --- CodeMirror State ---
let codeMirrorEditor = null;
let currentlyEditingNodeId = null;
let codeMirrorContainer = null;

// --- DOM Element Cache (Variables declared globally, assigned in initializeApp) ---
let drawflowElement, undoButton, redoButton, duplicateButton, copyButton, pasteButton,
    recalculateButton, lockButton, unlockButton, statusBar, zoomLevelSpan,
    nodePositionSpan, searchInput, nodesListContainer, fileInputElement,
    moduleListElement, nodeDefinitionModal, modalBackdrop, codeEditorSidebar,
    codeMirrorElement, codeEditorSaveButton, codeEditorCloseButton,
    editingNodeIdSpan, codeEditorTitleSpan;


// --- Helper Function for DOM Checks (Defined Globally) ---
function checkElement(selector, isCritical = false, message = `Element "${selector}" not found.`) {
    const el = document.querySelector(selector);
    if (!el) {
        const level = isCritical ? 'error' : 'warn';
        console[level](message);
        if (isCritical) {
            alert(`CRITICAL ERROR: ${message} App cannot start.`);
            throw new Error(message);
        }
    }
    return el;
}

// --- Base Node Definitions ---
const baseNodeDefinitions = {
    'texto': { name: 'texto', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-paragraph"></i> Texto</div><div class="box"><label>Contenido:</label><textarea df-content readonly style="height: 80px;" placeholder="..."></textarea><button type="button" class="edit-code-btn" onclick="openEditorForNode(event)"><i class="fas fa-edit"></i> Editar Contenido</button><p class="help-text">Edita en panel lateral.</p></div></div>`, cssClass: 'text-node', data: { content: '' } },
    'concatenar': { name: 'concatenar', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-link"></i> Concatenar</div><div class="box" style="text-align: center; font-size: 11px; color: #777; padding: 20px 5px;">Concatena entradas<br>(orden Y)<input type="hidden" df-result></div></div>`, cssClass: 'concatenate-node', data: { result: '' } },
    'mostrarPasar': { name: 'mostrarPasar', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-eye"></i> Mostrar y Pasar</div><div class="box"><label>Resultado:</label><textarea df-result readonly style="height: 60px;"></textarea><button type="button" onclick="selectAllText(event)" style="margin-top: 5px;">Seleccionar Todo</button><p class="help-text">Muestra y pasa datos.</p></div></div>`, cssClass: 'display-node', data: { result: '' } },
    'nota': { name: 'nota', inputs: 0, outputs: 0, html: `<div> <div class="title-box"><i class="fas fa-sticky-note"></i> Nota</div> <div class="box"> <div class="color-picker"> <label for="note-color-select-${'id' + Math.random().toString(16).slice(2)}">Color:</label> <select id="note-color-select-${'id' + Math.random().toString(16).slice(2)}" df-notecolor onchange="changeNoteColor(event)"> <option value="#ffffcc">Amarillo</option> <option value="#ccffcc">Verde</option> <option value="#ffcccc">Rojo</option> <option value="#ccccff">Azul</option> <option value="#e0e0e0">Gris</option> </select> </div> <textarea df-notecontent oninput="handleNodeDataChange(event); updateCharacterCount(event)" style="height: 120px;" placeholder="Notas..."></textarea> <div class="text-info"> <span df-charcount>0</span> chars </div> </div> </div>`, cssClass: 'note-node', data: { notecontent: '', notecolor: '#ffffcc', charcount: '0' } },
    'imagen': { name: 'imagen', inputs: 0, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-image"></i> Imagen HTML</div><div class="box"><div style="margin-bottom: 8px;"><button type="button" onclick="selectImageFile(event)">Seleccionar Local</button><span df-filename></span></div><img df-previewsrc src="" alt="Previa" style="display: none;"><label>URL:</label><input type="text" df-imgsrc oninput="handleImageInputChange(event)"><label>Alt:</label><input type="text" df-imgalt oninput="handleImageInputChange(event)"><label>Ancho:</label><input type="text" df-imgwidth oninput="handleImageInputChange(event)" placeholder="100px"><label>Alto:</label><input type="text" df-imgheight oninput="handleImageInputChange(event)"><p class="help-text">Salida: <img></p><input type="hidden" df-outputhtml></div></div>`, cssClass: 'image-node', data: { filename: '', previewsrc: '', imgsrc: '', imgalt: '', imgwidth: '', imgheight: '', outputhtml: '' } },
    'cargarTexto': { name: 'cargarTexto', inputs: 0, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-file-upload"></i> Cargar Texto</div><div class="box"><button type="button" onclick="selectTextFile(event)">Sel. Archivo</button><span df-filename></span><p class="help-text">Carga txt, html, ...</p><textarea df-filecontent style="display: none;"></textarea></div></div>`, cssClass: 'load-text-node', data: { filename: '', filecontent: '' } },
    'guardarTexto': { name: 'guardarTexto', inputs: 1, outputs: 0, html: `<div><div class="title-box"><i class="fas fa-save"></i> Guardar Texto</div><div class="box"><label>Nombre:</label><input type="text" df-savename oninput="handleNodeDataChange(event)" value="output.txt"><label>Contenido:</label><textarea df-savecontent readonly style="height: 60px;"></textarea><button type="button" onclick="saveNodeContentToFile(event)"><i class="fas fa-download"></i> Guardar</button></div></div>`, cssClass: 'save-text-node', data: { savename: 'output.txt', savecontent: '' } },
    'url_input': { name: 'url_input', inputs: 0, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-link"></i> URL Input</div><div class="box"><label>URL:</label><input df-url type="url" oninput="handleNodeDataChange(event)" placeholder="https://"></div></div>`, cssClass: 'url-input-node', data: { url: '' } },
    'timer_fetch': { name: 'timer_fetch', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-cloud-download-alt"></i> Timer Fetch</div><div class="box"><label>URL:</label><input df-url type="url" oninput="handleNodeDataChange(event)" placeholder="URL..."><label>Intervalo(ms):</label><input df-interval type="number" value="60000" min="100" oninput="handleNodeDataChange(event)"><p class="help-text">Fetch cada intervalo. Input 1=URL.</p></div></div>`, cssClass: 'timer-fetch-node', data: { interval: 60000, url: '' } },
    'fetch_html': { name: 'fetch_html', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-bolt"></i> Fetch HTML</div><div class="box help-text" style="padding: 15px 5px;">Recibe URL (Input 1), dispara fetch. Salida: HTML.</div></div>`, cssClass: 'fetch-node', data: {} },
    'display_text': { name: 'display_text', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-file-alt"></i> Display Text</div><div class="box"><label>Recibido:</label><textarea df-display readonly style="height:100px;"></textarea></div></div>`, cssClass: 'display-text-node', data: { display: 'Esperando...' } },
    'loop': { name: 'loop', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-sync-alt"></i> Loop</div><div class="box"><label>Intervalo(ms):</label><input df-interval type="number" value="1000" min="50" oninput="handleNodeDataChange(event)"></div></div>`, cssClass: 'loop-node', data: { interval: 1000 } },
    'repeat': { name: 'repeat', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-redo-alt"></i> Repeat</div><div class="box"><label>Veces:</label><input df-count type="number" value="3" min="1" oninput="handleNodeDataChange(event)"></div></div>`, cssClass: 'repeat-node', data: { count: 3 } },
    'timer_download': { name: 'timer_download', inputs: 0, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-stopwatch"></i> Timer Trigger</div><div class="box"><label>Intervalo(ms):</label><input df-interval type="number" value="10000" min="100" oninput="handleNodeDataChange(event)"><p class="help-text">Dispara timestamp.</p></div></div>`, cssClass: 'timer-node', data: { interval: 10000 } },
    'download_file': { name: 'download_file', inputs: 1, outputs: 0, html: `<div><div class="title-box"><i class="fas fa-download"></i> Download File</div><div class="box"><label>Nombre:</label><input df-filename type="text" value="download.txt" oninput="handleNodeDataChange(event)"><p class="help-text">Descarga Input 1.</p><input type="hidden" df-contentfordownload></div></div>`, cssClass: 'download-node', data: { filename: 'download.txt', contentfordownload: '' } },
    'extract_value': { name: 'extract_value', inputs: 2, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-filter"></i> Extraer Valor</div><div class="box"><label class="help-text">Regex (Input 2):</label><input type="text" df-selector_received readonly placeholder="(Patrón)"><label>Resultado (de Input 1):</label><textarea df-result readonly style="height:60px;">(Texto)</textarea></div></div>`, cssClass: 'extract-value-node', data: { selector_received: '', result: '(Esperando)' } },
    'javascript_code': { name: 'javascript_code', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fab fa-js-square"></i> Código JS</div><div class="box"><label>Código:</label><textarea df-jscode readonly style="height: 100px;" placeholder="// ..."></textarea><button type="button" class="edit-code-btn" onclick="openEditorForNode(event)"><i class="fas fa-edit"></i> Editar</button><div class="node-buttons"><button type="button" onclick="executeJsNode(event)"><i class="fas fa-play"></i> Ejecutar</button><button type="button" onclick="resetJsNodeResult(event)"><i class="fas fa-redo"></i> Reset</button></div><label>Resultado:</label><textarea df-result readonly style="height: 60px;"></textarea></div></div>`, cssClass: 'javascript-code-node', data: { jscode: "return input;", result: '', lastInput: null } },
    'static_code_snippet': { name: 'static_code_snippet', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-code"></i> Código Estático</div><div class="box"><label>Código:</label><textarea df-codecontent readonly style="height: 120px;" placeholder="<!-- ... -->"></textarea><button type="button" class="edit-code-btn" onclick="openEditorForNode(event)"><i class="fas fa-edit"></i> Editar</button><p class="help-text">Bloque estático. Edita con panel.</p></div></div>`, cssClass: 'static-code-node', data: { codecontent: '' } },


    // --- LOCAL IMAGE NODE (v1.11 - Definition stable since v1.9) ---
    'local_image': {
        name: 'local_image',
        inputs: 0, outputs: 0,
        html: `
            <div>
                <div class="title-box"><i class="fas fa-image"></i> Imagen Local</div>
                <div class="box">
                    <button type="button" onclick="selectLocalImageFile(event)" style="width:100%; margin-bottom: 8px;"><i class="fas fa-upload"></i> Cargar Imagen</button>
                    <div class="image-preview-container" style="margin-bottom: 8px; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; background-color: #f9f9f9; overflow: hidden;">
                        <img df-imagesrc src="" alt="Previa Imagen" style="display: none; max-width: 100%; max-height:100%; width:auto; height:auto; object-fit: contain;" />
                        <span class="placeholder-text" style="color: #aaa; font-size: 11px; text-align: center; padding: 10px;">No hay imagen</span>
                    </div>
                    <span df-filename style="font-size: 10px; color: #777; display: block; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Nombre del archivo"></span>
                    <details style="margin-bottom: 8px;">
                        <summary style="font-size: 10px; cursor: pointer; color: #555; font-weight:bold;">Tamaño Imagen Interna</summary>
                        <div style="display: flex; gap: 5px; margin-top: 5px;">
                            <div style="flex: 1;"><label style="font-size: 10px;">Ancho Img:</label><input type="text" df-imagewidth oninput="updateLocalImageStyle(event)" placeholder="100%" style="font-size:11px; height: 24px; padding: 2px 4px;"></div>
                            <div style="flex: 1;"><label style="font-size: 10px;">Alto Img:</label><input type="text" df-imageheight oninput="updateLocalImageStyle(event)" placeholder="auto" style="font-size:11px; height: 24px; padding: 2px 4px;"></div>
                        </div><p class="help-text" style="margin-top: 2px;">Imagen dentro del nodo (ej: 100%, 150px)</p>
                    </details>
                    <details open style="margin-bottom: 8px;">
                        <summary style="font-size: 10px; cursor: pointer; color: #555; font-weight:bold;">Tamaño Nodo Contenedor</summary>
                        <div style="display: flex; gap: 5px; margin-top: 5px;">
                            <div style="flex: 1;"><label style="font-size: 10px;">Ancho Nodo:</label><input type="text" df-nodewidth oninput="updateLocalNodeSize(event)" placeholder="240px" style="font-size:11px; height: 24px; padding: 2px 4px;"></div>
                            <div style="flex: 1;"><label style="font-size: 10px;">Alto Nodo:</label><input type="text" df-nodeheight oninput="updateLocalNodeSize(event)" placeholder="auto" style="font-size:11px; height: 24px; padding: 2px 4px;"></div>
                        </div><p class="help-text" style="margin-top: 2px;">Nodo completo (ej: 300px, auto)</p>
                    </details>
                </div>
            </div>`,
        cssClass: 'local-image-node',
        data: { imagesrc: '', filename: '', imagewidth: '100%', imageheight: 'auto', nodewidth: '240px', nodeheight: 'auto' }
    },
    // --- END LOCAL IMAGE NODE ---

// ————————————————————————————————————————————
// ——— NODOS DE ENTRADA ADICIONALES ———————
// ————————————————————————————————————————————

'input_number': {
    name: 'input_number',
    inputs: 0,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-hashtag"></i> Número</div>
        <div class="box">
          <label>Valor numérico:</label>
          <input type="number" df-number value="0" oninput="handleNodeDataChange(event)">
        </div>
      </div>`,
    cssClass: 'number-input-node',
    data: { number: 0 }
},

'input_text': {
    name: 'input_text',
    inputs: 0,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-font"></i> Texto</div>
        <div class="box">
          <label>Texto:</label>
          <input type="text" df-text value="" placeholder="..." oninput="handleNodeDataChange(event)">
        </div>
      </div>`,
    cssClass: 'text-input-node',
    data: { text: '' }
},

'input_range': {
    name: 'input_range',
    inputs: 0,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-sliders-h"></i> Slider</div>
        <div class="box">
          <label>Valor:</label>
          <input type="range" df-range min="0" max="100" value="50" oninput="handleNodeDataChange(event)">
          <span df-rangeval>50</span>
        </div>
      </div>`,
    cssClass: 'range-input-node',
    data: { range: 50 }
},

'input_date': {
    name: 'input_date',
    inputs: 0,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-calendar-alt"></i> Fecha</div>
        <div class="box">
          <label>Selecciona fecha:</label>
          <input type="date" df-date oninput="handleNodeDataChange(event)">
        </div>
      </div>`,
    cssClass: 'date-input-node',
    data: { date: '' }
},

'input_time': {
    name: 'input_time',
    inputs: 0,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-clock"></i> Hora</div>
        <div class="box">
          <label>Selecciona hora:</label>
          <input type="time" df-time oninput="handleNodeDataChange(event)">
        </div>
      </div>`,
    cssClass: 'time-input-node',
    data: { time: '' }
},

'input_color': {
    name: 'input_color',
    inputs: 0,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-palette"></i> Color</div>
        <div class="box">
          <label>Elige color:</label>
          <input type="color" df-color value="#ff0000" oninput="handleNodeDataChange(event)">
        </div>
      </div>`,
    cssClass: 'color-input-node',
    data: { color: '#ff0000' }
},


// ————————————————————————————————————————————
// ——— NODOS DE TRANSFORMACIÓN DE TEXTO —————
// ————————————————————————————————————————————

'text_replace': {
    name: 'text_replace',
    inputs: 1,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-exchange-alt"></i> Reemplazar</div>
        <div class="box">
          <label>Buscar:</label>
          <input type="text" df-find placeholder="texto a buscar">
          <label>Reemplazar con:</label>
          <input type="text" df-replace placeholder="nuevo texto">
          <button type="button" onclick="applyTextReplace(event)">Ejecutar</button>
          <textarea df-result readonly style="height: 60px;"></textarea>
        </div>
      </div>`,
    cssClass: 'text-replace-node',
    data: { find: '', replace: '', result: '' }
},

'text_split': {
    name: 'text_split',
    inputs: 1,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-cut"></i> Dividir</div>
        <div class="box">
          <label>Separador:</label>
          <input type="text" df-separator placeholder=",">
          <button type="button" onclick="applyTextSplit(event)">Ejecutar</button>
          <textarea df-result readonly style="height: 60px;"></textarea>
        </div>
      </div>`,
    cssClass: 'text-split-node',
    data: { separator: '', result: '' }
},

'text_uppercase': {
    name: 'text_uppercase',
    inputs: 1,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-arrow-up"></i> Mayúsculas</div>
        <div class="box">
          <button type="button" onclick="applyTextCase(event, 'upper')">A → Z</button>
          <textarea df-result readonly style="height: 60px;"></textarea>
        </div>
      </div>`,
    cssClass: 'text-uppercase-node',
    data: { result: '' }
},

'text_lowercase': {
    name: 'text_lowercase',
    inputs: 1,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-arrow-down"></i> Minúsculas</div>
        <div class="box">
          <button type="button" onclick="applyTextCase(event, 'lower')">a → z</button>
          <textarea df-result readonly style="height: 60px;"></textarea>
        </div>
      </div>`,
    cssClass: 'text-lowercase-node',
    data: { result: '' }
},

'text_length': {
    name: 'text_length',
    inputs: 1,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-align-justify"></i> Longitud</div>
        <div class="box">
          <button type="button" onclick="applyTextLength(event)">Calcular</button>
          <input type="number" df-result readonly>
        </div>
      </div>`,
    cssClass: 'text-length-node',
    data: { result: 0 }
},

'html_strip': {
    name: 'html_strip',
    inputs: 1,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-code"></i> Strip HTML</div>
        <div class="box">
          <button type="button" onclick="applyHtmlStrip(event)">Ejecutar</button>
          <textarea df-result readonly style="height: 60px;"></textarea>
        </div>
      </div>`,
    cssClass: 'html-strip-node',
    data: { result: '' }
},


// ————————————————————————————————————————————
// ——— NODO DE ENTRADA JSON GENÉRICA ————————
// ————————————————————————————————————————————
'input_json': {
    name: 'input_json',
    inputs: 0,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-database"></i> Input JSON</div>
        <div class="box">
          <label>Valor (JSON):</label>
          <textarea
            df-json
            placeholder='{"clave": 123, "arr": [1,2,3] }'
            style="width:100%; height:80px;"
            oninput="handleJsonInputChange(event)"
          ></textarea>
        </div>
      </div>`,
    cssClass: 'json-input-node',
    data: { json: '{}', lastInput: null }
  },
  
  
  



































































};
console.log("Base node definitions loaded:", Object.keys(baseNodeDefinitions).length);

// --- Helper Functions ---
// Función escapeHtml necesaria para exportRawJson
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function showToast(icon, title, text = '', timer = 2000) { if (typeof Swal === 'undefined') { console.log(`Toast (${icon}): ${title} - ${text}`); return; } Swal.fire({ toast: true, position: 'bottom-end', icon: icon, title: title, text: text, showConfirmButton: false, timer: timer, timerProgressBar: true, didOpen: (toast) => { toast.addEventListener('mouseenter', Swal.stopTimer); toast.addEventListener('mouseleave', Swal.resumeTimer); } }); }
function getConnections(nodeId, ioType) { try { const node = editor?.getNodeFromId(nodeId); const ports = ioType === 'input' ? node?.inputs : node?.outputs; if (!ports) return []; let connections = []; Object.values(ports).forEach(portInfo => { if (portInfo?.connections) { connections = connections.concat(portInfo.connections); } }); return connections; } catch (e) { console.error(`Error getConnections ${ioType} for ${nodeId}:`, e); return []; } }
function readField(nodeId, attr) { try { const node = editor?.getNodeFromId(nodeId); const dataKey = attr.startsWith('df-') ? attr.substring(3) : attr; if (node?.data && dataKey in node.data) return node.data[dataKey]; const element = document.getElementById(`node-${nodeId}`); if (element) { const inputElement = element.querySelector(`[${attr}]`); if (inputElement) return inputElement.value; } } catch (e) { /* ignore */ } return null; }
function getMimeType(ext) { const m = { 'html': 'text/html;charset=utf-8','htm': 'text/html;charset=utf-8','css': 'text/css;charset=utf-8','js': 'application/javascript;charset=utf-8','json': 'application/json;charset=utf-8','xml': 'application/xml;charset=utf-8','txt': 'text/plain;charset=utf-8','csv': 'text/csv;charset=utf-8','md': 'text/markdown;charset=utf-8','jpg': 'image/jpeg','jpeg': 'image/jpeg','png': 'image/png','gif': 'image/gif','svg': 'image/svg+xml','pdf': 'application/pdf'}; return m[ext] || 'application/octet-stream'; }

// --- Node Specific UI Functions ---
function selectAllText(event) { try { const n=event.target.closest('.drawflow-node'), t=n?.querySelector('textarea[df-result], textarea[df-display], textarea[df-savecontent]'); if(t){ t.select(); t.setSelectionRange(0,t.value.length); } } catch (e) { console.error("Error selectAllText:", e); } }
function selectImageFile(event) { try { const n = event.target.closest('.drawflow-node'); if (!n) return; const id = n.id.split('-')[1]; const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = (e) => { const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = (le) => { editor.updateNodeDataFromId(id, { filename: f.name, previewsrc: le.target.result }); const s = n.querySelector('span[df-filename]'); if(s) s.textContent = ` ${f.name}`; const p = n.querySelector('img[df-previewsrc]'); if(p){ p.src = le.target.result; p.style.display = 'block';} requestAnimationFrame(() => generateImageHtml(id)); }; r.onerror = () => showToast('error', 'Error', 'Cannot read image.'); r.readAsDataURL(f); } i.value = null; }; i.click(); } catch (e) { console.error("Error selectImageFile:", e); showToast('error', 'Error', 'Image select failed.'); } }
function generateImageHtml(nodeId) { try { const n = editor.getNodeFromId(nodeId); if (!n || n.name !== 'imagen') return; const d = n.data; let h = '<img'; const s = d.imgsrc || d.previewsrc; if(s) h += ` src="${escapeHtml(s)}"`; h += ` alt="${escapeHtml(d.imgalt || '')}"`; if(d.imgwidth) h += ` width="${escapeHtml(d.imgwidth)}"`; if(d.imgheight) h += ` height="${escapeHtml(d.imgheight)}"`; h += '>'; if (d.outputhtml !== h) { editor.updateNodeDataFromId(nodeId, { outputhtml: h }); propagateData(nodeId, 'imagen', 'outputhtml', h); saveHistoryState(); } } catch (e) { console.error(`Error generateImageHtml ${nodeId}:`, e); } }
function handleImageInputChange(event) { try { const n = event.target.closest('.drawflow-node'); if (!n) return; const id = n.id.split('-')[1]; requestAnimationFrame(() => { const node = editor.getNodeFromId(id); if (!node || node.name !== 'imagen') return; const data = node.data; if (event.target.hasAttribute('df-imgsrc')) { const p = n.querySelector('img[df-previewsrc]'); if(p){ const s = data.imgsrc || data.previewsrc || ''; p.src = s; p.style.display = s ? 'block' : 'none'; }} generateImageHtml(id); }); } catch (e) { console.error("Error handleImageInputChange:", e); } }
function selectTextFile(event) { try { const n = event.target.closest('.drawflow-node'); if (!n) return; const id = n.id.split('-')[1]; const i = document.createElement('input'); i.type = 'file'; i.accept = '.txt,.html,.css,.js,.json,.xml,text/*'; i.onchange = (e) => { const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = (le) => { const c = le.target.result; editor.updateNodeDataFromId(id, { filename: f.name, filecontent: c }); const s = n.querySelector('span[df-filename]'); if(s) s.textContent = ` ${f.name}`; propagateData(id, 'cargarTexto', 'filecontent', c); saveHistoryState(); }; r.onerror = () => showToast('error', 'Error', 'Cannot read text file.'); r.readAsText(f); } i.value = null; }; i.click(); } catch (e) { console.error("Error selectTextFile:", e); showToast('error', 'Error', 'File select failed.'); } }
function saveNodeContentToFile(event) { try { const n = event.target.closest('.drawflow-node'); if (!n) return; const id = n.id.split('-')[1]; const node = editor.getNodeFromId(id); if (!node) return; let c='', fn='d.txt', df='', fnf=''; if (node.name === 'guardarTexto') { df='savecontent'; fnf='savename'; fn=node.data[fnf]?.trim()||'output.txt'; } else if (node.name === 'download_file') { df='contentfordownload'; fnf='filename'; fn=node.data[fnf]?.trim()||'download.html'; } else return; c=node.data[df]||''; if (!c && node.name !== 'download_file') { showToast('warning', 'Empty', 'No content to save.'); return; } fn=fn.replace(/[^a-zA-Z0-9._-]/g,'_').trim()||"d.txt"; if(fn.length>200) fn=fn.substring(0,200); const mime=getMimeType(fn.split('.').pop().toLowerCase()); const b=new Blob([c],{type:mime}); const l=document.createElement('a'); l.href=URL.createObjectURL(b); l.download=fn; document.body.appendChild(l); l.click(); document.body.removeChild(l); URL.revokeObjectURL(l.href); } catch (error) { console.error("Error saveNodeContentToFile:", error); showToast('error', 'Error', 'Could not save.'); } }
function updateCharacterCount(event) { try { const t = event.target; const n = t.closest('.drawflow-node'); if (!n || !t.hasAttribute('df-notecontent')) return; const c = t.value?.length || 0; const s = n.querySelector('[df-charcount]'); if(s) s.textContent = c; } catch (e) { console.error("Error updateCharacterCount:", e); } }
function changeNoteColor(event) { try { const s = event.target; const n = s.closest('.drawflow-node'); if (!n) return; const id = n.id.split('-')[1]; const c = s.value; editor.updateNodeDataFromId(id, { notecolor: c }); n.style.backgroundColor = c; const tb = n.querySelector('.title-box'); if(tb) { const darkBgs = ['#ccccff', '#e0e0e0']; if (darkBgs.includes(c)) { tb.style.backgroundColor = '#f0f0f0'; tb.style.color = '#333'; } else { tb.style.backgroundColor = ''; tb.style.color = ''; } } saveHistoryState(); } catch (e) { console.error("Error changeNoteColor:", e); showToast('error', 'Color Error', 'Could not change.'); } }
function openEditorForNode(event) { try { const btn = event.target.closest('button.edit-code-btn'); const nEl = btn?.closest('.drawflow-node'); if (!nEl) return; const id = nEl.id.split('-')[1]; const node = editor.getNodeFromId(id); const types = ['javascript_code', 'static_code_snippet', 'texto']; if (id && types.includes(node?.name)) { if (selectedNodeId !== id) editor.selectNode(nEl.id); else { /* If already selected, still ensure editor opens */ if (!codeMirrorEditor) initializeCodeMirror(); if (codeMirrorEditor) openCodeEditorSidebar(id); else showToast('error', 'Editor Error', 'Code editor failed.'); } } } catch(e) { console.error("Error openEditorForNode:", e); showToast('error', 'Error', 'Cannot open editor.'); } }
function executeJsNode(event) { const nEl = event.target.closest('.drawflow-node'); if (!nEl) return; const id = nEl.id.split('-')[1]; const node = editor.getNodeFromId(id); if (!node || node.name !== 'javascript_code') return; const code = node.data.jscode || ''; const input = node.data.lastInput; let res, err=false, resStr=''; const start = performance.now(); try { const func = new Function('input', `'use strict';\n${code}`); res = func(input); if (res === undefined) resStr = '(undefined)'; else if (res === null) resStr = 'null'; else if (typeof res === 'string') resStr = res; else try { resStr = JSON.stringify(res, null, 2); } catch { resStr = String(res); } const end = performance.now(); console.log(`JS Result (${(end - start).toFixed(1)}ms):`, res); } catch (e) { const end = performance.now(); console.error(`JS Error ${id} (${(end-start).toFixed(1)}ms):`, e); resStr=`Error: ${e.message}\n${e.stack?e.stack.split('\n')[1]:''}`; err=true; res=undefined; } const ta = nEl.querySelector('textarea[df-result]'); if (ta) { ta.value = resStr; ta.classList.toggle('error', err); } editor.updateNodeDataFromId(id, { result: res }); if (!err) propagateData(id, 'javascript_code', 'result', res); }
function resetJsNodeResult(event) { const nEl = event.target.closest('.drawflow-node'); if (!nEl) return; const id = nEl.id.split('-')[1]; const node = editor.getNodeFromId(id); if (!node || node.name !== 'javascript_code') return; const ta = nEl.querySelector('textarea[df-result]'); if (ta) { ta.value = ''; ta.classList.remove('error'); } editor.updateNodeDataFromId(id, { result: '' }); propagateData(id, 'javascript_code', 'result', null); }


// --- Functions for Local Image Node (v1.11 - Stable) ---
function selectLocalImageFile(event) { const nodeId = getNodeIdFromEvent(event); if (!nodeId || !editor) return; try { const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.onchange = (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (loadEvent) => { try { const imageDataUrl = loadEvent.target.result; editor.updateNodeDataFromId(nodeId, { imagesrc: imageDataUrl, filename: file.name }); const nodeElement = document.getElementById(`node-${nodeId}`); if (nodeElement) { const imgTag = nodeElement.querySelector('img[df-imagesrc]'); const filenameSpan = nodeElement.querySelector('span[df-filename]'); const placeholderText = nodeElement.querySelector('.placeholder-text'); if (imgTag) { imgTag.src = imageDataUrl; imgTag.style.display = 'block'; const nodeData = editor.getNodeFromId(nodeId).data; imgTag.style.width = nodeData.imagewidth || '100%'; imgTag.style.height = nodeData.imageheight || 'auto'; } if (filenameSpan) { filenameSpan.textContent = file.name; filenameSpan.title = file.name; } if (placeholderText) { placeholderText.style.display = 'none'; } } saveHistoryState(); } catch (innerError) { console.error("Error processing loaded image:", innerError); showToast('error', 'Error Interno', 'No se pudo procesar la imagen.'); } }; reader.onerror = () => { showToast('error', 'Error de Lectura', 'No se pudo leer el archivo.'); }; reader.readAsDataURL(file); } fileInput.value = null; }; fileInput.click(); } catch (error) { console.error("Error selecting local image file:", error); showToast('error', 'Error', 'No se pudo iniciar selección.'); } }
function updateLocalImageStyle(event) { const nodeId = getNodeIdFromEvent(event); if (!nodeId || !editor) return; try { const nodeElement = document.getElementById(`node-${nodeId}`); if (!nodeElement) return; const imgTag = nodeElement.querySelector('img[df-imagesrc]'); const widthInput = nodeElement.querySelector('input[df-imagewidth]'); const heightInput = nodeElement.querySelector('input[df-imageheight]'); if (!imgTag || !widthInput || !heightInput) return; const newWidth = widthInput.value.trim() || 'auto'; const newHeight = heightInput.value.trim() || 'auto'; imgTag.style.width = newWidth; imgTag.style.height = newHeight; handleNodeDataChange(event); } catch (error) { console.error("Error updating local image style:", error); showToast('error', 'Error Estilo Imagen', 'No se pudo actualizar tamaño imagen.'); } }
function updateLocalNodeSize(event) { const nodeId = getNodeIdFromEvent(event); if (!nodeId || !editor) return; try { const nodeElement = document.getElementById(`node-${nodeId}`); if (!nodeElement) return; const widthInput = nodeElement.querySelector('input[df-nodewidth]'); const heightInput = nodeElement.querySelector('input[df-nodeheight]'); if (!widthInput || !heightInput) return; const newWidth = widthInput.value.trim() || 'auto'; const newHeight = heightInput.value.trim() || 'auto'; nodeElement.style.width = newWidth; nodeElement.style.height = newHeight; handleNodeDataChange(event); editor.updateConnectionNodes(`node-${nodeId}`); } catch (error) { console.error("Error updating local node size:", error); showToast('error', 'Error Tamaño Nodo', 'No se pudo actualizar tamaño nodo.'); } }
// --- END Local Image Node Functions ---
/**
 * @function getNodeIdFromEvent
 * @description Helper function to extract the Drawflow node ID from an event target.
 *              This is crucial for event handlers defined directly in the node's HTML.
 * @param {Event} event - The event object (e.g., from onclick, oninput).
 * @returns {string|null} The numeric ID of the node (as a string), or null if not found.
 */
function getNodeIdFromEvent(event) {
    if (!event || !event.target) {
        console.error("getNodeIdFromEvent: Event or event target is missing.");
        return null;
    }
    // Find the closest parent element that represents a Drawflow node
    const nodeElement = event.target.closest('.drawflow-node');
    if (!nodeElement) {
        console.error("getNodeIdFromEvent: Could not find parent node element for target:", event.target);
        return null;
    }
    // Extract the ID (e.g., 'node-5' -> '5')
    const nodeId = nodeElement.id.split('-')[1];
    if (!nodeId) {
        console.error("getNodeIdFromEvent: Could not parse node ID from element ID:", nodeElement.id);
        return null;
    }
    return nodeId;
}

// --- PEGA ESTA FUNCIÓN ARRIBA DENTRO DE TU ARCHIVO xocoflow_logic.js ---
// --- PUEDES PONERLA CERCA DE LAS OTRAS FUNCIONES DEL NODO LOCAL_IMAGE ---
// --- O EN LA SECCIÓN GENERAL DE "HELPER FUNCTIONS" ---


function handleNodeDataChange(event) { if (!editor || !event?.target) return; const el = event.target; const nodeEl = el.closest('.drawflow-node'); if (!nodeEl) return; const id = nodeEl.id.split('-')[1]; const node = editor.getNodeFromId(id); if (!node) return; let key = null; for (const attr of el.attributes) if (attr.name.startsWith('df-')) { key = attr.name.substring(3); break; } if (!key) return; requestAnimationFrame(() => { try { const updatedNode = editor.getNodeFromId(id); if (!updatedNode?.data?.hasOwnProperty(key)) return; const val = updatedNode.data[key]; const name = updatedNode.name; if ((name === 'url_input' && key === 'url') || (name === 'cargarTexto' && key === 'filecontent')) { if(name === 'url_input') executeNode(id, val); else propagateData(id, name, key, val); } else if (name === 'imagen' && ['imgsrc', 'imgalt', 'imgwidth', 'imgheight'].includes(key)) handleImageInputChange(event); else if (name === 'nota' && key === 'notecontent') updateCharacterCount(event); else if ((name === 'timer_fetch' || name === 'timer_download' || name === 'loop') && key === 'interval') executeNode(id, null); else if (name === 'timer_fetch' && key === 'url') executeNode(id, null); saveHistoryState(); } catch (e) { console.error(`Error handleNodeDataChange (${id}/${key}):`, e); } }); }


function applyTextReplace(event) {
    const id = getNodeIdFromEvent(event);
    const node = editor.getNodeFromId(id);
    const txt = node.data.lastInput ?? '';
    const find = node.data.find;
    const replace = node.data.replace;
    const res = txt.split(find).join(replace);
    updateNodeResult(id, res);
  }
  
  function applyTextSplit(event) {
    const id = getNodeIdFromEvent(event);
    const node = editor.getNodeFromId(id);
    const txt = node.data.lastInput ?? '';
    const sep = node.data.separator;
    const res = txt.split(sep).join('\n');
    updateNodeResult(id, res);
  }
  
  function applyTextCase(event, mode) {
    const id = getNodeIdFromEvent(event);
    const node = editor.getNodeFromId(id);
    const txt = node.data.lastInput ?? '';
    const res = mode === 'upper' ? txt.toUpperCase() : txt.toLowerCase();
    updateNodeResult(id, res);
  }
  
  function applyTextLength(event) {
    const id = getNodeIdFromEvent(event);
    const node = editor.getNodeFromId(id);
    const txt = node.data.lastInput ?? '';
    updateNodeResult(id, txt.length);
  }
  
  function applyHtmlStrip(event) {
    const id = getNodeIdFromEvent(event);
    const node = editor.getNodeFromId(id);
    const txt = node.data.lastInput ?? '';
    const res = txt.replace(/<[^>]*>/g, '');
    updateNodeResult(id, res);
  }
  
  function updateNodeResult(nodeId, result) {
    // helper to set df-result and propagar
    editor.updateNodeDataFromId(nodeId, { result });
    const el = document.getElementById(`node-${nodeId}`);
    const out = el.querySelector('[df-result]');
    if (out.tagName === 'INPUT') out.value = result;
    else out.value = result;
    // propagar al siguiente
    propagateData(nodeId, editor.getNodeFromId(nodeId).name, 'result', result);
  }
  

  function handleJsonInputChange(event) {
    const nodeId   = getNodeIdFromEvent(event);
    const textarea = event.target;
    const text     = textarea.value;
    let parsed;
  
    // 1) parseo
    try {
      parsed = JSON.parse(text);
      textarea.classList.remove('error');
    } catch (e) {
      textarea.classList.add('error');
      return;
    }
  
    // 2) actualizo estado interno
    editor.updateNodeDataFromId(nodeId, {
      json: text,
      lastInput: parsed
    });
  
    // 3) propago EJECUCIÓN (no datos) para que reciba y ejecute el nodo JS
    propagateExecution(nodeId, parsed);
  }
  
  
  












































































// --- Interval Management ---
function cleanupNodeIntervals(nodeId) { if (nodeIntervals[nodeId]) { nodeIntervals[nodeId].forEach(clearInterval); delete nodeIntervals[nodeId]; } }
function cleanupAllModuleIntervals() { const keys = Object.keys(nodeIntervals); if (keys.length > 0) { console.log(`Cleaning intervals for ${keys.length} nodes...`); keys.forEach(cleanupNodeIntervals); nodeIntervals = {}; } }

// --- Execution & Propagation Logic ---
const EXECUTE_NODE_SYSTEM_TYPES = [
    'url_input', 'timer_fetch', 'fetch_html', 'display_text',
    'loop', 'repeat', 'timer_download', 'download_file', 'extract_value'
  ];
  
  async function executeNode(nodeId, payload) {
    let node;
    try {
      node = editor.getNodeFromId(nodeId);
      if (!node) {
        cleanupNodeIntervals(nodeId);
        return;
      }
    } catch (error) {
      console.error(`Err get node ${nodeId}:`, error);
      return;
    }
    const nName = node.name;
    let outP = payload;
    if (node._executing) return;
    node._executing = true;
  
    try {
      switch (nName) {
        // —————————————————————————————————————————————
        case 'timer_fetch':
        case 'timer_download':
        case 'loop': {
          cleanupNodeIntervals(nodeId);
          let intMs = parseInt(readField(nodeId, 'df-interval') || node.data?.interval, 10);
          const defInt = nName === 'loop'
            ? 1000
            : (nName === 'timer_fetch' ? 60000 : 10000);
          if (isNaN(intMs) || intMs < 100) intMs = defInt;
          const initP = payload;
          console.log(`Start ${nName} ${nodeId} every ${intMs} ms.`);
          const execInt = async () => {
            const currN = editor.getNodeFromId(nodeId);
            if (!currN) { cleanupNodeIntervals(nodeId); return; }
            if (nName === 'timer_fetch') {
              let url = readField(nodeId, 'df-url');
              if (!url?.trim()) {
                const cs = getConnections(nodeId, 'input');
                for (const c of cs) {
                  const src = editor.getNodeFromId(c.node);
                  if (src?.name === 'url_input') {
                    url = readField(c.node, 'df-url');
                    if (url?.trim()) break;
                  }
                }
              }
              if (url?.trim()) {
                url = url.trim();
                if (!url.startsWith('http')) url = 'https://' + url;
                try {
                  const r = await fetch(CORS_PROXY + encodeURIComponent(url));
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  const d = await r.json();
                  propagateExecution(nodeId, d.contents);
                } catch (err) {
                  console.error(`TFetch ${nodeId} err:`, err);
                  propagateExecution(nodeId, `// ERR Fetch:\n// ${err.message}`);
                }
              } else propagateExecution(nodeId, '// ERR: No URL');
            }
            else if (nName === 'loop') {
              propagateExecution(nodeId, initP);
            }
            else {
              propagateExecution(nodeId, Date.now());
            }
          };
          const intId = setInterval(execInt, intMs);
          nodeIntervals[nodeId] = nodeIntervals[nodeId] || [];
          nodeIntervals[nodeId].push(intId);
          if (nName === 'timer_fetch') await execInt();
          break;
        }
  
        // —————————————————————————————————————————————
        case 'fetch_html': {
          let url = payload;
          if (typeof url !== 'string' || !url?.trim()) {
            propagateExecution(nodeId, '// ERR: Invalid URL');
            return;
          }
          url = url.trim();
          if (!url.startsWith('http')) url = 'https://' + url;
          try {
            const r = await fetch(CORS_PROXY + encodeURIComponent(url));
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            outP = d.contents;
          } catch (err) {
            console.error(`Fetch ${nodeId} err:`, err);
            outP = `// ERR Fetch:\n// ${err.message}`;
          }
          propagateExecution(nodeId, outP);
          break;
        }
  
        // —————————————————————————————————————————————
        case 'display_text': {
          const txt = String(payload ?? '(null)');
          editor.updateNodeDataFromId(nodeId, { display: txt });
          const el = document.getElementById(`node-${nodeId}`);
          const ta = el?.querySelector('textarea[df-display]');
          if (ta) ta.value = txt;
          outP = payload;
          propagateExecution(nodeId, outP);
          break;
        }
  
        // —————————————————————————————————————————————
        case 'repeat': {
          let c = parseInt(readField(nodeId, 'df-count') || node.data?.count, 10);
          if (isNaN(c) || c <= 0) return;
          const p = payload;
          for (let i = 0; i < c; i++) {
            setTimeout(() => propagateExecution(nodeId, p), 0);
          }
          return;
        }
  
        // —————————————————————————————————————————————
        case 'download_file': {
          if (payload == null) return;
          const f = (readField(nodeId, 'df-filename')?.trim() || 'd.txt');
          const s = String(payload);
          editor.updateNodeDataFromId(nodeId, { contentfordownload: s, filename: f });
          try {
            const sf = f.replace(/[^a-zA-Z0-9._-]/g, '_') || 'd.txt';
            const m  = getMimeType(sf.split('.').pop().toLowerCase());
            const b  = new Blob([s], { type: m });
            const l  = document.createElement('a');
            l.href = URL.createObjectURL(b);
            l.download = sf;
            document.body.appendChild(l);
            l.click();
            document.body.removeChild(l);
            URL.revokeObjectURL(l.href);
          } catch (err) {
            console.error(`Download ${nodeId} error:`, err);
            showToast('error', 'Error', 'Error descarga.');
          }
          return;
        }
  
        // —————————————————————————————————————————————
        case 'url_input': {
          const u = readField(nodeId, 'df-url');
          outP = u;
          propagateExecution(nodeId, outP);
          break;
        }
  
        // —————————————————————————————————————————————
        case 'extract_value': {
          const txt = String(payload ?? '');
          const pat = readField(nodeId, 'df-selector_received') || '';
          let val = null, res = '(Esperando)';
          if (txt && pat) {
            try {
              const r = new RegExp(pat);
              const m = txt.match(r);
              if (m) { val = m[1] ?? m[0]; res = val; }
              else res = '(No encontrado)';
            } catch {
              res = '(Error Regex)';
            }
          } else if (!pat) res = '(Esperando patrón)';
          else res = '(Esperando texto)';
  
          editor.updateNodeDataFromId(nodeId, { result: res });
          const el = document.getElementById(`node-${nodeId}`);
          const rt = el?.querySelector('textarea[df-result]');
          if (rt) rt.value = res;
  
          outP = val;
          propagateExecution(nodeId, outP);
          break;
        }
  
        // —————————————————————————————————————————————
        default: {
          // en cualquier otro caso, si es nodo “de sistema” vuelve a propagar
          if (!baseNodeDefinitions[nName] || EXECUTE_NODE_SYSTEM_TYPES.includes(nName)) {
            propagateExecution(nodeId, outP);
          }
        }
      }
    } catch (error) {
      console.error(`Error executing ${nName} (${nodeId}):`, error);
      showToast('error', `Error ${nName}`, error.message.substring(0,50), 4000);
    } finally {
      if (node) node._executing = false;
    }
  }
  
  
  function propagateExecution(sourceNodeId, payload) {
    const conns = getConnections(sourceNodeId, 'output');
    conns.forEach(conn => {
      const targetId   = conn.node;
      const targetNode = editor.getNodeFromId(targetId);
      if (!targetNode) return;
      const targetPort = conn.output;
  
      // — Nodos de sistema que disparan executeNode ——
      if (EXECUTE_NODE_SYSTEM_TYPES.includes(targetNode.name)) {
        if (targetNode.name === 'extract_value') {
          if (targetPort === 'input_1') {
            setTimeout(() => executeNode(targetId, payload), 0);
          } else if (targetPort === 'input_2') {
            const s = String(payload ?? '');
            editor.updateNodeDataFromId(targetId, { selector_received: s });
            const el = document.getElementById(`node-${targetId}`);
            const i  = el?.querySelector('input[df-selector_received]');
            if (i) i.value = s;
          }
        } else {
          setTimeout(() => executeNode(targetId, payload), 0);
        }
  
      // — Nodo JS: actualizamos lastInput y ejecutamos instantáneamente ——
      } else if (targetNode.name === 'javascript_code') {
        editor.updateNodeDataFromId(targetId, { lastInput: payload });
        setTimeout(() => executeNode(targetId, payload), 0);
  
      // — Resto de nodos personalizados —————————
      } else if (['mostrarPasar', 'guardarTexto', 'concatenar'].includes(targetNode.name)) {
        const val = String(payload ?? '');
        if (targetPort === 'input_1') {
          // mostrarPasar
          if (targetNode.name === 'mostrarPasar') {
            editor.updateNodeDataFromId(targetId, { result: val });
            const el = document.getElementById(`node-${targetId}`);
            const ta = el?.querySelector('textarea[df-result]');
            if (ta) ta.value = val;
            setTimeout(() => propagateData(targetId, targetNode.name, 'result', val), 0);
  
          // guardarTexto
          } else if (targetNode.name === 'guardarTexto') {
            editor.updateNodeDataFromId(targetId, { savecontent: val });
            const el = document.getElementById(`node-${targetId}`);
            const ta = el?.querySelector('textarea[df-savecontent]');
            if (ta) ta.value = val;
  
          // concatenar
          } else if (targetNode.name === 'concatenar') {
            setTimeout(() => updateConcatenateNode(targetId), 0);
          }
        }
      }
    });
  }
function handleNodeDataChange(event) { if (!editor || !event?.target) return; const el = event.target; const nodeEl = el.closest('.drawflow-node'); if (!nodeEl) return; const id = nodeEl.id.split('-')[1]; const node = editor.getNodeFromId(id); if (!node) return; let key = null; for (const attr of el.attributes) if (attr.name.startsWith('df-')) { key = attr.name.substring(3); break; } if (!key) return; requestAnimationFrame(() => { try { const updatedNode = editor.getNodeFromId(id); if (!updatedNode?.data?.hasOwnProperty(key)) return; const val = updatedNode.data[key]; const name = updatedNode.name; if ((name === 'url_input' && key === 'url') || (name === 'cargarTexto' && key === 'filecontent')) { if(name === 'url_input') executeNode(id, val); else propagateData(id, name, key, val); } else if (name === 'imagen' && ['imgsrc', 'imgalt', 'imgwidth', 'imgheight'].includes(key)) handleImageInputChange(event); else if (name === 'nota' && key === 'notecontent') updateCharacterCount(event); else if ((name === 'timer_fetch' || name === 'timer_download' || name === 'loop') && key === 'interval') executeNode(id, null); else if (name === 'timer_fetch' && key === 'url') executeNode(id, null); saveHistoryState(); } catch (e) { console.error(`Error handleNodeDataChange (${id}/${key}):`, e); } }); }
function propagateData(sourceNodeId, sourceNodeName, changedKey, outputData) {
    const sourceNode = editor.getNodeFromId(sourceNodeId);
    const outputPort = sourceNode?.outputs?.output_1;
    if (!outputPort) return;
  
    const connections = outputPort.connections || [];
    connections.forEach(conn => {
      const targetId   = conn.node;
      const targetNode = editor.getNodeFromId(targetId);
      if (!targetNode) return;
      const targetPort = conn.output;
  
      // — Nodos de sistema que disparan executeNode ——
      if (EXECUTE_NODE_SYSTEM_TYPES.includes(targetNode.name)) {
        if (targetNode.name === 'extract_value') {
          if (targetPort === 'input_1') {
            setTimeout(() => executeNode(targetId, outputData), 0);
          } else if (targetPort === 'input_2') {
            const s = String(outputData ?? '');
            editor.updateNodeDataFromId(targetId, { selector_received: s });
            const el = document.getElementById(`node-${targetId}`);
            const i  = el?.querySelector('input[df-selector_received]');
            if (i) i.value = s;
          }
        } else {
          setTimeout(() => executeNode(targetId, outputData), 0);
        }
  
      // — Nodo JS: actualizamos lastInput y ejecutamos instantáneamente ——
      } else if (targetNode.name === 'javascript_code') {
        editor.updateNodeDataFromId(targetId, { lastInput: outputData });
        setTimeout(() => executeNode(targetId, outputData), 0);
  
      // — concatenar ———————
      } else if (targetNode.name === 'concatenar') {
        setTimeout(() => updateConcatenateNode(targetId), 0);
  
      // — mostrarPasar —————
      } else if (targetNode.name === 'mostrarPasar' && targetPort === 'input_1') {
        const v = String(outputData ?? '');
        editor.updateNodeDataFromId(targetId, { result: v });
        const el = document.getElementById(`node-${targetId}`);
        const ta = el?.querySelector('textarea[df-result]');
        if (ta) ta.value = v;
        setTimeout(() => propagateData(targetId, targetNode.name, 'result', outputData), 0);
  
      // — guardarTexto —————
      } else if (targetNode.name === 'guardarTexto' && targetPort === 'input_1') {
        const v = String(outputData ?? '');
        editor.updateNodeDataFromId(targetId, { savecontent: v });
        const el = document.getElementById(`node-${targetId}`);
        const ta = el?.querySelector('textarea[df-savecontent]');
        if (ta) ta.value = v;
      }
    });
  }
  
function updateConcatenateNode(nodeId) { const n = editor.getNodeFromId(nodeId); if (!n || n.name !== 'concatenar' || !n.inputs?.input_1) return; const conns = (n.inputs.input_1.connections || []).slice().sort((a, b) => (editor.getNodeFromId(a.node)?.pos_y ?? 0) - (editor.getNodeFromId(b.node)?.pos_y ?? 0)); let str = ""; conns.forEach(c => { const sN = editor.getNodeFromId(c.node); if (!sN?.data) return; let dC = ''; const d = sN.data; const keys = ['result', 'content', 'codecontent', 'outputhtml', 'filecontent', 'display', 'url', 'jscode']; for(const k of keys){if(d.hasOwnProperty(k)){ dC = d[k]; break; }} if (dC === '' && Object.keys(d).length > 0) { const fk = Object.keys(d)[0]; if(!['lastInput', 'selector_received'].includes(fk)) dC = d[fk]; } str += String(dC ?? ''); }); if (n.data.result !== str) { editor.updateNodeDataFromId(nodeId, { result: str }); propagateData(nodeId, 'concatenar', 'result', str); saveHistoryState(); } }

// --- Node Activation ---
function activateNodeIfNeeded(nodeId) { try { const node = editor.getNodeFromId(nodeId); if (!node) return; const nName = node.name; if (['timer_fetch', 'timer_download', 'loop'].includes(nName)) executeNode(nodeId, null); else if (nName === 'repeat' && getConnections(nodeId, 'input').length === 0) executeNode(nodeId, null); else if (nName === 'url_input') { const url = readField(nodeId, 'df-url'); if (url?.trim()) executeNode(nodeId, url); } else if (nName === 'cargarTexto') { const c = node.data?.filecontent; if(c) propagateData(nodeId, nName, 'filecontent', c); } else if (nName === 'texto') { const c = node.data?.content; if(c) propagateData(nodeId, nName, 'content', c); } else if (nName === 'static_code_snippet') { const c = node.data?.codecontent; if(c) propagateData(nodeId, nName, 'codecontent', c); } else if (nName === 'imagen') generateImageHtml(nodeId); } catch (error) { console.error(`Error activating ${nodeId}:`, error); } }
function activateExistingAutoNodes() { console.log("Activating initial/auto nodes..."); let nodes = {}; try { nodes = editor.export()?.drawflow?.[editor.module]?.data ?? {}; } catch (e) { console.error("Err get nodes for activation:", e); return; } cleanupAllModuleIntervals(); const ids = Object.keys(nodes); if (ids.length > 0) { ids.forEach(id => { activateNodeIfNeeded(id); }); ids.forEach(id => { if (nodes[id]?.name === 'concatenar') updateConcatenateNode(id); }); } console.log("Initial activation complete."); }

// --- Node Search ---
if (searchInput) searchInput.addEventListener('input', filterNodes);
function filterNodes() { if (!searchInput || !nodesListContainer) return; try { const s = searchInput.value.toLowerCase().trim(); const items = nodesListContainer.querySelectorAll('.drag-drawflow, .create-node-button'); items?.forEach(i => { const btn = i.classList.contains('create-node-button'); const type = i.dataset.node?.toLowerCase() || ''; const nameEl = i.querySelector('span'); const nameTxt = nameEl?.textContent.toLowerCase().trim() || ''; const defName = btn ? 'crear tipo nodo' : ''; const itemTxt = nameTxt || defName; const show = !s || itemTxt.includes(s) || (type && type.includes(s)) || (btn && 'crear'.includes(s)); i.style.display = show ? (btn ? 'block' : 'flex') : 'none'; }); } catch (e) { console.error("Error filterNodes:", e); } }

// --- Custom Node Management ---
function getStoredCustomNodeTypes() { try { const s = localStorage.getItem(LOCALSTORAGE_NODES_KEY); return JSON.parse(s || '{}'); } catch (e) { console.error("Err reading custom types:", e); return {}; } }
function saveCustomNodeTypes(allTypes) { try { const custom = {}; for (const k in allTypes) if (!baseNodeDefinitions.hasOwnProperty(k)) custom[k] = allTypes[k]; localStorage.setItem(LOCALSTORAGE_NODES_KEY, JSON.stringify(custom)); } catch (e) { console.error("Err saving custom types:", e); showToast('error', 'Error', 'Cannot save custom nodes.'); } }
function addDraggableItemToSidebar(nodeDef) { if (!nodesListContainer || !nodeDef?.name) return; if (nodesListContainer.querySelector(`.drag-drawflow[data-node="${nodeDef.name}"]`)) return; const div = document.createElement('div'); div.className = 'drag-drawflow'; div.style.display = 'flex'; div.draggable = true; div.dataset.node = nodeDef.name; let title = nodeDef.title || nodeDef.name; let iconHtml = '<i class="fas fa-puzzle-piece"></i>'; try { const tmp = document.createElement('div'); tmp.innerHTML = nodeDef.html || ''; const tb = tmp.querySelector('.title-box'); if (tb) { const i = tb.querySelector('i'); if (i) { const ci = i.cloneNode(true); ci.style.cssText = 'margin-right: 8px; color: #777; width: 16px; text-align: center; flex-shrink: 0;'; iconHtml = ci.outerHTML; } if (!nodeDef.title) { const txt = tb.textContent.replace(/<[^>]*>/g, '').trim(); if (txt) title = txt; } } } catch (e) { console.warn(`Err parsing sidebar HTML for ${nodeDef.name}:`, e); } div.innerHTML = `${iconHtml}<span style="flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(title)}</span>`; div.title = `Drag: ${title} (${nodeDef.name})`; if (!baseNodeDefinitions.hasOwnProperty(nodeDef.name)) { const del = document.createElement('button'); del.innerHTML = '<i class="fas fa-trash-alt"></i>'; del.className = 'delete-node-type-btn'; del.title = `Delete type: ${nodeDef.name}`; del.setAttribute('aria-label', `Delete type ${nodeDef.name}`); del.onclick = (ev) => { ev.stopPropagation(); promptDeleteNodeType(nodeDef.name); }; div.appendChild(del); } div.addEventListener('dragstart', drag); div.addEventListener('touchstart', drag, { passive: false }); div.addEventListener('touchmove', positionMobile, { passive: false }); div.addEventListener('touchend', drop); nodesListContainer.appendChild(div); }
function loadCustomNodesToSidebar() { if (!nodesListContainer) return; try { const stored = getStoredCustomNodeTypes(); customNodeTypes = { ...baseNodeDefinitions, ...stored }; console.log("Node types loaded:", Object.keys(customNodeTypes).length); nodesListContainer.innerHTML = ''; if (nodeDefinitionModal) { const btn = document.createElement('div'); btn.className = 'create-node-button'; btn.setAttribute('role', 'button'); btn.innerHTML = '<i class="fas fa-plus-circle"></i><span>&nbsp;&nbsp;Create Node Type</span>'; btn.title = 'Define new custom node type'; btn.onclick = openNodeDefinitionModal; nodesListContainer.appendChild(btn); } const defs = Object.values(customNodeTypes).sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name)); defs.forEach(addDraggableItemToSidebar); filterNodes(); } catch (e) { console.error("Fatal sidebar load error:", e); showToast('error', 'Sidebar Error', 'Error loading nodes.'); } }
function openNodeDefinitionModal() { if (!nodeDefinitionModal || !modalBackdrop) { showToast('error','Error','Modal not available.'); return; } document.getElementById('newNodeTypeName').value = ''; document.getElementById('newNodeTypeTitle').value = ''; document.getElementById('newNodeInputs').value = '1'; document.getElementById('newNodeOutputs').value = '1'; document.getElementById('newNodeCssClass').value = ''; document.getElementById('newNodeHtmlContent').value = `<div>\n  <div class="title-box"><i class="fas fa-cogs"></i> My Node</div>\n  <div class="box">\n    <label>Data:</label>\n    <input type="text" df-mydata placeholder="Value...">\n  </div>\n</div>`; document.getElementById('newNodeInitialData').value = `{ "mydata": "" }`; nodeDefinitionModal.style.display = 'block'; modalBackdrop.style.display = 'block'; document.getElementById('newNodeTypeName').focus(); }
function closeNodeDefinitionModal() { if (!nodeDefinitionModal || !modalBackdrop) return; nodeDefinitionModal.style.display = 'none'; modalBackdrop.style.display = 'none'; }
function saveNewNodeType() { const nameIn=document.getElementById('newNodeTypeName'), titleIn=document.getElementById('newNodeTypeTitle'), inputsIn=document.getElementById('newNodeInputs'), outputsIn=document.getElementById('newNodeOutputs'), cssIn=document.getElementById('newNodeCssClass'), htmlIn=document.getElementById('newNodeHtmlContent'), dataIn=document.getElementById('newNodeInitialData'); if(!nameIn||!titleIn||!inputsIn||!outputsIn||!cssIn||!htmlIn||!dataIn) { showToast('error','Internal Error','Modal fields missing.'); return; } const name=nameIn.value.trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''); const title=titleIn.value.trim(); const inputs=parseInt(inputsIn.value,10); const outputs=parseInt(outputsIn.value,10); const cssClass=cssIn.value.trim()||`${name}-node`; const html=htmlIn.value; const dataStr=dataIn.value.trim(); if(!name) { showToast('error','Validation Error','Internal name required.'); nameIn.focus(); return; } if(customNodeTypes[name]) { showToast('error','Validation Error',`Name "${name}" exists.`); nameIn.focus(); return; } if(isNaN(inputs)||inputs<0||isNaN(outputs)||outputs<0) { showToast('error','Validation Error','Inputs/Outputs >= 0.'); return; } if(!html) { showToast('error','Validation Error','HTML empty.'); htmlIn.focus(); return; } let iData={}; if(dataStr) { try { iData=JSON.parse(dataStr); if(typeof iData!=='object'||iData===null||Array.isArray(iData)) throw new Error("JSON must be object."); } catch (e) { showToast('error','JSON Error',`Initial Data: ${e.message}`); dataIn.focus(); return; } } else { try { const tmp=document.createElement('div'); tmp.innerHTML=html; tmp.querySelectorAll('[df-]').forEach(el=>{ for(const a of el.attributes) if(a.name.startsWith('df-')){ const k=a.name.substring(3); if(!iData.hasOwnProperty(k)) iData[k]=el.value??el.textContent??''; } }); } catch(e){console.warn("Infer data error:", e);} } const def={name,title,inputs,outputs,html,data:iData,cssClass}; customNodeTypes[name]=def; saveCustomNodeTypes(customNodeTypes); addDraggableItemToSidebar(def); const item=nodesListContainer.querySelector(`[data-node="${name}"]`); item?.scrollIntoView({behavior:'smooth',block:'nearest'}); showToast('success','Success',`Type "${title||name}" added.`); closeNodeDefinitionModal(); }
function promptDeleteNodeType(nodeTypeName) { if(!nodeTypeName) return; if(baseNodeDefinitions.hasOwnProperty(nodeTypeName)){ showToast('warning','Not Allowed',`Base node "${nodeTypeName}" cannot be deleted.`); return; } if(!customNodeTypes.hasOwnProperty(nodeTypeName) || !getStoredCustomNodeTypes().hasOwnProperty(nodeTypeName)){ showToast('error','Error',`Custom node "${nodeTypeName}" not found.`); return; } const title=customNodeTypes[nodeTypeName]?.title||nodeTypeName; Swal.fire({title:`Delete Type "${title}"?`, text:`Delete definition "${nodeTypeName}"? Existing nodes may fail. Irreversible!`, icon:'warning', showCancelButton:true, confirmButtonColor:'#d33', cancelButtonColor:'#3085d6', confirmButtonText:'Yes, delete type', cancelButtonText:'Cancel'}).then((res) => { if(res.isConfirmed){ try { delete customNodeTypes[nodeTypeName]; saveCustomNodeTypes(customNodeTypes); loadCustomNodesToSidebar(); showToast('success','Deleted',`Type "${title}" deleted.`); } catch(err){ console.error(`Err deleting ${nodeTypeName}:`,err); showToast('error','Error', 'Failed to delete.'); customNodeTypes[nodeTypeName] = getStoredCustomNodeTypes()[nodeTypeName]; } } }); }

// --- History (Undo/Redo) ---
function initializeHistory() { historyStack = []; historyIndex = -1; updateUIDisabledStates(); console.log("History initialized."); }
function saveHistoryState(force = false) { if (!editor || (isLocked() && !force)) return; try { const current = JSON.stringify(editor.export()); if (!force && historyIndex >= 0 && historyStack[historyIndex] === current) return; if (historyIndex < historyStack.length - 1) historyStack = historyStack.slice(0, historyIndex + 1); historyStack.push(current); if (historyStack.length > MAX_HISTORY_STATES) historyStack.shift(); historyIndex = historyStack.length - 1; updateUIDisabledStates(); } catch (e) { console.error("Error saveHistoryState:", e); } }
function undo() { if (historyIndex <= 0 || isLocked()) return; try { historyIndex--; const prev = JSON.parse(historyStack[historyIndex]); const mod = editor.module; cleanupAllModuleIntervals(); editor.import(prev); if (editor.module === mod) { activateExistingAutoNodes(); updateUIDisabledStates(); if(currentlyEditingNodeId && !editor.getNodeFromId(currentlyEditingNodeId)) closeCodeEditorSidebar(false); else if (currentlyEditingNodeId) openCodeEditorSidebar(currentlyEditingNodeId); } else console.warn("Module changed during Undo."); } catch (e) { console.error("Error Undo:", e); historyIndex++; updateUIDisabledStates(); showToast('error', 'Error', 'Failed to undo.'); } }
function redo() { if (historyIndex >= historyStack.length - 1 || isLocked()) return; try { historyIndex++; const next = JSON.parse(historyStack[historyIndex]); const mod = editor.module; cleanupAllModuleIntervals(); editor.import(next); if (editor.module === mod) { activateExistingAutoNodes(); updateUIDisabledStates(); if(currentlyEditingNodeId && !editor.getNodeFromId(currentlyEditingNodeId)) closeCodeEditorSidebar(false); else if (currentlyEditingNodeId) openCodeEditorSidebar(currentlyEditingNodeId); } else console.warn("Module changed during Redo."); } catch (e) { console.error("Error Redo:", e); historyIndex--; updateUIDisabledStates(); showToast('error', 'Error', 'Failed to redo.'); } }

// --- Project Management ---
function triggerLoad() { if (fileInputElement) fileInputElement.click(); else showToast('error', 'Error', 'File input missing.'); }
if (fileInputElement) fileInputElement.addEventListener('change', loadProjectFromFile);


function loadProjectFromFile(event) {
    console.log(">>> loadProjectFromFile FUNCTION CALLED <<<");
    const fileInput = event.target; // Referencia al input
    const file = fileInput?.files?.[0];

    if (!file) {
        if(fileInput) fileInput.value = null; // Limpia si no hay archivo
        return;
    }

    const expectedProjectName = file.name.replace(/\.json$/i, "");
    console.log(`Intentando cargar archivo: ${file.name}`);
    const reader = new FileReader();

    reader.onload = (e) => {
        let projectData;
        const fileContent = e.target.result; // Guarda el contenido para posible log

        try {
            // --- PASO 1: Intentar parsear el JSON ---
            try {
                projectData = JSON.parse(fileContent);
            } catch (parseError) {
                console.error("Error al parsear JSON:", parseError, "\nContenido (inicio):", fileContent.substring(0, 200));
                showToast( // Usando showToast como se solicitó
                    'error',
                    'Load Error',
                    `Error: ${escapeHtml(parseError.message)}`,
                    4000
                );
                return; // Detiene el proceso aquí
            }

            // --- PASO 2: Verificar estructura básica de Drawflow ---
            if (!projectData || typeof projectData.drawflow !== 'object' || projectData.drawflow === null) {
                console.error("Estructura JSON inválida: falta la clave 'drawflow'. Datos:", projectData);
                 Swal.fire({
                    icon: 'error',
                    title: 'Error de Carga: Estructura Inválida',
                    text: `El archivo JSON "${escapeHtml(file.name)}" es válido, pero le falta la estructura interna necesaria ('drawflow') para ser un proyecto Xocoflow.`,
                    confirmButtonText: 'Entendido'
                });
                return; // Detiene el proceso
            }

            // --- PASO 3: Procesar Nodos Personalizados ---
            console.log("JSON parseado, procesando nodos personalizados...");
            try {
                if (projectData.customNodeDefinitions && typeof projectData.customNodeDefinitions === 'object') {
                    saveCustomNodeTypes(projectData.customNodeDefinitions);
                    customNodeTypes = { ...baseNodeDefinitions, ...projectData.customNodeDefinitions };
                } else {
                    customNodeTypes = { ...baseNodeDefinitions, ...getStoredCustomNodeTypes() };
                }
                loadCustomNodesToSidebar(); // Actualiza ANTES de importar para que Drawflow conozca los tipos
            } catch (nodeError) {
                 console.error("Error procesando definiciones de nodos personalizados:", nodeError);
                 showToast('warning', 'Nodos Personalizados', 'Hubo un problema al cargar las definiciones de nodos personalizados del archivo.', 3000);
                 customNodeTypes = { ...baseNodeDefinitions, ...getStoredCustomNodeTypes() };
                 loadCustomNodesToSidebar();
            }


            // --- PASO 4: Intentar importar en Drawflow Y SINCRONIZAR UI ---
            console.log("Importando datos en Drawflow...");
            let currentModuleBeforeImport = editor.module; // Guarda el módulo actual
            try {
                cleanupAllModuleIntervals();
                editor.import(projectData); // Intenta la importación

                // --- INICIO: ACTUALIZACIÓN MANUAL DE UI POST-IMPORTACIÓN ---
                console.log("Sincronizando UI de nodos con datos importados...");
                // Asegúrate de operar sobre el módulo correcto (puede cambiar durante la importación)
                const targetModule = editor.module || currentModuleBeforeImport; // Usa el módulo actual del editor
                const currentModuleNodes = editor.export().drawflow[targetModule]?.data;

                if (currentModuleNodes) {
                    Object.keys(currentModuleNodes).forEach(nodeId => {
                        const nodeData = currentModuleNodes[nodeId].data;
                        const nodeElement = document.getElementById(`node-${nodeId}`); // Busca el elemento en el DOM
                        const nodeDefinition = customNodeTypes[currentModuleNodes[nodeId].name]; // Obtiene la definición

                        if (nodeElement && nodeData) {
                             // Intenta reconstruir/actualizar el contenido HTML si es necesario
                             // (Esto es opcional y puede ser complejo, Drawflow debería manejarlo
                             // si el 'html' guardado es solo el nombre del nodo y typenode='html')
                             // Si guardaste el HTML completo, esta sincronización de abajo es CRUCIAL.

                            // Itera sobre los datos del nodo para actualizar los elementos df-*
                            Object.keys(nodeData).forEach(dataKey => {
                                const inputElement = nodeElement.querySelector(`[df-${dataKey}]`);
                                if (inputElement) {
                                    const value = nodeData[dataKey];
                                    if (inputElement.tagName === 'TEXTAREA' || (inputElement.tagName === 'INPUT' && ['text', 'number', 'url', 'email', 'password'].includes(inputElement.type))) {
                                        inputElement.value = value ?? '';
                                    } else if (inputElement.tagName === 'SELECT'){
                                         inputElement.value = value ?? '';
                                         // Disparar evento change si es necesario para estilos (ej. color nota)
                                         if (dataKey === 'notecolor') {
                                             const changeEvent = new Event('change', { bubbles: true });
                                             inputElement.dispatchEvent(changeEvent);
                                         }
                                    } else if (inputElement.tagName === 'IMG' && dataKey === 'imagesrc') { // Caso local_image
                                        inputElement.src = value ?? '';
                                        inputElement.style.display = value ? 'block' : 'none';
                                        const placeholder = nodeElement.querySelector('.placeholder-text');
                                        if(placeholder) placeholder.style.display = value ? 'none' : 'block';
                                    } else if (inputElement.tagName === 'SPAN' && dataKey === 'filename'){
                                         inputElement.textContent = value ?? '';
                                         inputElement.title = value ?? '';
                                    } else if (inputElement.hasAttribute('df-charcount')) { // Caso contador nota
                                         inputElement.textContent = nodeElement.querySelector('[df-notecontent]')?.value?.length || '0';
                                    }
                                     // Añade más casos según tus nodos personalizados
                                }
                            });

                             // Aplicar estilos o tamaños específicos post-actualización
                            if (currentModuleNodes[nodeId].name === 'nota' && nodeData.notecolor) {
                                 nodeElement.style.backgroundColor = nodeData.notecolor;
                                 // Actualiza color del title-box si es necesario (copiado de changeNoteColor)
                                 const tb = nodeElement.querySelector('.title-box');
                                 if(tb) {
                                     const darkBgs = ['#ccccff', '#e0e0e0'];
                                     if (darkBgs.includes(nodeData.notecolor)) {
                                         tb.style.backgroundColor = '#f0f0f0'; tb.style.color = '#333';
                                     } else {
                                         tb.style.backgroundColor = ''; tb.style.color = '';
                                     }
                                 }
                             } else if (currentModuleNodes[nodeId].name === 'local_image') {
                                 if (nodeData.nodewidth) nodeElement.style.width = nodeData.nodewidth;
                                 if (nodeData.nodeheight) nodeElement.style.height = nodeData.nodeheight;
                                 const imgTag = nodeElement.querySelector('img[df-imagesrc]');
                                 if (imgTag){
                                     if(nodeData.imagewidth) imgTag.style.width = nodeData.imagewidth;
                                     if(nodeData.imageheight) imgTag.style.height = nodeData.imageheight;
                                 }

                             }
                              // Llama a editor.updateNodeDataFromId si necesitas que Drawflow internamente
                              // también registre estos cambios visuales (aunque ya están en nodeData)
                              // editor.updateNodeDataFromId(nodeId, nodeData); // Opcional, puede ser redundante
                        }
                    });
                } else {
                    console.warn("No se encontraron nodos en el módulo actual post-importación para sincronizar UI:", targetModule);
                }
                console.log("Sincronización UI completada.");
                // --- FIN: ACTUALIZACIÓN MANUAL DE UI POST-IMPORTACIÓN ---

            } catch (importError) {
                console.error("Error durante editor.import():", importError, "\nDatos Drawflow (inicio):", JSON.stringify(projectData.drawflow).substring(0, 300));
                 Swal.fire({
                    icon: 'error',
                    title: 'Error de Carga: Datos Incompatibles',
                    html: `El archivo <b>${escapeHtml(file.name)}</b> tiene datos internos no compatibles o corruptos.<br><br><i>Detalle: ${escapeHtml(importError.message)}</i>`,
                    confirmButtonText: 'Entendido'
                });
                return; // Detiene el proceso
            }

            // --- PASO 5: Éxito - Finalizar la carga ---
            console.log("Importación completada. Actualizando UI y estado.");
            currentProjectName = expectedProjectName;
            renderModuleTabs(); // Renderiza tabs DESPUÉS de la importación exitosa
            initializeHistory(); // Reinicia historial DESPUÉS de importación exitosa
            selectedNodeId = null; // Limpia selección
            copiedNodeData = null; // Limpia portapapeles
            updateUIDisabledStates(); // Actualiza estado botones
            closeCodeEditorSidebar(false); // Cierra editor código
            document.title = `Xocoflow | ${currentProjectName} - ${editor.module}`;
            saveHistoryState(true); // Guarda el estado inicial cargado
            // Llama a activateExistingAutoNodes DESPUÉS de sincronizar la UI
            // para que los nodos automáticos (timers, etc.) funcionen con los datos correctos.
            activateExistingAutoNodes();
            showToast('success', 'Cargado', `Proyecto "${escapeHtml(currentProjectName)}" cargado.`);

        } catch (err) {
            // Catch general para errores inesperados
            console.error("Error inesperado durante la carga del proyecto:", err);
            showToast('error', 'Error de Carga Inesperado', `Ocurrió un problema: ${err.message}`, 4000);
        } finally {
            if (fileInput) fileInput.value = null;
        }
    };

    reader.onerror = (e) => {
        // Error de FileReader
        console.error("Error de FileReader:", e);
        showToast('error', 'Error de Lectura', 'No se pudo leer el archivo seleccionado.', 3000);
         if (fileInput) fileInput.value = null;
    };

    reader.readAsText(file);
}



// --- Project Management & Module Actions ---

/**
 * Guarda el proyecto actual (estado de Drawflow, nodos personalizados, metadatos)
 * en un archivo JSON descargable.
 * @param {string} [filename] - Nombre base para el archivo (sin .json). Usa currentProjectName o 'xocoflow_project' si no se provee.
 */
function saveProject(filename) {
    if (!editor) return;

    // Gestiona el nombre del archivo
    if (!filename || typeof filename !== 'string') {
        filename = currentProjectName || 'xocoflow_project';
    }
    filename = filename.trim().replace(/\.json$/i,""); // Quita extensión si la tiene
    if (!filename) {
        filename = 'xocoflow_project'; // Nombre por defecto si queda vacío
    }
    filename += '.json'; // Añade la extensión

    try {
        const drawflowData = editor.export(); // Obtiene datos de Drawflow (puede incluir HTML renderizado)
        if (!drawflowData?.drawflow) {
            throw new Error("Export failed or drawflow data missing.");
        }

        const customDefs = getStoredCustomNodeTypes(); // Obtiene definiciones personalizadas actuales

        // Construye el objeto del proyecto a guardar
        const project = {
            appName: "Xocoflow",
            version: "1.7.6", // <- Versión actualizada para consistencia con el archivo
            savedAt: new Date().toISOString(),
            customNodeDefinitions: customDefs,
            drawflow: drawflowData.drawflow // Guarda la parte 'drawflow' de la exportación
        };

        const json = JSON.stringify(project, null, 2); // Formato legible
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

        // Técnica para descargar el archivo
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href); // Libera memoria

        // Actualiza estado de la aplicación
        currentProjectName = filename.replace(/\.json$/i, ""); // Actualiza nombre sin extensión
        document.title = `Xocoflow | ${currentProjectName} - ${editor.module}`;
        showToast('success', 'Guardado', `Proyecto "${filename}" guardado.`);

    } catch (err) {
        console.error("Error saving project:", err);
        showToast('error', 'Error al Guardar', `No se pudo guardar el proyecto: ${err.message}`);
    }
}

/**
 * Muestra un diálogo para que el usuario introduzca un nombre de archivo
 * y luego llama a saveProject con ese nombre.
 */
async function promptSaveAs() {
    if (!editor) return; // Añade verificación por si acaso
    try {
        const { value: inputName } = await Swal.fire({
            title: 'Guardar Como...',
            input: 'text',
            inputLabel: 'Nombre del archivo (sin .json)',
            inputValue: currentProjectName || 'mi_proyecto', // Sugiere nombre actual o genérico
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            inputValidator: (v) => {
                const trimmed = v?.trim();
                if (!trimmed) return '¡El nombre es obligatorio!';
                // Regex para caracteres inválidos en nombres de archivo comunes
                if (/[<>:"/\\|?*]/.test(trimmed)) return 'Nombre contiene caracteres inválidos.';
                return null; // Válido
            }
        });

        if (inputName) { // Si el usuario confirmó y el nombre es válido
            saveProject(inputName.trim()); // Llama a saveProject con el nuevo nombre
        }
    } catch (e) {
        // Error en el propio diálogo Swal (raro)
        console.error("Error in Save As dialog:", e);
        showToast('error', 'Error', 'No se pudo mostrar el diálogo Guardar Como.');
    }
}

/**
 * Muestra el contenido completo devuelto por editor.export() en formato JSON
 * dentro de un modal para inspección.
 */
function exportRawJson() {
    if (!editor) return;
    try {
        const raw = editor.export(); // Obtiene la exportación completa de Drawflow
        if (!raw?.drawflow) { // Verifica que al menos exista la estructura base
            throw new Error("Export failed or drawflow data missing.");
        }
        const json = JSON.stringify(raw, null, 2); // Formatea todo el objeto exportado

        Swal.fire({
            title: 'JSON Crudo de Drawflow',
            width: '80%', // Modal más ancho
            html: `<textarea readonly style="width: 95%; height: 400px; white-space: pre; overflow-wrap: normal; overflow-x: auto; background-color:#f8f8f8; border:1px solid #ddd; font-family:monospace; font-size:12px;">${escapeHtml(json)}</textarea>`,
            confirmButtonText: 'Cerrar'
        });
    } catch (e) {
        console.error("Error exporting raw JSON:", e);
        showToast('error', 'Error de Exportación', `No se pudo exportar el JSON: ${e.message}`);
    }
}

/**
 * Limpia todos los nodos y conexiones del módulo actualmente activo,
 * previa confirmación del usuario.
 */
function clearCurrentModule() {
    if (!editor) return;
    const mod = editor.module;
    let nodeCount = 0;
    try {
        // Obtiene la cuenta de nodos de forma segura
        nodeCount = Object.keys(editor.export()?.drawflow?.[mod]?.data ?? {}).length;
    } catch (e) {
        console.error("Error getting node count for module:", mod, e);
        showToast('error', 'Error', 'No se pudo verificar el contenido del módulo.');
        return;
    }

    if (nodeCount === 0) {
        showToast('info', 'Módulo Vacío', `El módulo "${escapeHtml(mod)}" ya está vacío.`);
        return;
    }

    try {
        Swal.fire({
            title: `¿Limpiar Módulo "${escapeHtml(mod)}"?`,
            text: `Se eliminarán ${nodeCount} nodos y todas sus conexiones. ¡Esta acción es irreversible!`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, limpiar módulo',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                console.log(`Clearing module: ${mod}`);
                cleanupAllModuleIntervals(); // Detiene timers, etc.
                editor.clearModuleSelected(); // Limpia el contenido del módulo en Drawflow
                // Resetea estado de la aplicación relacionado con selección/copia
                selectedNodeId = null;
                copiedNodeData = null;
                updateUIDisabledStates();
                closeCodeEditorSidebar(false); // Cierra editor si estaba abierto
                if (mod === 'Home') { // Si es el módulo Home, añade nodo bienvenida
                    addWelcomeNode(mod);
                }
                saveHistoryState(true); // Guarda el estado vacío (o con bienvenida)
                showToast('info', 'Módulo Limpiado', `Módulo "${escapeHtml(mod)}" limpiado.`);
            }
        });
    } catch (e) {
        // Error en el diálogo Swal o lógica interna
        console.error("Error during clear module confirmation:", e);
        showToast('error', 'Error', 'No se pudo iniciar la limpieza del módulo.');
    }
}

// --- FIN Project Management & Module Actions ---
// --- Node Actions ---
function duplicateSelectedNode() { if (!selectedNodeId || isLocked()) return; try { const oNode = editor.getNodeFromId(selectedNodeId); if (!oNode) throw new Error("Node not found."); const cData = JSON.parse(JSON.stringify(oNode.data || {})); const ins = Object.keys(oNode.inputs || {}).length, outs = Object.keys(oNode.outputs || {}).length; const x = oNode.pos_x + 40, y = oNode.pos_y + 40; const newId = editor.addNode(oNode.name, ins, outs, x, y, oNode.class, cData, oNode.html); saveHistoryState(); activateNodeIfNeeded(newId); } catch (err) { showToast('error', 'Duplicate Error', `Error: ${err.message}`); } }
function copySelectedNode() { if (!selectedNodeId || isLocked()) return; try { const node = editor.getNodeFromId(selectedNodeId); if (!node) throw new Error("Node not found."); if (!customNodeTypes[node.name]) throw new Error(`Type "${node.name}" unknown.`); copiedNodeData = { name: node.name, data: JSON.parse(JSON.stringify(node.data || {})), html: node.html, class: node.class, inputs: Object.keys(node.inputs || {}).length, outputs: Object.keys(node.outputs || {}).length, title: node.title || node.name }; updateUIDisabledStates(); showToast('success', 'Node Copied', `${copiedNodeData.title}`); } catch (err) { console.error("Error copying:", err); copiedNodeData = null; updateUIDisabledStates(); showToast('error', 'Copy Error', `Error: ${err.message}`); } }
function pasteNode() { if (!copiedNodeData || isLocked()) return; if (!customNodeTypes[copiedNodeData.name]) { showToast('error', 'Paste Error', `Type "${copiedNodeData.name}" unknown.`); copiedNodeData = null; updateUIDisabledStates(); return; } try { const rect = editor.container.getBoundingClientRect(), zoom = editor.zoom || 1; const cx = (rect.width / 2 - editor.canvas_x) / zoom, cy = (rect.height / 2 - editor.canvas_y) / zoom; const ox = Math.random() * 40 - 20, oy = Math.random() * 40 - 20; const w = 200, h = 100; const x = cx - (w / 2) + ox, y = cy + oy; const cData = JSON.parse(JSON.stringify(copiedNodeData.data)); const newId = editor.addNode(copiedNodeData.name, copiedNodeData.inputs, copiedNodeData.outputs, x, y, copiedNodeData.class, cData, copiedNodeData.html); saveHistoryState(); activateNodeIfNeeded(newId); } catch (err) { showToast('error', 'Paste Error', `Error: ${err.message}`); } }
function deleteSelectedNode() { if (!selectedNodeId || isLocked()) return; try { editor.removeNodeId(`node-${selectedNodeId}`); /* State update handled by listener */ } catch (err) { showToast('error', 'Delete Error', `Error: ${err.message}`); } }

// --- Module/Tab Management ---
function renderModuleTabs() { /* Sin cambios */
    if (!moduleListElement) return;
    try {
        moduleListElement.innerHTML = '';
        const modulesData = editor.export().drawflow || {};
        const currentModule = editor.module;
        let moduleNames = Object.keys(modulesData);
        if (moduleNames.length === 0) {
             if (!modulesData['Home']) { editor.addModule('Home'); moduleNames = ['Home']; }
             else { moduleNames = ['Home']; }
        }
        moduleNames.sort((a, b) => (a === 'Home' ? -1 : b === 'Home' ? 1 : a.localeCompare(b)));

        moduleNames.forEach(moduleName => {
            const li = document.createElement('li');
            li.textContent = moduleName;
            li.dataset.moduleName = moduleName;
            li.title = `Cambiar a: ${moduleName}`;
            // ----------- AQUI SE CAMBIA -----------
            li.onclick = () => {
                editor.changeModule(moduleName);
                // Si quieres que las pestañas se vuelvan a renderizar inmediatamente:
                renderModuleTabs();
            };
            // ---------------------------------------
        
            if (moduleName === currentModule) li.classList.add('selected');
        
            if (moduleName !== 'Home' && moduleNames.length > 1) {
                const closeBtn = document.createElement('span');
                closeBtn.innerHTML = '×';
                closeBtn.title = `Eliminar ${moduleName}`;
                closeBtn.className = 'close-tab-btn';
                closeBtn.style.cssText = `
                    margin-left: 8px;
                    cursor: pointer;
                    color: #aaa;
                    font-weight: bold;
                    padding: 0 4px;
                    border-radius: 3px;
                    font-size: 14px;
                    line-height: 1;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    height: 16px;
                    width: 16px;
                    vertical-align: middle;
                    transition: all 0.2s;
                `;
                closeBtn.onmouseover = () => {
                    closeBtn.style.color = '#fff';
                    closeBtn.style.backgroundColor = '#ffb3b3';
                };
                closeBtn.onmouseout = () => {
                    closeBtn.style.color = '#aaa';
                    closeBtn.style.backgroundColor = 'transparent';
                };
                closeBtn.onclick = (ev) => {
                    ev.stopPropagation();
                    removeModuleTab(moduleName);
                };
                li.appendChild(closeBtn);
            }
        
            moduleListElement.appendChild(li);
        });
        

        const addBtn = document.createElement('li'); addBtn.innerHTML = '<i class="fas fa-plus"></i>';
        addBtn.title = "Añadir módulo"; addBtn.className = 'add-tab-btn';
        addBtn.style.cssText = `cursor: pointer; border-right: none; padding: 0 10px; background-color: transparent; margin-left: 5px; opacity: 0.7; transition: opacity 0.2s;`;
        addBtn.onmouseover = () => { addBtn.style.opacity = '1'; }; addBtn.onmouseout = () => { addBtn.style.opacity = '0.7'; };
        addBtn.onclick = promptAddModule;
        moduleListElement.appendChild(addBtn);
    } catch (e) { console.error("Error en renderModuleTabs:", e); }
}

async function promptAddModule() { /* Sin cambios */
    try {
        const { value: moduleNameInput } = await Swal.fire({
             title: 'Nuevo Módulo', input: 'text', inputLabel: 'Nombre', inputValue: '',
             showCancelButton: true, confirmButtonText: 'Crear', cancelButtonText: 'Cancelar',
             inputValidator: (v) => {
                const t = v?.trim(); if (!t) return 'Nombre vacío.';
                const existing = Object.keys(editor.export().drawflow || {});
                if (existing.some(m => m.toLowerCase() === t.toLowerCase())) return `"${t}" ya existe.`;
                if (/[<>:"/\\|?*]/.test(t)) return 'Caracteres inválidos.';
                return null;
             }
        });
        const moduleName = moduleNameInput?.trim();
        if (moduleName) {
            console.log(`Añadiendo módulo: ${moduleName}`);
            editor.addModule(moduleName);
            editor.changeModule(moduleName); // Dispara 'moduleChanged'
            renderModuleTabs(); // 'moduleChanged' debería llamarlo
            addWelcomeNode(moduleName); // Añadir nodo bienvenida al nuevo módulo
        } else { console.log("Creación cancelada."); }
    } catch (e) { console.error("Error en promptAddModule:", e); }
}
function removeModuleTab(moduleName) { /* Adaptado para limpiar intervalos */
    if (moduleName === 'Home') { Swal.fire('No permitido', 'No puedes eliminar "Home".', 'warning'); return; }
    const moduleCount = Object.keys(editor.export().drawflow || {}).length;
    if (moduleCount <= 1) { Swal.fire('No permitido', 'No puedes eliminar el último módulo.', 'warning'); return; }

    try {
        Swal.fire({
            title: `¿Eliminar Módulo "${moduleName}"?`, text: "Acción permanente.", icon: 'warning',
            showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar'
         }).then((result) => {
            if (result.isConfirmed) {
                console.log(`Eliminando módulo: ${moduleName}`);
                const currentActiveModule = editor.module;

                // Limpiar intervalos ANTES de cambiar de módulo si es el activo
                if (currentActiveModule === moduleName) {
                     cleanupAllModuleIntervals();
                }

                try {
                     editor.removeModule(moduleName);
                     console.log(`Módulo "${moduleName}" eliminado.`);
                     if (currentActiveModule === moduleName) {
                         console.log("Cambiando a 'Home' tras eliminar activo.");
                         editor.changeModule('Home'); // Dispara 'moduleChanged'
                     } else {
                         console.log("Módulo inactivo eliminado. Renderizando pestañas.");
                         renderModuleTabs(); // Re-renderizar manualmente
                         saveHistoryState(true); // Guardar estado tras eliminar inactivo
                     }
                 } catch (removeError) { console.error(`Error eliminando módulo:`, removeError); Swal.fire('Error', `No se pudo eliminar: ${removeError.message}`, 'error'); }
            } else { console.log("Eliminación cancelada."); }
        });
    } catch (e) { console.error("Error confirmación eliminar:", e); }
}

// --- UI Helpers ---
function changeMode(option) { try { if (!lockButton || !unlockButton || !editor) return; const isLocking = option === 'lock'; editor.editor_mode = isLocking ? 'fixed' : 'edit'; updateUIDisabledStates(); showToast('info', `Editor ${isLocking ? 'Locked' : 'Unlocked'}`, '', 1500); if (isLocking) closeCodeEditorSidebar(false); } catch (e) { console.error("Error changeMode:", e); } }
function updateUIDisabledStates() { const locked = isLocked(); const nodeSel = selectedNodeId !== null; const canUndo = historyIndex > 0; const canRedo = historyIndex < historyStack.length - 1; const canPaste = copiedNodeData !== null; const setCtrl = (btn, vis, dis = false) => { if (btn) { btn.classList.toggle('hidden', !vis); btn.disabled = !vis || dis; } }; setCtrl(undoButton, !locked && canUndo, !canUndo); setCtrl(redoButton, !locked && canRedo, !canRedo); setCtrl(copyButton, !locked && nodeSel, !nodeSel); setCtrl(duplicateButton, !locked && nodeSel, !nodeSel); setCtrl(pasteButton, !locked && canPaste, !canPaste); if (recalculateButton) setCtrl(recalculateButton, !locked, locked); if (lockButton && unlockButton) { lockButton.style.display = locked ? 'none' : ''; unlockButton.style.display = locked ? '' : 'none'; const sw = lockButton.parentElement; if(sw) sw.setAttribute('aria-checked', String(locked)); } if (nodesListContainer) { nodesListContainer.style.opacity = locked ? '0.6' : '1'; nodesListContainer.style.pointerEvents = locked ? 'none' : ''; } updateNodePositionStatus(selectedNodeId); }

// --- Drag and Drop ---
var mobile_item_selec = ''; var mobile_last_move = null; function allowDrop(ev) { ev.preventDefault(); } function drag(ev) { try { const el = ev.target.closest(".drag-drawflow"); if (!el || !el.dataset.node) { ev.preventDefault(); return; } const nt = el.dataset.node; if (ev.type === "touchstart") { mobile_item_selec = nt; mobile_last_move = ev; el.style.opacity = '0.5';} else { ev.dataTransfer.setData("node", nt); ev.dataTransfer.effectAllowed = 'copy';} } catch(e){console.error("Drag error:",e);} } function positionMobile(ev) { mobile_last_move = ev; } function drop(ev) { let nodeName='',clientX=0,clientY=0,isTouch=false; try { if (ev.type === "touchend") { isTouch=true; const orig=nodesListContainer?.querySelector(`[data-node="${mobile_item_selec}"]`); if(orig) orig.style.opacity='1'; if(!mobile_last_move||!mobile_item_selec) return; clientX=mobile_last_move.changedTouches[0].clientX; clientY=mobile_last_move.changedTouches[0].clientY; nodeName=mobile_item_selec; mobile_item_selec=''; mobile_last_move=null; } else { ev.preventDefault(); nodeName=ev.dataTransfer.getData("node"); clientX=ev.clientX; clientY=ev.clientY; } const targetEl = document.elementFromPoint(clientX, clientY); if (nodeName && targetEl?.closest(`#${DRAWFLOW_CONTAINER_ID}`)) addNodeToDrawFlow(nodeName, clientX, clientY); } catch(e){console.error("Drop error:",e); if(isTouch){const orig=nodesListContainer?.querySelector(`[data-node="${mobile_item_selec}"]`); if(orig) orig.style.opacity='1'; mobile_item_selec=''; mobile_last_move=null;}} }
function addNodeToDrawFlow(name, pos_x, pos_y) { if(!editor || isLocked()){ showToast('warning', 'Locked'); return false; } try { const nodeDef=customNodeTypes[name]; if(!nodeDef) throw new Error(`Type "${name}" unknown.`); const rect=editor.container.getBoundingClientRect(), zoom=editor.zoom||1; const canvasX=(pos_x-rect.left-editor.canvas_x)/zoom, canvasY=(pos_y-rect.top-editor.canvas_y)/zoom; const w=parseInt(nodeDef.width||220), h=parseInt(nodeDef.height||80); const adjX=canvasX-(w/2), adjY=canvasY-(h/2); const data=JSON.parse(JSON.stringify(nodeDef.data||{})); const nodeId=editor.addNode(name, nodeDef.inputs, nodeDef.outputs, adjX, adjY, nodeDef.cssClass||'', data, nodeDef.html); saveHistoryState(); activateNodeIfNeeded(nodeId); return true; } catch (e){console.error(`Err adding ${name}:`,e); showToast('error', 'Add Error', `Error: ${e.message}`); return false;} }

// --- Recalculate All ---
function recalculateAllNodesInCurrentModule() { if (!editor || isLocked()) { showToast('warning', 'Locked'); return; } const mod = editor.module; console.log(`%cRecalculating: ${mod}...`, 'color: orange;'); showToast('info', 'Recalculating...', `Module ${mod}.`, 2500); try { const nodes = editor.export()?.drawflow?.[mod]?.data ?? {}; const ids = Object.keys(nodes); if (ids.length === 0) return; cleanupAllModuleIntervals(); ids.forEach(id => { activateNodeIfNeeded(id); }); ids.forEach(id => { if (nodes[id]?.name === 'concatenar') updateConcatenateNode(id); }); showToast('success', 'Recalculated', `${mod} updated.`); } catch (err) { showToast('error', 'Error', 'Recalculation failed.'); } }

// --- CodeMirror Sidebar ---

/**
 * Inicializa la instancia del editor CodeMirror si aún no existe.
 * Se llama automáticamente la primera vez que se necesita o en initializeApp.
 */
function initializeCodeMirror() {
    if (codeMirrorEditor || !codeMirrorElement || typeof CodeMirror === 'undefined') {
        // Ya inicializado, no hay elemento contenedor, o la librería no cargó
        if (!codeMirrorEditor && typeof CodeMirror !== 'undefined' && codeMirrorElement) {
             console.warn("CodeMirror element exists but editor instance is null. Retrying init.");
        } else if (!codeMirrorElement) {
             console.warn("CodeMirror container element not found. Cannot initialize.");
             return; // No continuar si falta el contenedor
        } else if (typeof CodeMirror === 'undefined') {
             console.warn("CodeMirror library not loaded. Cannot initialize.");
             return; // No continuar si falta la librería
        } else {
             return; // Ya inicializado
        }
    }

    try {
        console.log("Attempting to initialize CodeMirror...");
        codeMirrorContainer = codeMirrorElement;
        codeMirrorEditor = CodeMirror(codeMirrorContainer, {
            lineNumbers: true,
            mode: "javascript", // Modo inicial por defecto
            theme: "material-darker",
            matchBrackets: true,
            autoCloseBrackets: true,
            indentUnit: 2,
            tabSize: 2,
            lineWrapping: true,
            gutters: ["CodeMirror-linenumbers"]
        });

        // Añade listeners a los botones de la sidebar
        if (codeEditorSaveButton) {
             codeEditorSaveButton.addEventListener('click', saveAndCloseCodeEditor);
        } else {
             console.warn("Code editor save button not found.");
        }
        if (codeEditorCloseButton) {
             // Asegura que el botón X también intente guardar antes de cerrar
             codeEditorCloseButton.addEventListener('click', () => closeCodeEditorSidebar(true));
        } else {
             console.warn("Code editor close button not found.");
        }

        console.log("CodeMirror initialized successfully.");

    } catch (e) {
        console.error("Error initializing CodeMirror:", e);
        codeMirrorEditor = null; // Asegura que el estado refleje el fallo
        showToast('error', 'Error Editor Código', 'Falló la inicialización del editor.');
    }
}

/**
 * Abre la barra lateral del editor CodeMirror para un nodo específico.
 * Carga el contenido correcto del nodo en el editor.
 * (Versión que SIEMPRE llama a setValue)
 * @param {string} nodeId - El ID del nodo a editar.
 */
function openCodeEditorSidebar(nodeId) {
    console.log(`>>> openCodeEditorSidebar llamado para nodo ID: ${nodeId}`); // Log inicial
    // Verifica si la sidebar y el ID son válidos
    if (!codeEditorSidebar || !nodeId) {
         console.error("Sidebar element or Node ID missing.");
         return;
    }
    // Intenta inicializar CM si aún no lo está
    if (!codeMirrorEditor) initializeCodeMirror();
    // Si la inicialización falló o no fue posible, no continuar
    if (!codeMirrorEditor) {
        showToast('error', 'Editor Error', 'CodeMirror no está disponible.');
        return;
    }

    let node;
    try {
        node = editor.getNodeFromId(nodeId); // Obtiene los datos del nodo
         console.log("Nodo obtenido:", node);
    } catch (e) {
        console.error(`Error getting node ${nodeId} to open editor:`, e);
        showToast('error', 'Error Nodo', 'No se pudo encontrar el nodo para editar.');
        return;
    }

    const editableNodeTypes = ['javascript_code', 'static_code_snippet', 'texto'];

    // Verifica si el nodo existe y es de un tipo editable
    if (!node || !editableNodeTypes.includes(node.name)) {
        console.warn(`Intento de abrir editor para nodo no editable o inexistente: ID ${nodeId}, Type ${node?.name}`);
        if (codeEditorSidebar.classList.contains('visible')) {
            closeCodeEditorSidebar(true); // Cierra si estaba visible para otro nodo
        }
        return;
    }

    // Determina qué campo de datos, icono, título y modo usar según el tipo de nodo
    let dataField = '', iconClass = '', editorTitle = '', editorMode = 'text/plain';
    switch (node.name) {
        case 'javascript_code':
            dataField = 'jscode'; iconClass = 'fab fa-js-square'; editorTitle = 'Editar Código JS'; editorMode = 'javascript'; break;
        case 'static_code_snippet':
            dataField = 'codecontent'; iconClass = 'fas fa-code'; editorTitle = 'Editar Código Estático'; editorMode = 'text/html'; break;
        case 'texto':
            dataField = 'content'; iconClass = 'fas fa-paragraph'; editorTitle = 'Editar Texto / HTML'; editorMode = 'text/html'; break;
        default:
            console.error("Tipo de nodo inesperado en switch:", node.name);
            return;
    }
     console.log(`Configuración para ${node.name}: dataField=${dataField}, mode=${editorMode}`);

    // Siempre obtener el código actual de los datos internos del nodo
    const currentCode = node.data[dataField] || '';
    console.log(`Código interno a cargar: "${currentCode.substring(0, 70)}..." (Longitud: ${currentCode.length})`);

    // Establecer el modo correcto ANTES de poner el valor
    const currentEditorMode = codeMirrorEditor.getOption('mode');
    if (currentEditorMode !== editorMode) {
        codeMirrorEditor.setOption('mode', editorMode);
        console.log(`CodeMirror mode cambiado a: ${editorMode}`);
    } else {
         console.log(`CodeMirror mode ya es: ${editorMode}`);
    }

    // --- MODIFICACIÓN: Siempre llama a setValue ---
    console.log("Llamando a codeMirrorEditor.setValue()...");
    try {
        codeMirrorEditor.setValue(currentCode); // Establece el contenido SIEMPRE
        codeMirrorEditor.clearHistory();      // Limpia el historial después de establecer
        console.log("codeMirrorEditor.setValue() ejecutado con éxito.");
    } catch (e) {
        console.error("¡ERROR durante codeMirrorEditor.setValue()!:", e);
        showToast('error', 'Error Editor', 'No se pudo cargar el contenido en el editor.');
        // Decide si continuar o no... probablemente mejor salir si setValue falla
        // return;
    }
    // --- Fin Modificación ---

    // Actualiza los elementos de la UI de la barra lateral
    if (codeEditorTitleSpan) codeEditorTitleSpan.textContent = editorTitle;
    const titleIconElement = codeEditorSidebar.querySelector('.sidebar-header h3 i');
    if (titleIconElement) titleIconElement.className = iconClass;
    if (editingNodeIdSpan) editingNodeIdSpan.textContent = nodeId;

    // Marca qué nodo está siendo editado y muestra/enfoca la barra lateral
    currentlyEditingNodeId = nodeId;
    if (!codeEditorSidebar.classList.contains('visible')) {
        codeEditorSidebar.classList.add('visible');
        codeEditorSidebar.setAttribute('aria-hidden', 'false');
        console.log("Sidebar hecha visible.");
        setTimeout(() => {
            if (codeMirrorEditor) {
                 console.log("Refrescando y enfocando editor (sidebar recién visible)...");
                 codeMirrorEditor.refresh();
                 codeMirrorEditor.focus();
                 codeMirrorEditor.setCursor({ line: 0, ch: 0 });
             }
        }, 50);
    } else {
        console.log("Sidebar ya visible, solo enfocando editor...");
        // Si ya estaba visible, simplemente re-enfoca (el contenido ya se estableció)
        codeMirrorEditor.focus();
    }
    console.log(`>>> Fin openCodeEditorSidebar para nodo ID: ${nodeId}`);
}

/**
 * Cierra la barra lateral del editor CodeMirror.
 * Opcionalmente guarda los cambios antes de cerrar.
 * @param {boolean} [save=false] - Indica si se deben guardar los cambios del editor.
 */
function closeCodeEditorSidebar(save = false) {
    console.log(`>>> closeCodeEditorSidebar llamado. Save: ${save}, Editando ID: ${currentlyEditingNodeId}`);
    // Si no está visible o no existe la sidebar, no hacer nada más que limpiar el ID
    if (!codeEditorSidebar || !codeEditorSidebar.classList.contains('visible')) {
        if (currentlyEditingNodeId) currentlyEditingNodeId = null;
        return;
    }

    const closingId = currentlyEditingNodeId; // Captura el ID que se estaba editando

    // Lógica de guardado (solo si save=true, hay un ID y el editor existe)
    if (save && closingId && codeMirrorEditor) {
        console.log(`Intentando guardar cambios para nodo ${closingId}...`);
        const codeFromEditor = codeMirrorEditor.getValue(); // Obtiene el texto actual del editor
        console.log(`Código obtenido del editor (inicio): "${codeFromEditor.substring(0, 70)}..."`);

        try {
            const node = editor.getNodeFromId(closingId); // Obtiene el nodo correspondiente

            if (node) {
                const nodeName = node.name;
                let dataField = ''; // Campo de datos donde se guarda el código (ej: 'jscode')
                switch (nodeName) {
                    case 'javascript_code': dataField = 'jscode'; break;
                    case 'static_code_snippet': dataField = 'codecontent'; break;
                    case 'texto': dataField = 'content'; break;
                }

                if (dataField) {
                    const currentInternalCode = node.data[dataField] || '';
                    // Solo guarda si el código del editor es diferente al guardado internamente
                    if (currentInternalCode !== codeFromEditor) {
                        console.log(`El código ha cambiado. Guardando en node.data.${dataField}...`);
                        try {
                            // 1. Actualiza los datos internos del nodo en Drawflow
                            editor.updateNodeDataFromId(closingId, { [dataField]: codeFromEditor });
                            console.log(`Datos internos del nodo ${closingId} actualizados.`);

                            // 2. Actualiza la apariencia visual DENTRO del nodo en el canvas
                            const nodeElement = document.getElementById(`node-${closingId}`);
                            const textareaInNode = nodeElement?.querySelector(`textarea[df-${dataField}]`);
                            if (textareaInNode) {
                                textareaInNode.value = codeFromEditor; // Actualiza el valor del textarea
                                console.log(`Textarea visual [df-${dataField}] dentro del nodo actualizado.`);
                            } else {
                                console.warn(`No se encontró el textarea [df-${dataField}] visual dentro del nodo ${closingId}.`);
                            }

                            // 3. Propaga los datos si es necesario (Texto o Código Estático)
                            if (nodeName === 'texto' || nodeName === 'static_code_snippet') {
                                console.log(`Propagando datos actualizados para nodo ${closingId} (${nodeName})`);
                                propagateData(closingId, nodeName, dataField, codeFromEditor);
                            }

                            // 4. Guarda el estado en el historial de deshacer/rehacer
                            saveHistoryState();
                            console.log("Estado guardado en el historial.");

                        } catch (updateError) {
                            console.error(`Error al actualizar datos del nodo ${closingId}:`, updateError);
                            showToast('error', 'Error al Guardar', 'No se pudieron guardar los datos del nodo.');
                        }
                    } else {
                         console.log("El código no cambió respecto a los datos internos. No se requiere guardado.");
                    }
                } else {
                     console.warn(`Campo de datos desconocido para el tipo de nodo '${nodeName}' al intentar guardar.`);
                }
            } else {
                console.error(`¡Nodo ${closingId} no encontrado al intentar guardar los cambios!`);
                 showToast('error', 'Error al Guardar', 'No se encontró el nodo para guardar.');
            }
        } catch (getNodeError) {
             console.error(`Error al obtener el nodo ${closingId} para guardar:`, getNodeError);
             showToast('error', 'Error al Guardar', 'No se pudo obtener la información del nodo.');
        }
    } else if (save) {
         console.warn("Guardado solicitado, pero faltan condiciones (ID de nodo o editor).");
    }

    // Ocultar la barra lateral y limpiar el estado de edición
    codeEditorSidebar.classList.remove('visible');
    codeEditorSidebar.setAttribute('aria-hidden', 'true');
    currentlyEditingNodeId = null; // Importante: Resetea el ID del nodo en edición
    if (editingNodeIdSpan) editingNodeIdSpan.textContent = 'N/A'; // Limpia el indicador de ID
    console.log("Sidebar cerrada.");
}

/**
 * Función llamada por el botón "Guardar y Cerrar" de la sidebar.
 * Simplemente invoca a closeCodeEditorSidebar forzando el guardado.
 */
function saveAndCloseCodeEditor() {
    console.log("Botón 'Guardar y Cerrar' presionado.");
    closeCodeEditorSidebar(true); // Llama a cerrar siempre guardando
}

// --- END CodeMirror Sidebar ---

// --- Status Bar ---
function updateZoomStatus(level) { if (zoomLevelSpan) zoomLevelSpan.textContent = `${Math.round(level * 100)}%`; }
function updateNodePositionStatus(nodeId) { if (nodePositionSpan) { if (nodeId) { const n = editor?.getNodeFromId(nodeId); if (n) nodePositionSpan.textContent = `X:${Math.round(n.pos_x)},Y:${Math.round(n.pos_y)}`; else nodePositionSpan.textContent = `X:-,Y:-`; } else nodePositionSpan.textContent = `X:-,Y:-`; } }

// --- Drawflow Event Listeners ---
function setupDrawflowListeners() {
    if (!editor) { console.error("Cannot setup listeners: Drawflow editor missing."); return; }
    try {
        editor.on('nodeRemoved', (id) => { console.log(`Event: Node Removed ${id}`); cleanupNodeIntervals(id); if (selectedNodeId === id) { selectedNodeId = null; updateNodePositionStatus(null); } if (currentlyEditingNodeId === id) closeCodeEditorSidebar(false); updateUIDisabledStates(); saveHistoryState(); });
        
        editor.on('nodeSelected', (id) => {
            console.log(`Event: Node Selected ${id}`);
            // Solo actualiza el estado de la selección y la interfaz de usuario
            const previousSelection = selectedNodeId;
            selectedNodeId = id;
            updateUIDisabledStates(); // Actualiza botones (Copiar, Duplicar, etc.)
            updateNodePositionStatus(id); // Actualiza la barra de estado con la posición

            // --- YA NO hay lógica para abrir/cerrar el editor aquí ---
        });


        editor.on('nodeUnselected', (wasSel) => { console.log(`Event: Node Unselected (was: ${wasSel})`); const prevSelected = selectedNodeId; selectedNodeId = null; updateUIDisabledStates(); updateNodePositionStatus(null); if (prevSelected === currentlyEditingNodeId) closeCodeEditorSidebar(true); });
        editor.on('nodeMoved', (id) => { saveHistoryState(); if(id === selectedNodeId) updateNodePositionStatus(id); const n = editor.getNodeFromId(id); if(n){ const outs=getConnections(id,'output'); outs.forEach(c=>{if(editor.getNodeFromId(c.node)?.name==='concatenar')updateConcatenateNode(c.node);}); if(n.name==='concatenar'){const ins=getConnections(id,'input');ins.forEach(c=>{updateConcatenateNode(id);});}}});
        editor.on('connectionCreated', (c) => { setTimeout(() => { try { const sId=c.output_id, tId=c.input_id, sN=editor.getNodeFromId(sId), tN=editor.getNodeFromId(tId); if(!sN||!tN) throw new Error("Src/Tgt missing."); const tName=tN.name, tPort=c.input_class, ignore=['texto','static_code_snippet']; if(ignore.includes(tName)){saveHistoryState();return;} let data; const sD=sN.data; if(sD){const keys=['result','content','codecontent','outputhtml','filecontent','display','url','jscode'];for(const k of keys){if(sD.hasOwnProperty(k)){data=sD[k];break;}} if(data===undefined&&Object.keys(sD).length>0){const fk=Object.keys(sD)[0];if(!['lastInput','selector_received'].includes(fk))data=sD[fk];}} if(EXECUTE_NODE_SYSTEM_TYPES.includes(tName)){if(tName==='extract_value'){if(tPort==='input_1')executeNode(tId,data);else if(tPort==='input_2'){const s=String(data??'');editor.updateNodeDataFromId(tId,{selector_received:s});const el=document.getElementById(`node-${tId}`);const i=el?.querySelector('input[df-selector_received]');if(i)i.value=s;}}else executeNode(tId,data);}else if(tName==='javascript_code')editor.updateNodeDataFromId(tId,{lastInput:data});else if(tName==='concatenar')updateConcatenateNode(tId);else if(tName==='mostrarPasar'){if(tPort==='input_1'){const v=String(data??'');editor.updateNodeDataFromId(tId,{result:v});const el=document.getElementById(`node-${tId}`);const ta=el?.querySelector('textarea[df-result]');if(ta)ta.value=v;propagateData(tId,tName,'result',data);}}else if(tName==='guardarTexto'){if(tPort==='input_1'){const v=String(data??'');editor.updateNodeDataFromId(tId,{savecontent:v});const el=document.getElementById(`node-${tId}`);const ta=el?.querySelector('textarea[df-savecontent]');if(ta)ta.value=v;}} saveHistoryState();}catch(err){console.error("Err connectionCreated:",err);saveHistoryState();}},0);});
        editor.on('connectionRemoved', (c) => { const tId = c.input_id, tN = editor.getNodeFromId(tId); if (tN?.name === 'concatenar') setTimeout(() => updateConcatenateNode(tId), 0); saveHistoryState(); });
        editor.on('moduleChanged', (name) => { console.log(`%cEVENT: Module Changed -> ${name}`, 'color: blue; font-weight: bold;'); renderModuleTabs(); initializeHistory(); selectedNodeId = null; copiedNodeData = null; currentlyEditingNodeId = null; updateUIDisabledStates(); updateZoomStatus(editor.zoom); updateNodePositionStatus(null); document.title = `Xocoflow | ${currentProjectName} - ${name}`; closeCodeEditorSidebar(false); setTimeout(() => { if(editor.module === name){ saveHistoryState(true); activateExistingAutoNodes(); console.log(` -> Module ${name} loaded.`); }}, 50); });
        editor.on('zoom', (level) => { updateZoomStatus(level); });
        editor.on('translate', (pos) => { /* Update canvas pos */ });
        editor.on('contextmenu', (e) => { e.preventDefault(); });
        editor.on('click', (e) => { if (codeEditorSidebar?.classList.contains('visible') && !e.target.closest('#code-editor-sidebar')) { const nodeEl = currentlyEditingNodeId ? document.getElementById(`node-${currentlyEditingNodeId}`) : null; if (!nodeEl || !nodeEl.contains(e.target)) closeCodeEditorSidebar(true); } if (!e.target.closest('.drawflow-node,.controls-container,.menu,.swal2-container,#code-editor-sidebar')) { if (selectedNodeId) { try { editor.removeSelection(); } catch { selectedNodeId = null; } updateUIDisabledStates(); } } });
        console.log("Drawflow event listeners attached.");
    } catch (e) { console.error("Error setting Drawflow listeners:", e); showToast('error', 'Critical Error', 'Failed editor events.'); }
}

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (event) => { try { const active = document.activeElement; const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable || active.closest('.CodeMirror')); const isModal = nodeDefinitionModal?.style.display !== 'none'; const isCM = codeMirrorEditor && codeMirrorEditor.hasFocus(); const isSidebar = codeEditorSidebar?.contains(active); const locked = isLocked(); if (event.key === 'Escape') { if (isModal) { closeNodeDefinitionModal(); event.preventDefault(); return; } if (isCM || (isSidebar && currentlyEditingNodeId)) { closeCodeEditorSidebar(true); event.preventDefault(); return; } if (selectedNodeId) { try{ editor.removeSelection(); } catch { selectedNodeId = null; } updateUIDisabledStates(); event.preventDefault(); return; } } if (isInput && !isCM && !isSidebar) { if ((event.ctrlKey || event.metaKey) && ['a','c','x','v','z','y'].includes(event.key.toLowerCase())) return; if (!['Escape','Delete','Backspace'].includes(event.key)) return; } const ctrl = event.ctrlKey || event.metaKey; if (ctrl) { switch (event.key.toLowerCase()) { case 'z': if(!locked){ event.preventDefault(); undo(); } break; case 'y': if(!locked){ event.preventDefault(); redo(); } break; case 'c': if(selectedNodeId && !locked){event.preventDefault(); copySelectedNode();} break; case 'v': if(!locked){event.preventDefault(); pasteNode();} break; case 'd': if(selectedNodeId && !locked){event.preventDefault(); duplicateSelectedNode();} break; case 's': event.preventDefault(); if (event.shiftKey) promptSaveAs(); else saveProject(currentProjectName); break; case 'o': event.preventDefault(); triggerLoad(); break; case 'r': if(recalculateButton && !locked){event.preventDefault(); recalculateAllNodesInCurrentModule();} break; } } else { switch (event.key) { case 'Delete': case 'Backspace': if (selectedNodeId && !isInput && !locked) { event.preventDefault(); deleteSelectedNode(); } break; } } } catch (e) { console.error("Keyboard shortcut error:", e); } });
function isLocked() { return editor?.editor_mode === 'fixed'; }

// --- Application Initialization ---
function initializeApp() {
    try {
        console.log("🚀 Initializing Xocoflow...");

        // --- Cache DOM Elements ---
        drawflowElement = checkElement(`#${DRAWFLOW_CONTAINER_ID}`, true);
        moduleListElement = checkElement('.menu ul#module-tabs', true);
        nodesListContainer = checkElement('.nodes-list', true);
        undoButton = checkElement('#undo-button');
        redoButton = checkElement('#redo-button');
        duplicateButton = checkElement('#duplicate-button');
        copyButton = checkElement('#copy-button');
        pasteButton = checkElement('#paste-button');
        recalculateButton = checkElement('#recalculate-button');
        lockButton = checkElement('#lock-button');
        unlockButton = checkElement('#unlock-button');
        statusBar = checkElement('#editor-status-bar');
        zoomLevelSpan = checkElement('#zoom-level');
        nodePositionSpan = checkElement('#node-position');
        searchInput = checkElement('#node-search');
        fileInputElement = checkElement('#file-input'); // <-- Se asigna aquí
        nodeDefinitionModal = checkElement('#nodeDefinitionModal');
        modalBackdrop = checkElement('#modalBackdrop');
        codeEditorSidebar = checkElement('#code-editor-sidebar');
        codeMirrorElement = checkElement('#codemirror-container');
        codeEditorSaveButton = checkElement('#save-code-sidebar-btn');
        codeEditorCloseButton = checkElement('#close-code-sidebar-btn');
        editingNodeIdSpan = checkElement('#editing-node-id');
        codeEditorTitleSpan = checkElement('#code-editor-title');
        // --- End Caching ---

        // --- Attach Search Listener ---
        if (searchInput) {
            searchInput.addEventListener('input', filterNodes);
            console.log("Search input listener attached.");
        } else {
            console.warn("Search input element (#node-search) not found, cannot attach listener.");
        }
        // --- End Attach Search Listener ---

        // --- Attach File Input Listener --- <<<<< BLOQUE AÑADIDO AQUÍ
        if (fileInputElement) {
            fileInputElement.addEventListener('change', loadProjectFromFile);
            console.log("File input listener attached.");
        } else {
            console.warn("File input element (#file-input) not found, cannot attach listener.");
        }
        // --- End Attach File Input Listener ---

        // --- Library Checks ---
        if (typeof Drawflow === 'undefined') throw new Error("Drawflow library failed to load.");
        if (typeof CodeMirror === 'undefined') console.warn("CodeMirror library not loaded.");
        if (typeof Swal === 'undefined') console.warn("SweetAlert2 library not loaded.");
        // --- End Library Checks ---

        // --- Initialize Drawflow ---
        try {
            editor = new Drawflow(drawflowElement);
            editor.reroute = true; editor.editor_mode = 'edit';
            editor.zoom_max = 1.8; editor.zoom_min = 0.25; editor.zoom_value = 0.08;
            console.log("Drawflow instance created successfully.");
        } catch (e) { throw new Error(`Failed to create Drawflow editor: ${e.message}`); }
        // --- End Initialize Drawflow ---

        editor.start(); // Start Drawflow *after* instance created
        console.log("Drawflow started.");

        setupDrawflowListeners(); // Attach event handlers *after* start

        // --- Initial Module Setup ---
        const initialExport = editor.export(); const initialModules = initialExport?.drawflow;
        let homeExists = initialModules?.hasOwnProperty('Home');
        if (!initialModules || Object.keys(initialModules).length === 0 || !homeExists) { if (!homeExists) editor.addModule('Home'); if (editor.module !== 'Home') editor.changeModule('Home'); }
        else if (!editor.module || !initialModules[editor.module]) editor.changeModule('Home');
        console.log(`Initial active module: ${editor.module}`);
        // --- End Initial Module ---

        loadCustomNodesToSidebar();
        renderModuleTabs();
        initializeHistory();
        updateUIDisabledStates();
        updateZoomStatus(editor.zoom);
        updateNodePositionStatus(null);
        document.title = `Xocoflow | ${currentProjectName} - ${editor.module}`;
        changeMode('edit');

        const currentModuleData = editor.export()?.drawflow?.[editor.module]?.data ?? {};
        if (Object.keys(currentModuleData).length === 0) { addWelcomeNode(editor.module); saveHistoryState(true); }
        else { saveHistoryState(true); activateExistingAutoNodes(); }

        if (recalculateButton) recalculateButton.addEventListener('click', recalculateAllNodesInCurrentModule);
        initializeCodeMirror();

        console.log("%cXocoflow Ready.", "color: green; font-weight: bold;");
        showToast('success', 'Ready', '', 1500);

    } catch (error) {
        console.error("❌ FATAL INITIALIZATION ERROR:", error);
        showInitializationError(`Initialization failed: ${error.message}`);
    }
}























function addWelcomeNode(moduleName) { if (!editor || !moduleName || isLocked()) return; try { const exported = editor.export(); const existing = exported?.drawflow?.[moduleName]?.data ?? {}; if (Object.keys(existing).length > 0) return; const html = `<div><div class="title-box welcome-title"><i class="fas fa-rocket"></i> Welcome to ${escapeHtml(moduleName)}!</div><div class="box welcome-box"><p><strong>Quick Start:</strong></p><ul><li><i class="fas fa-mouse-pointer"></i> Drag nodes.</li><li><i class="fas fa-link"></i> Connect outputs <i class="fas fa-arrow-right"></i> to inputs <i class="fas fa-arrow-left"></i>.</li><li><i class="fas fa-edit"></i> Click "Edit Content/Code".</li><li><i class="fas fa-save"></i> Save work.</li><li><i class="fas fa-plus-circle"></i> Explore "Create Node Type".</li></ul></div></div>`; const w=280, h=210; const rect = editor.container.getBoundingClientRect(), z=editor.zoom||1; const cx=(rect.width/2-editor.canvas_x)/z, cy=(rect.height/2-editor.canvas_y)/z; const x=cx-w/2, y=cy-h/2; const name='xocoflow_welcome_info'; if (!customNodeTypes[name]) editor.registerNode(name, null , {}, {}); const id = editor.addNode(name, 0, 0, x, y, 'welcome-node', {}, html); console.log(`Welcome node ${id} added to ${moduleName}.`); } catch (e) { console.error(`Error adding welcome node:`, e); } }

// Helper to display critical initialization errors
function showInitializationError(message) { document.body.innerHTML = `<div style="padding: 20px; background-color: #ffcdd2; border: 2px solid #b71c1c; color: #b71c1c; font-family: sans-serif; text-align: center;"><h1><i class="fas fa-bomb"></i> Critical Error</h1><p>Xocoflow failed to initialize.</p><pre style="text-align: left; white-space: pre-wrap; word-wrap: break-word; background-color: #fff; padding: 10px; border: 1px solid #ccc; margin-top: 15px; max-height: 300px; overflow-y: auto;">${escapeHtml(message)}</pre><p style="margin-top:15px;"><button onclick="location.reload()">Reload</button></p></div>`; }


// --- Initial Execution Trigger ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// === END OF COMPLETE xocoflow_logic.js ===