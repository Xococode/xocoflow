// === START OF COMPLETE xocoflow_logic.js ===
// Version: 1.7.6 - Node Resizing and Enhanced Auto Replace
"use strict";

console.log("Xocoflow Script: Initializing (v1.7.6)...");

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
let customContextMenu = null; 

// --- Node Resizing State ---
let isResizingNode = false;
let resizingNodeInfo = {
    id: null,
    initialMouseX: 0,
    initialMouseY: 0,
    initialNodeWidth: 0,
    initialNodeHeight: 0,
    resizerElement: null
};


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

// --- Node Movement Lock ---
function getOrCreateLockIndicator(titleBoxElement) {
    if (!titleBoxElement) return null;
    let indicator = titleBoxElement.querySelector('.lock-indicator');
    if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = 'lock-indicator';
        titleBoxElement.appendChild(indicator);
    }
    return indicator;
}

function updateNodeVisualLockState(nodeId, isLocked) {
    if (!editor) return;
    try {
        const nodeElement = document.getElementById(`node-${nodeId}`);
        if (!nodeElement) return;
        const titleBox = nodeElement.querySelector('.title-box');
        if (!titleBox) return;
        const indicator = getOrCreateLockIndicator(titleBox);
        if (!indicator) return;

        if (isLocked) {
            indicator.innerHTML = '<i class="fas fa-lock"></i>';
            indicator.title = 'Movimiento Bloqueado';
            indicator.classList.add('locked');
        } else {
            indicator.innerHTML = '<i class="fas fa-lock-open"></i>';
            indicator.title = 'Movimiento Desbloqueado';
            indicator.classList.remove('locked');
        }
    } catch (error) {
        console.error(`Error updating visual lock state for node ${nodeId}:`, error);
    }
}

function setNodeMovementLock(nodeId, lockState) {
    if (!editor || !nodeId) return;
    try {
        const node = editor.getNodeFromId(nodeId);
        if (!node) { console.error(`setNodeMovementLock: Node ${nodeId} not found.`); return; }
        const currentData = node.data || {};
        const currentLockState = currentData.isMovementLocked === true;
        if (currentLockState === lockState) return;

        const newData = { ...currentData, isMovementLocked: lockState };
        editor.updateNodeDataFromId(nodeId, newData);
        updateNodeVisualLockState(nodeId, lockState);
        saveHistoryState();
        console.log(`Node ${nodeId} movement ${lockState ? 'LOCKED' : 'UNLOCKED'}`);
    } catch (error) {
        console.error(`Error setting movement lock for node ${nodeId}:`, error);
    }
}

function toggleNodeMovementLock(nodeId) {
    if (!editor || !nodeId) return;
    try {
        const node = editor.getNodeFromId(nodeId);
        if (!node) { console.error(`toggleNodeMovementLock: Node ${nodeId} not found.`); return; }
        const currentData = node.data || {};
        const currentLockState = currentData.isMovementLocked === true;
        setNodeMovementLock(nodeId, !currentLockState);
    } catch (error) {
        console.error(`Error toggling movement lock for node ${nodeId}:`, error);
    }
}

// --- Custom Context Menu ---
function showCustomContextMenu(event, nodeId) {
    event.preventDefault();
    event.stopPropagation();
    hideCustomContextMenu();

    const node = editor.getNodeFromId(nodeId);
    if (!node) return;
    const currentData = node.data || {};
    const isNodeLocked = currentData.isMovementLocked === true;

    customContextMenu = document.createElement('div');
    customContextMenu.className = 'custom-context-menu';
    const ul = document.createElement('ul');

    const lockLi = document.createElement('li');
    lockLi.innerHTML = `<i class="fas ${isNodeLocked ? 'fa-lock-open' : 'fa-lock'}"></i> <span>${isNodeLocked ? 'Desbloquear Movimiento' : 'Bloquear Movimiento'}</span>`;
    lockLi.onclick = (e) => { e.stopPropagation(); toggleNodeMovementLock(nodeId); hideCustomContextMenu(); };
    ul.appendChild(lockLi);

    const hr = document.createElement('hr');
    ul.appendChild(hr);

    const deleteLi = document.createElement('li');
    deleteLi.innerHTML = '<i class="fas fa-trash-alt"></i> <span>Eliminar Nodo</span>';
    deleteLi.onclick = (e) => {
        e.stopPropagation();
        if (isLocked()) { showToast('warning', 'Editor Bloqueado', 'Desbloquea el editor para eliminar nodos.'); hideCustomContextMenu(); return; }
        editor.removeNodeId(`node-${nodeId}`);
        hideCustomContextMenu();
    };
    ul.appendChild(deleteLi);

    customContextMenu.appendChild(ul);
    document.body.appendChild(customContextMenu);

    const { clientX: mouseX, clientY: mouseY } = event;
    const menuRect = customContextMenu.getBoundingClientRect();
    let x = mouseX;
    let y = mouseY;
    if (mouseX + menuRect.width > window.innerWidth) x = window.innerWidth - menuRect.width - 5;
    if (mouseY + menuRect.height > window.innerHeight) y = window.innerHeight - menuRect.height - 5;
    if (x < 0) x = 5;
    if (y < 0) y = 5;
    customContextMenu.style.top = `${y}px`;
    customContextMenu.style.left = `${x}px`;

    setTimeout(() => {
        document.addEventListener('click', handleClickOutsideContextMenu, true);
        document.addEventListener('contextmenu', handleClickOutsideContextMenu, true);
    }, 0);
}

function hideCustomContextMenu() {
    if (customContextMenu) {
        customContextMenu.remove();
        customContextMenu = null;
        document.removeEventListener('click', handleClickOutsideContextMenu, true);
        document.removeEventListener('contextmenu', handleClickOutsideContextMenu, true);
    }
}

function handleClickOutsideContextMenu(event) {
    if (customContextMenu && !customContextMenu.contains(event.target)) {
        if (event.type === 'contextmenu' && event.target.closest('.drawflow-node')) return;
        hideCustomContextMenu();
    }
}

// --- Node Resizing Logic ---
function startNodeResize(event, nodeId, resizerElement) {
    if (isLocked()) return; // General editor lock
    // Check specific node movement lock (optional: decide if resize is also locked)
    // const nodeData = editor.getNodeFromId(nodeId)?.data;
    // if (nodeData?.isMovementLocked === true) return;

    event.preventDefault();
    event.stopPropagation();

    isResizingNode = true;
    resizingNodeInfo.id = nodeId;
    resizingNodeInfo.resizerElement = resizerElement; // Store which resizer was clicked

    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (!nodeElement) { isResizingNode = false; return; }

    resizingNodeInfo.initialMouseX = event.clientX;
    resizingNodeInfo.initialMouseY = event.clientY;
    resizingNodeInfo.initialNodeWidth = nodeElement.offsetWidth;
    resizingNodeInfo.initialNodeHeight = nodeElement.offsetHeight;

    document.addEventListener('mousemove', duringNodeResize);
    document.addEventListener('mouseup', stopNodeResize);
    document.body.classList.add('body-resizing-node');
    if (drawflowElement) drawflowElement.style.userSelect = 'none';
}

function duringNodeResize(event) {
    if (!isResizingNode || !resizingNodeInfo.id) return;
    event.preventDefault();
    
    const nodeElement = document.getElementById(`node-${resizingNodeInfo.id}`);
    if (!nodeElement) return;

    const zoomFactor = editor.zoom || 1;
    const deltaX = (event.clientX - resizingNodeInfo.initialMouseX) / zoomFactor;
    const deltaY = (event.clientY - resizingNodeInfo.initialMouseY) / zoomFactor;

    let newWidth = resizingNodeInfo.initialNodeWidth + deltaX;
    let newHeight = resizingNodeInfo.initialNodeHeight + deltaY;

    const minWidth = 100; 
    const minHeight = 60;
    if (newWidth < minWidth) newWidth = minWidth;
    if (newHeight < minHeight) newHeight = minHeight;

    nodeElement.style.width = `${newWidth}px`;
    nodeElement.style.height = `${newHeight}px`;
    editor.updateConnectionNodes(`node-${resizingNodeInfo.id}`);
}

function stopNodeResize() {
    if (!isResizingNode || !resizingNodeInfo.id) return;

    const nodeElement = document.getElementById(`node-${resizingNodeInfo.id}`);
    if (nodeElement) {
        const finalWidth = nodeElement.offsetWidth;
        const finalHeight = nodeElement.offsetHeight;
        try {
            const nodeData = editor.getNodeFromId(resizingNodeInfo.id)?.data || {};
            editor.updateNodeDataFromId(resizingNodeInfo.id, {
                ...nodeData,
                nodeWidth: `${finalWidth}px`,
                nodeHeight: `${finalHeight}px`
            });
            console.log(`Node ${resizingNodeInfo.id} resized to: ${finalWidth}px x ${finalHeight}px`);
        } catch (e) { console.error("Error updating node data after resize:", e); }
    }

    isResizingNode = false;
    resizingNodeInfo.id = null;
    resizingNodeInfo.resizerElement = null;

    document.removeEventListener('mousemove', duringNodeResize);
    document.removeEventListener('mouseup', stopNodeResize);
    document.body.classList.remove('body-resizing-node');
    if (drawflowElement) drawflowElement.style.userSelect = '';
    saveHistoryState();
}

// --- Base Node Definitions ---
const baseNodeDefinitions = {
    'texto': { name: 'texto', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-paragraph"></i> Texto</div><div class="box"><label>Contenido:</label><textarea df-content readonly style="height: 80px;" placeholder="..."></textarea><button type="button" class="edit-code-btn" onclick="openEditorForNode(event)"><i class="fas fa-edit"></i> Editar Contenido</button><p class="help-text">Edita en panel lateral.</p></div></div>`, cssClass: 'text-node', data: { content: '' } },
    'concatenar': { name: 'concatenar', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-link"></i> Concatenar</div><div class="box" style="text-align: center; font-size: 11px; color: #777; padding: 20px 5px;">Concatena entradas<br>(orden Y)<input type="hidden" df-result></div></div>`, cssClass: 'concatenate-node', data: { result: '' } },
    'mostrarPasar': { name: 'mostrarPasar', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-eye"></i> Mostrar y Pasar</div><div class="box"><label>Resultado:</label><textarea df-result readonly style="height: 60px;"></textarea><button type="button" onclick="selectAllText(event)" style="margin-top: 5px;">Seleccionar Todo</button><p class="help-text">Muestra y pasa datos.</p></div></div>`, cssClass: 'display-node', data: { result: '' } },
    'nota': { name: 'nota', inputs: 0, outputs: 0, html: `<div> <div class="title-box"><i class="fas fa-sticky-note"></i> Nota</div> <div class="box"> <div class="color-picker"> <label for="note-color-select-{{id}}">Color:</label> <select id="note-color-select-{{id}}" df-notecolor onchange="changeNoteColor(event)"> <option value="#ffffcc">Amarillo</option> <option value="#ccffcc">Verde</option> <option value="#ffcccc">Rojo</option> <option value="#ccccff">Azul</option> <option value="#e0e0e0">Gris</option> </select> </div> <textarea df-notecontent oninput="handleNodeDataChange(event); updateCharacterCount(event)" style="height: 120px;" placeholder="Notas..."></textarea> <div class="text-info"> <span df-charcount>0</span> chars </div> </div> <div class="node-resizer" title="Redimensionar Nota"><i class="fas fa-expand-alt"></i></div></div>`, cssClass: 'note-node resizable-node-class', data: { notecontent: '', notecolor: '#ffffcc', charcount: '0', nodeWidth: '180px', nodeHeight: 'auto' } },
    'imagen': { name: 'imagen', inputs: 0, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-image"></i> Imagen HTML</div><div class="box"><div style="margin-bottom: 8px;"><button type="button" onclick="selectImageFile(event)">Seleccionar Local</button><span df-filename></span></div><img df-previewsrc src="" alt="Previa" style="display: none; max-width:100%; max-height:80px; object-fit:contain;"><label>URL:</label><input type="text" df-imgsrc oninput="handleImageInputChange(event)"><label>Alt:</label><input type="text" df-imgalt oninput="handleImageInputChange(event)"><label>Ancho:</label><input type="text" df-imgwidth oninput="handleImageInputChange(event)" placeholder="100px"><label>Alto:</label><input type="text" df-imgheight oninput="handleImageInputChange(event)"><p class="help-text">Salida: &lt;img&gt;</p><input type="hidden" df-outputhtml></div><div class="node-resizer" title="Redimensionar"><i class="fas fa-expand-alt"></i></div></div>`, cssClass: 'image-node resizable-node-class', data: { filename: '', previewsrc: '', imgsrc: '', imgalt: '', imgwidth: '', imgheight: '', outputhtml: '', nodeWidth: '240px', nodeHeight: 'auto' } },
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
    'javascript_code': { name: 'javascript_code', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fab fa-js-square"></i> Código JS</div><div class="box"><label>Código:</label><textarea df-jscode readonly style="height: 100px;" placeholder="// ..."></textarea><button type="button" class="edit-code-btn" onclick="openEditorForNode(event)"><i class="fas fa-edit"></i> Editar</button><div class="node-buttons"><button type="button" onclick="executeJsNode(event)"><i class="fas fa-play"></i> Ejecutar</button><button type="button" onclick="resetJsNodeResult(event)"><i class="fas fa-redo"></i> Reset</button></div><label>Resultado:</label><textarea df-result readonly style="height: 60px;"></textarea></div><div class="node-resizer" title="Redimensionar"><i class="fas fa-expand-alt"></i></div></div>`, cssClass: 'javascript-code-node resizable-node-class', data: { jscode: "return input;", result: '', lastInput: null, nodeWidth: '260px', nodeHeight: 'auto' } },
    'static_code_snippet': { name: 'static_code_snippet', inputs: 1, outputs: 1, html: `<div><div class="title-box"><i class="fas fa-code"></i> Código Estático</div><div class="box"><label>Código:</label><textarea df-codecontent readonly style="height: 120px;" placeholder="<!-- ... -->"></textarea><button type="button" class="edit-code-btn" onclick="openEditorForNode(event)"><i class="fas fa-edit"></i> Editar</button><p class="help-text">Bloque estático. Edita con panel.</p></div><div class="node-resizer" title="Redimensionar"><i class="fas fa-expand-alt"></i></div></div>`, cssClass: 'static-code-node resizable-node-class', data: { codecontent: '', nodeWidth: '260px', nodeHeight: 'auto' } },
    'local_image': {
        name: 'local_image', inputs: 0, outputs: 0,
        html: `<div> <div class="title-box"><i class="fas fa-image"></i> Imagen Local</div> <div class="box"> <button type="button" onclick="selectLocalImageFile(event)" style="width:100%; margin-bottom: 8px;"><i class="fas fa-upload"></i> Cargar Imagen</button> <div class="image-preview-container" style="margin-bottom: 8px; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; background-color: #f9f9f9; overflow: hidden;"> <img df-imagesrc src="" alt="Previa Imagen" style="display: none; max-width: 100%; max-height:100%; width:auto; height:auto; object-fit: contain;" /> <span class="placeholder-text" style="color: #aaa; font-size: 11px; text-align: center; padding: 10px;">No hay imagen</span> </div> <span df-filename style="font-size: 10px; color: #777; display: block; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Nombre del archivo"></span> <details style="margin-bottom: 8px;"> <summary style="font-size: 10px; cursor: pointer; color: #555; font-weight:bold;">Tamaño Imagen Interna</summary> <div style="display: flex; gap: 5px; margin-top: 5px;"> <div style="flex: 1;"><label style="font-size: 10px;">Ancho Img:</label><input type="text" df-imagewidth oninput="updateLocalImageStyle(event)" placeholder="100%" style="font-size:11px; height: 24px; padding: 2px 4px;"></div> <div style="flex: 1;"><label style="font-size: 10px;">Alto Img:</label><input type="text" df-imageheight oninput="updateLocalImageStyle(event)" placeholder="auto" style="font-size:11px; height: 24px; padding: 2px 4px;"></div> </div><p class="help-text" style="margin-top: 2px;">Imagen dentro del nodo (ej: 100%, 150px)</p> </details> <details open style="margin-bottom: 8px;"> <summary style="font-size: 10px; cursor: pointer; color: #555; font-weight:bold;">Tamaño Nodo Contenedor</summary> <div style="display: flex; gap: 5px; margin-top: 5px;"> <div style="flex: 1;"><label style="font-size: 10px;">Ancho Nodo:</label><input type="text" df-nodewidth oninput="updateLocalNodeSize(event)" placeholder="240px" style="font-size:11px; height: 24px; padding: 2px 4px;"></div> <div style="flex: 1;"><label style="font-size: 10px;">Alto Nodo:</label><input type="text" df-nodeheight oninput="updateLocalNodeSize(event)" placeholder="auto" style="font-size:11px; height: 24px; padding: 2px 4px;"></div> </div><p class="help-text" style="margin-top: 2px;">Nodo completo (ej: 300px, auto)</p> </details> </div> <div class="node-resizer" title="Redimensionar"><i class="fas fa-expand-alt"></i></div> </div>`,
        cssClass: 'local-image-node resizable-node-class',
        data: { imagesrc: '', filename: '', imagewidth: '100%', imageheight: 'auto', nodewidth: '240px', nodeheight: 'auto' }
    },
    'input_number': { name: 'input_number', inputs: 0, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-hashtag"></i> Número</div> <div class="box"> <label>Valor numérico:</label> <input type="number" df-number value="0" oninput="handleNodeDataChange(event)"> </div> </div>`, cssClass: 'number-input-node', data: { number: 0 } },
    'input_text': { name: 'input_text', inputs: 0, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-font"></i> Texto</div> <div class="box"> <label>Texto:</label> <input type="text" df-text value="" placeholder="..." oninput="handleNodeDataChange(event)"> </div> </div>`, cssClass: 'text-input-node', data: { text: '' } },
    'input_range': { name: 'input_range', inputs: 0, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-sliders-h"></i> Slider</div> <div class="box"> <label>Valor:</label> <input type="range" df-range min="0" max="100" value="50" oninput="handleNodeDataChange(event); this.nextElementSibling.textContent = this.value;"> <span df-rangeval>50</span> </div> </div>`, cssClass: 'range-input-node', data: { range: 50, rangeval: "50" } },
    'input_date': { name: 'input_date', inputs: 0, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-calendar-alt"></i> Fecha</div> <div class="box"> <label>Selecciona fecha:</label> <input type="date" df-date oninput="handleNodeDataChange(event)"> </div> </div>`, cssClass: 'date-input-node', data: { date: '' } },
    'input_time': { name: 'input_time', inputs: 0, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-clock"></i> Hora</div> <div class="box"> <label>Selecciona hora:</label> <input type="time" df-time oninput="handleNodeDataChange(event)"> </div> </div>`, cssClass: 'time-input-node', data: { time: '' } },
    'input_color': { name: 'input_color', inputs: 0, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-palette"></i> Color</div> <div class="box"> <label>Elige color:</label> <input type="color" df-color value="#ff0000" oninput="handleNodeDataChange(event)"> </div> </div>`, cssClass: 'color-input-node', data: { color: '#ff0000' } },
    'text_replace': { name: 'text_replace', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-exchange-alt"></i> Reemplazar</div> <div class="box"> <label>Buscar:</label> <input type="text" df-find placeholder="texto a buscar" oninput="handleNodeDataChange(event)"> <label>Reemplazar con:</label> <input type="text" df-replace placeholder="nuevo texto" oninput="handleNodeDataChange(event)"> <div style="margin-top:10px;"> <label>Resultado:</label> <textarea df-result readonly style="height: 60px; width: 100%; background-color: var(--background-readonly);"></textarea> </div> </div> </div>`, cssClass: 'text-replace-node', data: { find: '', replace: '', lastInput: null, result: '' } },
    'text_split': { name: 'text_split', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-cut"></i> Dividir</div> <div class="box"> <label>Separador:</label> <input type="text" df-separator placeholder="," oninput="handleNodeDataChange(event)"> <textarea df-result readonly style="height: 60px;"></textarea> </div> </div>`, cssClass: 'text-split-node', data: { separator: '', result: '', lastInput: null } },
    'text_uppercase': { name: 'text_uppercase', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-arrow-up"></i> Mayúsculas</div> <div class="box"> <p class="help-text">Convierte texto de entrada a MAYÚSCULAS.</p> <textarea df-result readonly style="height: 60px;"></textarea> </div> </div>`, cssClass: 'text-uppercase-node', data: { result: '', lastInput: null } },
    'text_lowercase': { name: 'text_lowercase', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-arrow-down"></i> Minúsculas</div> <div class="box"> <p class="help-text">Convierte texto de entrada a minúsculas.</p> <textarea df-result readonly style="height: 60px;"></textarea> </div> </div>`, cssClass: 'text-lowercase-node', data: { result: '', lastInput: null } },
    'text_length': { name: 'text_length', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-align-justify"></i> Longitud</div> <div class="box"> <p class="help-text">Calcula longitud del texto de entrada.</p> <input type="number" df-result readonly> </div> </div>`, cssClass: 'text-length-node', data: { result: 0, lastInput: null } },
    'html_strip': { name: 'html_strip', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-code"></i> Strip HTML</div> <div class="box"> <p class="help-text">Elimina etiquetas HTML del texto de entrada.</p> <textarea df-result readonly style="height: 60px;"></textarea> </div> </div>`, cssClass: 'html-strip-node', data: { result: '', lastInput: null } },
    'input_json': { name: 'input_json', inputs: 0, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-database"></i> Input JSON</div> <div class="box"> <label>Valor (JSON):</label> <textarea df-json placeholder='{"clave": 123, "arr": [1,2,3] }' style="width:100%; height:80px;" oninput="handleJsonInputChange(event)" ></textarea> </div> </div>`, cssClass: 'json-input-node', data: { json: '{}', lastInput: null } },
    'sum': { name: 'sum', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-plus"></i> Suma</div> <div class="box"> <label>Resultado:</label> <textarea df-result readonly style="height: 40px; text-align:right; font-weight:bold; font-size: 1.1em; padding: 5px 8px;" placeholder="0"></textarea> <p class="help-text" style="font-size:10px; text-align:center; margin-top: 5px;">Suma todas las entradas numéricas.</p> </div> </div>`, cssClass: 'sum-node', data: { result: 0 } },
    'subtract': { name: 'subtract', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-minus"></i> Resta</div> <div class="box"> <label>Resultado:</label> <textarea df-result readonly style="height: 40px; text-align:right; font-weight:bold; font-size: 1.1em; padding: 5px 8px;" placeholder="0"></textarea> <p class="help-text" style="font-size:10px; text-align:center; margin-top: 5px;">Resta entradas (orden Y).</p> </div> </div>`, cssClass: 'subtract-node', data: { result: 0 } },
    'multiply': { name: 'multiply', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-times"></i> Multiplicación</div> <div class="box"> <label>Resultado:</label> <textarea df-result readonly style="height: 40px; text-align:right; font-weight:bold; font-size: 1.1em; padding: 5px 8px;" placeholder="1"></textarea> <p class="help-text" style="font-size:10px; text-align:center; margin-top: 5px;">Multiplica entradas.</p> </div> </div>`, cssClass: 'multiply-node', data: { result: 1 } },
    'divide': { name: 'divide', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-divide"></i> División</div> <div class="box"> <label>Resultado:</label> <textarea df-result readonly style="height: 40px; text-align:right; font-weight:bold; font-size: 1.1em; padding: 5px 8px;" placeholder="N/A"></textarea> <p class="help-text" style="font-size:10px; text-align:center; margin-top: 5px;">Divide entradas (orden Y).</p> </div> </div>`, cssClass: 'divide-node', data: { result: NaN } },
    'image_minimal': { name: 'image_minimal', inputs: 0, outputs: 0, html: `<div class="image-minimal-content" role="img" aria-label="Imagen cargada"> <div class="image-placeholder" title="Haz clic, pega o arrastra una imagen aquí"> <i class="fas fa-image"></i> <span>Cargar Imagen</span> </div> <img df-imgsrc src="" alt="Imagen cargada" style="display: none;" /> <div class="node-resizer" title="Redimensionar Imagen"><i class="fas fa-expand-alt"></i></div> </div>`, cssClass: 'image-minimal-node resizable-node-class', data: { imgsrc: '', naturalWidth: 0, naturalHeight: 0, nodeWidth: '80px', nodeHeight: '60px' } }, // nodeWidth/Height para tamaño inicial
    'template_engine': { name: 'template_engine', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-file-invoice"></i> Plantilla</div> <div class="box"> <p class="help-text" style="font-size: 10px; margin-bottom: 8px;"> Usa <code>{{variable}}</code> o <code>{{objeto.propiedad}}</code> para insertar valores del JSON de entrada. </p> <label for="node-{{id}}-template">Plantilla:</label> <textarea id="node-{{id}}-template" df-template style="height: 120px; font-family: var(--font-family-code); font-size: 12px;" placeholder="Hola {{nombre}}, \n\nTu pedido {{pedido.id}} está listo." oninput="handleNodeDataChange(event)"></textarea> <label for="node-{{id}}-result" style="margin-top:10px;">Resultado:</label> <textarea id="node-{{id}}-result" df-result readonly style="height: 80px; font-size: 12px; background-color: var(--background-readonly);"></textarea> </div> <div class="node-resizer" title="Redimensionar"><i class="fas fa-expand-alt"></i></div> </div>`, cssClass: 'template-node resizable-node-class', data: { template: '', lastInput: null, result: '', nodeWidth: '250px', nodeHeight: 'auto' } },
    'manual_text_replace': { name: 'manual_text_replace', inputs: 0, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-highlighter"></i> Reemplazo Manual</div> <div class="box"> <label>Texto Original:</label> <textarea df-original style="height: 80px;" placeholder="Pega o escribe el texto aquí..."></textarea> <label>Buscar:</label> <input type="text" df-find placeholder="Texto a buscar"> <label>Reemplazar con:</label> <input type="text" df-replace placeholder="Nuevo texto"> <button type="button" onclick="executeManualReplace(event)" style="width: 100%; margin-top: 10px; padding: 8px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;"> <i class="fas fa-check"></i> Aplicar Reemplazo y Ver Resultado </button> <div style="margin-top:10px;"> <label>Resultado:</label> <textarea df-result readonly style="height: 60px; width: 100%; background-color: var(--background-readonly);"></textarea> </div> </div> <div class="node-resizer" title="Redimensionar"><i class="fas fa-expand-alt"></i></div> </div>`, cssClass: 'manual-replace-node resizable-node-class', data: { original: '', find: '', replace: '', result: '', nodeWidth: '260px', nodeHeight: 'auto' } },
    'auto_text_replace': {
        name: 'auto_text_replace',
        inputs: 2, // Ahora 2 entradas
        outputs: 1,
        html: `
          <div>
            <div class="title-box"><i class="fas fa-magic"></i> Reemplazo Automático</div>
            <div class="box">
              <label>Texto Original (Recibido por Input 1):</label>
              <textarea df-lastInput readonly style="height: 45px; width: 100%; background-color: #e9ecef; color: #495057; font-size: 11px; margin-bottom: 8px;" placeholder="(Esperando texto por Input 1)"></textarea>
              <label>Buscar:</label>
              <input type="text" df-find placeholder="Texto a buscar" oninput="handleNodeDataChange(event)">
              <label>Reemplazar con:</label>
              <input type="text" df-replace placeholder="Nuevo texto" oninput="handleNodeDataChange(event)">
              <p class="help-text" style="font-size: 10px; margin-top: 5px;"> Input 1: Texto a procesar.<br> Input 2: Disparador (trigger) para re-procesar. </p>
              <div style="margin-top:10px;"> <label>Resultado:</label> <textarea df-result readonly style="height: 60px; width: 100%; background-color: var(--background-readonly);"></textarea> </div>
            </div>
            <div class="node-resizer" title="Redimensionar"><i class="fas fa-expand-alt"></i></div>
          </div>`,
        cssClass: 'auto-replace-node resizable-node-class',
        data: { find: '', replace: '', lastInput: '', result: '', nodeWidth: '260px', nodeHeight: 'auto' }
    },
    'hybrid_text_replace': { name: 'hybrid_text_replace', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-edit"></i> Reemplazo Híbrido</div> <div class="box"> <label>Texto Original (Prioriza Input 1 si está conectado):</label> <textarea df-original style="height: 60px;" placeholder="Escribe aquí o conecta Input 1..."></textarea> <input type="hidden" df-lastInput> <label>Buscar:</label> <input type="text" df-find placeholder="Texto a buscar"> <label>Reemplazar con:</label> <input type="text" df-replace placeholder="Nuevo texto"> <button type="button" onclick="executeHybridReplace(event)" style="width: 100%; margin-top: 10px; padding: 8px; background-color: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer;"> <i class="fas fa-check"></i> Aplicar Reemplazo Manualmente </button> <div style="margin-top:10px;"> <label>Resultado:</label> <textarea df-result readonly style="height: 60px; width: 100%; background-color: var(--background-readonly);"></textarea> </div> </div> <div class="node-resizer" title="Redimensionar"><i class="fas fa-expand-alt"></i></div> </div>`, cssClass: 'hybrid-replace-node resizable-node-class', data: { original: '', find: '', replace: '', lastInput: null, result: '', nodeWidth: '260px', nodeHeight: 'auto' } },
    'nodo_seleccion_verde': { name: 'nodo_seleccion_verde', title: 'Nodo Selección Verde', inputs: 1, outputs: 1, html: `<div> <div class="title-box"><i class="fas fa-leaf"></i> Selección Verde</div> <div class="box"> <p style="text-align: center; padding: 10px 0;"> Este nodo se pone verde<br>cuando lo seleccionas. </p> <input type="text" df-sampledata placeholder="Dato de ejemplo..."> </div> <div class="node-resizer" title="Redimensionar"><i class="fas fa-expand-alt"></i></div></div>`, cssClass: 'green-selectable-node resizable-node-class', data: { sampledata: '', nodeWidth: '240px', nodeHeight: 'auto' } },
    'nodo_seleccion_rojo_claro': { name: 'nodo_seleccion_rojo_claro', title: 'Nodo Selección Rojo Claro', inputs: 1, outputs: 0, html: `<div> <div class="title-box"><i class="fas fa-fire-alt"></i> Selección Rojo Claro</div> <div class="box"> <p style="text-align: center; padding: 10px 0;"> Este nodo se pone rojo claro<br>cuando lo seleccionas. </p> <input type="number" df-priority placeholder="Prioridad (ej: 1-5)"> </div> <div class="node-resizer" title="Redimensionar"><i class="fas fa-expand-alt"></i></div></div>`, cssClass: 'light-red-selectable-node base-style-for-red-node resizable-node-class', data: { priority: null, nodeWidth: '250px', nodeHeight: 'auto' } },
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






/**
 * Ejecuta la lógica de reemplazo para el nodo 'hybrid_text_replace'.
 * Se llama al hacer clic en el botón dentro del nodo.
 * Prioriza el texto recibido por conexión (lastInput) sobre el escrito (original).
 */
function executeHybridReplace(event) {
    const id = getNodeIdFromEvent(event);
    if (!id) return;

    console.log(`--- Executing Hybrid Replace Node ${id} ---`);
    const node = editor.getNodeFromId(id);

    if (!node || node.name !== 'hybrid_text_replace') {
        console.error(`Hybrid Replace (${id}): Node not found or invalid type.`);
        return;
    }

    // Determinar qué texto original usar:
    // Prioridad: Si lastInput NO es null/undefined (llegó algo por cable), usarlo.
    // Fallback: Usar el texto del campo df-original.
    const hasInputConnectionData = (node.data.lastInput !== null && node.data.lastInput !== undefined);
    const sourceText = hasInputConnectionData ? String(node.data.lastInput) : (node.data.original ?? '');

    // Leer find y replace actuales
    const findText = node.data.find ?? '';
    const replaceText = node.data.replace ?? '';

    // console.log(`   Source Text Used: "${sourceText}" (Input Connection Used: ${hasInputConnectionData})`);
    // console.log(`   Find Text from node.data: "${findText}"`);
    // console.log(`   Replace Text from node.data: "${replaceText}"`);

    let resultText;
    if (findText) {
        try {
            // console.log(`   >>> Attempting: String("${sourceText}").split("${findText}").join("${replaceText}")`);
            resultText = sourceText.split(findText).join(replaceText);
        } catch (e) {
            console.error(`Hybrid Replace (${id}): Error during split/join - ${e.message}`);
            resultText = `Error: ${e.message}`;
        }
    } else {
        resultText = sourceText;
        // console.log("   Find text is empty, result is the original input.");
    }

    // console.log(`   >>> Calculated resultText: "${resultText}"`);

    // Actualizar el nodo (UI y datos) y propagar el resultado
    updateNodeResult(id, resultText); // Usa la misma función de antes

    // console.log(`--- Finished Hybrid Replace Node ${id} ---`);
}































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




// ==========================================================
// ====> PUEDES PEGAR LA NUEVA FUNCIÓN AQUÍ <====
// ==========================================================
/**
 * Ejecuta la lógica de reemplazo para el nodo 'manual_text_replace'.
 * Se llama al hacer clic en el botón dentro del nodo.
 * Lee todos los valores necesarios directamente desde los datos del nodo en ese momento.
 */
function executeManualReplace(event) {
    const id = getNodeIdFromEvent(event); // Obtiene el ID del nodo desde el evento del botón
    if (!id) return;

    // console.log(`--- Executing Manual Replace Node ${id} ---`);
    const node = editor.getNodeFromId(id);

    // Validar que el nodo existe y es del tipo correcto
    if (!node || node.name !== 'manual_text_replace') {
        console.error(`Manual Replace (${id}): Node not found or invalid type.`);
        return;
    }

    // Leer los valores DIRECTAMENTE de node.data en el momento del clic
    const originalText = node.data.original ?? '';
    const findText = node.data.find ?? '';
    const replaceText = node.data.replace ?? '';

    // console.log(`   Original Text from node.data: "${originalText}"`);
    // console.log(`   Find Text from node.data: "${findText}"`);
    // console.log(`   Replace Text from node.data: "${replaceText}"`);

    let resultText;

    // Realizar el reemplazo (solo si 'findText' no está vacío)
    if (findText) {
        try {
            // console.log(`   >>> Attempting: String("${originalText}").split("${findText}").join("${replaceText}")`);
            resultText = originalText.split(findText).join(replaceText);
        } catch (e) {
            console.error(`Manual Replace (${id}): Error during split/join - ${e.message}`);
            resultText = `Error: ${e.message}`;
        }
    } else {
        // Si 'findText' está vacío, el resultado es el texto original
        resultText = originalText;
        // console.log("   Find text is empty, result is the original input.");
    }

    // console.log(`   >>> Calculated resultText: "${resultText}"`);

    // Actualizar el nodo (UI y datos) y propagar el resultado
    updateNodeResult(id, resultText); // Actualiza UI (df-result), node.data.result, propaga y guarda historial

    // console.log(`--- Finished Manual Replace Node ${id} ---`);
}
// ==========================================================
// ====> FIN DE LA NUEVA FUNCIÓN <====
// ==========================================================




// --- Añade esta nueva función de ejecución ---
/**
 * Ejecuta la lógica de reemplazo para el nodo 'auto_text_replace'.
 * Puede ser llamado por la llegada de nuevo input o por cambios en find/replace.
 * @param {string} nodeId - El ID del nodo.
 * @param {*} inputTextValue - El texto sobre el cual se realizará el reemplazo (normalmente node.data.lastInput).
 */
function executeAutoReplace(nodeId, inputTextValue) {
    // console.log(`--- Executing Auto Replace Node ${nodeId} ---`);
    const node = editor.getNodeFromId(nodeId);

    if (!node || node.name !== 'auto_text_replace') {
        console.error(`Auto Replace (${nodeId}): Node not found or invalid type.`);
        return;
    }

    // Leer los valores ACTUALES de find y replace desde node.data
    const findText = node.data.find ?? '';
    const replaceText = node.data.replace ?? '';
    // Convertir el valor de entrada a string (maneja null/undefined)
    const currentInputText = String(inputTextValue ?? '');

    // console.log(`   Input Text for Processing: "${currentInputText}"`);
    // console.log(`   Find Text from node.data: "${findText}"`);
    // console.log(`   Replace Text from node.data: "${replaceText}"`);

    let resultText;
    // Realizar el reemplazo (solo si 'findText' no está vacío)
    if (findText) {
        try {
            // console.log(`   >>> Attempting: String("${currentInputText}").split("${findText}").join("${replaceText}")`);
            resultText = currentInputText.split(findText).join(replaceText);
        } catch (e) {
            console.error(`Auto Replace (${id}): Error during split/join - ${e.message}`);
            resultText = `Error: ${e.message}`;
        }
    } else {
        // Si 'findText' está vacío, el resultado es el texto original
        resultText = currentInputText;
        // console.log("   Find text is empty, result is the original input.");
    }

    // console.log(`   >>> Calculated resultText: "${resultText}"`);

    // Actualizar el nodo (UI y datos) y propagar el resultado
    updateNodeResult(nodeId, resultText); // Actualiza UI(df-result), data.result, propaga y guarda historial (si cambió)

    // console.log(`--- Finished Auto Replace Node ${nodeId} ---`);
}






/**
 * [Simplificado] Ejecuta el reemplazo de texto para un nodo.
 * Realiza un reemplazo global y sensible a mayúsculas.
 * @param {string} nodeId - El ID del nodo.
 * @param {*}    inputText - Texto o dato a procesar.
 */
function executeTextReplace(nodeId, inputTextValue) { // Cambiado nombre de variable para claridad
    // console.log(`--- Executing Text Replace Node ${nodeId} ---`);
    const node = editor.getNodeFromId(nodeId);

    if (!node || node.name !== 'text_replace') {
        console.error(`Text Replace (${nodeId}): Node not found or invalid type.`);
        return;
    }

    // Obtener los valores ACTUALES de find y replace desde node.data
    const findText = node.data.find ?? '';
    const replaceText = node.data.replace ?? '';
    // Convertir el valor de entrada a string (maneja null/undefined)
    const currentInputText = String(inputTextValue ?? ''); // Usamos el argumento

    // *** LOGS DE ENTRADA DETALLADOS ***
    // console.log(`   Input Text Received: "${currentInputText}" (Type: ${typeof inputTextValue})`);
    // console.log(`   Find Text from node.data: "${findText}"`);
    // console.log(`   Replace Text from node.data: "${replaceText}"`);
    // *** FIN LOGS DE ENTRADA ***

    let resultText;
    if (findText) {
        try {
            // *** LOG ANTES DE LA OPERACIÓN ***
            // console.log(`   >>> Attempting: String("${currentInputText}").split("${findText}").join("${replaceText}")`);
            // *** FIN LOG ANTES ***
            resultText = currentInputText.split(findText).join(replaceText);
        } catch (e) {
            console.error(`Text Replace (${nodeId}): Error during split/join - ${e.message}`);
            resultText = `Error: ${e.message}`;
        }
    } else {
        resultText = currentInputText;
        // console.log("   Find text is empty, result is the original input.");
    }

    // *** LOG RESULTADO CALCULADO ***
    // console.log(`   >>> Calculated resultText: "${resultText}"`);
    // *** FIN LOG RESULTADO ***

    // Llamar a updateNodeResult para actualizar todo
    updateNodeResult(nodeId, resultText); // Pasamos el resultado calculado
    // console.log(`--- Finished Text Replace Node ${nodeId} ---`);
}

















































































































// --- PEGA ESTA FUNCIÓN ARRIBA DENTRO DE TU ARCHIVO xocoflow_logic.js ---
// --- PUEDES PONERLA CERCA DE LAS OTRAS FUNCIONES DEL NODO LOCAL_IMAGE ---
// --- O EN LA SECCIÓN GENERAL DE "HELPER FUNCTIONS" ---
// Asegúrate de que esta es tu función handleNodeDataChange completa

// --- USA ESTA VERSIÓN COMPLETA Y MODIFICADA ---
// --- USA ESTA VERSIÓN FINAL ---
function handleNodeDataChange(event) {
    if (!editor || !event?.target) return;
    const el = event.target;
    const nodeEl = el.closest('.drawflow-node');
    if (!nodeEl) return;
    const id = nodeEl.id.split('-')[1];
    const node = editor.getNodeFromId(id); // Obtener nodo para verificar datos iniciales si es necesario
    if (!node) return;
    let key = null;
    // Buscar el atributo df-*
    for (const attr of el.attributes) {
        if (attr.name.startsWith('df-')) {
            key = attr.name.substring(3);
            break;
        }
    }
    if (!key) return; // Si no hay df-*, salir

    // *** LOG INICIAL en handleNodeDataChange ***
    // console.log(`>>> handleNodeDataChange triggered for Node ${id}, Element with df-${key}`);

    requestAnimationFrame(() => { // Usar requestAnimationFrame asegura que el valor en node.data se actualice antes de leerlo
        try {
            const updatedNode = editor.getNodeFromId(id); // Volver a obtener para datos actualizados
            // Verificar que el nodo y la clave aún existen y son válidos después de actualizar
            if (!updatedNode?.data || !Object.prototype.hasOwnProperty.call(updatedNode.data, key)) {
                 console.warn(`handleNodeDataChange: Node ${id} or key '${key}' no longer exists or data is invalid after update.`);
                 return;
            }
            const val = updatedNode.data[key]; // Obtener el valor ACTUALIZADO de los datos del nodo
            const name = updatedNode.name;

            // *** LOG con el valor actualizado ***
            // console.log(`   Node Name: ${name}, Key: ${key}, Updated Value in node.data:`, val);

            let historySavedByExecution = false; // Flag para ver si una ejecución ya guardó historial

            // --- Lógica específica por tipo de nodo y clave cambiada ---
            if ((name === 'url_input' && key === 'url')) {
                 executeNode(id, val); // Asume que executeNode guarda historial si es necesario
                 historySavedByExecution = true;
            } else if (name === 'cargarTexto' && key === 'filecontent') {
                 propagateData(id, name, key, val); // Asume que la propagación final guarda historial si es necesario
                 historySavedByExecution = true; // Asumimos que sí
            } else if (name === 'imagen' && ['imgsrc', 'imgalt', 'imgwidth', 'imgheight'].includes(key)) {
                 handleImageInputChange(event); // Esta llama a generateImageHtml que llama a saveHistoryState
                 historySavedByExecution = true;
            } else if (name === 'nota' && key === 'notecontent') {
                 updateCharacterCount(event);
                 // No necesita ejecución, guardar historial directamente al final
            } else if ((name === 'timer_fetch' || name === 'timer_download' || name === 'loop') && (key === 'interval' || (name === 'timer_fetch' && key === 'url'))) {
                 executeNode(id, null); // Reinicia timer, no necesita guardar historial extra aquí
                 historySavedByExecution = true; // El reinicio puede considerarse un cambio
            }
            else if (['input_number', 'input_text', 'input_range', 'input_date', 'input_time', 'input_color'].includes(name)) {
                 propagateData(id, name, key, val); // Llama a propagateData, que debería llevar a guardar historial si algo cambia
                 historySavedByExecution = true; // Asumimos que sí
            }
            else if (name === 'template_engine' && key === 'template') {
                 // console.log(`Template Node (${id}): Template changed by user. Reprocessing...`);
                 processTemplateNode(id); // Llama a processTemplateNode que llama a updateNodeResult que guarda historial
                 historySavedByExecution = true;
            }
            else if (name === 'local_image') {
                if (key === 'imagewidth' || key === 'imageheight') {
                    updateLocalImageStyle(event); // Llama a handleNodeDataChange -> saveHistoryState
                } else if (key === 'nodewidth' || key === 'nodeheight') {
                    updateLocalNodeSize(event); // Llama a handleNodeDataChange -> saveHistoryState
                }
                 // Necesita guardado directo al final
            }
            else if (name === 'image_minimal') {
                // No requiere acción aquí usualmente, guardar al final si cambia algo relevante
            }
             // ===================================================================
             // ====> INICIO: BLOQUE ACTUALIZADO PARA TODOS LOS REEMPLAZOS <====
             // ===================================================================
             // Maneja 'text_replace' y 'auto_text_replace' (disparan ejecución)
             else if ((name === 'text_replace' || name === 'auto_text_replace') && (key === 'find' || key === 'replace')) {
                 // console.log(`   *** ${name} condition MET for key '${key}' ***`);
                 const lastInput = updatedNode.data.lastInput;
                 if (lastInput !== null && lastInput !== undefined) {
                     // console.log(`   ${name} (${id}): Input field '${key}' changed. Reprocessing with lastInput: "${lastInput}"`);
                     const executionFunction = (name === 'auto_text_replace') ? executeAutoReplace : executeTextReplace;
                     setTimeout(() => executionFunction(id, lastInput), 0);
                     historySavedByExecution = true; // La ejecución llamará a updateNodeResult -> saveHistoryState
                 } else {
                     // console.log(`   ${name} (${id}): Input field '${key}' changed, but no lastInput to process yet.`);
                     // Si no hay lastInput, solo el cambio en find/replace se guarda al final
                 }
             }
             // Maneja 'hybrid_text_replace' (NO dispara ejecución)
             else if (name === 'hybrid_text_replace' && ['original', 'find', 'replace'].includes(key)) {
                 // console.log(`   Hybrid Replace (${id}): Field '${key}' changed by user. No automatic action.`);
                 // No se hace nada más, la ejecución es manual vía botón.
                 // El historial se guarda al final.
             }
             // ===================================================================
             // ====> FIN: BLOQUE ACTUALIZADO <====
             // ===================================================================

             // --- Manejo de text_split (separado por si acaso) ---
             else if (name === 'text_split' && key === 'separator') {
                 const lastInput = updatedNode.data.lastInput;
                 if (lastInput !== null && lastInput !== undefined) {
                      // console.log(`   Text Split (${id}): Input field '${key}' changed. Reprocessing with lastInput: "${lastInput}"`);
                      setTimeout(() => executeTextSplit(id, lastInput), 0);
                      historySavedByExecution = true; // La ejecución llamará a updateNodeResult -> saveHistoryState
                 } else {
                     // console.log(`   Text Split (${id}): Input field '${key}' changed, but no lastInput to process yet.`);
                 }
             }
             // --- FIN MANEJO NODOS DE TEXTO ---

            // Guardar historial para cambios que no dispararon una ejecución que ya guarda.
            if (!historySavedByExecution) {
                // ¿Realmente hubo un cambio en los datos? (Drawflow actualiza node.data antes de llamar a esto via rAF)
                // Podríamos comparar el valor 'val' con el valor original antes del rAF, pero es complejo.
                // Por simplicidad, guardamos si no fue manejado por una ejecución.
                // console.log(`   Saving history directly from handleNodeDataChange for ${name} (key: ${key})`);
                saveHistoryState();
            } else {
                 // console.log(`   History save deferred or handled by execution for ${name} (key: ${key})`);
            }


        } catch (e) {
            console.error(`Error handleNodeDataChange (Node: ${id}, Key: ${key}):`, e);
        }
    });
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
        // console.log(`Node ${nodeId} (${node.name}): Updating result data.`);
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
                // console.warn(`Node ${nodeId} (${node.name}): Result element (df-result) not found in UI.`);
            }
        } else {
            //  console.warn(`Node ${nodeId} (${node.name}): Node element not found in DOM for UI update.`);
        }

        // Propagamos el nuevo resultado a los nodos conectados
        // Usamos el nombre del nodo actual para la propagación
        // console.log(`Node ${nodeId} (${node.name}): Propagating new result.`);
        propagateData(nodeId, node.name, 'result', resultValue);

        // Guardamos el estado para deshacer/rehacer porque el resultado cambió
        saveHistoryState();
    } else {
        //  console.log(`Node ${nodeId} (${node.name}): Result unchanged, no update needed.`);
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
    // console.log(`Input JSON (${nodeId}): Propagating parsed data object...`, parsed);
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
                  // console.warn(`Node sum (${nodeId}): Input from ${conn.node} is not a number. Ignored.`);
              }
          }
      });

      // Actualizar los datos internos del nodo y la UI solo si el resultado ha cambiado
      if (node.data.result !== currentSum) {
          // console.log(`Node sum (${nodeId}): Updating result from ${node.data.result} to ${currentSum}`);
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
                  // console.warn(`Node subtract (${nodeId}): Input from ${conn.node} is not a valid number. Using 0.`);
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
          // console.log(`Node subtract (${nodeId}): Updating result from ${node.data.result} to ${currentResult}`);
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
                  // console.warn(`Node multiply (${nodeId}): Input from ${conn.node} is not a valid number. Ignored.`);
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
          // console.log(`Node multiply (${nodeId}): Updating result from ${previousResult} to ${currentResult}`);
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
                      // console.warn(`Node divide (${nodeId}): Input from ${conn.node} is not a valid number. Result will be NaN.`);
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
                      // console.warn(`Node divide (${nodeId}): Division by zero detected from node ${conn.node}. Result set to Infinity.`);
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
          // console.log(`Node divide (${nodeId}): Updating result from ${previousResult} to ${currentResult}`);
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

  // console.log(`Processing image load for node ${nodeId}...`);
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
          // console.log(`Image loaded: ${w}x${h}`);

          if (w === 0 || h === 0) throw new Error("Invalid image dimensions (0x0).");

          // 1. Actualizar datos internos del nodo en Drawflow
          editor.updateNodeDataFromId(nodeId, {
              imgsrc: imageDataUrl,
              naturalWidth: w,
              naturalHeight: h,
              nodeWidth: `${w}px`, // Guardar también como nodeWidth/Height para consistencia
              nodeHeight: `${h}px`
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
              // console.log(`Node ${nodeId} connections updated after resize.`);
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
           editor.updateNodeDataFromId(nodeId, { imgsrc: '', naturalWidth: 0, naturalHeight: 0, nodeWidth: '80px', nodeHeight: '60px' });
           nodeElement.style.width = '80px';
           nodeElement.style.height = '60px';
           nodeElement.style.border = '2px dashed #cccccc';

      }
  };
  tempImg.onerror = (err) => {
      console.error("Error loading image data into temp Image object:", err);
      showToast('error', 'Error Carga', 'El formato de imagen no es válido o está corrupto.');
      // Resetear UI
      imgTag.src = '';
      imgTag.style.display = 'none';
      placeholder.style.display = 'flex';
      editor.updateNodeDataFromId(nodeId, { imgsrc: '', naturalWidth: 0, naturalHeight: 0, nodeWidth: '80px', nodeHeight: '60px' });
      nodeElement.style.width = '80px';
      nodeElement.style.height = '60px';
      nodeElement.style.border = '2px dashed #cccccc';
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

  // console.log(`Attaching listeners to minimal image node ${nodeId}`);

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
    // console.log(`Executing Text Case: Node ${nodeId}, Mode: ${mode}`);
    const inputText = String(inputValue ?? ''); // Asegurar que sea string
    const result = mode === 'upper' ? inputText.toUpperCase() : inputText.toLowerCase();
    updateNodeResult(nodeId, result); // Actualiza y propaga el resultado
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
    // console.log(`Executing Text Split: Node ${nodeId}`);
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
    // console.log(`Executing Text Length: Node ${nodeId}`);
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
    // console.log(`Executing HTML Strip: Node ${nodeId}`);
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
    // console.log(`--- Processing Template Node ${nodeId} ---`);
    // console.log("   Template String (Read from UI):", JSON.stringify(currentTemplate));
    // console.log("   Input JSON (Effective):", inputJson ? JSON.stringify(inputJson) : inputJson);
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
                // console.log(`   -> Replacing {{${cleanKey}}}: Found value:`, value, `(Type: ${typeof value})`);
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
        // console.warn(`Template Node (${nodeId}): No effective input JSON.`);
    }

    // *** LOG IMPORTANTE ***
    // console.log(`   Final Processed Template:`, JSON.stringify(processedTemplate));
    // *** FIN LOG IMPORTANTE ***

    if (nodeData.result !== processedTemplate || errorOccurred) {
        // console.log(`Template Node (${nodeId}): Updating result.`);
        editor.updateNodeDataFromId(nodeId, { result: processedTemplate });

        const resultTextarea = nodeElement.querySelector('textarea[df-result]');
        if (resultTextarea) {
            // *** LOG IMPORTANTE ***
            // console.log(`   Attempting to set UI textarea[df-result] value.`);
            resultTextarea.value = processedTemplate;
            // console.log(`   UI textarea[df-result] value set.`);
            // *** FIN LOG IMPORTANTE ***
        } else {
            // *** ERROR IMPORTANTE ***
            console.error(`   CRITICAL: UI textarea[df-result] NOT FOUND for node ${nodeId}. Check HTML definition.`);
            // *** FIN ERROR IMPORTANTE ***
        }
        // *** LOG IMPORTANTE ***
        // console.log(`   Attempting to propagate final result...`);
        propagateData(nodeId, 'template_engine', 'result', processedTemplate);
        // console.log(`   Propagation called.`);
        // *** FIN LOG IMPORTANTE ***
        saveHistoryState();
    } else {
        // console.log(`Template Node (${nodeId}): Result unchanged.`);
    }
    // console.log(`--- Finished Processing Template Node ${nodeId} ---`);
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
          // console.log(`Start ${nName} ${nodeId} every ${intMs} ms.`);
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

          let historySavedByInternalLogic = false;

          // Lógica específica para ciertos nodos que necesitan ejecutar/propagar al cambiar
          if ((name === 'url_input' && key === 'url')) {
               executeNode(id, val);
               historySavedByInternalLogic = true;
          } else if (name === 'cargarTexto' && key === 'filecontent') {
               propagateData(id, name, key, val);
               historySavedByInternalLogic = true;
          } else if (name === 'imagen' && ['imgsrc', 'imgalt', 'imgwidth', 'imgheight'].includes(key)) {
               handleImageInputChange(event); // Llama a la función que actualiza la imagen y propaga (y guarda historial)
               historySavedByInternalLogic = true;
          } else if (name === 'nota' && key === 'notecontent') {
               updateCharacterCount(event); // Actualiza contador, no necesita propagar
          } else if ((name === 'timer_fetch' || name === 'timer_download' || name === 'loop') && key === 'interval') {
               executeNode(id, null); // Reinicia el timer con el nuevo intervalo
               historySavedByInternalLogic = true;
          } else if (name === 'timer_fetch' && key === 'url') {
               executeNode(id, null); // Reinicia el fetch timer (usará la nueva URL en la próxima ejecución)
               historySavedByInternalLogic = true;
          }
          else if (['input_number', 'input_text', 'input_range', 'input_date', 'input_time', 'input_color'].includes(name)) {
               // console.log(`Propagating data from ${name} node ${id}, key: ${key}, value:`, val);
               propagateData(id, name, key, val); // Propaga el valor cambiado (propagateData guarda historial si es necesario)
               historySavedByInternalLogic = true; 
          }
          else if (name === 'template_engine' && key === 'template') {
                processTemplateNode(id); // Llama a processTemplateNode que llama a updateNodeResult que guarda historial
                historySavedByInternalLogic = true;
          }
          else if (name === 'local_image' && (key === 'imagewidth' || key === 'imageheight')) {
                updateLocalImageStyle(event); // Llama a handleNodeDataChange internamente -> saveHistoryState
                historySavedByInternalLogic = true; // Ya lo guarda
          }
          else if (name === 'local_image' && (key === 'nodewidth' || key === 'nodeheight')) {
                updateLocalNodeSize(event); // Llama a handleNodeDataChange internamente -> saveHistoryState
                historySavedByInternalLogic = true; // Ya lo guarda
          }
          else if ((name === 'text_replace' || name === 'auto_text_replace') && (key === 'find' || key === 'replace')) {
                const lastInput = updatedNode.data.lastInput;
                if (lastInput !== null && lastInput !== undefined) {
                    const executionFunction = (name === 'auto_text_replace') ? executeAutoReplace : executeTextReplace;
                    setTimeout(() => executionFunction(id, lastInput), 0);
                    historySavedByInternalLogic = true; 
                }
          }
          else if (name === 'text_split' && key === 'separator') {
                const lastInput = updatedNode.data.lastInput;
                if (lastInput !== null && lastInput !== undefined) {
                     setTimeout(() => executeTextSplit(id, lastInput), 0);
                     historySavedByInternalLogic = true; 
                }
          }


          // Guardar historial para cambios que no dispararon una ejecución que ya guarda.
          if (!historySavedByInternalLogic) {
            // console.log(`   Saving history directly from handleNodeDataChange for ${name} (key: ${key})`);
            saveHistoryState();
          }


      } catch (e) {
          console.error(`Error handleNodeDataChange (${id}/${key}):`, e);
      }
  });
}




// MODIFICADO: propagateData con manejo de nodos aritméticos, texto (auto) y PLANTILLA
// ACTUALIZADO: propagateData con manejo de nodos aritméticos, texto (auto) y PLANTILLA (corregido)
// --- USA ESTA VERSIÓN COMPLETA Y MODIFICADA ---
function propagateData(sourceNodeId, sourceNodeName, changedKey, outputData) {
    try {
        const sourceNode = editor.getNodeFromId(sourceNodeId);
        if (!sourceNode) { console.warn(`propagateData: Source node ${sourceNodeId} not found.`); return; }
        const outputPortInfo = sourceNode.outputs?.output_1; // Asumimos que la mayoría de nodos usan 'output_1'
        
        if (!outputPortInfo?.connections || outputPortInfo.connections.length === 0) {
            // console.log(`PropagateData: Node ${sourceNodeId} (${sourceNodeName}) has no outgoing connections from output_1.`);
            return;
        }

        const connections = outputPortInfo.connections;
        const sourceData = sourceNode.data || {};
        let dataToPropagate;

        // --- Determinar el dato real a propagar ---
        if (outputData !== undefined) {
            dataToPropagate = outputData;
        } else {
            // Claves comunes de salida o el valor del df- attribute que cambió
            const commonOutputKeys = ['result', 'content', 'codecontent', 'outputhtml', 'filecontent', 'display', 'url', 'jscode'];
            const inputNodeKeys = ['number', 'text', 'range', 'date', 'time', 'color', 'json', 'notecontent', 'original'];
            
            // Orden de prioridad para encontrar el dato a propagar:
            // 1. El valor que acaba de cambiar (si changedKey está en sourceData)
            // 2. Claves comunes de salida
            // 3. Claves de nodos de entrada
            // 4. Como último recurso, el primer dato no especial del nodo
            const searchKeys = [changedKey, ...commonOutputKeys, ...inputNodeKeys].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

            for (const k of searchKeys) {
                if (Object.prototype.hasOwnProperty.call(sourceData, k)) {
                    dataToPropagate = sourceData[k];
                    break;
                }
            }
            if (dataToPropagate === undefined) { // Fallback
                const validKeys = Object.keys(sourceData).filter(k => !['lastInput', 'lastInputs', 'selector_received', 'nodeWidth', 'nodeHeight', 'isMovementLocked'].includes(k));
                if (validKeys.length > 0) {
                    dataToPropagate = sourceData[validKeys[0]];
                } else {
                    // console.warn(`PropagateData: No suitable data found to propagate from ${sourceNodeId} (${sourceNodeName}) for key ${changedKey}.`);
                    return; // No hay nada claro que propagar
                }
            }
        }
        // --- Fin determinación de dato ---

        // console.log(`PropagateData from ${sourceNodeId} (${sourceNodeName}), key: ${changedKey}, effective data:`, dataToPropagate);

        connections.forEach(conn => {
            const targetId = conn.node;
            const targetNode = editor.getNodeFromId(targetId);
            if (!targetNode) {
                console.warn(`Target node ${targetId} not found during propagation from ${sourceNodeId}.`);
                return;
            }
            const targetNodeName = targetNode.name;
            const targetInputPortName = conn.output; // Nombre del puerto de entrada del nodo destino (ej: 'input_1')

            // === Lógica de Propagación Específica por Tipo de Nodo Destino ===

            if (EXECUTE_NODE_SYSTEM_TYPES.includes(targetNodeName)) { 
                if (targetNodeName === 'extract_value') {
                    if (targetInputPortName === 'input_1') { // Texto a procesar
                        setTimeout(() => executeNode(targetId, dataToPropagate), 0);
                    } else if (targetInputPortName === 'input_2') { // Patrón Regex
                        const s = String(dataToPropagate ?? '');
                        editor.updateNodeDataFromId(targetId, { selector_received: s });
                        const el = document.getElementById(`node-${targetId}`);
                        const i = el?.querySelector('input[df-selector_received]');
                        if (i) i.value = s;
                        // No ejecutar automáticamente, extract_value se ejecuta cuando llega a input_1
                    }
                } else {
                    setTimeout(() => executeNode(targetId, dataToPropagate), 0);
                }
            }
            else if (targetNodeName === 'javascript_code') { 
                editor.updateNodeDataFromId(targetId, { lastInput: dataToPropagate });
                setTimeout(() => executeNode(targetId, dataToPropagate), 0); // executeJsNode se llama dentro de executeNode si es necesario
            }
            else if (targetNodeName === 'concatenar') { 
                setTimeout(() => updateConcatenateNode(targetId), 0);
            }
            else if (['sum', 'subtract', 'multiply', 'divide'].includes(targetNodeName)) {
                 setTimeout(() => { // Llama a la función de actualización específica del nodo aritmético
                    if (targetNodeName === 'sum') updateSumNode(targetId);
                    else if (targetNodeName === 'subtract') updateSubtractNode(targetId);
                    else if (targetNodeName === 'multiply') updateMultiplyNode(targetId);
                    else if (targetNodeName === 'divide') updateDivideNode(targetId);
                 },0);
            }
            else if (targetNodeName === 'mostrarPasar' && targetInputPortName === 'input_1') { 
                const v = String(dataToPropagate ?? '');
                editor.updateNodeDataFromId(targetId, { result: v });
                const el = document.getElementById(`node-${targetId}`);
                const ta = el?.querySelector('textarea[df-result]');
                if (ta) ta.value = v;
                setTimeout(() => propagateData(targetId, targetNodeName, 'result', dataToPropagate), 0);
            }
            else if (targetNodeName === 'guardarTexto' && targetInputPortName === 'input_1') { 
                const v = String(dataToPropagate ?? '');
                editor.updateNodeDataFromId(targetId, { savecontent: v });
                const el = document.getElementById(`node-${targetId}`);
                const ta = el?.querySelector('textarea[df-savecontent]');
                if (ta) ta.value = v;
            }
            else if (['text_replace', 'text_split', 'text_uppercase', 'text_lowercase', 'text_length', 'html_strip'].includes(targetNodeName) && targetInputPortName === 'input_1') {
                const inputText = String(dataToPropagate ?? '');
                editor.updateNodeDataFromId(targetId, { lastInput: inputText }); // Guardar el input
                setTimeout(() => {
                    try {
                        // Las funciones de ejecución deben leer find/separator de node.data y usar el inputText
                        if (targetNodeName === 'text_uppercase') executeTextCase(targetId, inputText, 'upper');
                        else if (targetNodeName === 'text_lowercase') executeTextCase(targetId, inputText, 'lower');
                        else if (targetNodeName === 'text_replace') executeTextReplace(targetId, inputText);
                        else if (targetNodeName === 'text_split') executeTextSplit(targetId, inputText);
                        else if (targetNodeName === 'text_length') executeTextLength(targetId, inputText);
                        else if (targetNodeName === 'html_strip') executeHtmlStrip(targetId, inputText);
                    } catch (execError) { console.error(`Error executing text op for ${targetNodeName} (${targetId}):`, execError); }
                }, 0);
            }
            else if (targetNodeName === 'auto_text_replace') {
                if (targetInputPortName === 'input_1') { 
                    const inputTextString = String(dataToPropagate ?? '');
                    editor.updateNodeDataFromId(targetId, { lastInput: inputTextString }); 
                    const targetNodeElement = document.getElementById(`node-${targetId}`);
                    const lastInputElementUI = targetNodeElement?.querySelector('textarea[df-lastInput]');
                    if (lastInputElementUI) lastInputElementUI.value = inputTextString;
                    // console.log(`Auto Replace (${targetId}): Received text for input_1. Storing & Executing.`);
                    setTimeout(() => executeAutoReplace(targetId, inputTextString), 0);
                } else if (targetInputPortName === 'input_2') { // Disparador
                    // console.log(`Auto Replace (${targetId}): Received TRIGGER on input_2.`);
                    const existingLastInput = String(targetNode.data.lastInput ?? '');
                    setTimeout(() => executeAutoReplace(targetId, existingLastInput), 0);
                }
            }
            else if (targetNodeName === 'hybrid_text_replace' && targetInputPortName === 'input_1') {
                editor.updateNodeDataFromId(targetId, { lastInput: dataToPropagate });
                // console.log(`Hybrid Replace (${targetId}): Received input via connection. Storing in lastInput.`);
            }
            else if (targetNodeName === 'template_engine' && targetInputPortName === 'input_1') {
                editor.updateNodeDataFromId(targetId, { lastInput: dataToPropagate });
                setTimeout(() => processTemplateNode(targetId, dataToPropagate), 0);
            }
             // Aquí puedes añadir más `else if` para otros nodos personalizados que reaccionan a la entrada
        }); 
    } catch (error) {
        console.error(`Error propagating data from node ${sourceNodeId} (${sourceNodeName}):`, error);
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
function openNodeDefinitionModal() { if (!nodeDefinitionModal || !modalBackdrop) { showToast('error','Error','Modal not available.'); return; } document.getElementById('newNodeTypeName').value = ''; document.getElementById('newNodeTypeTitle').value = ''; document.getElementById('newNodeInputs').value = '1'; document.getElementById('newNodeOutputs').value = '1'; document.getElementById('newNodeCssClass').value = ''; document.getElementById('newNodeHtmlContent').value = `<div>\n  <div class="title-box"><i class="fas fa-cogs"></i> My Node</div>\n  <div class="box">\n    <label>Data:</label>\n    <input type="text" df-mydata placeholder="Value...">\n  </div>\n <div class="node-resizer" title="Redimensionar"><i class="fas fa-expand-alt"></i></div></div>`; document.getElementById('newNodeInitialData').value = `{ "mydata": "", "nodeWidth": "220px", "nodeHeight": "auto" }`; nodeDefinitionModal.style.display = 'block'; modalBackdrop.style.display = 'block'; document.getElementById('newNodeTypeName').focus(); }
function closeNodeDefinitionModal() { if (!nodeDefinitionModal || !modalBackdrop) return; nodeDefinitionModal.style.display = 'none'; modalBackdrop.style.display = 'none'; }
function saveNewNodeType() { const nameIn=document.getElementById('newNodeTypeName'), titleIn=document.getElementById('newNodeTypeTitle'), inputsIn=document.getElementById('newNodeInputs'), outputsIn=document.getElementById('newNodeOutputs'), cssIn=document.getElementById('newNodeCssClass'), htmlIn=document.getElementById('newNodeHtmlContent'), dataIn=document.getElementById('newNodeInitialData'); if(!nameIn||!titleIn||!inputsIn||!outputsIn||!cssIn||!htmlIn||!dataIn) { showToast('error','Internal Error','Modal fields missing.'); return; } const name=nameIn.value.trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''); const title=titleIn.value.trim(); const inputs=parseInt(inputsIn.value,10); const outputs=parseInt(outputsIn.value,10); const cssClass=(cssIn.value.trim()||`${name}-node`) + " resizable-node-class"; const html=htmlIn.value.trim(); if(!name) { showToast('error','Validation Error','Internal name required.'); nameIn.focus(); return; } if(customNodeTypes[name]) { showToast('error','Validation Error',`Name "${name}" exists.`); nameIn.focus(); return; } if(isNaN(inputs)||inputs<0||isNaN(outputs)||outputs<0) { showToast('error','Validation Error','Inputs/Outputs >= 0.'); return; } if(!html) { showToast('error','Validation Error','HTML empty.'); htmlIn.focus(); return; } let iData={ nodeWidth: "220px", nodeHeight: "auto"}; if(dataStr) { try { const parsedData =JSON.parse(dataStr); if(typeof parsedData!=='object'||parsedData===null||Array.isArray(parsedData)) throw new Error("JSON must be object."); iData = {...iData, ...parsedData}; } catch (e) { showToast('error','JSON Error',`Initial Data: ${e.message}`); dataIn.focus(); return; } } else { try { const tmp=document.createElement('div'); tmp.innerHTML=html; tmp.querySelectorAll('[df-]').forEach(el=>{ for(const a of el.attributes) if(a.name.startsWith('df-')){ const k=a.name.substring(3); if(!iData.hasOwnProperty(k)) iData[k]=el.value??el.textContent??''; } }); } catch(e){console.warn("Infer data error:", e);} } if (!html.includes('class="node-resizer"')) { showToast('warning', 'Resizer Missing', 'Añade <div class="node-resizer"><i class="fas fa-expand-alt"></i></div> al HTML si quieres que sea redimensionable.');} const def={name,title,inputs,outputs,html,data:iData,cssClass}; customNodeTypes[name]=def; saveCustomNodeTypes(customNodeTypes); addDraggableItemToSidebar(def); const item=nodesListContainer.querySelector(`[data-node="${name}"]`); item?.scrollIntoView({behavior:'smooth',block:'nearest'}); showToast('success','Success',`Type "${title||name}" added.`); closeNodeDefinitionModal(); }
function promptDeleteNodeType(nodeTypeName) { if(!nodeTypeName) return; if(baseNodeDefinitions.hasOwnProperty(nodeTypeName)){ showToast('warning','Not Allowed',`Base node "${nodeTypeName}" cannot be deleted.`); return; } if(!customNodeTypes.hasOwnProperty(nodeTypeName) || !getStoredCustomNodeTypes().hasOwnProperty(nodeTypeName)){ showToast('error','Error',`Custom node "${nodeTypeName}" not found.`); return; } const title=customNodeTypes[nodeTypeName]?.title||nodeTypeName; Swal.fire({title:`Delete Type "${title}"?`, text:`Delete definition "${nodeTypeName}"? Existing nodes may fail. Irreversible!`, icon:'warning', showCancelButton:true, confirmButtonColor:'#d33', cancelButtonColor:'#3085d6', confirmButtonText:'Yes, delete type', cancelButtonText:'Cancel'}).then((res) => { if(res.isConfirmed){ try { delete customNodeTypes[nodeTypeName]; saveCustomNodeTypes(customNodeTypes); loadCustomNodesToSidebar(); showToast('success','Deleted',`Type "${title}" deleted.`); } catch(err){ console.error(`Err deleting ${nodeTypeName}:`,err); showToast('error','Error', 'Failed to delete.'); customNodeTypes[nodeTypeName] = getStoredCustomNodeTypes()[nodeTypeName]; } } }); }

// --- History (Undo/Redo) ---
function initializeHistory() { historyStack = []; historyIndex = -1; updateUIDisabledStates(); console.log("History initialized."); }
function saveHistoryState(force = false) { if (!editor || (isLocked() && !force)) return; try { const current = JSON.stringify(editor.export()); if (!force && historyIndex >= 0 && historyStack[historyIndex] === current) return; if (historyIndex < historyStack.length - 1) historyStack = historyStack.slice(0, historyIndex + 1); historyStack.push(current); if (historyStack.length > MAX_HISTORY_STATES) historyStack.shift(); historyIndex = historyStack.length - 1; updateUIDisabledStates(); } catch (e) { console.error("Error saveHistoryState:", e); } }
function undo() { if (historyIndex <= 0 || isLocked()) return; try { historyIndex--; const prev = JSON.parse(historyStack[historyIndex]); const mod = editor.module; cleanupAllModuleIntervals(); editor.import(prev); if (editor.module === mod) { activateExistingAutoNodes(); updateUIDisabledStates(); if(currentlyEditingNodeId && !editor.getNodeFromId(currentlyEditingNodeId)) closeCodeEditorSidebar(false); else if (currentlyEditingNodeId) openCodeEditorSidebar(currentlyEditingNodeId); } else console.warn("Module changed during Undo."); } catch (e) { console.error("Error Undo:", e); historyIndex++; updateUIDisabledStates(); showToast('error', 'Error', 'Failed to undo.'); } }
function redo() { if (historyIndex >= historyStack.length - 1 || isLocked()) return; try { historyIndex++; const next = JSON.parse(historyStack[historyIndex]); const mod = editor.module; cleanupAllModuleIntervals(); editor.import(next); if (editor.module === mod) { activateExistingAutoNodes(); updateUIDisabledStates(); if(currentlyEditingNodeId && !editor.getNodeFromId(currentlyEditingNodeId)) closeCodeEditorSidebar(false); else if (currentlyEditingNodeId) openCodeEditorSidebar(currentlyEditingNodeId); } else console.warn("Module changed during Redo."); } catch (e) { console.error("Error Redo:", e); historyIndex--; updateUIDisabledStates(); showToast('error', 'Error', 'Failed to redo.'); } }

// --- Project Management ---
function triggerLoad() { if (fileInputElement) fileInputElement.click(); else showToast('error', 'Error', 'File input missing.'); }
// if (fileInputElement) fileInputElement.addEventListener('change', loadProjectFromFile); // Moved to initializeApp

/**
 * Carga un proyecto Xocoflow desde un archivo JSON seleccionado por el usuario.
 * @param {Event} event - El evento 'change' del input de tipo 'file'.
 */
function loadProjectFromFile(event) {
  // console.log(">>> loadProjectFromFile FUNCTION CALLED <<<");
  const fileInput = event.target; 
  const file = fileInput?.files?.[0];

  if (!file) {
      if(fileInput) fileInput.value = null; 
      return;
  }

  const expectedProjectName = file.name.replace(/\.json$/i, "");
  // console.log(`Intentando cargar archivo: ${file.name}`);
  const reader = new FileReader();

  reader.onload = (e) => {
      let projectData;
      const fileContent = e.target.result;

      try {
          try {
              projectData = JSON.parse(fileContent);
          } catch (parseError) { showToast('error', 'Error de Parseo', 'El archivo JSON no es válido.'); if (fileInput) fileInput.value = null; return; }

          if (!projectData?.drawflow) { showToast('error', 'Formato Inválido', 'El archivo no parece un proyecto Xocoflow válido.'); if (fileInput) fileInput.value = null; return;}

          // console.log("JSON parseado, procesando nodos personalizados...");
          try {
              const customDefsFromFile = projectData.customNodeDefinitions;
              if (customDefsFromFile && typeof customDefsFromFile === 'object') {
                  saveCustomNodeTypes(customDefsFromFile); 
                  customNodeTypes = { ...baseNodeDefinitions, ...customDefsFromFile };
              } else {
                  customNodeTypes = { ...baseNodeDefinitions, ...getStoredCustomNodeTypes() };
              }
              loadCustomNodesToSidebar(); 
          } catch (nodeError) { console.warn("Error procesando definiciones de nodos personalizados:", nodeError); showToast('warning', 'Advertencia Nodos', 'Problema al cargar algunas definiciones de nodos personalizados.');}


          // console.log("Importando datos en Drawflow...");
          const currentModuleBeforeImport = editor.module;
          try {
              cleanupAllModuleIntervals(); 
              editor.import(projectData); 

              // console.log("Sincronizando UI de nodos con datos importados...");
              const targetModule = editor.module || currentModuleBeforeImport; 
              const drawflowExportAfterImport = editor.export(); 
              const currentModuleNodes = drawflowExportAfterImport?.drawflow?.[targetModule]?.data;

              if (currentModuleNodes) {
                  Object.keys(currentModuleNodes).forEach(nodeId => {
                      const node = currentModuleNodes[nodeId]; 
                      const nodeData = node.data || {};
                      const nodeElement = document.getElementById(`node-${nodeId}`);
                      const nodeName = node.name;

                      if (nodeElement) {
                          Object.keys(nodeData).forEach(dataKey => {
                              if (['naturalWidth', 'naturalHeight'].includes(dataKey) && nodeName === 'image_minimal') return;
                              if (['lastInput', 'lastInputs', 'selector_received'].includes(dataKey)) return;

                              const inputElement = nodeElement.querySelector(`[df-${dataKey}]`);
                              if (inputElement) {
                                  const value = nodeData[dataKey];
                                  if (inputElement.tagName === 'TEXTAREA' || (inputElement.tagName === 'INPUT' && ['text', 'number', 'url', 'email', 'password', 'range', 'date', 'time', 'color'].includes(inputElement.type))) {
                                      inputElement.value = value ?? '';
                                      if (inputElement.type === 'range' && inputElement.nextElementSibling?.hasAttribute('df-rangeval')) {
                                           inputElement.nextElementSibling.textContent = value ?? '0';
                                      }
                                  } else if (inputElement.tagName === 'SELECT'){
                                      inputElement.value = value ?? '';
                                      if (dataKey === 'notecolor' && nodeName === 'nota') { 
                                          const changeEvent = new Event('change', { bubbles: true });
                                          inputElement.dispatchEvent(changeEvent);
                                      }
                                  } else if (inputElement.tagName === 'IMG' && dataKey === 'imgsrc' && nodeName !== 'image_minimal') { 
                                      inputElement.src = value ?? '';
                                      inputElement.style.display = value ? 'block' : 'none';
                                      const placeholder = nodeElement.querySelector('.placeholder-text');
                                      if(placeholder) placeholder.style.display = value ? 'none' : 'block';
                                  } else if (inputElement.tagName === 'SPAN' && dataKey === 'filename'){
                                      inputElement.textContent = value ?? '';
                                      inputElement.title = value ?? '';
                                  } else if (inputElement.hasAttribute('df-charcount')  && nodeName === 'nota') { 
                                      inputElement.textContent = nodeElement.querySelector('[df-notecontent]')?.value?.length || '0';
                                  }
                              }
                          });
                          if (nodeData.nodeWidth) nodeElement.style.width = nodeData.nodeWidth;
                          if (nodeData.nodeHeight) nodeElement.style.height = nodeData.nodeHeight;
                          
                          const resizer = nodeElement.querySelector('.node-resizer');
                          if (resizer) {
                            resizer.removeEventListener('mousedown', startNodeResize); // Prevenir duplicados
                            resizer.addEventListener('mousedown', (e) => startNodeResize(e, nodeId, resizer));
                          }


                          if (nodeName === 'nota' && nodeData.notecolor) {
                              nodeElement.style.backgroundColor = nodeData.notecolor;
                              const tb = nodeElement.querySelector('.title-box');
                              if(tb) {
                                  const darkBgs = ['#ccccff', '#e0e0e0'];
                                  tb.style.backgroundColor = darkBgs.includes(nodeData.notecolor) ? '#f0f0f0' : '';
                                  tb.style.color = darkBgs.includes(nodeData.notecolor) ? '#333' : '';
                              }
                          }
                          else if (nodeName === 'local_image') {
                              const imgTag = nodeElement.querySelector('img[df-imagesrc]');
                              if (imgTag){
                                  if(nodeData.imagewidth) imgTag.style.width = nodeData.imagewidth;
                                  if(nodeData.imageheight) imgTag.style.height = nodeData.imageheight;
                                  imgTag.src = nodeData.imagesrc ?? '';
                                  imgTag.style.display = nodeData.imagesrc ? 'block' : 'none';
                                  const placeholder = nodeElement.querySelector('.placeholder-text');
                                   if(placeholder) placeholder.style.display = nodeData.imagesrc ? 'none' : 'block';
                              }
                          }
                          else if (nodeName === 'image_minimal') {
                              const imgTag = nodeElement.querySelector('img[df-imgsrc]');
                              const placeholder = nodeElement.querySelector('.image-placeholder');
                              if (imgTag && placeholder) {
                                  const hasValidImage = nodeData.imgsrc && nodeData.naturalWidth > 0 && nodeData.naturalHeight > 0;
                                  if (hasValidImage) {
                                      imgTag.src = nodeData.imgsrc;
                                      imgTag.style.display = 'block';
                                      placeholder.style.display = 'none';
                                      nodeElement.style.width = nodeData.nodeWidth || `${nodeData.naturalWidth}px`;
                                      nodeElement.style.height = nodeData.nodeHeight || `${nodeData.naturalHeight}px`;
                                      nodeElement.style.border = 'none'; 
                                  } else {
                                      imgTag.src = '';
                                      imgTag.style.display = 'none';
                                      placeholder.style.display = 'flex'; 
                                      nodeElement.style.width = nodeData.nodeWidth || '80px';
                                      nodeElement.style.height = nodeData.nodeHeight || '60px';
                                      nodeElement.style.border = '2px dashed #cccccc'; 
                                  }
                                  setTimeout(() => setupMinimalImageNodeListeners(nodeId), 50);
                                  setTimeout(() => editor.updateConnectionNodes(`node-${nodeId}`), 100);
                              }
                          }
                          if (nodeData.hasOwnProperty('isMovementLocked')) {
                                updateNodeVisualLockState(nodeId, nodeData.isMovementLocked);
                          } else {
                                editor.updateNodeDataFromId(nodeId, { ...nodeData, isMovementLocked: false });
                                updateNodeVisualLockState(nodeId, false);
                          }


                      } 
                  }); 
              } 
              // console.log("Post-import UI synchronization completed.");

          } catch (importError) { console.error("Error durante la importación:", importError); showToast('error', 'Error de Importación', 'No se pudo importar el proyecto.'); if (fileInput) fileInput.value = null; return; }

          // console.log("Importación completada. Actualizando estado de la aplicación.");
          currentProjectName = expectedProjectName;
          renderModuleTabs();
          initializeHistory();
          selectedNodeId = null;
          copiedNodeData = null;
          currentlyEditingNodeId = null; 
          updateUIDisabledStates();
          closeCodeEditorSidebar(false);
          document.title = `Xocoflow | ${currentProjectName} - ${editor.module}`;
          saveHistoryState(true); 
          activateExistingAutoNodes();
          showToast('success', 'Proyecto Cargado', `"${escapeHtml(currentProjectName)}" cargado.`);

      } catch (err) { console.error("Error en reader.onload:", err); showToast('error', 'Error de Archivo', 'No se pudo leer el archivo del proyecto.'); }
      finally {
          if (fileInput) fileInput.value = null; 
      }
  }; 

  reader.onerror = (e) => { showToast('error', 'Error de Lectura', 'No se pudo leer el archivo.'); if (fileInput) fileInput.value = null;};

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
            version: "1.7.6", 
            savedAt: new Date().toISOString(),
            customNodeDefinitions: customDefs,
            drawflow: drawflowData.drawflow 
        };

        const json = JSON.stringify(project, null, 2); 
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href); 

        currentProjectName = filename.replace(/\.json$/i, ""); 
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
    if (!editor) return; 
    try {
        const { value: inputName } = await Swal.fire({
            title: 'Guardar Como...',
            input: 'text',
            inputLabel: 'Nombre del archivo (sin .json)',
            inputValue: currentProjectName || 'mi_proyecto', 
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            inputValidator: (v) => {
                const trimmed = v?.trim();
                if (!trimmed) return '¡El nombre es obligatorio!';
                if (/[<>:"/\\|?*]/.test(trimmed)) return 'Nombre contiene caracteres inválidos.';
                return null; 
            }
        });

        if (inputName) { 
            saveProject(inputName.trim()); 
        }
    } catch (e) {
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
        const raw = editor.export(); 
        if (!raw?.drawflow) { 
            throw new Error("Export failed or drawflow data missing.");
        }
        const json = JSON.stringify(raw, null, 2); 

        Swal.fire({
            title: 'JSON Crudo de Drawflow',
            width: '80%', 
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
                // console.log(`Clearing module: ${mod}`);
                cleanupAllModuleIntervals(); 
                editor.clearModuleSelected(); 
                selectedNodeId = null;
                copiedNodeData = null;
                updateUIDisabledStates();
                closeCodeEditorSidebar(false); 
                if (mod === 'Home') { 
                    addWelcomeNode(mod);
                }
                saveHistoryState(true); 
                showToast('info', 'Módulo Limpiado', `Módulo "${escapeHtml(mod)}" limpiado.`);
            }
        });
    } catch (e) {
        console.error("Error during clear module confirmation:", e);
        showToast('error', 'Error', 'No se pudo iniciar la limpieza del módulo.');
    }
}

// --- FIN Project Management & Module Actions ---
// --- Node Actions ---
function duplicateSelectedNode() { 
    if (!selectedNodeId || isLocked()) return; 
    try { 
        const oNode = editor.getNodeFromId(selectedNodeId); 
        if (!oNode) throw new Error("Node not found."); 
        
        let cDataDuplicate = JSON.parse(JSON.stringify(oNode.data || {}));
        cDataDuplicate.isMovementLocked = oNode.data.isMovementLocked === true; // Preserve lock state
        // Preserve nodeWidth and nodeHeight if they exist
        if (oNode.data.nodeWidth) cDataDuplicate.nodeWidth = oNode.data.nodeWidth;
        if (oNode.data.nodeHeight) cDataDuplicate.nodeHeight = oNode.data.nodeHeight;


        const ins = Object.keys(oNode.inputs || {}).length, outs = Object.keys(oNode.outputs || {}).length; 
        const x = oNode.pos_x + 40, y = oNode.pos_y + 40; 
        const newId = editor.addNode(oNode.name, ins, outs, x, y, oNode.class, cDataDuplicate, oNode.html); 
        
        setTimeout(() => { // Ensure node element exists before applying styles/listeners
            const newNodeElement = document.getElementById(`node-${newId}`);
            if(newNodeElement) {
                if (cDataDuplicate.nodeWidth) newNodeElement.style.width = cDataDuplicate.nodeWidth;
                if (cDataDuplicate.nodeHeight) newNodeElement.style.height = cDataDuplicate.nodeHeight;
                const resizer = newNodeElement.querySelector('.node-resizer');
                if (resizer) {
                    resizer.addEventListener('mousedown', (e) => startNodeResize(e, newId, resizer));
                }
            }
            updateNodeVisualLockState(newId, cDataDuplicate.isMovementLocked);
            activateNodeIfNeeded(newId); 
        },0);
        saveHistoryState(); 
    } catch (err) { showToast('error', 'Duplicate Error', `Error: ${err.message}`); } 
}

function copySelectedNode() { 
    if (!selectedNodeId || isLocked()) return; 
    try { 
        const node = editor.getNodeFromId(selectedNodeId); 
        if (!node) throw new Error("Node not found."); 
        if (!customNodeTypes[node.name]) throw new Error(`Type "${node.name}" unknown.`); 
        copiedNodeData = { 
            name: node.name, 
            data: JSON.parse(JSON.stringify(node.data || {})), // Deep copy data
            html: node.html, 
            class: node.class, 
            inputs: Object.keys(node.inputs || {}).length, 
            outputs: Object.keys(node.outputs || {}).length, 
            title: node.title || node.name,
            isMovementLocked: node.data.isMovementLocked === true, // Copy lock state
            nodeWidth: node.data.nodeWidth, // Copy dimensions
            nodeHeight: node.data.nodeHeight
        }; 
        updateUIDisabledStates(); 
        showToast('success', 'Node Copied', `${copiedNodeData.title}`); 
    } catch (err) { console.error("Error copying:", err); copiedNodeData = null; updateUIDisabledStates(); showToast('error', 'Copy Error', `Error: ${err.message}`); } 
}

function pasteNode() { 
    if (!copiedNodeData || isLocked()) return; 
    if (!customNodeTypes[copiedNodeData.name]) { showToast('error', 'Paste Error', `Type "${copiedNodeData.name}" unknown.`); copiedNodeData = null; updateUIDisabledStates(); return; } 
    try { 
        const rect = editor.container.getBoundingClientRect(), zoom = editor.zoom || 1; 
        const cx = (rect.width / 2 - editor.canvas_x) / zoom, cy = (rect.height / 2 - editor.canvas_y) / zoom; 
        const ox = Math.random() * 40 - 20, oy = Math.random() * 40 - 20; 
        
        // Use copied dimensions if available, otherwise default
        const nodeWidth = copiedNodeData.nodeWidth ? parseFloat(copiedNodeData.nodeWidth) : 220;
        // const nodeHeight = copiedNodeData.nodeHeight ? parseFloat(copiedNodeData.nodeHeight) : 100; // Height can be auto

        const x = cx - (nodeWidth / 2) + ox; 
        const y = cy + oy; 
        
        let cDataPaste = JSON.parse(JSON.stringify(copiedNodeData.data));
        cDataPaste.isMovementLocked = copiedNodeData.isMovementLocked === true;
        if (copiedNodeData.nodeWidth) cDataPaste.nodeWidth = copiedNodeData.nodeWidth;
        if (copiedNodeData.nodeHeight) cDataPaste.nodeHeight = copiedNodeData.nodeHeight;

        const newId = editor.addNode(copiedNodeData.name, copiedNodeData.inputs, copiedNodeData.outputs, x, y, copiedNodeData.class, cDataPaste, copiedNodeData.html); 
        
        setTimeout(() => {
            const newNodeElement = document.getElementById(`node-${newId}`);
            if(newNodeElement) {
                if (cDataPaste.nodeWidth) newNodeElement.style.width = cDataPaste.nodeWidth;
                if (cDataPaste.nodeHeight && cDataPaste.nodeHeight !== 'auto') {
                     newNodeElement.style.height = cDataPaste.nodeHeight;
                } else {
                    // If auto, let content determine height, or set a default if needed
                    // newNodeElement.style.height = 'auto'; // Or a min-height
                }
                const resizer = newNodeElement.querySelector('.node-resizer');
                if (resizer) {
                    resizer.addEventListener('mousedown', (e) => startNodeResize(e, newId, resizer));
                }
            }
            updateNodeVisualLockState(newId, cDataPaste.isMovementLocked);
            activateNodeIfNeeded(newId); 
        },0);
        saveHistoryState(); 
    } catch (err) { showToast('error', 'Paste Error', `Error: ${err.message}`); } 
}
function deleteSelectedNode() { if (!selectedNodeId || isLocked()) return; try { editor.removeNodeId(`node-${selectedNodeId}`); /* State update handled by listener */ } catch (err) { showToast('error', 'Delete Error', `Error: ${err.message}`); } }

// --- Module/Tab Management ---
function renderModuleTabs() { 
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
            li.onclick = () => { editor.changeModule(moduleName); /* renderModuleTabs(); // Not always needed, moduleChanged event handles it */ };
            if (moduleName === currentModule) li.classList.add('selected');
            if (moduleName !== 'Home' && moduleNames.length > 1) {
                const closeBtn = document.createElement('span');
                closeBtn.innerHTML = '×';
                closeBtn.title = `Eliminar ${moduleName}`;
                closeBtn.className = 'close-tab-btn';
                closeBtn.style.cssText = ` margin-left: 8px; cursor: pointer; color: #aaa; font-weight: bold; padding: 0 4px; border-radius: 3px; font-size: 14px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; height: 16px; width: 16px; vertical-align: middle; transition: all 0.2s; `;
                closeBtn.onmouseover = () => { closeBtn.style.color = '#fff'; closeBtn.style.backgroundColor = '#ffb3b3'; };
                closeBtn.onmouseout = () => { closeBtn.style.color = '#aaa'; closeBtn.style.backgroundColor = 'transparent'; };
                closeBtn.onclick = (ev) => { ev.stopPropagation(); removeModuleTab(moduleName); };
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

async function promptAddModule() { 
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
            // console.log(`Añadiendo módulo: ${moduleName}`);
            editor.addModule(moduleName);
            editor.changeModule(moduleName); 
            addWelcomeNode(moduleName); 
        } else { console.log("Creación cancelada."); }
    } catch (e) { console.error("Error en promptAddModule:", e); }
}
function removeModuleTab(moduleName) { 
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
                // console.log(`Eliminando módulo: ${moduleName}`);
                const currentActiveModule = editor.module;
                if (currentActiveModule === moduleName) {
                     cleanupAllModuleIntervals();
                }
                try {
                     editor.removeModule(moduleName);
                     // console.log(`Módulo "${moduleName}" eliminado.`);
                     if (currentActiveModule === moduleName) {
                         // console.log("Cambiando a 'Home' tras eliminar activo.");
                         editor.changeModule('Home'); 
                     } else {
                         // console.log("Módulo inactivo eliminado. Renderizando pestañas.");
                         renderModuleTabs(); 
                         saveHistoryState(true); 
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

function addNodeToDrawFlow(name, pos_x, pos_y) {
  if (!editor || isLocked()) {
      showToast('warning', 'Editor Bloqueado', 'Desbloquea para añadir nodos.');
      return false;
  }
  try {
      const nodeDef = customNodeTypes[name];
      if (!nodeDef) throw new Error(`Tipo de nodo "${name}" desconocido.`);

      const data = JSON.parse(JSON.stringify(nodeDef.data || {}));
      data.isMovementLocked = false; // Default for new nodes
      // Ensure nodeWidth/Height are in data for resizable nodes
      if (nodeDef.cssClass && nodeDef.cssClass.includes('resizable-node-class')) {
          data.nodeWidth = data.nodeWidth || (name === 'image_minimal' ? '80px' : '220px'); // Default or specific for image_minimal
          data.nodeHeight = data.nodeHeight || (name === 'image_minimal' ? '60px' : 'auto');
      }
      
      const rect = editor.container.getBoundingClientRect();
      const zoom = editor.zoom || 1;
      const initialWidthPx = parseFloat(data.nodeWidth) || (name === 'image_minimal' ? 80 : 220);
      // Height is often auto, so we might not use it for centering if 'auto'
      // const initialHeightPx = (data.nodeHeight && data.nodeHeight !== 'auto') ? parseFloat(data.nodeHeight) : (name === 'image_minimal' ? 60 : 80);

      const canvasX = (pos_x - rect.left - editor.canvas_x) / zoom;
      const canvasY = (pos_y - rect.top - editor.canvas_y) / zoom;
      const adjX = canvasX - (initialWidthPx / 2);
      const adjY = canvasY; // Centering Y can be tricky with 'auto' height

      const nodeId = editor.addNode(name, nodeDef.inputs, nodeDef.outputs, adjX, adjY, nodeDef.cssClass || '', data, nodeDef.html );

      setTimeout(() => { 
           const nodeElement = document.getElementById(`node-${nodeId}`);
           if (nodeElement) {
                if (data.nodeWidth) nodeElement.style.width = data.nodeWidth;
                if (data.nodeHeight && data.nodeHeight !== 'auto') nodeElement.style.height = data.nodeHeight;
                
                const resizer = nodeElement.querySelector('.node-resizer');
                if (resizer) {
                    resizer.addEventListener('mousedown', (e) => startNodeResize(e, nodeId, resizer));
                }
                if (name === 'image_minimal') {
                    if (nodeElement.style.border === '') nodeElement.style.border = '2px dashed #cccccc'; // Initial border for image_minimal
                    const placeholder = nodeElement.querySelector('.image-placeholder');
                    if(placeholder) placeholder.style.display = 'flex';
                    setupMinimalImageNodeListeners(nodeId);
                }
                updateNodeVisualLockState(nodeId, data.isMovementLocked);
           }
      }, 0);
       
      activateNodeIfNeeded(nodeId); 
      saveHistoryState(); 
      // console.log(`Node ${name} (ID: ${nodeId}) added successfully at (${adjX.toFixed(0)}, ${adjY.toFixed(0)}).`);
      return true; 

  } catch (e) {
      console.error(`Error adding node "${name}":`, e);
      showToast('error', 'Error al Añadir Nodo', `Error: ${e.message}`);
      return false; 
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
        if (!codeMirrorEditor && typeof CodeMirror !== 'undefined' && codeMirrorElement) {
             // console.warn("CodeMirror element exists but editor instance is null. Retrying init.");
        } else if (!codeMirrorElement) {
             console.warn("CodeMirror container element not found. Cannot initialize.");
             return; 
        } else if (typeof CodeMirror === 'undefined') {
             console.warn("CodeMirror library not loaded. Cannot initialize.");
             return; 
        } else {
             return; 
        }
    }

    try {
        // console.log("Attempting to initialize CodeMirror...");
        codeMirrorContainer = codeMirrorElement;
        codeMirrorEditor = CodeMirror(codeMirrorContainer, {
            lineNumbers: true, mode: "javascript", theme: "material-darker",
            matchBrackets: true, autoCloseBrackets: true, indentUnit: 2,
            tabSize: 2, lineWrapping: true, gutters: ["CodeMirror-linenumbers"]
        });

        if (codeEditorSaveButton) codeEditorSaveButton.addEventListener('click', saveAndCloseCodeEditor);
        else console.warn("Code editor save button not found.");
        if (codeEditorCloseButton) codeEditorCloseButton.addEventListener('click', () => closeCodeEditorSidebar(true));
        else console.warn("Code editor close button not found.");
        // console.log("CodeMirror initialized successfully.");

    } catch (e) {
        console.error("Error initializing CodeMirror:", e);
        codeMirrorEditor = null; 
        showToast('error', 'Error Editor Código', 'Falló la inicialización del editor.');
    }
}

/**
 * Abre la barra lateral del editor CodeMirror para un nodo específico.
 * Carga el contenido correcto del nodo en el editor.
 * @param {string} nodeId - El ID del nodo a editar.
 */
function openCodeEditorSidebar(nodeId) {
    // console.log(`>>> openCodeEditorSidebar llamado para nodo ID: ${nodeId}`); 
    if (!codeEditorSidebar || !nodeId) { console.error("Sidebar element or Node ID missing."); return; }
    if (!codeMirrorEditor) initializeCodeMirror();
    if (!codeMirrorEditor) { showToast('error', 'Editor Error', 'CodeMirror no está disponible.'); return; }

    let node;
    try { node = editor.getNodeFromId(nodeId); } 
    catch (e) { console.error(`Error getting node ${nodeId} to open editor:`, e); showToast('error', 'Error Nodo', 'No se pudo encontrar el nodo para editar.'); return; }

    const editableNodeTypes = ['javascript_code', 'static_code_snippet', 'texto'];
    if (!node || !editableNodeTypes.includes(node.name)) {
        // console.warn(`Intento de abrir editor para nodo no editable o inexistente: ID ${nodeId}, Type ${node?.name}`);
        if (codeEditorSidebar.classList.contains('visible')) closeCodeEditorSidebar(true); 
        return;
    }

    let dataField = '', iconClass = '', editorTitle = '', editorMode = 'text/plain';
    switch (node.name) {
        case 'javascript_code': dataField = 'jscode'; iconClass = 'fab fa-js-square'; editorTitle = 'Editar Código JS'; editorMode = 'javascript'; break;
        case 'static_code_snippet': dataField = 'codecontent'; iconClass = 'fas fa-code'; editorTitle = 'Editar Código Estático'; editorMode = 'text/html'; break;
        case 'texto': dataField = 'content'; iconClass = 'fas fa-paragraph'; editorTitle = 'Editar Texto / HTML'; editorMode = 'text/html'; break;
        default: console.error("Tipo de nodo inesperado en switch:", node.name); return;
    }
    // console.log(`Configuración para ${node.name}: dataField=${dataField}, mode=${editorMode}`);
    const currentCode = node.data[dataField] || '';
    // console.log(`Código interno a cargar: "${currentCode.substring(0, 70)}..." (Longitud: ${currentCode.length})`);

    const currentEditorMode = codeMirrorEditor.getOption('mode');
    if (currentEditorMode !== editorMode) codeMirrorEditor.setOption('mode', editorMode);
    
    try {
        codeMirrorEditor.setValue(currentCode); 
        codeMirrorEditor.clearHistory();      
        // console.log("codeMirrorEditor.setValue() ejecutado con éxito.");
    } catch (e) { console.error("¡ERROR durante codeMirrorEditor.setValue()!:", e); showToast('error', 'Error Editor', 'No se pudo cargar el contenido en el editor.'); }

    if (codeEditorTitleSpan) codeEditorTitleSpan.textContent = editorTitle;
    const titleIconElement = codeEditorSidebar.querySelector('.sidebar-header h3 i');
    if (titleIconElement) titleIconElement.className = iconClass;
    if (editingNodeIdSpan) editingNodeIdSpan.textContent = nodeId;

    currentlyEditingNodeId = nodeId;
    if (!codeEditorSidebar.classList.contains('visible')) {
        codeEditorSidebar.classList.add('visible');
        codeEditorSidebar.setAttribute('aria-hidden', 'false');
        // console.log("Sidebar hecha visible.");
        setTimeout(() => {
            if (codeMirrorEditor) {
                //  console.log("Refrescando y enfocando editor (sidebar recién visible)...");
                 codeMirrorEditor.refresh();
                 codeMirrorEditor.focus();
                 codeMirrorEditor.setCursor({ line: 0, ch: 0 });
             }
        }, 50);
    } else {
        // console.log("Sidebar ya visible, solo enfocando editor...");
        if(codeMirrorEditor) codeMirrorEditor.focus();
    }
    // console.log(`>>> Fin openCodeEditorSidebar para nodo ID: ${nodeId}`);
}

/**
 * Cierra la barra lateral del editor CodeMirror.
 * Opcionalmente guarda los cambios antes de cerrar.
 * @param {boolean} [save=false] - Indica si se deben guardar los cambios del editor.
 */
function closeCodeEditorSidebar(save = false) {
    // console.log(`>>> closeCodeEditorSidebar llamado. Save: ${save}, Editando ID: ${currentlyEditingNodeId}`);
    if (!codeEditorSidebar || !codeEditorSidebar.classList.contains('visible')) {
        if (currentlyEditingNodeId) currentlyEditingNodeId = null;
        return;
    }
    const closingId = currentlyEditingNodeId; 
    if (save && closingId && codeMirrorEditor) {
        // console.log(`Intentando guardar cambios para nodo ${closingId}...`);
        const codeFromEditor = codeMirrorEditor.getValue(); 
        // console.log(`Código obtenido del editor (inicio): "${codeFromEditor.substring(0, 70)}..."`);
        try {
            const node = editor.getNodeFromId(closingId); 
            if (node) {
                const nodeName = node.name;
                let dataField = ''; 
                switch (nodeName) {
                    case 'javascript_code': dataField = 'jscode'; break;
                    case 'static_code_snippet': dataField = 'codecontent'; break;
                    case 'texto': dataField = 'content'; break;
                }
                if (dataField) {
                    const currentInternalCode = node.data[dataField] || '';
                    if (currentInternalCode !== codeFromEditor) {
                        // console.log(`El código ha cambiado. Guardando en node.data.${dataField}...`);
                        try {
                            editor.updateNodeDataFromId(closingId, { [dataField]: codeFromEditor });
                            // console.log(`Datos internos del nodo ${closingId} actualizados.`);
                            const nodeElement = document.getElementById(`node-${closingId}`);
                            const textareaInNode = nodeElement?.querySelector(`textarea[df-${dataField}]`);
                            if (textareaInNode) {
                                textareaInNode.value = codeFromEditor; 
                                // console.log(`Textarea visual [df-${dataField}] dentro del nodo actualizado.`);
                            } else {
                                // console.warn(`No se encontró el textarea [df-${dataField}] visual dentro del nodo ${closingId}.`);
                            }
                            if (nodeName === 'texto' || nodeName === 'static_code_snippet') {
                                // console.log(`Propagando datos actualizados para nodo ${closingId} (${nodeName})`);
                                propagateData(closingId, nodeName, dataField, codeFromEditor);
                            }
                            saveHistoryState();
                            // console.log("Estado guardado en el historial.");
                        } catch (updateError) { console.error(`Error al actualizar datos del nodo ${closingId}:`, updateError); showToast('error', 'Error al Guardar', 'No se pudieron guardar los datos del nodo.'); }
                    } else { 
                        // console.log("El código no cambió respecto a los datos internos. No se requiere guardado."); 
                    }
                } else { 
                    // console.warn(`Campo de datos desconocido para el tipo de nodo '${nodeName}' al intentar guardar.`); 
                }
            } else { console.error(`¡Nodo ${closingId} no encontrado al intentar guardar los cambios!`); showToast('error', 'Error al Guardar', 'No se encontró el nodo para guardar.'); }
        } catch (getNodeError) { console.error(`Error al obtener el nodo ${closingId} para guardar:`, getNodeError); showToast('error', 'Error al Guardar', 'No se pudo obtener la información del nodo.'); }
    } else if (save) { 
        // console.warn("Guardado solicitado, pero faltan condiciones (ID de nodo o editor)."); 
    }

    codeEditorSidebar.classList.remove('visible');
    codeEditorSidebar.setAttribute('aria-hidden', 'true');
    currentlyEditingNodeId = null; 
    if (editingNodeIdSpan) editingNodeIdSpan.textContent = 'N/A'; 
    // console.log("Sidebar cerrada.");
}

function saveAndCloseCodeEditor() {
    // console.log("Botón 'Guardar y Cerrar' presionado.");
    closeCodeEditorSidebar(true); 
}

// --- END CodeMirror Sidebar ---

// --- Status Bar ---
function updateZoomStatus(level) { if (zoomLevelSpan) zoomLevelSpan.textContent = `${Math.round(level * 100)}%`; }
function updateNodePositionStatus(nodeId) { if (nodePositionSpan) { if (nodeId) { const n = editor?.getNodeFromId(nodeId); if (n) nodePositionSpan.textContent = `X:${Math.round(n.pos_x)},Y:${Math.round(n.pos_y)}`; else nodePositionSpan.textContent = `X:-,Y:-`; } else nodePositionSpan.textContent = `X:-,Y:-`; } }

// --- Drawflow Event Listeners ---
function setupDrawflowListeners() {
    if (!editor) { console.error("Cannot setup listeners: Drawflow editor missing."); return; }
    try {
        editor.on('nodeRemoved', (id) => {
            // console.log(`Event: Node Removed ${id}`);
            cleanupNodeIntervals(id); 
            hideCustomContextMenu(); 
            if (selectedNodeId === id) { selectedNodeId = null; updateNodePositionStatus(null); }
            if (currentlyEditingNodeId === id) closeCodeEditorSidebar(false); 
            
            let connectionsFromRemovedNode = [];
            try {
                const nodeDataBeforeRemoval = editor.getNodeFromId(id); 
                if (nodeDataBeforeRemoval && nodeDataBeforeRemoval.outputs) { 
                    Object.values(nodeDataBeforeRemoval.outputs).forEach(outputPort => {
                        connectionsFromRemovedNode = connectionsFromRemovedNode.concat(outputPort.connections || []);
                    });
                }
            } catch (e) { /* console.warn(`Could not reliably get connections from node ${id} during removal event.`); */ }
  
            if (connectionsFromRemovedNode.length > 0) {
                connectionsFromRemovedNode.forEach(conn => {
                    try { 
                        const targetNode = editor.getNodeFromId(conn.node); 
                        if (targetNode) { 
                            const targetName = targetNode.name;
                            const needsRecalc = ['sum', 'subtract', 'multiply', 'divide', 'concatenar'];
                            if (needsRecalc.includes(targetName)) {
                                // console.log(`Node ${id} removed, updating target ${targetName} node ${conn.node}`);
                                switch (targetName) {
                                    case 'sum': setTimeout(() => updateSumNode(conn.node), 0); break;
                                    case 'subtract': setTimeout(() => updateSubtractNode(conn.node), 0); break;
                                    case 'multiply': setTimeout(() => updateMultiplyNode(conn.node), 0); break;
                                    case 'divide': setTimeout(() => updateDivideNode(conn.node), 0); break;
                                    case 'concatenar': setTimeout(() => updateConcatenateNode(conn.node), 0); break;
                                }
                            }
                        }
                    } catch (findTargetError) { /* console.warn(`Error finding target node ${conn.node} during node ${id} removal cleanup.`); */ }
                });
            }
            updateUIDisabledStates();
            saveHistoryState();
        });
  
        editor.on('nodeSelected', (id) => {
            // console.log(`Event: Node Selected ${id}`);
            selectedNodeId = id;
            updateUIDisabledStates();
            updateNodePositionStatus(id);
        });
  
        editor.on('nodeUnselected', (wasSelected) => {
            // console.log(`Event: Node Unselected (was selected: ${wasSelected})`);
            const prevSelected = selectedNodeId;
            selectedNodeId = null;
            updateUIDisabledStates();
            updateNodePositionStatus(null);
            if (prevSelected && prevSelected === currentlyEditingNodeId) {
                closeCodeEditorSidebar(true);
            }
        });
  
        editor.on('nodeMoved', (id) => {
            saveHistoryState();
            if(id === selectedNodeId) updateNodePositionStatus(id);
            try { 
                const node = editor.getNodeFromId(id);
                if(node) {
                    const orderDependentTargets = ['concatenar', 'subtract', 'divide'];
                    const nodeName = node.name;
                    const outputConnections = getConnections(id, 'output');
                    outputConnections.forEach(conn => {
                        try { 
                            const targetNode = editor.getNodeFromId(conn.node);
                            if (targetNode && orderDependentTargets.includes(targetNode.name)) {
                                // console.log(`Node ${id} moved, updating order-dependent target node ${conn.node} (${targetNode.name})`);
                                switch (targetNode.name) {
                                    case 'concatenar': setTimeout(() => updateConcatenateNode(conn.node), 0); break;
                                    case 'subtract': setTimeout(() => updateSubtractNode(conn.node), 0); break;
                                    case 'divide': setTimeout(() => updateDivideNode(conn.node), 0); break;
                                }
                            }
                        } catch (e) { /* console.warn(`Error processing target node ${conn.node} on move of ${id}`); */ }
                    });
                    if (orderDependentTargets.includes(nodeName)) {
                        // console.log(`Order-dependent node ${id} (${nodeName}) moved, recalculating...`);
                        switch (nodeName) {
                            case 'concatenar': setTimeout(() => updateConcatenateNode(id), 0); break;
                            case 'subtract': setTimeout(() => updateSubtractNode(id), 0); break;
                            case 'divide': setTimeout(() => updateDivideNode(id), 0); break;
                        }
                    }
                }
            } catch (e) { /* console.warn(`Error processing nodeMoved for ${id}: ${e.message}`); */ }
        });
  
        editor.on('connectionCreated', (connectionInfo) => {
            // console.log(`Event: Connection Created`, connectionInfo);
            setTimeout(() => {
                try {
                    const sourceNodeId = connectionInfo.output_id;
                    const targetNodeId = connectionInfo.input_id;
                    const sourceNode = editor.getNodeFromId(sourceNodeId);
                    const targetNode = editor.getNodeFromId(targetNodeId);
                    if (!sourceNode || !targetNode) throw new Error("Source or Target node missing after delay.");
                    
                    // console.log(`connectionCreated: Calling propagateData from ${sourceNodeId} to ${targetNodeId}`);
                    propagateData(sourceNodeId, sourceNode.name, null, undefined);
  
                    const targetNodeName = targetNode.name;
                    const recalcNodes = ['sum', 'subtract', 'multiply', 'divide', 'concatenar'];
                    if (recalcNodes.includes(targetNodeName)) {
                        // console.log(`connectionCreated: Recalculating target node ${targetNodeId} (${targetNodeName})`);
                        switch (targetNodeName) {
                            case 'sum': updateSumNode(targetNodeId); break;
                            case 'subtract': updateSubtractNode(targetNodeId); break;
                            case 'multiply': updateMultiplyNode(targetNodeId); break;
                            case 'divide': updateDivideNode(targetNodeId); break;
                            case 'concatenar': updateConcatenateNode(targetNodeId); break;
                        }
                    }
                    saveHistoryState();
                } catch (error) { console.error("Error processing connectionCreated event:", error, "Connection info:", connectionInfo); saveHistoryState(); }
            }, 50);
        });
  
        editor.on('connectionRemoved', (connectionInfo) => {
            // console.log(`Event: Connection Removed`, connectionInfo);
            setTimeout(() => {
                 try { 
                     const targetNodeId = connectionInfo.input_id; 
                     const targetNode = editor.getNodeFromId(targetNodeId);
                     if (targetNode) { 
                         const targetName = targetNode.name;
                         const recalcNodes = ['sum', 'subtract', 'multiply', 'divide', 'concatenar'];
                         if (recalcNodes.includes(targetName)) {
                            //  console.log(`connectionRemoved: Recalculating target node ${targetNodeId} (${targetName})`);
                             switch (targetName) {
                                 case 'sum': updateSumNode(targetNodeId); break;
                                 case 'subtract': updateSubtractNode(targetNodeId); break;
                                 case 'multiply': updateMultiplyNode(targetNodeId); break;
                                 case 'divide': updateDivideNode(targetNodeId); break;
                                 case 'concatenar': updateConcatenateNode(targetNodeId); break;
                             }
                         }
                         if (targetName === 'hybrid_text_replace' && connectionInfo.input_class === 'input_1') {
                            //  console.log(`Hybrid Replace (${targetNodeId}): Input connection removed. Clearing lastInput.`);
                             editor.updateNodeDataFromId(targetNodeId, { lastInput: null });
                         }
                         if (targetName === 'auto_text_replace' && connectionInfo.input_class === 'input_1') {
                            //  console.log(`Auto Replace (${targetNodeId}): Input_1 connection removed. Clearing lastInput & reprocessing.`);
                             editor.updateNodeDataFromId(targetNodeId, { lastInput: "" });
                             const targetNodeElement = document.getElementById(`node-${targetNodeId}`);
                             const lastInputElementUI = targetNodeElement?.querySelector('textarea[df-lastInput]');
                             if (lastInputElementUI) lastInputElementUI.value = "";
                             setTimeout(() => executeAutoReplace(targetNodeId, ""), 0); 
                         }


                     } else { /* console.warn(`connectionRemoved: Target node ${targetNodeId} not found.`); */ }
                     saveHistoryState(); 
                 } catch (error) { console.error("Error processing connectionRemoved event:", error, "Connection info:", connectionInfo); saveHistoryState(); }
            }, 50); 
        });
  
        editor.on('moduleChanged', (name) => {
            console.log(`%cEVENT: Module Changed -> ${name}`, 'color: blue; font-weight: bold;');
            hideCustomContextMenu(); 
            const modulesData = editor.export()?.drawflow;
            if (!modulesData || !modulesData[name]) {
                 console.warn(`Module ${name} not found after moduleChanged event. Falling back to Home.`);
                 name = 'Home';
                 if (!modulesData || !modulesData[name]) editor.addModule('Home');
                 editor.changeModule('Home');
                 return;
            }
            renderModuleTabs();
            initializeHistory();
            selectedNodeId = null; copiedNodeData = null; currentlyEditingNodeId = null;
            updateUIDisabledStates(); updateZoomStatus(editor.zoom); updateNodePositionStatus(null);
            document.title = `Xocoflow | ${currentProjectName} - ${name}`;
            closeCodeEditorSidebar(false);
            setTimeout(() => {
                if(editor.module === name){
                    saveHistoryState(true);
                    activateExistingAutoNodes();
                    // console.log(` -> Module ${name} processing complete.`);
                }
            }, 100);
        });
  
        editor.on('zoom', (level) => { updateZoomStatus(level); });
        editor.on('translate', (pos) => { /* No action needed currently */ });
  
        editor.on('contextmenu', (e) => {
            const nodeElement = e.target.closest(".drawflow-node");
            if (e.target.closest('.drawflow-delete')) {
                e.preventDefault(); 
                hideCustomContextMenu(); 
                return;
            }
            if (nodeElement) {
                const nodeId = nodeElement.id.slice(5); 
                showCustomContextMenu(e, nodeId); 
            } else {
                e.preventDefault(); 
                hideCustomContextMenu(); 
            }
        });
  
        editor.on('click', (e) => {
            const target = e.target;
            if (customContextMenu && !customContextMenu.contains(target)) hideCustomContextMenu();
            if (codeEditorSidebar?.classList.contains('visible') && !target.closest('#code-editor-sidebar') && !target.closest('.drawflow-node')) {
                 closeCodeEditorSidebar(true);
            }
            const ignoreClickTargets = '.drawflow-node, .controls-container, .menu, .swal2-container, #code-editor-sidebar, .nodes-list, .col header, .drawflow-delete, .point, .custom-context-menu'; 
            if (!target.closest(ignoreClickTargets) && selectedNodeId) {
                try { editor.removeSelection(); } catch { /* Ignorar */ }
            }
        });
        // console.log("Drawflow event listeners attached.");
    } catch (e) {
        console.error("Error setting Drawflow listeners:", e);
        showToast('error', 'Critical Error', 'Failed to setup editor events.');
    }
}

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (event) => { try { const active = document.activeElement; const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable || active.closest('.CodeMirror')); const isModal = nodeDefinitionModal?.style.display !== 'none'; const isCM = codeMirrorEditor && codeMirrorEditor.hasFocus(); const isSidebar = codeEditorSidebar?.contains(active); const mainEditorLocked = isLocked(); if (event.key === 'Escape') { if (isModal) { closeNodeDefinitionModal(); event.preventDefault(); return; } if (isCM || (isSidebar && currentlyEditingNodeId)) { closeCodeEditorSidebar(true); event.preventDefault(); return; } if (selectedNodeId) { try{ editor.removeSelection(); } catch { selectedNodeId = null; } updateUIDisabledStates(); event.preventDefault(); return; } } if (isInput && !isCM && !isSidebar) { if ((event.ctrlKey || event.metaKey) && ['a','c','x','v','z','y'].includes(event.key.toLowerCase())) return; if (!['Escape','Delete','Backspace'].includes(event.key)) return; } const ctrl = event.ctrlKey || event.metaKey; if (ctrl) { switch (event.key.toLowerCase()) { case 'z': if(!mainEditorLocked){ event.preventDefault(); undo(); } break; case 'y': if(!mainEditorLocked){ event.preventDefault(); redo(); } break; case 'c': if(selectedNodeId && !mainEditorLocked){event.preventDefault(); copySelectedNode();} break; case 'v': if(!mainEditorLocked){event.preventDefault(); pasteNode();} break; case 'd': if(selectedNodeId && !mainEditorLocked){event.preventDefault(); duplicateSelectedNode();} break; case 's': event.preventDefault(); if (event.shiftKey) promptSaveAs(); else saveProject(currentProjectName); break; case 'o': event.preventDefault(); triggerLoad(); break; case 'r': if(recalculateButton && !mainEditorLocked){event.preventDefault(); recalculateAllNodesInCurrentModule();} break; } } else { switch (event.key) { case 'Delete': case 'Backspace': if (selectedNodeId && !isInput && !mainEditorLocked) { event.preventDefault(); deleteSelectedNode(); } break; } } } catch (e) { console.error("Keyboard shortcut error:", e); } });
function isLocked() { return editor?.editor_mode === 'fixed'; }

// --- Application Initialization ---
function initializeApp() {
    try {
        console.log("🚀 Initializing Xocoflow...");
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
        fileInputElement = checkElement('#file-input');
        nodeDefinitionModal = checkElement('#nodeDefinitionModal');
        modalBackdrop = checkElement('#modalBackdrop');
        codeEditorSidebar = checkElement('#code-editor-sidebar');
        codeMirrorElement = checkElement('#codemirror-container');
        codeEditorSaveButton = checkElement('#save-code-sidebar-btn');
        codeEditorCloseButton = checkElement('#close-code-sidebar-btn');
        editingNodeIdSpan = checkElement('#editing-node-id');
        codeEditorTitleSpan = checkElement('#code-editor-title');

        if (searchInput) searchInput.addEventListener('input', filterNodes);
        if (fileInputElement) fileInputElement.addEventListener('change', loadProjectFromFile);

        if (typeof Drawflow === 'undefined') throw new Error("Drawflow library failed to load.");
        if (typeof CodeMirror === 'undefined') console.warn("CodeMirror library not loaded.");
        if (typeof Swal === 'undefined') console.warn("SweetAlert2 library not loaded.");

        try {
            editor = new Drawflow(drawflowElement);
            editor.reroute = true; editor.editor_mode = 'edit';
            editor.zoom_max = 1.8; editor.zoom_min = 0.25; editor.zoom_value = 0.08;
            // console.log("Drawflow instance created successfully.");
        } catch (e) { throw new Error(`Failed to create Drawflow editor: ${e.message}`); }
        
        editor.start(); 
        // console.log("Drawflow started.");
        setupDrawflowListeners(); 

        const initialExport = editor.export(); const initialModules = initialExport?.drawflow;
        let homeExists = initialModules?.hasOwnProperty('Home');
        if (!initialModules || Object.keys(initialModules).length === 0 || !homeExists) { if (!homeExists) editor.addModule('Home'); if (editor.module !== 'Home') editor.changeModule('Home'); }
        else if (!editor.module || !initialModules[editor.module]) editor.changeModule('Home');
        // console.log(`Initial active module: ${editor.module}`);

        if (drawflowElement) {
            drawflowElement.addEventListener('mousedown', (e) => {
                // Descomenta logs para depuración intensiva si es necesario
                // console.log("%cMOUSEDOWN CAPTURE:", "color: orange; font-weight:bold;", e.target, "Button:", e.button);
        
                // 1. Ignorar clics en los puertos de input/output (para crear conexiones)
                if (e.target.closest('.input') || e.target.closest('.output')) {
                    // console.log("  LOCK: Click on port, allowing.");
                    return;
                }
        
                const nodeElement = e.target.closest(".drawflow-node");
                if (!nodeElement) {
                    // console.log("  LOCK: Click on canvas background.");
                    return; // Clic en el fondo del canvas, no en un nodo
                }
        
                const nodeId = nodeElement.id.slice(5);
                // console.log(`  LOCK: Click targeted node ${nodeId}`);
        
                try {
                    const node = editor.getNodeFromId(nodeId);
                    if (!node) {
                        console.warn(`  LOCK: Node data for ${nodeId} not found!`);
                        return;
                    }
                    
                    const isNodeMovementLocked = node.data && node.data.isMovementLocked === true;
                    // console.log(`  LOCK: Node ${nodeId} isMovementLocked: ${isNodeMovementLocked}`);
        
                    if (isNodeMovementLocked) {
                        // Elementos que, si se hace clic en ellos, DEBEN permitir su interacción normal
                        // y NO deben ser afectados por el bloqueo de movimiento del nodo.
                        const trulyInteractiveSelector = `
                            input[type="color"], input[type="range"], input[type="date"], input[type="time"],
                            select, button, 
                            a[href], 
                            .lock-indicator, 
                            .node-resizer, 
                            details, summary, /* Para permitir abrir/cerrar <details> */
                            .image-placeholder, /* Para el nodo image_minimal */
                            .CodeMirror, /* Si tuvieras un CodeMirror dentro de un nodo */
                            [contenteditable="true"]
                        `; 
                        // Nota: Los inputs de texto y textareas se manejan de forma especial abajo.
        
                        const clickedTrulyInteractive = e.target.closest(trulyInteractiveSelector);
        
                        if (clickedTrulyInteractive) {
                            // Si se hizo clic en el indicador de candado (izquierdo)
                            if (e.button === 0 && clickedTrulyInteractive.closest('.lock-indicator')) {
                                // console.log(`  LOCK: Click on lock indicator for node ${nodeId}. Toggling lock.`);
                                toggleNodeMovementLock(nodeId);
                                e.stopPropagation(); 
                                e.preventDefault();  
                                return; 
                            }
                            // Si se hizo clic en el resizer (izquierdo)
                            // El resizer tiene su propio mousedown listener que llama a startNodeResize,
                            // y startNodeResize hace stopPropagation.
                            // Así que aquí simplemente permitimos que el evento del resizer se dispare.
                            if (e.button === 0 && clickedTrulyInteractive.closest('.node-resizer')) {
                                // console.log(`  LOCK: Click on resizer for node ${nodeId}. Allowing resize mousedown.`);
                                return; 
                            }
        
                            // console.log(`  LOCK: Click on TRULY interactive element inside locked node ${nodeId}. Allowing. Target:`, e.target);
                            return; // Permitir que el evento continúe para estos elementos verdaderamente interactivos
                        }
        
                        // MANEJO ESPECIAL PARA INPUTS DE TEXTO Y TEXTAREAS:
                        // Queremos permitir que el usuario haga clic para enfocar y escribir,
                        // pero NO queremos que un mousedown + drag sobre ellos mueva el nodo.
                        const isTextInputElement = e.target.matches('input[type="text"], input[type="number"], input[type="url"], input[type="email"], input[type="password"], textarea');
                        
                        if (isTextInputElement) {
                            // Si es un clic izquierdo (para enfocar/seleccionar texto)
                            if (e.button === 0) {
                                // console.log(`  LOCK: Left click on text input/textarea in locked node ${nodeId}. Allowing focus/text selection. Target:`, e.target);
                                // NO detenemos la propagación aquí para permitir el foco y la selección.
                                // PERO, Drawflow podría aún así capturar el mousemove para arrastrar el nodo.
                                // Este es el caso difícil.
                                // Una opción es que Drawflow internamente ya respete el no arrastrar si el target es input/textarea.
                                // Si no, necesitaríamos una lógica más compleja en mousemove.
        
                                // Por ahora, intentaremos una estrategia: si el clic es en un input/textarea,
                                // asumimos que es para editarlo, y detenemos la propagación para EVITAR que Drawflow mueva el NODO.
                                // El foco y la edición del input/textarea deberían seguir funcionando.
                                // console.log(`  LOCK: Click on text input/textarea, stopping propagation to prevent node drag, but allowing input interaction.`);
                                e.stopPropagation();
                                // NO hacemos e.preventDefault() aquí para permitir que el input reciba el foco.
                                return; 
                            }
                            // Si es otro botón (ej. clic derecho para menú contextual del navegador sobre el textarea), permitir.
                            // console.log(`  LOCK: Non-left click on text input/textarea in locked node ${nodeId}. Allowing. Target:`, e.target);
                            return;
                        }
        
        
                        // Si el nodo está bloqueado Y el clic NO fue en un elemento de `trulyInteractiveSelector`
                        // NI en un `isTextInputElement` manejado arriba (o sea, es un clic en el "cuerpo" del nodo):
                        // console.log(`  LOCK: NODE ${nodeId} IS LOCKED. Click was on node body. STOPPING PROPAGATION.`);
                        e.stopPropagation(); // ¡CLAVE! Detener el evento de mousedown
        
                        if (e.button === 0 && !nodeElement.classList.contains('selected')) {
                            // console.log(`  LOCK: Programmatically selecting locked node ${nodeId}.`);
                            editor.selectNode(nodeElement.id);
                        }
                        
                        if (e.button !== 2) {
                            // console.log("  LOCK: Preventing default browser action for non-right click on locked node body.");
                            e.preventDefault();
                        }
                    } else {
                        // console.log(`  LOCK: Node ${nodeId} is NOT locked. Allowing default Drawflow behavior.`);
                    }
                } catch (error) {
                    console.warn(`  LOCK: Error during mousedown logic for node ${nodeId}:`, error);
                }
            }, true); // ¡MUY IMPORTANTE: true para usar la fase de captura!
            console.log("Mousedown listener for movement lock (REVISED V2) attached to drawflowElement in CAPTURE phase.");
        } else {
            console.error("drawflowElement (editor container) not found! Cannot attach mousedown listener for movement lock.");
        }
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

function addWelcomeNode(moduleName) { if (!editor || !moduleName || isLocked()) return; try { const exported = editor.export(); const existing = exported?.drawflow?.[moduleName]?.data ?? {}; if (Object.keys(existing).length > 0) return; const html = `<div><div class="title-box welcome-title"><i class="fas fa-rocket"></i> Welcome to ${escapeHtml(moduleName)}!</div><div class="box welcome-box"><p><strong>Quick Start:</strong></p><ul><li><i class="fas fa-mouse-pointer"></i> Drag nodes.</li><li><i class="fas fa-link"></i> Connect outputs <i class="fas fa-arrow-right"></i> to inputs <i class="fas fa-arrow-left"></i>.</li><li><i class="fas fa-edit"></i> Click "Edit Content/Code".</li><li><i class="fas fa-save"></i> Save work.</li><li><i class="fas fa-plus-circle"></i> Explore "Create Node Type".</li></ul></div><div class="node-resizer" title="Redimensionar"><i class="fas fa-expand-alt"></i></div></div>`; const w=280, h=210; const rect = editor.container.getBoundingClientRect(), z=editor.zoom||1; const cx=(rect.width/2-editor.canvas_x)/z, cy=(rect.height/2-editor.canvas_y)/z; const x=cx-w/2, y=cy-h/2; const name='xocoflow_welcome_info'; const nodeData = { nodeWidth: `${w}px`, nodeHeight: `${h}px`, isMovementLocked: false }; if (!customNodeTypes[name]) editor.registerNode(name, null , {}, {}); const id = editor.addNode(name, 0, 0, x, y, 'welcome-node resizable-node-class', nodeData, html); setTimeout(() => { const nodeElement = document.getElementById(`node-${id}`); if (nodeElement) { nodeElement.style.width = nodeData.nodeWidth; nodeElement.style.height = nodeData.nodeHeight; const resizer = nodeElement.querySelector('.node-resizer'); if(resizer) resizer.addEventListener('mousedown', (e) => startNodeResize(e, id, resizer)); updateNodeVisualLockState(id, false);}}, 0); /*console.log(`Welcome node ${id} added to ${moduleName}.`);*/ } catch (e) { console.error(`Error adding welcome node:`, e); } }
function showInitializationError(message) { document.body.innerHTML = `<div style="padding: 20px; background-color: #ffcdd2; border: 2px solid #b71c1c; color: #b71c1c; font-family: sans-serif; text-align: center;"><h1><i class="fas fa-bomb"></i> Critical Error</h1><p>Xocoflow failed to initialize.</p><pre style="text-align: left; white-space: pre-wrap; word-wrap: break-word; background-color: #fff; padding: 10px; border: 1px solid #ccc; margin-top: 15px; max-height: 300px; overflow-y: auto;">${escapeHtml(message)}</pre><p style="margin-top:15px;"><button onclick="location.reload()">Reload</button></p></div>`; }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeApp);
else initializeApp();
// === END OF COMPLETE xocoflow_logic.js ===