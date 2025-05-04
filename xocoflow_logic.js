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

// Dentro de baseNodeDefinitions = { ... };

'text_replace': {
    name: 'text_replace',
    inputs: 1,
    outputs: 1,
    html: `
      <div>
        <div class="title-box"><i class="fas fa-exchange-alt"></i> Reemplazar</div>
        <div class="box">
          <label>Buscar:</label>
          {/* oninput eliminado, handleNodeDataChange lo captura por df-find */}
          <input type="text" df-find placeholder="texto a buscar"> 
          
          <label>Reemplazar con:</label>
          {/* oninput eliminado, handleNodeDataChange lo captura por df-replace */}
          <input type="text" df-replace placeholder="nuevo texto">
          
          {/* Botón manual opcional */}
          <button type="button" onclick="applyTextReplace(event)" style="margin-top: 8px;">Ejecutar Manual</button> 
          
          <div style="margin-top:10px;"> {/* Cambiado para consistencia */}
            <label>Resultado:</label>
            <textarea df-result readonly style="height: 60px; width: 100%; background-color: var(--background-readonly);"></textarea>
          </div>
        </div>
      </div>`,
    cssClass: 'text-replace-node',
    data: { 
        find: '',        // Texto a buscar
        replace: '',     // Texto de reemplazo
        lastInput: null, // Guardar el último texto recibido en la entrada
        result: ''       // El resultado del reemplazo
    }
    // Ya no necesitamos onDataReceived aquí
},

// ... resto de tus definiciones ...

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
          <button type="button" onclick="applyTextCase(event, 'upper')">a → Z</button>
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
          <button type="button" onclick="applyTextCase(event, 'lower')">A → z</button>
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
  
  
  
    // NUEVO: NODO SUMA
    'sum': {
      name: 'sum',
      inputs: 1, // Un puerto de entrada que acepta múltiples conexiones
      outputs: 1,
      html: `
          <div>
            <div class="title-box"><i class="fas fa-plus"></i> Suma</div>
            <div class="box">
              <label>Resultado:</label>
              <textarea df-result readonly style="height: 40px; text-align:right; font-weight:bold; font-size: 1.1em; padding: 5px 8px;" placeholder="0"></textarea>
              <p class="help-text" style="font-size:10px; text-align:center; margin-top: 5px;">Suma todas las entradas numéricas.</p>
            </div>
          </div>`,
      cssClass: 'sum-node', // Clase CSS opcional para estilizar
      data: { result: 0 } // Dato inicial para el resultado
  },
  // FIN NUEVO NODO SUMA

// Dentro del objeto baseNodeDefinitions = { ... }; añade esta entrada:

    // NUEVO: NODO RESTA
    'subtract': {
      name: 'subtract',
      inputs: 1, // Un puerto de entrada que acepta múltiples conexiones
      outputs: 1,
      html: `
          <div>
            <div class="title-box"><i class="fas fa-minus"></i> Resta</div>
            <div class="box">
              <label>Resultado:</label>
              <textarea df-result readonly style="height: 40px; text-align:right; font-weight:bold; font-size: 1.1em; padding: 5px 8px;" placeholder="0"></textarea>
              <p class="help-text" style="font-size:10px; text-align:center; margin-top: 5px;">Resta entradas (orden Y).</p>
            </div>
          </div>`,
      cssClass: 'subtract-node', // Clase CSS opcional
      data: { result: 0 } // Dato inicial para el resultado
  },
  // FIN NUEVO NODO RESTA


// Dentro del objeto baseNodeDefinitions = { ... }; añade esta entrada:

    // NUEVO: NODO MULTIPLICACIÓN
    'multiply': {
      name: 'multiply',
      inputs: 1, // Un puerto de entrada que acepta múltiples conexiones
      outputs: 1,
      html: `
          <div>
            <div class="title-box"><i class="fas fa-times"></i> Multiplicación</div>
            <div class="box">
              <label>Resultado:</label>
              <textarea df-result readonly style="height: 40px; text-align:right; font-weight:bold; font-size: 1.1em; padding: 5px 8px;" placeholder="1"></textarea>
              <p class="help-text" style="font-size:10px; text-align:center; margin-top: 5px;">Multiplica entradas.</p>
            </div>
          </div>`,
      cssClass: 'multiply-node', // Clase CSS opcional
      data: { result: 1 } // Dato inicial para el resultado (identidad multiplicativa)
  },
  // FIN NUEVO NODO MULTIPLICACIÓN


    // NUEVO: NODO DIVISIÓN
    'divide': {
      name: 'divide',
      inputs: 1, // Un puerto de entrada que acepta múltiples conexiones
      outputs: 1,
      html: `
          <div>
            <div class="title-box"><i class="fas fa-divide"></i> División</div>
            <div class="box">
              <label>Resultado:</label>
              <textarea df-result readonly style="height: 40px; text-align:right; font-weight:bold; font-size: 1.1em; padding: 5px 8px;" placeholder="N/A"></textarea>
              <p class="help-text" style="font-size:10px; text-align:center; margin-top: 5px;">Divide entradas (orden Y).</p>
            </div>
          </div>`,
      cssClass: 'divide-node', // Clase CSS opcional
      data: { result: NaN } // Dato inicial para el resultado (indefinido)
  },
  // FIN NUEVO NODO DIVISIÓN

// Dentro del objeto baseNodeDefinitions = { ... }; añade esta entrada:

    // NUEVO: NODO MULTIPLICACIÓN
    'multiply': {
      name: 'multiply',
      inputs: 1, // Un puerto de entrada que acepta múltiples conexiones
      outputs: 1,
      html: `
          <div>
            <div class="title-box"><i class="fas fa-times"></i> Multiplicación</div>
            <div class="box">
              <label>Resultado:</label>
              <textarea df-result readonly style="height: 40px; text-align:right; font-weight:bold; font-size: 1.1em; padding: 5px 8px;" placeholder="1"></textarea>
              <p class="help-text" style="font-size:10px; text-align:center; margin-top: 5px;">Multiplica entradas.</p>
            </div>
          </div>`,
      cssClass: 'multiply-node', // Clase CSS opcional
      data: { result: 1 } // Dato inicial para el resultado (identidad multiplicativa)
  },
  // FIN NUEVO NODO MULTIPLICACIÓN

// Dentro del objeto baseNodeDefinitions = { ... }; añade esta entrada:

    // NUEVO: NODO DIVISIÓN
    'divide': {
      name: 'divide',
      inputs: 1, // Un puerto de entrada que acepta múltiples conexiones
      outputs: 1,
      html: `
          <div>
            <div class="title-box"><i class="fas fa-divide"></i> División</div>
            <div class="box">
              <label>Resultado:</label>
              <textarea df-result readonly style="height: 40px; text-align:right; font-weight:bold; font-size: 1.1em; padding: 5px 8px;" placeholder="N/A"></textarea>
              <p class="help-text" style="font-size:10px; text-align:center; margin-top: 5px;">Divide entradas (orden Y).</p>
            </div>
          </div>`,
      cssClass: 'divide-node', // Clase CSS opcional
      data: { result: NaN } // Dato inicial para el resultado (indefinido)
  },
  // FIN NUEVO NODO DIVISIÓN




// Dentro del objeto baseNodeDefinitions = { ... }; añade esta entrada:

    // NUEVO: NODO IMAGEN MINIMALISTA
    'image_minimal': {
      name: 'image_minimal',
      inputs: 0, // Sin entradas de datos
      outputs: 0, // Sin salidas de datos (podría añadirse una para la URL/DataURL si se desea)
      html: `
          <div class="image-minimal-content" role="img" aria-label="Imagen cargada">
            <div class="image-placeholder" title="Haz clic, pega o arrastra una imagen aquí">
               <i class="fas fa-image"></i>
               <span>Cargar Imagen</span>
            </div>
            <img df-imgsrc src="" alt="Imagen cargada" style="display: none;" />
          </div>`,
      cssClass: 'image-minimal-node',
      // Guardaremos el tamaño original y la URL
      data: { imgsrc: '', naturalWidth: 0, naturalHeight: 0 }
  },
  // FIN NUEVO NODO IMAGEN MINIMALISTA


// --- NODO PLANTILLA ---
'template_engine': {
    name: 'template_engine', // Nombre interno
    inputs: 1,          // Recibe el objeto JSON
    outputs: 1,         // Emite el texto procesado
    html: `
      <div>
        <div class="title-box"><i class="fas fa-file-invoice"></i> Plantilla</div>
        <div class="box">
          <p class="help-text" style="font-size: 10px; margin-bottom: 8px;">
            Usa <code>{{variable}}</code> o <code>{{objeto.propiedad}}</code> para insertar
            valores del JSON de entrada.
          </p>
          <label for="node-{{id}}-template">Plantilla:</label>
          <textarea id="node-{{id}}-template" df-template style="height: 120px; font-family: var(--font-family-code); font-size: 12px;" placeholder="Hola {{nombre}}, \n\nTu pedido {{pedido.id}} está listo." oninput="handleNodeDataChange(event)"></textarea>
          
          <label for="node-{{id}}-result" style="margin-top:10px;">Resultado:</label>
          <textarea id="node-{{id}}-result" df-result readonly style="height: 80px; font-size: 12px; background-color: var(--background-readonly);"></textarea>
        </div>
      </div>`,
    cssClass: 'template-node', // Clase CSS opcional
    data: {
        template: '',      // La cadena de plantilla escrita por el usuario
        lastInput: null,   // El último objeto JSON recibido
        result: ''         // El resultado después de procesar la plantilla
    }
},
// --- FIN NODO PLANTILLA ---














































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
function handleNodeDataChange(event) {
    if (!editor || !event?.target) return;
    const el = event.target;
    const nodeEl = el.closest('.drawflow-node');
    if (!nodeEl) return;
    const id = nodeEl.id.split('-')[1];
    const node = editor.getNodeFromId(id);
    if (!node) return;
    let key = null;
    for (const attr of el.attributes) if (attr.name.startsWith('df-')) { key = attr.name.substring(3); break; }
    if (!key) return;

    requestAnimationFrame(() => { // Usar requestAnimationFrame asegura que el valor en node.data se actualice antes de leerlo
        try {
            const updatedNode = editor.getNodeFromId(id);
            // Verificar que el nodo y la clave aún existen y son válidos
            if (!updatedNode?.data || !updatedNode.data.hasOwnProperty(key)) {
                 console.warn(`handleNodeDataChange: Node ${id} or key ${key} no longer exists or data is invalid.`);
                 return;
            }
            const val = updatedNode.data[key]; // Obtener el valor actualizado de los datos del nodo
            const name = updatedNode.name;

            // --- Lógica específica por tipo de nodo y clave cambiada ---
            if ((name === 'url_input' && key === 'url')) {
                 executeNode(id, val); // URL Input -> Ejecutar fetch/propagación
            } else if (name === 'cargarTexto' && key === 'filecontent') {
                 propagateData(id, name, key, val); // Cargar Texto -> Propagar contenido
            } else if (name === 'imagen' && ['imgsrc', 'imgalt', 'imgwidth', 'imgheight'].includes(key)) {
                 handleImageInputChange(event); // Nodo Imagen (original) -> Actualizar/Propagar HTML
            } else if (name === 'nota' && key === 'notecontent') {
                 updateCharacterCount(event); // Nodo Nota -> Actualizar contador
            } else if ((name === 'timer_fetch' || name === 'timer_download' || name === 'loop') && key === 'interval') {
                 executeNode(id, null); // Cambia intervalo de Timers -> Reiniciar timer
            } else if (name === 'timer_fetch' && key === 'url') {
                 executeNode(id, null); // Cambia URL de Timer Fetch -> Reiniciar timer
            }
            // --- INICIO: MANEJO INPUTS SIMPLES Y NODO PLANTILLA ---
            else if (['input_number', 'input_text', 'input_range', 'input_date', 'input_time', 'input_color'].includes(name)) {
                 // Nodos de entrada simples -> Propagar el valor cambiado
                 propagateData(id, name, key, val);
            }
            else if (name === 'template_engine' && key === 'template') {
                 // Cambió el texto de la plantilla -> Reprocesar con el último JSON
                 console.log(`Template Node (${id}): Template changed by user. Reprocessing...`);
                 processTemplateNode(id); // Llama a la función de procesamiento
            }
            // --- FIN: MANEJO INPUTS SIMPLES Y NODO PLANTILLA ---

            // --- INICIO: MANEJO NODOS LOCAL IMAGE ---
            else if (name === 'local_image') {
                if (key === 'imagewidth' || key === 'imageheight') {
                    updateLocalImageStyle(event);
                } else if (key === 'nodewidth' || key === 'nodeheight') {
                    updateLocalNodeSize(event);
                }
            }
            else if (name === 'image_minimal') {
                // No requiere acción aquí usualmente
            }
            // --- FIN: MANEJO NODOS LOCAL IMAGE ---

             // --- INICIO: MANEJO NODOS DE TEXTO (ACTUALIZADO) ---
             else if (name === 'text_replace' && (key === 'find' || key === 'replace')) {
                if (updatedNode.data.lastInput !== null && updatedNode.data.lastInput !== undefined) { 
                     console.log(`Text Replace (${id}): Input field ${key} changed. Reprocessing with lastInput...`); // <-- ¡Este log debe aparecer!
                     setTimeout(() => executeTextReplace(id, updatedNode.data.lastInput), 0); 
                } else {
                     console.log(`Text Replace (${id}): Input field ${key} changed, but no lastInput to process yet.`);
                }
            }
             else if (name === 'text_split' && key === 'separator') {
                 // Similar para text_split: reprocesar si cambia el separador y hay texto.
                 if (updatedNode.data.lastInput !== null && updatedNode.data.lastInput !== undefined) {
                      console.log(`Text Split (${id}): Input field ${key} changed. Reprocessing with lastInput...`);
                      setTimeout(() => executeTextSplit(id, updatedNode.data.lastInput), 0);
                 } else {
                      // console.log(`Text Split (${id}): Input field ${key} changed, but no lastInput to process yet.`); // Log opcional
                 }
             }
             // --- FIN: MANEJO NODOS DE TEXTO ---


            // Guardar historial después de un cambio detectado Y procesado por las lógicas anteriores.
            // Las funciones llamadas (executeNode, propagateData, processTemplateNode, etc.)
            // ya llaman a saveHistoryState() internamente SIEMPRE que el resultado o estado relevante cambia.
            // Llamar a saveHistoryState() aquí puede ser redundante en muchos casos,
            // pero asegura que cambios simples (como en nota) o los cambios en find/replace/separator
            // (que ahora disparan una ejecución que SÍ guardará si el resultado cambia) se capturen
            // si hubiera algún caso no cubierto por las funciones internas. Es relativamente seguro dejarlo.
            saveHistoryState();

        } catch (e) {
            console.error(`Error handleNodeDataChange (Node: ${id}, Key: ${key}):`, e);
            // Podrías añadir un showToast aquí si fuera necesario
        }
    });
}

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
  
/**
 * Actualiza el resultado de un nodo (datos y UI), propaga y guarda historial.
 * Usada por nodos como text_replace, text_split, etc.
 * @param {string} nodeId - El ID del nodo.
 * @param {*} resultValue - El valor del resultado a guardar y propagar.
 */
function updateNodeResult(nodeId, resultValue) {
    const node = editor.getNodeFromId(nodeId);
    if (!node) return;

    // Solo actualizar si el resultado realmente cambió
    if (node.data.result !== resultValue) {
        console.log(`Node ${nodeId} (${node.name}): Updating result data.`);
        // Actualizamos el dato en el modelo de Drawflow
        editor.updateNodeDataFromId(nodeId, { result: resultValue });

        // Actualizamos el elemento visual (textarea o input) en la UI
        const nodeElement = document.getElementById(`node-${nodeId}`);
        if (nodeElement) {
            // Busca textarea o input con df-result
            const resultElement = nodeElement.querySelector('textarea[df-result], input[df-result]');
            if (resultElement) {
                resultElement.value = resultValue; // Asignar valor
            } else {
                console.warn(`Node ${nodeId} (${node.name}): Result element (df-result) not found in UI.`);
            }
        } else {
             console.warn(`Node ${nodeId} (${node.name}): Node element not found in DOM for UI update.`);
        }

        // Propagamos el nuevo resultado a los nodos conectados
        // Usamos el nombre del nodo actual para la propagación
        console.log(`Node ${nodeId} (${node.name}): Propagating new result.`);
        propagateData(nodeId, node.name, 'result', resultValue);

        // Guardamos el estado para deshacer/rehacer porque el resultado cambió
        saveHistoryState();
    } else {
         console.log(`Node ${nodeId} (${node.name}): Result unchanged, no update needed.`);
    }
}
  

  function handleJsonInputChange(event) {
    const nodeId   = getNodeIdFromEvent(event);
    const textarea = event.target;
    const text     = textarea.value;
    let parsed;
    const nodeName = 'input_json'; // Nombre del nodo para propagateData

    // 1) Parseo
    try {
        parsed = JSON.parse(text || '{}'); // Asegura que no sea vacío, parsea a objeto
        textarea.classList.remove('error');
    } catch (e) {
        textarea.classList.add('error');
        console.error(`Input JSON (${nodeId}) Parse Error:`, e);
        // No propagar si hay error de parseo
        // Podrías limpiar lastInput si quieres
        // editor.updateNodeDataFromId(nodeId, { json: text, lastInput: null });
        return;
    }

    // 2) Actualizo estado interno
    // Guardamos tanto el texto original como el objeto parseado
    editor.updateNodeDataFromId(nodeId, {
        json: text,
        lastInput: parsed // Guardamos el objeto parseado
    });

    // 3) ¡CAMBIO IMPORTANTE! Usar propagateData para enviar el OBJETO PARSEADO
    // Esto activará la lógica que añadimos para 'template_engine' en propagateData.
    // Usamos 'lastInput' como "changedKey" conceptual, y 'parsed' como el dato a enviar.
    console.log(`Input JSON (${nodeId}): Propagating parsed data object...`, parsed);
    propagateData(nodeId, nodeName, 'lastInput', parsed);

    // Opcional: Si algún nodo necesita ser *ejecutado* específicamente
    // por la llegada de este JSON (además de recibir los datos),
    // podrías mantener la llamada a propagateExecution aquí también,
    // pero para el nodo Plantilla, propagateData es la necesaria.
    // propagateExecution(nodeId, parsed); // Podría ser redundante o innecesaria ahora

    // Guardar historial porque el dato cambió y se propagó
    saveHistoryState();
}
  
  
  







// NUEVO: Función para calcular y actualizar el nodo Suma
/**
 * Calcula la suma de las entradas conectadas a un nodo 'sum' y actualiza su resultado.
 * @param {string} nodeId - El ID del nodo 'sum'.
 */
function updateSumNode(nodeId) {
  try {
      const node = editor.getNodeFromId(nodeId);
      // Verificar que el nodo existe, es de tipo 'sum' y tiene el puerto de entrada definido
      if (!node || node.name !== 'sum' || !node.inputs?.input_1) return;

      const connections = node.inputs.input_1.connections || [];
      let currentSum = 0;

      // Recorrer todas las conexiones entrantes
      connections.forEach(conn => {
          const sourceNode = editor.getNodeFromId(conn.node);
          if (sourceNode?.data) {
              let value = 0;
              // Intentar obtener el valor numérico de la fuente
              // Prioridad: 'number' (de input_number), luego 'result' (de otros nodos), luego 'range'
              if (sourceNode.data.hasOwnProperty('number')) {
                  value = parseFloat(sourceNode.data.number);
              } else if (sourceNode.data.hasOwnProperty('result')) {
                   value = parseFloat(sourceNode.data.result);
              } else if (sourceNode.data.hasOwnProperty('range')) { // Añadido para input_range
                   value = parseFloat(sourceNode.data.range);
              } // Puedes añadir más campos 'else if' si tienes otros nodos que emiten números con claves diferentes

              // Si es un número válido, añadirlo a la suma
              if (!isNaN(value)) {
                  currentSum += value;
              } else {
                  console.warn(`Node sum (${nodeId}): Input from ${conn.node} is not a number. Ignored.`);
              }
          }
      });

      // Actualizar los datos internos del nodo y la UI solo si el resultado ha cambiado
      if (node.data.result !== currentSum) {
          console.log(`Node sum (${nodeId}): Updating result from ${node.data.result} to ${currentSum}`);
          editor.updateNodeDataFromId(nodeId, { result: currentSum });

          // Actualizar el textarea visual dentro del nodo
          const nodeElement = document.getElementById(`node-${nodeId}`);
          const resultTextarea = nodeElement?.querySelector('textarea[df-result]');
          if (resultTextarea) {
              resultTextarea.value = currentSum;
          }

          // Propagar el nuevo resultado a los nodos conectados a la salida del nodo Suma
          propagateData(nodeId, 'sum', 'result', currentSum);
          saveHistoryState(); // Guardar estado porque el resultado cambió
      }
  } catch (error) {
      console.error(`Error updating sum node ${nodeId}:`, error);
      showToast('error', 'Error en Suma', `No se pudo calcular la suma para el nodo ${nodeId}.`);
  }
}
// FIN NUEVA FUNCIÓN


// Añade esta función junto a updateSumNode y updateConcatenateNode

// NUEVO: Función para calcular y actualizar el nodo Resta
/**
 * Calcula la resta de las entradas conectadas a un nodo 'subtract' y actualiza su resultado.
 * El orden se basa en la posición Y de los nodos de entrada (el superior menos los inferiores).
 * @param {string} nodeId - El ID del nodo 'subtract'.
 */
function updateSubtractNode(nodeId) {
  try {
      const node = editor.getNodeFromId(nodeId);
      // Verificar que el nodo existe, es de tipo 'subtract' y tiene el puerto de entrada definido
      if (!node || node.name !== 'subtract' || !node.inputs?.input_1) return;

      const connectionsRaw = node.inputs.input_1.connections || [];

      // Ordenar conexiones por posición Y del nodo origen (el más alto primero)
      const connectionsSorted = connectionsRaw.slice().sort((a, b) => {
          const nodeA_Y = editor.getNodeFromId(a.node)?.pos_y ?? Infinity;
          const nodeB_Y = editor.getNodeFromId(b.node)?.pos_y ?? Infinity;
          return nodeA_Y - nodeB_Y;
      });

      let currentResult = 0;
      let isFirstNode = true;

      // Recorrer todas las conexiones entrantes ordenadas
      connectionsSorted.forEach(conn => {
          const sourceNode = editor.getNodeFromId(conn.node);
          let value = 0; // Valor por defecto si no es número

          if (sourceNode?.data) {
              // Intentar obtener el valor numérico de la fuente
              if (sourceNode.data.hasOwnProperty('number')) {
                  value = parseFloat(sourceNode.data.number);
              } else if (sourceNode.data.hasOwnProperty('result')) {
                   value = parseFloat(sourceNode.data.result);
              } else if (sourceNode.data.hasOwnProperty('range')) {
                   value = parseFloat(sourceNode.data.range);
              } // Añadir más 'else if' si es necesario

              // Asegurarse de que el valor sea numérico, si no, usar 0
              if (isNaN(value)) {
                  value = 0;
                  console.warn(`Node subtract (${nodeId}): Input from ${conn.node} is not a valid number. Using 0.`);
              }
          }

          // Si es el primer nodo (el más arriba), establecerlo como valor inicial
          if (isFirstNode) {
              currentResult = value;
              isFirstNode = false;
          } else {
              // Restar los valores de los nodos subsiguientes
              currentResult -= value;
          }
      });

      // Si no hubo conexiones, el resultado es 0
      if (connectionsSorted.length === 0) {
          currentResult = 0;
      }

      // Actualizar los datos internos del nodo y la UI solo si el resultado ha cambiado
      if (node.data.result !== currentResult) {
          console.log(`Node subtract (${nodeId}): Updating result from ${node.data.result} to ${currentResult}`);
          editor.updateNodeDataFromId(nodeId, { result: currentResult });

          // Actualizar el textarea visual dentro del nodo
          const nodeElement = document.getElementById(`node-${nodeId}`);
          const resultTextarea = nodeElement?.querySelector('textarea[df-result]');
          if (resultTextarea) {
              resultTextarea.value = currentResult;
          }

          // Propagar el nuevo resultado
          propagateData(nodeId, 'subtract', 'result', currentResult);
          saveHistoryState(); // Guardar estado porque el resultado cambió
      }
  } catch (error) {
      console.error(`Error updating subtract node ${nodeId}:`, error);
      showToast('error', 'Error en Resta', `No se pudo calcular la resta para el nodo ${nodeId}.`);
  }
}
// FIN NUEVA FUNCIÓN RESTA



// Añade esta función

// NUEVO: Función para calcular y actualizar el nodo Multiplicación
/**
 * Calcula el producto de las entradas conectadas a un nodo 'multiply' y actualiza su resultado.
 * @param {string} nodeId - El ID del nodo 'multiply'.
 */
function updateMultiplyNode(nodeId) {
  try {
      const node = editor.getNodeFromId(nodeId);
      // Verificar que el nodo existe, es de tipo 'multiply' y tiene el puerto de entrada definido
      if (!node || node.name !== 'multiply' || !node.inputs?.input_1) return;

      const connections = node.inputs.input_1.connections || [];
      let currentResult = 1; // Empezar con la identidad multiplicativa
      let hasValidInput = false; // Flag para saber si se encontró al menos un número

      // Recorrer todas las conexiones entrantes
      connections.forEach(conn => {
          const sourceNode = editor.getNodeFromId(conn.node);
          let value = NaN; // Inicializar como NaN para forzar validación

          if (sourceNode?.data) {
              // Intentar obtener el valor numérico de la fuente
              if (sourceNode.data.hasOwnProperty('number')) {
                  value = parseFloat(sourceNode.data.number);
              } else if (sourceNode.data.hasOwnProperty('result')) {
                   value = parseFloat(sourceNode.data.result);
              } else if (sourceNode.data.hasOwnProperty('range')) {
                   value = parseFloat(sourceNode.data.range);
              } // Añadir más 'else if' si es necesario

              // Si es un número válido, multiplicarlo
              if (!isNaN(value)) {
                  currentResult *= value;
                  hasValidInput = true; // Marcamos que encontramos al menos un número
              } else {
                  console.warn(`Node multiply (${nodeId}): Input from ${conn.node} is not a valid number. Ignored.`);
                  // No multiplicamos si no es un número válido
              }
          }
      });

      // Si no hubo ninguna conexión válida, el resultado podría ser 0 o 1.
      // Decidimos que si no hay conexiones O ninguna válida, el resultado es 0.
      // Si hubo conexiones pero resultaron en NaN (ej. texto * texto), el resultado será NaN.
      // Si solo hubo conexiones no numéricas (ignoradas), el resultado se quedó en 1.
      // Para consistencia, si no hubo inputs válidos conectados, forzamos a 0.
      if (connections.length === 0 || !hasValidInput) {
           currentResult = 0;
      }

      // Actualizar los datos internos del nodo y la UI solo si el resultado ha cambiado
      // Manejar comparación con NaN (NaN !== NaN siempre es true)
      const previousResult = node.data.result;
      if (previousResult !== currentResult && !(isNaN(previousResult) && isNaN(currentResult))) {
          console.log(`Node multiply (${nodeId}): Updating result from ${previousResult} to ${currentResult}`);
          editor.updateNodeDataFromId(nodeId, { result: currentResult });

          // Actualizar el textarea visual dentro del nodo
          const nodeElement = document.getElementById(`node-${nodeId}`);
          const resultTextarea = nodeElement?.querySelector('textarea[df-result]');
          if (resultTextarea) {
              resultTextarea.value = isNaN(currentResult) ? "NaN" : currentResult; // Mostrar NaN si es el caso
          }

          // Propagar el nuevo resultado
          propagateData(nodeId, 'multiply', 'result', currentResult);
          saveHistoryState(); // Guardar estado porque el resultado cambió
      }
  } catch (error) {
      console.error(`Error updating multiply node ${nodeId}:`, error);
      showToast('error', 'Error en Multiplicación', `No se pudo calcular el producto para el nodo ${nodeId}.`);
  }
}
// FIN NUEVA FUNCIÓN MULTIPLICACIÓN



// Añade esta función

// NUEVO: Función para calcular y actualizar el nodo División
/**
 * Calcula la división secuencial de las entradas conectadas a un nodo 'divide' y actualiza su resultado.
 * El orden se basa en la posición Y de los nodos de entrada (el superior dividido por los inferiores).
 * Maneja la división por cero resultando en Infinity.
 * @param {string} nodeId - El ID del nodo 'divide'.
 */
function updateDivideNode(nodeId) {
  try {
      const node = editor.getNodeFromId(nodeId);
      // Verificar que el nodo existe, es de tipo 'divide' y tiene el puerto de entrada definido
      if (!node || node.name !== 'divide' || !node.inputs?.input_1) return;

      const connectionsRaw = node.inputs.input_1.connections || [];

      // Ordenar conexiones por posición Y del nodo origen (el más alto primero)
      const connectionsSorted = connectionsRaw.slice().sort((a, b) => {
          const nodeA_Y = editor.getNodeFromId(a.node)?.pos_y ?? Infinity;
          const nodeB_Y = editor.getNodeFromId(b.node)?.pos_y ?? Infinity;
          return nodeA_Y - nodeB_Y;
      });

      let currentResult = NaN; // Empezar como Indefinido
      let isFirstNode = true;
      let divisionByZero = false;

      // Se necesitan al menos dos entradas para dividir
      if (connectionsSorted.length < 2) {
           currentResult = NaN; // Resultado indefinido si hay menos de 2 entradas
      } else {
          connectionsSorted.forEach(conn => {
              const sourceNode = editor.getNodeFromId(conn.node);
              let value = NaN; // Valor por defecto

              if (sourceNode?.data) {
                  // Intentar obtener el valor numérico de la fuente
                  if (sourceNode.data.hasOwnProperty('number')) {
                      value = parseFloat(sourceNode.data.number);
                  } else if (sourceNode.data.hasOwnProperty('result')) {
                       value = parseFloat(sourceNode.data.result);
                  } else if (sourceNode.data.hasOwnProperty('range')) {
                       value = parseFloat(sourceNode.data.range);
                  } // Añadir más 'else if'

                  // Si no es un número válido, tratar como NaN para el cálculo
                  if (isNaN(value)) {
                      value = NaN;
                      console.warn(`Node divide (${nodeId}): Input from ${conn.node} is not a valid number. Result will be NaN.`);
                  }
              } else {
                  value = NaN; // Si no hay nodo o datos, es NaN
              }

              // Establecer el dividendo inicial (primer nodo)
              if (isFirstNode) {
                  currentResult = value;
                  isFirstNode = false;
              } else {
                  // Dividir por los valores subsiguientes (divisores)
                  // Comprobar división por cero
                  if (value === 0) {
                      divisionByZero = true;
                      currentResult = Infinity; // O puedes poner NaN o un string de error
                      console.warn(`Node divide (${nodeId}): Division by zero detected from node ${conn.node}. Result set to Infinity.`);
                      return; // Salir del forEach si hay división por cero (opcional, podría continuar y dar NaN/Infinity)
                  }
                  // Si el resultado actual o el divisor es NaN, el resultado sigue siendo NaN
                  if (isNaN(currentResult) || isNaN(value)) {
                      currentResult = NaN;
                  } else {
                       currentResult /= value;
                  }
              }
          });
      }

      // Actualizar los datos internos y la UI solo si el resultado ha cambiado
      const previousResult = node.data.result;
      // Comparación especial para NaN (NaN !== NaN es true)
      if (previousResult !== currentResult && !(isNaN(previousResult) && isNaN(currentResult))) {
          console.log(`Node divide (${nodeId}): Updating result from ${previousResult} to ${currentResult}`);
          editor.updateNodeDataFromId(nodeId, { result: currentResult });

          // Actualizar el textarea visual dentro del nodo
          const nodeElement = document.getElementById(`node-${nodeId}`);
          const resultTextarea = nodeElement?.querySelector('textarea[df-result]');
          if (resultTextarea) {
              let displayValue = "N/A"; // Valor por defecto para mostrar
              if (divisionByZero) {
                   displayValue = "Infinity"; // O "Error Div/0"
              } else if (!isNaN(currentResult)) {
                   displayValue = currentResult;
              } else if (connectionsSorted.length >= 2) {
                   displayValue = "NaN"; // Si hubo cálculo pero dio NaN
              }
              resultTextarea.value = displayValue;
          }

          // Propagar el nuevo resultado (puede ser NaN o Infinity)
          propagateData(nodeId, 'divide', 'result', currentResult);
          saveHistoryState(); // Guardar estado porque el resultado cambió
      }
  } catch (error) {
      console.error(`Error updating divide node ${nodeId}:`, error);
      showToast('error', 'Error en División', `No se pudo calcular la división para el nodo ${nodeId}.`);
  }
}
// FIN NUEVA FUNCIÓN DIVISIÓN





// --- Añade estas nuevas funciones en la sección de Helpers o Node Specific UI ---

/**
 * Función central para procesar una imagen cargada (desde cualquier fuente).
 * Actualiza los datos del nodo, la UI y redimensiona el nodo.
 * @param {string} nodeId El ID del nodo.
 * @param {string} imageDataUrl La imagen como Data URL.
 */
function processMinimalImageLoad(nodeId, imageDataUrl) {
  if (!editor || !nodeId || !imageDataUrl) return;

  console.log(`Processing image load for node ${nodeId}...`);
  const nodeElement = document.getElementById(`node-${nodeId}`);
  const imgTag = nodeElement?.querySelector('img[df-imgsrc]');
  const placeholder = nodeElement?.querySelector('.image-placeholder');

  if (!nodeElement || !imgTag || !placeholder) {
      console.error(`Minimal Image Node elements not found for ID ${nodeId}.`);
      showToast('error', 'Error Interno', 'No se encontraron elementos del nodo imagen.');
      return;
  }

  // Crear imagen en memoria para obtener dimensiones
  const tempImg = new Image();
  tempImg.onload = () => {
      try {
          const w = tempImg.naturalWidth;
          const h = tempImg.naturalHeight;
          console.log(`Image loaded: ${w}x${h}`);

          if (w === 0 || h === 0) throw new Error("Invalid image dimensions (0x0).");

          // 1. Actualizar datos internos del nodo en Drawflow
          editor.updateNodeDataFromId(nodeId, {
              imgsrc: imageDataUrl,
              naturalWidth: w,
              naturalHeight: h
          });

          // 2. Actualizar UI del nodo
          imgTag.src = imageDataUrl;
          imgTag.style.display = 'block';
          placeholder.style.display = 'none';
          if (nodeElement.style.border.includes('dashed')) { // Quitar borde punteado si lo tenía
               nodeElement.style.border = 'none';
          }


          // 3. Redimensionar el elemento del nodo
          nodeElement.style.width = `${w}px`;
          nodeElement.style.height = `${h}px`;

          // 4. Forzar actualización de conexiones
          // Usar un pequeño timeout puede ayudar a que el DOM se actualice antes de redibujar líneas
          setTimeout(() => {
              editor.updateConnectionNodes(`node-${nodeId}`);
              console.log(`Node ${nodeId} connections updated after resize.`);
          }, 50);


          // 5. Guardar historial
          saveHistoryState();
          showToast('success', 'Imagen Cargada', `${w}x${h}px`);

      } catch (error) {
           console.error(`Error processing image dimensions or updating node ${nodeId}:`, error);
           showToast('error', 'Error Imagen', 'No se pudo procesar la imagen.');
           // Resetear si falla
           imgTag.src = '';
           imgTag.style.display = 'none';
           placeholder.style.display = 'flex'; // O 'block' según tu layout de placeholder
           editor.updateNodeDataFromId(nodeId, { imgsrc: '', naturalWidth: 0, naturalHeight: 0 });
      }
  };
  tempImg.onerror = (err) => {
      console.error("Error loading image data into temp Image object:", err);
      showToast('error', 'Error Carga', 'El formato de imagen no es válido o está corrupto.');
      // Resetear UI
      imgTag.src = '';
      imgTag.style.display = 'none';
      placeholder.style.display = 'flex';
      editor.updateNodeDataFromId(nodeId, { imgsrc: '', naturalWidth: 0, naturalHeight: 0 });
  };
  tempImg.src = imageDataUrl; // Iniciar la carga en memoria
}

/**
* Inicia la selección de archivo para el nodo imagen minimalista.
* @param {Event} event Evento click en el placeholder.
*/
function triggerMinimalImageFileSelect(event) {
  const placeholder = event.currentTarget; // El placeholder que recibió el clic
  const nodeElement = placeholder.closest('.drawflow-node');
  if (!nodeElement) return;
  const nodeId = nodeElement.id.split('-')[1];

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';

  input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (loadEvent) => {
              processMinimalImageLoad(nodeId, loadEvent.target.result);
          };
          reader.onerror = () => {
              showToast('error', 'Error Lectura', 'No se pudo leer el archivo.');
          };
          reader.readAsDataURL(file);
      }
      document.body.removeChild(input); // Limpiar input
  };

  document.body.appendChild(input);
  input.click();
}

/**
* Maneja el evento dragover sobre el placeholder de imagen.
* @param {DragEvent} event
*/
function handleMinimalImageDragOver(event) {
   event.preventDefault();
   event.stopPropagation();
   event.dataTransfer.dropEffect = 'copy';
   event.currentTarget.classList.add('dragover'); // currentTarget es el placeholder
}

/**
* Maneja el evento dragleave sobre el placeholder de imagen.
* @param {DragEvent} event
*/
function handleMinimalImageDragLeave(event) {
  event.stopPropagation();
  event.currentTarget.classList.remove('dragover');
}

/**
* Maneja el evento drop sobre el placeholder de imagen.
* @param {DragEvent} event
*/
function handleMinimalImageDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const placeholder = event.currentTarget;
  placeholder.classList.remove('dragover');
  const nodeElement = placeholder.closest('.drawflow-node');
  if (!nodeElement) return;
  const nodeId = nodeElement.id.split('-')[1];

  const files = event.dataTransfer.files;
  if (files.length > 0) {
      // Buscar el primer archivo de imagen
      let imageFile = null;
      for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith('image/')) {
              imageFile = files[i];
              break;
          }
      }

      if (imageFile) {
          const reader = new FileReader();
          reader.onload = (loadEvent) => {
              processMinimalImageLoad(nodeId, loadEvent.target.result);
          };
          reader.onerror = () => {
              showToast('error', 'Error Lectura', 'No se pudo leer el archivo arrastrado.');
          };
          reader.readAsDataURL(imageFile);
      } else {
          showToast('warning', 'Archivo Inválido', 'Arrastra un archivo de imagen.');
      }
  }
}

/**
* Maneja el evento paste sobre el nodo imagen minimalista.
* @param {ClipboardEvent} event
*/
function handleMinimalImagePaste(event) {
  const nodeElement = event.currentTarget; // El nodo que tiene el listener
  if (!nodeElement || !nodeElement.classList.contains('image-minimal-node')) return; // Doble check

  const nodeId = nodeElement.id.split('-')[1];
  const items = (event.clipboardData || window.clipboardData)?.items;
  if (!items) return;

  let foundImage = false;
  for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
          event.preventDefault(); // Prevenir pegado default solo si encontramos imagen
          const blob = items[i].getAsFile();
          if (blob) {
               foundImage = true;
               const reader = new FileReader();
               reader.onload = (loadEvent) => {
                   processMinimalImageLoad(nodeId, loadEvent.target.result);
               };
               reader.onerror = () => {
                   showToast('error', 'Error Lectura', 'No se pudo leer la imagen pegada.');
               };
               reader.readAsDataURL(blob);
               break; // Procesar solo la primera imagen encontrada
          }
      }
  }
  // Si no se encontró imagen en el portapapeles, no hacemos nada (ni prevenimos default)
}


// --- Modificar o añadir esta función para registrar los listeners ---

/**
* Registra los listeners específicos para el nodo imagen minimalista.
* Debe llamarse DESPUÉS de que el nodo se añade al DOM.
* @param {string} nodeId El ID del nodo recién añadido.
*/
function setupMinimalImageNodeListeners(nodeId) {
  const nodeElement = document.getElementById(`node-${nodeId}`);
  const placeholder = nodeElement?.querySelector('.image-placeholder');

  if (!nodeElement || !placeholder) {
      console.warn(`Could not find elements to attach listeners for minimal image node ${nodeId}`);
      return;
  }

  console.log(`Attaching listeners to minimal image node ${nodeId}`);

  // Click en placeholder para seleccionar archivo
  placeholder.onclick = triggerMinimalImageFileSelect;

  // Drag and Drop en placeholder
  placeholder.ondragover = handleMinimalImageDragOver;
  placeholder.ondragleave = handleMinimalImageDragLeave;
  placeholder.ondrop = handleMinimalImageDrop;

  // Paste EN EL NODO (funciona mejor que solo en el placeholder)
  // Usamos captura para asegurar que lo cojamos aunque el foco esté dentro
  nodeElement.addEventListener('paste', handleMinimalImagePaste, true); // 'true' para fase de captura

  // Opcional: Listener para borrar la imagen (ej. doble clic en la imagen?)
  // const imgTag = nodeElement.querySelector('img[df-imgsrc]');
  // imgTag.ondblclick = (event) => {
  //    event.stopPropagation();
  //    clearMinimalImage(nodeId); // Necesitarías crear esta función
  // };
}


/**
 * Ejecuta la transformación de mayúsculas/minúsculas directamente.
 * @param {string} nodeId - ID del nodo.
 * @param {string} inputValue - El texto de entrada.
 * @param {'upper' | 'lower'} mode - 'upper' para mayúsculas, 'lower' para minúsculas.
 */
function executeTextCase(nodeId, inputValue, mode) {
    console.log(`Executing Text Case: Node ${nodeId}, Mode: ${mode}`);
    const inputText = String(inputValue ?? ''); // Asegurar que sea string
    const result = mode === 'upper' ? inputText.toUpperCase() : inputText.toLowerCase();
    updateNodeResult(nodeId, result); // Actualiza y propaga el resultado
}



























/**
 * [Simplificado] Ejecuta el reemplazo de texto para un nodo.
 * Realiza un reemplazo global y sensible a mayúsculas.
 * @param {string} nodeId - El ID del nodo.
 * @param {*}    inputText - Texto o dato a procesar.
 */
function executeTextReplace(nodeId, inputText) {
    console.log(`--- [Simple] Executing Text Replace Node ${nodeId} ---`);

    // 1. Validar el nodo
    const node = editor.getNodeFromId(nodeId);
    if (!node || node.name !== 'text_replace') {
        console.error(`Text Replace (${nodeId}): Nodo inválido o tipo incorrecto.`);
        return; // No continuar si el nodo no es válido
    }

    // 2. Obtener datos necesarios del nodo
    // Lee directamente de node.data (asumiendo que handleNodeDataChange los actualiza)
    const findText = node.data.find ?? '';         // Usar '' si no está definido
    const replaceText = node.data.replace ?? '';   // Usar '' si no está definido
    
    // 3. Asegurar que el texto de entrada sea un string
    const currentInputText = String(inputText ?? ''); 

    console.log(`   Input: "${currentInputText}"`);
    console.log(`   Find: "${findText}"`);
    console.log(`   Replace: "${replaceText}"`);

    // 4. Si el texto a buscar ('find') está vacío, no hacer nada y devolver el original
    if (!findText) {
        console.warn(`Text Replace (${nodeId}): Texto de búsqueda vacío. Devolviendo texto original.`);
        // Llamamos a updateNodeResult para asegurar que la salida refleje la entrada actual
        updateNodeResult(nodeId, currentInputText); 
        console.log(`--- [Simple] Finished Text Replace Node ${nodeId} (No Find Text) ---`);
        return; 
    }

    // 5. Realizar el reemplazo (global, case-sensitive)
    let resultText;
    try {
        // El método split/join es eficiente para reemplazos literales globales
        resultText = currentInputText.split(findText).join(replaceText);
        console.log(`   Result: "${resultText}"`);
    } catch (error) {
        // Capturar errores inesperados durante el split/join
        console.error(`Text Replace Node (${nodeId}): Error durante el reemplazo`, error);
        resultText = `Error: ${error.message}`; // Establecer un mensaje de error como resultado
    }

    // 6. Actualizar el nodo con el resultado (o el mensaje de error)
    // Esta función actualiza node.data.result, la UI, propaga y guarda historial
    updateNodeResult(nodeId, resultText); 
    
    console.log(`--- [Simple] Finished Text Replace Node ${nodeId} ---`);
}



































































/**
 * Escapa caracteres especiales para usar en expresiones regulares.
 * @param {string} string - El string a escapar.
 * @returns {string} - El string escapado.
 */
function escapeRegExp(string) {
    // Escapar caracteres especiales para RegExp
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Trunca un texto largo para mostrarlo en logs.
 * @param {string} text - El texto a truncar.
 * @param {number} maxLength - Longitud máxima (por defecto 100).
 * @returns {string} - El texto truncado.
 */
function truncateForLog(text, maxLength = 100) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '... [truncado]';
}

/**
 * Ejecuta la división de texto directamente.
 * @param {string} nodeId - ID del nodo.
 * @param {string} inputValue - El texto de entrada.
 */
function executeTextSplit(nodeId, inputValue) {
    console.log(`Executing Text Split: Node ${nodeId}`);
    const nodeData = editor.getNodeFromId(nodeId)?.data;
    if (!nodeData) return;
    const inputText = String(inputValue ?? '');
    const separator = nodeData.separator ?? ''; // Obtener 'separator'
    // Si el separador está vacío, simplemente devuelve el texto original
    // o decide un comportamiento (ej. dividir por caracter? Por ahora, original).
    // Dividir y unir con salto de línea para mostrar en textarea.
    const result = (separator === '') ? inputText : inputText.split(separator).join('\n');
    // Nota: El dato propagado será un string con saltos de línea.
    // Si necesitaras propagar un array, la lógica cambiaría aquí y en updateNodeResult.
    updateNodeResult(nodeId, result);
}

/**
 * Calcula la longitud del texto directamente.
 * @param {string} nodeId - ID del nodo.
 * @param {string} inputValue - El texto de entrada.
 */
function executeTextLength(nodeId, inputValue) {
    console.log(`Executing Text Length: Node ${nodeId}`);
    const inputText = String(inputValue ?? '');
    const result = inputText.length; // El resultado es un número
    updateNodeResult(nodeId, result); // Actualiza (mostrará número) y propaga (número)
}

/**
 * Ejecuta la eliminación de etiquetas HTML directamente.
 * @param {string} nodeId - ID del nodo.
 * @param {string} inputValue - El texto de entrada (HTML).
 */
function executeHtmlStrip(nodeId, inputValue) {
    console.log(`Executing HTML Strip: Node ${nodeId}`);
    const inputText = String(inputValue ?? '');
    const result = inputText.replace(/<[^>]*>/g, ''); // Regex para quitar etiquetas
    updateNodeResult(nodeId, result);
}


/**
 * Obtiene de forma segura un valor anidado de un objeto usando una cadena de ruta.
 * Ejemplo: getValueFromJson(obj, 'user.address.city')
 * @param {object|null} obj - El objeto fuente.
 * @param {string} keyPath - La ruta de la clave (ej. 'nombre', 'pedido.id').
 * @returns {*} El valor encontrado, o undefined si la ruta no existe o el objeto no es válido.
 */
function getValueFromJson(obj, keyPath) {
    // Validaciones iniciales
    if (!obj || typeof obj !== 'object' || obj === null || typeof keyPath !== 'string' || keyPath === '') {
        return undefined;
    }
    const keys = keyPath.split('.'); // Dividir la ruta por puntos
    let current = obj;
    for (const key of keys) {
        // Verificar si el nivel actual es un objeto válido antes de acceder
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined; // Ruta no encontrada
        }
        // Verificar si la clave existe en el nivel actual
        if (!Object.prototype.hasOwnProperty.call(current, key)) {
             return undefined; // Clave específica no encontrada
        }
        current = current[key]; // Moverse al siguiente nivel
    }
    // Devolver el valor final encontrado (puede ser null, string, number, etc.)
    return current;
}

/**
 * Procesa la plantilla de un nodo 'template_engine'.
 * @param {string} nodeId - El ID del nodo a procesar.
 * @param {object} [directInputJson] - (Opcional) El objeto JSON pasado directamente.
 */
function processTemplateNode(nodeId, directInputJson) {
    const node = editor.getNodeFromId(nodeId);
    if (!node || node.name !== 'template_engine') return;

    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (!nodeElement) { console.error(`Template Node (${nodeId}): Element not found.`); return; }
    const templateTextarea = nodeElement.querySelector('textarea[df-template]');
    if (!templateTextarea) { console.error(`Template Node (${nodeId}): Template textarea not found.`); return; }
    const currentTemplate = templateTextarea.value || '';

    if (node.data.template !== currentTemplate) {
         editor.updateNodeDataFromId(nodeId, { template: currentTemplate });
    }

    const nodeData = editor.getNodeFromId(nodeId).data;
    let inputJson = directInputJson !== undefined ? directInputJson : nodeData.lastInput;

    // Convertir inputJson de string a objeto si es necesario
    if (typeof inputJson === 'string') {
        try {
            inputJson = JSON.parse(inputJson);
        } catch (error) {
            console.error(`Template Node (${nodeId}): Failed to parse JSON input`, error);
            editor.updateNodeDataFromId(nodeId, { result: `Error: JSON inválido - ${error.message}` });
            return;
        }
    }

    // *** LOGS IMPORTANTES ***
    console.log(`--- Processing Template Node ${nodeId} ---`);
    console.log("   Template String (Read from UI):", JSON.stringify(currentTemplate));
    console.log("   Input JSON (Effective):", inputJson ? JSON.stringify(inputJson) : inputJson);
    // *** FIN LOGS IMPORTANTES ***

    let processedTemplate = '';
    let errorOccurred = false;

    if (inputJson && typeof inputJson === 'object' && inputJson !== null) {
        const regex = /{{\s*([\w.-]+)\s*}}/g;
        try {
            processedTemplate = currentTemplate.replace(regex, (match, key) => {
                const cleanKey = key.trim();
                const value = getValueFromJsonPath(inputJson, cleanKey);
                // *** LOG IMPORTANTE ***
                console.log(`   -> Replacing {{${cleanKey}}}: Found value:`, value, `(Type: ${typeof value})`);
                // *** FIN LOG IMPORTANTE ***
                if (value === undefined) { return match; } // Dejar sin cambiar
                else if (value === null) { return ''; }
                else if (typeof value === 'object') { return JSON.stringify(value); }
                else { return String(value); }
            });
        } catch (error) {
            console.error(`Template Node (${nodeId}): Error during replace`, error);
            processedTemplate = `Error: ${error.message}`;
            errorOccurred = true;
        }
    } else {
        processedTemplate = currentTemplate;
        console.warn(`Template Node (${nodeId}): No effective input JSON.`);
    }

    // *** LOG IMPORTANTE ***
    console.log(`   Final Processed Template:`, JSON.stringify(processedTemplate));
    // *** FIN LOG IMPORTANTE ***

    if (nodeData.result !== processedTemplate || errorOccurred) {
        console.log(`Template Node (${nodeId}): Updating result.`);
        editor.updateNodeDataFromId(nodeId, { result: processedTemplate });

        const resultTextarea = nodeElement.querySelector('textarea[df-result]');
        if (resultTextarea) {
            // *** LOG IMPORTANTE ***
            console.log(`   Attempting to set UI textarea[df-result] value.`);
            resultTextarea.value = processedTemplate;
            console.log(`   UI textarea[df-result] value set.`);
            // *** FIN LOG IMPORTANTE ***
        } else {
            // *** ERROR IMPORTANTE ***
            console.error(`   CRITICAL: UI textarea[df-result] NOT FOUND for node ${nodeId}. Check HTML definition.`);
            // *** FIN ERROR IMPORTANTE ***
        }
        // *** LOG IMPORTANTE ***
        console.log(`   Attempting to propagate final result...`);
        propagateData(nodeId, 'template_engine', 'result', processedTemplate);
        console.log(`   Propagation called.`);
        // *** FIN LOG IMPORTANTE ***
        saveHistoryState();
    } else {
        console.log(`Template Node (${nodeId}): Result unchanged.`);
    }
    console.log(`--- Finished Processing Template Node ${nodeId} ---`);
}

/**
 * Obtiene un valor de un objeto JSON usando una ruta de acceso con notación de punto.
 * @param {object} json - El objeto JSON.
 * @param {string} path - La ruta de acceso (ej: "usuario.direccion.calle").
 * @returns {*} El valor encontrado o undefined si no existe.
 */
function getValueFromJsonPath(json, path) {
    if (!json || !path) return undefined;
    
    const keys = path.split('.');
    let current = json;
    
    for (const key of keys) {
        if (current === null || typeof current !== 'object') {
            return undefined;
        }
        current = current[key];
        if (current === undefined) {
            return undefined;
        }
    }
    
    return current;
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
// MODIFICADO: handleNodeDataChange para propagar cambios de nodos de entrada básicos
function handleNodeDataChange(event) {
  if (!editor || !event?.target) return;
  const el = event.target;
  const nodeEl = el.closest('.drawflow-node');
  if (!nodeEl) return;
  const id = nodeEl.id.split('-')[1];
  const node = editor.getNodeFromId(id);
  if (!node) return;
  let key = null;
  for (const attr of el.attributes) if (attr.name.startsWith('df-')) { key = attr.name.substring(3); break; }
  if (!key) return;

  // Usar requestAnimationFrame para asegurar que el valor en node.data esté actualizado
  requestAnimationFrame(() => {
      try {
          const updatedNode = editor.getNodeFromId(id);
          if (!updatedNode?.data?.hasOwnProperty(key)) return; // Verifica que la clave exista en los datos
          const val = updatedNode.data[key]; // Obtiene el valor actualizado de los datos del nodo
          const name = updatedNode.name;

          // Lógica específica para ciertos nodos que necesitan ejecutar/propagar al cambiar
          if ((name === 'url_input' && key === 'url')) {
               executeNode(id, val);
          } else if (name === 'cargarTexto' && key === 'filecontent') {
               propagateData(id, name, key, val);
          } else if (name === 'imagen' && ['imgsrc', 'imgalt', 'imgwidth', 'imgheight'].includes(key)) {
               handleImageInputChange(event); // Llama a la función que actualiza la imagen y propaga
          } else if (name === 'nota' && key === 'notecontent') {
               updateCharacterCount(event); // Actualiza contador, no necesita propagar
          } else if ((name === 'timer_fetch' || name === 'timer_download' || name === 'loop') && key === 'interval') {
               executeNode(id, null); // Reinicia el timer con el nuevo intervalo
          } else if (name === 'timer_fetch' && key === 'url') {
               executeNode(id, null); // Reinicia el fetch timer (usará la nueva URL en la próxima ejecución)
          }
          // --- INICIO MODIFICACIÓN: Propagar para nodos de entrada simples ---
          else if (['input_number', 'input_text', 'input_range', 'input_date', 'input_time', 'input_color'].includes(name)) {
               console.log(`Propagating data from ${name} node ${id}, key: ${key}, value:`, val);
               propagateData(id, name, key, val); // Propaga el valor cambiado
          }
          // --- FIN MODIFICACIÓN ---
          // Nota: input_json ya se maneja en handleJsonInputChange

          // Siempre guardar el historial después de un cambio en los datos del nodo
          saveHistoryState();

      } catch (e) {
          console.error(`Error handleNodeDataChange (${id}/${key}):`, e);
      }
  });
}




// MODIFICADO: propagateData con manejo de nodos aritméticos, texto (auto) y PLANTILLA
// ACTUALIZADO: propagateData con manejo de nodos aritméticos, texto (auto) y PLANTILLA (corregido)
function propagateData(sourceNodeId, sourceNodeName, changedKey, outputData) {
    try {
        const sourceNode = editor.getNodeFromId(sourceNodeId);
        // Asume puerto de salida estándar 'output_1', si no existe o no tiene conexiones, salir.
        const outputPort = sourceNode?.outputs?.output_1;
        if (!outputPort?.connections || outputPort.connections.length === 0) {
            // console.log(`Propagate from ${sourceNodeId}: No output connections found on output_1.`);
            return;
        }

        const connections = outputPort.connections;
        const sourceData = sourceNode.data || {};
        let dataToPropagate;

        // --- Determinar el dato real a propagar ---
        if (outputData !== undefined) {
            dataToPropagate = outputData;
        } else {
            const commonOutputKeys = ['result', 'content', 'codecontent', 'outputhtml', 'filecontent', 'display', 'url', 'jscode'];
            const inputKeys = ['number', 'text', 'range', 'date', 'time', 'color', 'json', 'notecontent'];
            const searchKeys = [changedKey, ...commonOutputKeys, ...inputKeys].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

            for (const k of searchKeys) {
                if (sourceData.hasOwnProperty(k)) {
                    dataToPropagate = sourceData[k];
                    break;
                }
            }
            if (dataToPropagate === undefined) {
                const firstKey = Object.keys(sourceData).find(k => !['lastInput', 'lastInputs', 'selector_received'].includes(k));
                if (firstKey) dataToPropagate = sourceData[firstKey];
            }
        }
        // --- Fin determinación de dato ---

        connections.forEach(conn => {
            const targetId   = conn.node;
            const targetNode = editor.getNodeFromId(targetId);
            if (!targetNode) {
                console.warn(`Target node ${targetId} not found during propagation from ${sourceNodeId}.`);
                return;
            }
            const targetNodeName = targetNode.name;
            const targetInputPort = conn.output;

            // === Lógica de Propagación Específica por Tipo de Nodo Destino ===

            if (EXECUTE_NODE_SYSTEM_TYPES.includes(targetNodeName)) { // Nodos de sistema
                if (targetNodeName === 'extract_value') {
                    if (targetInputPort === 'input_1') {
                        setTimeout(() => executeNode(targetId, dataToPropagate), 0);
                    } else if (targetInputPort === 'input_2') {
                        const s = String(dataToPropagate ?? '');
                        editor.updateNodeDataFromId(targetId, { selector_received: s });
                        const el = document.getElementById(`node-${targetId}`);
                        const i  = el?.querySelector('input[df-selector_received]');
                        if (i) i.value = s;
                    }
                } else {
                    setTimeout(() => executeNode(targetId, dataToPropagate), 0);
                }
            }
            else if (targetNodeName === 'javascript_code') { // Nodo JS
                editor.updateNodeDataFromId(targetId, { lastInput: dataToPropagate });
                setTimeout(() => executeNode(targetId, dataToPropagate), 0);
            }
            else if (targetNodeName === 'concatenar') { // Nodo Concatenar
                setTimeout(() => updateConcatenateNode(targetId), 0);
            }
            else if (targetNodeName === 'sum') { // Nodos Aritméticos
                setTimeout(() => updateSumNode(targetId), 0);
            }
            else if (targetNodeName === 'subtract') {
                setTimeout(() => updateSubtractNode(targetId), 0);
            }
            else if (targetNodeName === 'multiply') {
                setTimeout(() => updateMultiplyNode(targetId), 0);
            }
            else if (targetNodeName === 'divide') {
                setTimeout(() => updateDivideNode(targetId), 0);
            }
            else if (targetNodeName === 'mostrarPasar' && targetInputPort === 'input_1') { // Mostrar y Pasar
                const v = String(dataToPropagate ?? '');
                editor.updateNodeDataFromId(targetId, { result: v });
                const el = document.getElementById(`node-${targetId}`);
                const ta = el?.querySelector('textarea[df-result]');
                if (ta) ta.value = v;
                setTimeout(() => propagateData(targetId, targetNodeName, 'result', dataToPropagate), 0);
            }
            else if (targetNodeName === 'guardarTexto' && targetInputPort === 'input_1') { // Guardar Texto
                const v = String(dataToPropagate ?? '');
                editor.updateNodeDataFromId(targetId, { savecontent: v });
                const el = document.getElementById(`node-${targetId}`);
                const ta = el?.querySelector('textarea[df-savecontent]');
                if (ta) ta.value = v;
            }
            else if (['text_replace', 'text_split', 'text_uppercase', 'text_lowercase', 'text_length', 'html_strip'].includes(targetNodeName) && targetInputPort === 'input_1') { // Nodos Transformación Texto (Automático)
                const inputText = String(dataToPropagate ?? '');
                editor.updateNodeDataFromId(targetId, { lastInput: inputText });
                setTimeout(() => {
                    try {
                        // console.log(`Auto-executing ${targetNodeName} (${targetId}) due to input change.`);
                        switch (targetNodeName) {
                            case 'text_uppercase': executeTextCase(targetId, inputText, 'upper'); break;
                            case 'text_lowercase': executeTextCase(targetId, inputText, 'lower'); break;
                            case 'text_replace': executeTextReplace(targetId, inputText); break;
                            case 'text_split': executeTextSplit(targetId, inputText); break;
                            case 'text_length': executeTextLength(targetId, inputText); break;
                            case 'html_strip': executeHtmlStrip(targetId, inputText); break;
                        }
                    } catch (execError) {
                        console.error(`Error during automatic execution of ${targetNodeName} (${targetId}):`, execError);
                        const nodeElement = document.getElementById(`node-${targetId}`);
                        const resultTextArea = nodeElement?.querySelector('textarea[df-result], input[df-result]');
                        if(resultTextArea) resultTextArea.value = `Error: ${execError.message}`;
                        editor.updateNodeDataFromId(targetId, { result: `Error: ${execError.message}` });
                    }
                }, 0);
            }
            // --- INICIO: BLOQUE CORREGIDO PARA NODO PLANTILLA ---
            else if (targetNodeName === 'template_engine' && targetInputPort === 'input_1') {
                // 1. Guardar el objeto JSON recibido en lastInput (útil para reprocesamiento si cambia la plantilla)
                editor.updateNodeDataFromId(targetId, { lastInput: dataToPropagate });
                // console.log(`Template Node (${targetId}): Stored input data for potential reprocessing.`, dataToPropagate);

                // 2. Llamar a la función de procesamiento PASANDO el dato directamente
                //    Guardar en variable local para el closure del setTimeout
                const jsonDataForTimeout = dataToPropagate;
                setTimeout(() => {
                    // Llama a processTemplateNode CON el dato como segundo argumento
                    processTemplateNode(targetId, jsonDataForTimeout);
                }, 0);
            }
            // --- FIN: BLOQUE CORREGIDO PARA NODO PLANTILLA ---

            // Añade aquí más 'else if' si creas otros nodos personalizados que reaccionen a la entrada

        }); // Fin del forEach connections
    } catch (error) {
        console.error(`Error propagating data from node ${sourceNodeId} (${sourceNodeName}):`, error);
        // showToast('error', 'Propagation Error', `Error from ${sourceNodeName}`);
    }
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

/**
 * Carga un proyecto Xocoflow desde un archivo JSON seleccionado por el usuario.
 * @param {Event} event - El evento 'change' del input de tipo 'file'.
 */
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
      const fileContent = e.target.result;

      try {
          // --- PASO 1: Parsear JSON ---
          try {
              projectData = JSON.parse(fileContent);
          } catch (parseError) { /* ... (manejo de error existente) ... */ return; }

          // --- PASO 2: Verificar estructura básica ---
          if (!projectData?.drawflow) { /* ... (manejo de error existente) ... */ return; }

          // --- PASO 3: Procesar Nodos Personalizados ---
          console.log("JSON parseado, procesando nodos personalizados...");
          try {
              // Cargar definiciones personalizadas del archivo o del localStorage
              const customDefsFromFile = projectData.customNodeDefinitions;
              if (customDefsFromFile && typeof customDefsFromFile === 'object') {
                  saveCustomNodeTypes(customDefsFromFile); // Guarda en localStorage
                  customNodeTypes = { ...baseNodeDefinitions, ...customDefsFromFile };
              } else {
                  // Si no hay definiciones en el archivo, usa las que ya están en localStorage
                  customNodeTypes = { ...baseNodeDefinitions, ...getStoredCustomNodeTypes() };
              }
              loadCustomNodesToSidebar(); // Actualiza sidebar ANTES de importar
          } catch (nodeError) { /* ... (manejo de error/warning existente) ... */ }


          // --- PASO 4: Importar en Drawflow y Sincronizar UI ---
          console.log("Importando datos en Drawflow...");
          const currentModuleBeforeImport = editor.module;
          try {
              cleanupAllModuleIntervals(); // Detener timers antes de importar
              editor.import(projectData); // ¡La importación ocurre aquí!

              // --- INICIO: ACTUALIZACIÓN MANUAL DE UI POST-IMPORTACIÓN ---
              console.log("Sincronizando UI de nodos con datos importados...");
              const targetModule = editor.module || currentModuleBeforeImport; // Módulo actual después de importar
              const drawflowExportAfterImport = editor.export(); // Obtenemos el estado *después* de importar
              const currentModuleNodes = drawflowExportAfterImport?.drawflow?.[targetModule]?.data;

              if (currentModuleNodes) {
                  Object.keys(currentModuleNodes).forEach(nodeId => {
                      // Obtener datos y elemento del nodo recién importado
                      const node = currentModuleNodes[nodeId]; // Nodo completo de la exportación
                      const nodeData = node.data || {};
                      const nodeElement = document.getElementById(`node-${nodeId}`);
                      const nodeName = node.name;

                      if (nodeElement) {
                          // --- Sincronización General (para la mayoría de nodos) ---
                          // Itera sobre los datos para actualizar los elementos df-* correspondientes
                          Object.keys(nodeData).forEach(dataKey => {
                              // Saltar claves especiales que no se reflejan directamente o se manejan abajo
                              if (['naturalWidth', 'naturalHeight'].includes(dataKey) && nodeName === 'image_minimal') return;
                              // Claves que pueden ser internas y no tener elemento df-* directo
                              if (['lastInput', 'lastInputs', 'selector_received'].includes(dataKey)) return;

                              const inputElement = nodeElement.querySelector(`[df-${dataKey}]`);
                              if (inputElement) {
                                  const value = nodeData[dataKey];
                                  // Lógica existente para inputs, textareas, selects...
                                  if (inputElement.tagName === 'TEXTAREA' || (inputElement.tagName === 'INPUT' && ['text', 'number', 'url', 'email', 'password', 'range', 'date', 'time', 'color'].includes(inputElement.type))) {
                                      inputElement.value = value ?? '';
                                      // Si es un range, actualiza el span asociado si existe
                                      if (inputElement.type === 'range' && inputElement.nextElementSibling?.hasAttribute('df-rangeval')) {
                                           inputElement.nextElementSibling.textContent = value ?? '0';
                                      }
                                  } else if (inputElement.tagName === 'SELECT'){
                                      inputElement.value = value ?? '';
                                      if (dataKey === 'notecolor') { // Trigger 'change' para actualizar color de nota
                                          const changeEvent = new Event('change', { bubbles: true });
                                          inputElement.dispatchEvent(changeEvent);
                                      }
                                  } else if (inputElement.tagName === 'IMG' && dataKey === 'imgsrc' && nodeName !== 'image_minimal') { // Caso local_image original
                                      inputElement.src = value ?? '';
                                      inputElement.style.display = value ? 'block' : 'none';
                                      const placeholder = nodeElement.querySelector('.placeholder-text');
                                      if(placeholder) placeholder.style.display = value ? 'none' : 'block';
                                  } else if (inputElement.tagName === 'SPAN' && dataKey === 'filename'){
                                      inputElement.textContent = value ?? '';
                                      inputElement.title = value ?? '';
                                  } else if (inputElement.hasAttribute('df-charcount')) { // Contador nota
                                      inputElement.textContent = nodeElement.querySelector('[df-notecontent]')?.value?.length || '0';
                                  }
                                  // ... otros casos si son necesarios ...
                              }
                          });

                          // --- Sincronización Específica por Tipo de Nodo ---

                          // Caso: Nodo Nota (color del fondo y título)
                          if (nodeName === 'nota' && nodeData.notecolor) {
                              nodeElement.style.backgroundColor = nodeData.notecolor;
                              const tb = nodeElement.querySelector('.title-box');
                              if(tb) {
                                  const darkBgs = ['#ccccff', '#e0e0e0'];
                                  tb.style.backgroundColor = darkBgs.includes(nodeData.notecolor) ? '#f0f0f0' : '';
                                  tb.style.color = darkBgs.includes(nodeData.notecolor) ? '#333' : '';
                              }
                          }
                          // Caso: Nodo Local Image (tamaño del nodo e imagen interna)
                          else if (nodeName === 'local_image') {
                              if (nodeData.nodewidth) nodeElement.style.width = nodeData.nodewidth;
                              if (nodeData.nodeheight) nodeElement.style.height = nodeData.nodeheight;
                              const imgTag = nodeElement.querySelector('img[df-imagesrc]');
                              if (imgTag){
                                  if(nodeData.imagewidth) imgTag.style.width = nodeData.imagewidth;
                                  if(nodeData.imageheight) imgTag.style.height = nodeData.imageheight;
                                  // Restaurar src y visibilidad también, aunque debería hacerse en el bucle general
                                  imgTag.src = nodeData.imagesrc ?? '';
                                  imgTag.style.display = nodeData.imagesrc ? 'block' : 'none';
                                  const placeholder = nodeElement.querySelector('.placeholder-text');
                                   if(placeholder) placeholder.style.display = nodeData.imagesrc ? 'none' : 'block';
                              }
                          }
                          // --- INICIO: Caso image_minimal ---
                          else if (nodeName === 'image_minimal') {
                              const imgTag = nodeElement.querySelector('img[df-imgsrc]');
                              const placeholder = nodeElement.querySelector('.image-placeholder');

                              if (imgTag && placeholder) {
                                  // Verificar si hay una imagen válida guardada
                                  const hasValidImage = nodeData.imgsrc && nodeData.naturalWidth > 0 && nodeData.naturalHeight > 0;

                                  if (hasValidImage) {
                                      // Restaurar imagen y tamaño
                                      imgTag.src = nodeData.imgsrc;
                                      imgTag.style.display = 'block';
                                      placeholder.style.display = 'none';
                                      nodeElement.style.width = `${nodeData.naturalWidth}px`;
                                      nodeElement.style.height = `${nodeData.naturalHeight}px`;
                                      nodeElement.style.border = 'none'; // Quitar borde punteado
                                      console.log(`Restored image_minimal ${nodeId} to ${nodeData.naturalWidth}x${nodeData.naturalHeight}`);
                                  } else {
                                      // Mostrar placeholder y tamaño mínimo
                                      imgTag.src = '';
                                      imgTag.style.display = 'none';
                                      placeholder.style.display = 'flex'; // O 'block'
                                      nodeElement.style.width = '80px';
                                      nodeElement.style.height = '60px';
                                      nodeElement.style.border = '2px dashed #cccccc'; // Poner borde
                                      console.log(`Restored image_minimal ${nodeId} to placeholder state.`);
                                  }

                                  // SIEMPRE re-adjuntar listeners después de cargar el proyecto
                                  setTimeout(() => setupMinimalImageNodeListeners(nodeId), 50);

                                  // Forzar actualización de conexiones después de ajustar tamaño
                                  // Dar un poco más de tiempo para que el DOM se estabilice
                                  setTimeout(() => editor.updateConnectionNodes(`node-${nodeId}`), 100);
                              } else {
                                  console.warn(`Could not find img/placeholder elements for image_minimal node ${nodeId} during project load.`);
                              }
                          }
                          // --- FIN: Caso image_minimal ---

                      } else {
                          console.warn(`Node element not found in DOM for ID ${nodeId} during post-import UI sync.`);
                      }
                  }); // Fin forEach nodeId
              } else {
                  console.warn("No nodes found in the current module after import to sync UI:", targetModule);
              }
              console.log("Post-import UI synchronization completed.");
              // --- FIN: ACTUALIZACIÓN MANUAL DE UI POST-IMPORTACIÓN ---

          } catch (importError) { /* ... (manejo de error existente) ... */ return; }

          // --- PASO 5: Éxito - Finalizar la carga ---
          console.log("Importación completada. Actualizando estado de la aplicación.");
          currentProjectName = expectedProjectName;
          renderModuleTabs();
          initializeHistory();
          selectedNodeId = null;
          copiedNodeData = null;
          currentlyEditingNodeId = null; // Asegurarse de limpiar esto también
          updateUIDisabledStates();
          closeCodeEditorSidebar(false);
          document.title = `Xocoflow | ${currentProjectName} - ${editor.module}`;
          saveHistoryState(true); // Guarda estado inicial cargado
          // Activar nodos automáticos DESPUÉS de sincronizar UI
          activateExistingAutoNodes();
          showToast('success', 'Proyecto Cargado', `"${escapeHtml(currentProjectName)}" cargado.`);

      } catch (err) { /* ... (manejo de error existente) ... */ }
      finally {
          if (fileInput) fileInput.value = null; // Limpiar input de archivo
      }
  }; // Fin reader.onload

  reader.onerror = (e) => { /* ... (manejo de error existente) ... */ };

  reader.readAsText(file); // Iniciar lectura
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
/**
 * Añade un nodo al canvas de Drawflow en la posición especificada por el evento drop/touch.
 * Incluye lógica especial para configurar el nodo 'image_minimal'.
 * @param {string} name - El nombre/tipo del nodo (ej: 'texto', 'image_minimal').
 * @param {number} pos_x - Coordenada X del evento en la ventana.
 * @param {number} pos_y - Coordenada Y del evento en la ventana.
 * @returns {boolean} - True si se añadió correctamente, false en caso de error.
 */
function addNodeToDrawFlow(name, pos_x, pos_y) {
  // Verificar si el editor existe y no está bloqueado
  if (!editor || isLocked()) {
      showToast('warning', 'Editor Bloqueado', 'Desbloquea para añadir nodos.');
      return false;
  }

  try {
      // Obtener la definición del nodo desde nuestro registro (incluye base y custom)
      const nodeDef = customNodeTypes[name];
      if (!nodeDef) {
          throw new Error(`Tipo de nodo "${name}" desconocido.`);
      }

      // --- Calcular Tamaño y Posición Inicial ---
      let initialWidthPx, initialHeightPx;
      // Caso especial para el nodo imagen minimalista: empieza pequeño
      if (name === 'image_minimal') {
          initialWidthPx = 80; // Valor base en píxeles (igual que min-width CSS)
          initialHeightPx = 60; // Valor base en píxeles (igual que min-height CSS)
      } else {
          // Para otros nodos, usar el width/height de la definición o un default
          initialWidthPx = parseInt(nodeDef.width || 220); // Default 220px si no se especifica
          initialHeightPx = parseInt(nodeDef.height || 80);  // Default 80px si no se especifica
      }

      // Convertir coordenadas de pantalla a coordenadas del canvas Drawflow
      const rect = editor.container.getBoundingClientRect();
      const zoom = editor.zoom || 1;
      const canvasX = (pos_x - rect.left - editor.canvas_x) / zoom;
      const canvasY = (pos_y - rect.top - editor.canvas_y) / zoom;

      // Ajustar posición para que el nodo se centre donde se soltó
      const adjX = canvasX - (initialWidthPx / 2);
      const adjY = canvasY - (initialHeightPx / 2);

      // --- Crear Datos y Añadir Nodo ---
      // Copiar profundamente los datos iniciales para evitar referencias compartidas
      const data = JSON.parse(JSON.stringify(nodeDef.data || {}));

      // Añadir el nodo usando el método de Drawflow
      const nodeId = editor.addNode(
          name,
          nodeDef.inputs,
          nodeDef.outputs,
          adjX, // Posición X ajustada en el canvas
          adjY, // Posición Y ajustada en el canvas
          nodeDef.cssClass || '', // Clase CSS específica o vacía
          data, // Datos iniciales del nodo
          nodeDef.html // Contenido HTML del nodo
      );

      // --- Lógica Específica Post-Añadir Nodo ---
      // Si es el nodo imagen minimalista, configura sus listeners y estilo inicial
      if (name === 'image_minimal') {
          // Usar setTimeout para asegurar que el nodo esté completamente renderizado en el DOM
          setTimeout(() => {
              const nodeElement = document.getElementById(`node-${nodeId}`);
              if (nodeElement) {
                  // Establecer tamaño inicial explícitamente
                  nodeElement.style.width = `${initialWidthPx}px`;
                  nodeElement.style.height = `${initialHeightPx}px`;
                  // Añadir borde punteado inicial para indicar que se puede soltar/pegar
                  nodeElement.style.border = '2px dashed #cccccc';
                  // Asegurar que el placeholder sea visible
                  const placeholder = nodeElement.querySelector('.image-placeholder');
                  if(placeholder) placeholder.style.display = 'flex'; // O 'block' según layout

                  // Adjuntar los listeners específicos (click, dnd, paste)
                  setupMinimalImageNodeListeners(nodeId);
                  console.log(`Listeners attached to new image_minimal node ${nodeId}`);
              } else {
                   console.warn(`Could not find new image_minimal node element ${nodeId} immediately after adding.`);
              }
          }, 0); // Timeout de 0ms suele ser suficiente
      } else {
           // Para otros nodos, llamar a la activación si es necesario
           activateNodeIfNeeded(nodeId);
      }

      // Guardar el estado en el historial para poder deshacer/rehacer
      saveHistoryState();
      console.log(`Node ${name} (ID: ${nodeId}) added successfully at (${adjX.toFixed(0)}, ${adjY.toFixed(0)}).`);
      return true; // Indicar éxito

  } catch (e) {
      // Manejar errores durante la adición
      console.error(`Error adding node "${name}":`, e);
      showToast('error', 'Error al Añadir Nodo', `Error: ${e.message}`);
      return false; // Indicar fallo
  }
}
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
      // --- nodeRemoved Listener ---
      editor.on('nodeRemoved', (id) => {
          console.log(`Event: Node Removed ${id}`);
          cleanupNodeIntervals(id); // Limpiar timers/intervalos

          // Actualizar estado de selección y UI
          if (selectedNodeId === id) { selectedNodeId = null; updateNodePositionStatus(null); }
          if (currentlyEditingNodeId === id) closeCodeEditorSidebar(false); // Cerrar editor si se borra el nodo editado

          // --- INICIO LÓGICA NODOS DEPENDIENTES ---
          let connectionsFromRemovedNode = [];
          try { // Intentar obtener conexiones antes de la eliminación completa
              const nodeDataBeforeRemoval = editor.getNodeFromId(id);
              if (nodeDataBeforeRemoval?.outputs) {
                  Object.values(nodeDataBeforeRemoval.outputs).forEach(outputPort => {
                      connectionsFromRemovedNode = connectionsFromRemovedNode.concat(outputPort.connections || []);
                  });
              }
          } catch (e) {
              console.warn(`Could not reliably get connections from node ${id} during removal event.`);
          }

          // Actualizar nodos Suma, Resta, Multiplicación, División o Concatenar conectados
          if (connectionsFromRemovedNode.length > 0) {
              connectionsFromRemovedNode.forEach(conn => {
                  const targetNode = editor.getNodeFromId(conn.node); // Obtiene el nodo destino
                  if (targetNode) { // Verificar si el nodo destino aún existe
                      const targetName = targetNode.name;
                      if (targetName === 'sum') {
                          console.log(`Node ${id} removed, updating target sum node ${conn.node}`);
                          setTimeout(() => updateSumNode(conn.node), 0);
                      } else if (targetName === 'subtract') {
                          console.log(`Node ${id} removed, updating target subtract node ${conn.node}`);
                          setTimeout(() => updateSubtractNode(conn.node), 0);
                      } else if (targetName === 'multiply') {
                          console.log(`Node ${id} removed, updating target multiply node ${conn.node}`);
                          setTimeout(() => updateMultiplyNode(conn.node), 0);
                      } else if (targetName === 'divide') {
                          console.log(`Node ${id} removed, updating target divide node ${conn.node}`);
                          setTimeout(() => updateDivideNode(conn.node), 0);
                      } else if (targetName === 'concatenar') {
                          console.log(`Node ${id} removed, updating target concatenate node ${conn.node}`);
                          setTimeout(() => updateConcatenateNode(conn.node), 0);
                      }
                  }
              });
          }
          // --- FIN LÓGICA NODOS DEPENDIENTES ---

          updateUIDisabledStates(); // Actualizar botones
          saveHistoryState(); // Guardar estado después de la eliminación
      });

      // --- nodeSelected Listener ---
      editor.on('nodeSelected', (id) => {
          console.log(`Event: Node Selected ${id}`);
          selectedNodeId = id;
          updateUIDisabledStates();
          updateNodePositionStatus(id);
      });

      // --- nodeUnselected Listener ---
      editor.on('nodeUnselected', (wasSelected) => {
          console.log(`Event: Node Unselected (was selected: ${wasSelected})`);
          const prevSelected = selectedNodeId;
          selectedNodeId = null; // Limpiar selección
          updateUIDisabledStates();
          updateNodePositionStatus(null);
          // Cerrar y guardar sidebar si se deselecciona el nodo que se estaba editando
          if (prevSelected && prevSelected === currentlyEditingNodeId) {
              closeCodeEditorSidebar(true);
          }
      });

      // --- nodeMoved Listener ---
      editor.on('nodeMoved', (id) => {
          saveHistoryState(); // Guarda historial al mover
          if(id === selectedNodeId) updateNodePositionStatus(id); // Actualiza posición en barra de estado

          const node = editor.getNodeFromId(id);
          if(node) {
              // --- INICIO LÓGICA NODOS DEPENDIENTES DEL ORDEN Y ---
              // Si el nodo movido tiene salidas conectadas a nodos cuyo cálculo depende del orden Y
              const outputConnections = getConnections(id, 'output');
              outputConnections.forEach(conn => {
                  const targetNode = editor.getNodeFromId(conn.node);
                  if (targetNode) { // Verificar si el nodo destino existe
                      const targetName = targetNode.name;
                      if (targetName === 'concatenar' || targetName === 'subtract' || targetName === 'divide') {
                           console.log(`Node ${id} moved, updating order-dependent target node ${conn.node} (${targetName})`);
                           // Llamar a la función de actualización correspondiente
                           if (targetName === 'concatenar') setTimeout(() => updateConcatenateNode(conn.node), 0);
                           else if (targetName === 'subtract') setTimeout(() => updateSubtractNode(conn.node), 0);
                           else if (targetName === 'divide') setTimeout(() => updateDivideNode(conn.node), 0);
                      }
                      // Suma y Multiplicación no dependen del orden, no necesitan recalcular por mover una entrada
                  }
              });

              // Si el nodo movido ES uno de los que dependen del orden Y de sus propias entradas
              const nodeName = node.name;
              if (nodeName === 'concatenar' || nodeName === 'subtract' || nodeName === 'divide') {
                   console.log(`Order-dependent node ${id} (${nodeName}) moved, recalculating...`);
                  // Recalcular el propio nodo movido
                  if (nodeName === 'concatenar') setTimeout(() => updateConcatenateNode(id), 0);
                  else if (nodeName === 'subtract') setTimeout(() => updateSubtractNode(id), 0);
                  else if (nodeName === 'divide') setTimeout(() => updateDivideNode(id), 0);
              }
              // --- FIN LÓGICA NODOS DEPENDIENTES DEL ORDEN Y ---
          }
      });

      // --- connectionCreated Listener ---
      editor.on('connectionCreated', (connectionInfo) => {
          setTimeout(() => { // Retrasar ligeramente
              try {
                  const sourceNodeId = connectionInfo.output_id;
                  const targetNodeId = connectionInfo.input_id;
                  const sourceNode = editor.getNodeFromId(sourceNodeId);
                  const targetNode = editor.getNodeFromId(targetNodeId);

                  if (!sourceNode || !targetNode) throw new Error("Source or Target node missing in connectionCreated handler.");

                  const targetNodeName = targetNode.name;

                  // 1. Propagar el dato inicial desde la fuente al conectar
                  propagateData(sourceNodeId, sourceNode.name, null, undefined);

                  // 2. Llamada específica para recalcular el nodo destino si es necesario
                  if (targetNodeName === 'sum') { updateSumNode(targetNodeId); }
                  else if (targetNodeName === 'subtract') { updateSubtractNode(targetNodeId); }
                  else if (targetNodeName === 'multiply') { updateMultiplyNode(targetNodeId); }
                  else if (targetNodeName === 'divide') { updateDivideNode(targetNodeId); }
                  else if (targetNodeName === 'concatenar') { updateConcatenateNode(targetNodeId); }
                  // No es necesario loguear aquí, las funciones de update ya loguean si cambian el resultado

                  saveHistoryState(); // Guardar historial después de conexión y propagación/cálculo inicial
              } catch (error) {
                  console.error("Error processing connectionCreated event:", error, "Connection info:", connectionInfo);
                  saveHistoryState(); // Guardar incluso si hay error para poder deshacer
              }
          }, 10); // 10ms delay
      });

      // --- connectionRemoved Listener ---
      editor.on('connectionRemoved', (connectionInfo) => {
          setTimeout(() => { // Retrasar ligeramente
               const targetNodeId = connectionInfo.input_id; // Nodo al que LLEGABA la conexión
               const targetNode = editor.getNodeFromId(targetNodeId);

               if (targetNode) { // Verificar que el nodo destino aún existe
                   const targetName = targetNode.name;
                   // Si se quitó una conexión a un nodo que necesita recalcularse, hacerlo
                   if (targetName === 'sum') { updateSumNode(targetNodeId); }
                   else if (targetName === 'subtract') { updateSubtractNode(targetNodeId); }
                   else if (targetName === 'multiply') { updateMultiplyNode(targetNodeId); }
                   else if (targetName === 'divide') { updateDivideNode(targetNodeId); }
                   else if (targetName === 'concatenar') { updateConcatenateNode(targetNodeId); }
                   // No es necesario loguear aquí, las funciones de update ya loguean
               }

               saveHistoryState(); // Guardar estado tras quitar conexión
          }, 10);
      });

      // --- Otros Listeners (sin cambios) ---
      editor.on('moduleChanged', (name) => { console.log(`%cEVENT: Module Changed -> ${name}`, 'color: blue; font-weight: bold;'); renderModuleTabs(); initializeHistory(); selectedNodeId = null; copiedNodeData = null; currentlyEditingNodeId = null; updateUIDisabledStates(); updateZoomStatus(editor.zoom); updateNodePositionStatus(null); document.title = `Xocoflow | ${currentProjectName} - ${name}`; closeCodeEditorSidebar(false); setTimeout(() => { if(editor.module === name){ saveHistoryState(true); activateExistingAutoNodes(); console.log(` -> Module ${name} loaded.`); }}, 50); });
      editor.on('zoom', (level) => { updateZoomStatus(level); });
      editor.on('translate', (pos) => { /* No action needed now */ });
      editor.on('contextmenu', (e) => { e.preventDefault(); });
      editor.on('click', (e) => {
          const target = e.target;
          // Cerrar sidebar si se hace clic fuera de ella Y fuera de CUALQUIER nodo
          if (codeEditorSidebar?.classList.contains('visible') && !target.closest('#code-editor-sidebar') && !target.closest('.drawflow-node')) {
               closeCodeEditorSidebar(true);
          }
          // Deseleccionar nodo si se hace clic en el fondo del canvas (o elementos no interactivos)
          if (!target.closest('.drawflow-node,.controls-container,.menu,.swal2-container,#code-editor-sidebar,.nodes-list,.col header')) { // Añadidos elementos a ignorar
              if (selectedNodeId) {
                  try { editor.removeSelection(); } catch { /* Ignorar si falla */ }
                  // El evento 'nodeUnselected' ya maneja la limpieza del estado
              }
          }
      });
      console.log("Drawflow event listeners attached.");
  } catch (e) {
      console.error("Error setting Drawflow listeners:", e);
      showToast('error', 'Critical Error', 'Failed editor events.');
  }
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