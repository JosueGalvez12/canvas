// DOM Nodes
const canvasContainer = document.getElementById("canvas-container");
const colorPicker = document.getElementById("colorPicker");
const brushSize = document.getElementById("brushSize");
const opacitySlider = document.getElementById("opacitySlider");
const brushType = document.getElementById("brushType");
const fillShapeCheckbox = document.getElementById("fillShape");
const layerListEl = document.getElementById("layer-list");
const mirrorAxisEl = document.getElementById("mirror-axis");

const tools = {
    pen: document.getElementById("btn-pen"),
    eraser: document.getElementById("btn-eraser"),
    ruler: document.getElementById("btn-ruler"),
    curve: document.getElementById("btn-curve"),
    rect: document.getElementById("btn-rect"),
    circle: document.getElementById("btn-circle")
};

const btnMirror = document.getElementById("btn-mirror");
const btnClear = document.getElementById("btn-clear");
const btnDownload = document.getElementById("btn-download");
const btnAddLayer = document.getElementById("btn-add-layer");
const btnUndo = document.getElementById("btn-undo");

// State
let layers = []; // Index 0 is the topmost layer visually
let activeLayerIndex = 0;
let layerCounter = 1;

// Undo Stack variables
const undoStack = [];
const MAX_UNDO = 20;

const saveState = () => {
    if (!layers[activeLayerIndex]) return;
    const ctx = layers[activeLayerIndex].ctx;
    const canvas = layers[activeLayerIndex].canvas;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStack.push({
        layerId: layers[activeLayerIndex].id,
        data: imgData
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
};

const undoCommand = () => {
    if (undoStack.length === 0) return;
    const lastState = undoStack.pop();
    const layer = layers.find(l => l.id === lastState.layerId);
    if (layer) {
        layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        layer.ctx.putImageData(lastState.data, 0, 0);
    }
};

let isDrawing = false;
let currentTool = 'pen'; 
let isMirrorEnabled = false;
let mirrorX = window.innerWidth / 2;
let isDraggingMirror = false;

let startX = 0, startY = 0;
let lastPos = {x: 0, y: 0};
let lastMid = {x: 0, y: 0};

// Estado para curva ajustable
let isAdjustingCurve = false;

// =============================
// PREVIEW CANVAS (RULER)
// =============================
const previewCanvas = document.createElement('canvas');
previewCanvas.id = "previewCvs";
const previewCtx = previewCanvas.getContext('2d');
previewCanvas.style.zIndex = "999"; // Siempre hasta arriba
previewCanvas.style.pointerEvents = "auto"; // Captura eventos principales aquí
canvasContainer.appendChild(previewCanvas);

// Setup y Resize Global
const resizeCanvases = () => {
    const allCvs = [...layers.map(l => l.canvas), previewCanvas];
    
    allCvs.forEach(cvs => {
        const temp = document.createElement("canvas");
        temp.width = cvs.width;
        temp.height = cvs.height;
        temp.getContext("2d").drawImage(cvs, 0, 0);

        cvs.width = window.innerWidth;
        cvs.height = window.innerHeight;

        cvs.getContext("2d").drawImage(temp, 0, 0);
    });

    if(mirrorX > window.innerWidth) {
        mirrorX = window.innerWidth / 2;
        mirrorAxisEl.style.left = `${mirrorX}px`;
    }
};
window.addEventListener("resize", resizeCanvases);

const initialSetup = () => {
    previewCanvas.width = window.innerWidth;
    previewCanvas.height = window.innerHeight;
    mirrorX = window.innerWidth / 2;
    mirrorAxisEl.style.left = `${mirrorX}px`;
};
initialSetup();

// =============================
// GESTIÓN DE CAPAS
// =============================
const createLayer = (name) => {
    const cvs = document.createElement('canvas');
    cvs.width = window.innerWidth;
    cvs.height = window.innerHeight;
    const ctx = cvs.getContext('2d');
    
    cvs.style.pointerEvents = "none"; // Solo previewCanvas recibe clics para evitar bugs
    
    const layer = {
        id: Date.now(),
        name: name || `Capa ${layerCounter++}`,
        canvas: cvs,
        ctx: ctx,
        visible: true
    };
    
    // Insertar en HTML antes del previewCanvas (al fondo en DOM es al frente)
    canvasContainer.insertBefore(cvs, previewCanvas);
    layers.unshift(layer); // Unshift pone logica al "frente"
    
    setActiveLayer(0); // Activar recién creada
};

const deleteLayer = (index) => {
    if (layers.length <= 1) return; // Mínimo 1 capa
    layers[index].canvas.remove();
    layers.splice(index, 1);
    
    setActiveLayer(0);
};

const toggleVisibility = (index, ev) => {
    ev.stopPropagation();
    layers[index].visible = !layers[index].visible;
    layers[index].canvas.style.display = layers[index].visible ? 'block' : 'none';
    renderLayersList();
};

const setActiveLayer = (index) => {
    activeLayerIndex = index;
    // Asignar los Z-Index (layers[0] debe ser el más alto de los canvas de dibujo)
    layers.forEach((l, i) => {
        l.canvas.style.zIndex = layers.length - i;
    });
    renderLayersList();
};

const renderLayersList = () => {
    layerListEl.innerHTML = '';
    layers.forEach((layer, i) => {
        const item = document.createElement('div');
        item.className = `layer-item ${i === activeLayerIndex ? 'active' : ''}`;
        item.onclick = () => setActiveLayer(i);
        
        const nameNode = document.createElement('span');
        nameNode.className = 'layer-name';
        nameNode.innerText = layer.name;
        
        const actions = document.createElement('div');
        actions.className = 'layer-actions';
        
        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'layer-btn';
        eyeBtn.innerHTML = `<i class="fas fa-eye${layer.visible ? '' : '-slash'}"></i>`;
        eyeBtn.onclick = (e) => toggleVisibility(i, e);
        
        const delBtn = document.createElement('button');
        delBtn.className = `layer-btn`;
        delBtn.style.color = layers.length === 1 ? '#ccc' : '#ef233c'; 
        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteLayer(i);
        };
        
        actions.appendChild(eyeBtn);
        actions.appendChild(delBtn);
        item.appendChild(nameNode);
        item.appendChild(actions);
        layerListEl.appendChild(item);
    });
};

createLayer("Trazo Principal");
createLayer("Fondo Boceto");

// =============================
// LÓGICA DE DIBUJO E INTERACCIÓN
// =============================

const getActiveCtx = () => layers[activeLayerIndex].ctx;

const getPos = (e) => {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
};

const getPosEnd = (e) => {
    if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
};

const configCtx = (ctx) => {
    ctx.lineWidth = brushSize.value;
    ctx.globalAlpha = parseFloat(opacitySlider.value) || 1;
    
    // Resetear props a defecto para curar estados previos (ejemplo: dashed line -> ruler bug)
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    if (currentTool === 'eraser') {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.globalAlpha = 1; // El borrador siempre al 100% (?) Bueno, a gusto.
    } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = colorPicker.value;
        ctx.fillStyle = colorPicker.value;
        
        switch (brushType.value) {
            case "solid":
                // defaults already set
                break;
            case "square":
                ctx.lineCap = "square";
                ctx.lineJoin = "miter";
                break;
            case "dashed":
                const dashVal = parseInt(brushSize.value) * 1.5;
                ctx.setLineDash([dashVal, dashVal]);
                break;
            case "shadow":
                ctx.shadowColor = colorPicker.value;
                ctx.shadowBlur = parseInt(brushSize.value) * 1.2 + 2;
                break;
        }
    }
};

const getMirroredX = (x) => 2 * mirrorX - x;

const drawShape = (ctxToDraw, type, x1, y1, x2, y2, cX, cY) => {
    configCtx(ctxToDraw);
    ctxToDraw.beginPath();
    if (type === 'rect') {
        ctxToDraw.rect(x1, y1, x2 - x1, y2 - y1);
    } else if (type === 'circle') {
        const r = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        ctxToDraw.arc(x1, y1, r, 0, Math.PI * 2);
    } else if (type === 'line') {
        ctxToDraw.moveTo(x1, y1);
        ctxToDraw.lineTo(x2, y2);
    } else if (type === 'curve') {
        ctxToDraw.moveTo(x1, y1);
        ctxToDraw.quadraticCurveTo(cX, cY, x2, y2);
    }

    if (fillShapeCheckbox.checked && (type === 'rect' || type === 'circle')) {
        ctxToDraw.fill();
    }
    ctxToDraw.stroke();
};

const drawMirroredShape = (ctxToDraw, type, x1, y1, x2, y2, cX, cY) => {
    if (!isMirrorEnabled) return;
    const mx1 = getMirroredX(x1);
    const mx2 = getMirroredX(x2);
    const mcX = cX !== undefined ? getMirroredX(cX) : undefined;
    drawShape(ctxToDraw, type, mx1, y1, mx2, y2, mcX, cY);
};

const startDrawing = (e) => {
    if (e.type === "touchstart") e.preventDefault();
    if (!layers[activeLayerIndex].visible) return; // No dibujar en capa oculta

    const pos = getPos(e);
    
    // Si estamos en la fase 2 de curvatura
    if (currentTool === 'curve' && isAdjustingCurve) {
        isDrawing = true;
        return; // Mantiene startX y lastPos como los extremos originales
    }

    isDrawing = true;
    startX = pos.x; startY = pos.y;
    lastPos = pos;
    lastMid = pos;
    isAdjustingCurve = false; // Reset
    
    // Guardar estado antes de los trazos continuos
    if (!['ruler', 'rect', 'circle', 'curve'].includes(currentTool)) {
        saveState();
    }
};

const draw = (e) => {
    if (!isDrawing) return;
    if (e.type === "touchmove") e.preventDefault();
    
    const pos = getPos(e);
    const ctx = getActiveCtx();
    
    if (['ruler', 'rect', 'circle'].includes(currentTool)) {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        const type = currentTool === 'ruler' ? 'line' : currentTool;
        drawShape(previewCtx, type, startX, startY, pos.x, pos.y);
        drawMirroredShape(previewCtx, type, startX, startY, pos.x, pos.y);
    } else if (currentTool === 'curve') {
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        if (!isAdjustingCurve) {
            // Fase 1: Línea recta
            drawShape(previewCtx, 'line', startX, startY, pos.x, pos.y);
            drawMirroredShape(previewCtx, 'line', startX, startY, pos.x, pos.y);
        } else {
            // Fase 2: Curva usando 'pos' como punto de control y 'lastPos' como punto final
            drawShape(previewCtx, 'curve', startX, startY, lastPos.x, lastPos.y, pos.x, pos.y);
            drawMirroredShape(previewCtx, 'curve', startX, startY, lastPos.x, lastPos.y, pos.x, pos.y);
        }
    } else {
        // Trazo Curvo Continuo Sin Gaps (Lápiz, Borrador)
        configCtx(ctx);
        const mid = {
            x: lastPos.x + (pos.x - lastPos.x) / 2,
            y: lastPos.y + (pos.y - lastPos.y) / 2
        };

        ctx.beginPath();
        ctx.moveTo(lastMid.x, lastMid.y);
        ctx.quadraticCurveTo(lastPos.x, lastPos.y, mid.x, mid.y);
        ctx.stroke();

        if (isMirrorEnabled) {
            const mMidX = getMirroredX(mid.x);
            const mLastPosX = getMirroredX(lastPos.x);
            const mLastMidX = getMirroredX(lastMid.x);
            
            ctx.beginPath();
            ctx.moveTo(mLastMidX, lastMid.y);
            ctx.quadraticCurveTo(mLastPosX, lastPos.y, mMidX, mid.y);
            ctx.stroke();
        }
        
        lastPos = pos;
        lastMid = mid;
    }
};

const stopDrawing = (e) => {
    if (!isDrawing) return;
    
    const pos = getPosEnd(e) || lastPos;
    const ctx = getActiveCtx();
    
    if (['ruler', 'rect', 'circle'].includes(currentTool)) {
        isDrawing = false;
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        saveState();
        const type = currentTool === 'ruler' ? 'line' : currentTool;
        drawShape(ctx, type, startX, startY, pos.x, pos.y);
        drawMirroredShape(ctx, type, startX, startY, pos.x, pos.y);
    } else if (currentTool === 'curve') {
        if (!isAdjustingCurve) {
            // Fin Fase 1
            isDrawing = false;
            lastPos = pos; // Guardar final
            isAdjustingCurve = true; // Empieza fase 2
        } else {
            // Fin Fase 2
            isDrawing = false;
            previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            saveState();
            drawShape(ctx, 'curve', startX, startY, lastPos.x, lastPos.y, pos.x, pos.y);
            drawMirroredShape(ctx, 'curve', startX, startY, lastPos.x, lastPos.y, pos.x, pos.y);
            isAdjustingCurve = false;
        }
    } else {
        isDrawing = false;
        // Acabar curvas continuas
        configCtx(ctx);
        ctx.beginPath();
        ctx.moveTo(lastMid.x, lastMid.y);
        ctx.lineTo(lastPos.x, lastPos.y);
        ctx.stroke();
        
        if (isMirrorEnabled) {
            ctx.beginPath();
            ctx.moveTo(getMirroredX(lastMid.x), lastMid.y);
            ctx.lineTo(getMirroredX(lastPos.x), lastPos.y);
            ctx.stroke();
        }
    }
};

// Listeners al canvas que está por encima de todo
previewCanvas.addEventListener("mousedown", startDrawing);
previewCanvas.addEventListener("mousemove", draw);
previewCanvas.addEventListener("mouseup", stopDrawing);
previewCanvas.addEventListener("mouseleave", stopDrawing);

previewCanvas.addEventListener("touchstart", startDrawing, { passive: false });
previewCanvas.addEventListener("touchmove", draw, { passive: false });
previewCanvas.addEventListener("touchend", stopDrawing);

// =============================
// BOTONES Y HERRAMIENTAS
// =============================
const selectTool = (toolName) => {
    currentTool = toolName;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    tools[toolName].classList.add('active');
};

Object.keys(tools).forEach(t => {
    tools[t].addEventListener('click', () => selectTool(t));
});

btnMirror.addEventListener("click", () => {
    isMirrorEnabled = !isMirrorEnabled;
    if(isMirrorEnabled) {
        btnMirror.classList.add('active');
        mirrorAxisEl.style.display = "block";
    } else {
        btnMirror.classList.remove('active');
        mirrorAxisEl.style.display = "none";
    }
});

btnClear.addEventListener("click", () => {
    saveState();
    const ctx = getActiveCtx();
    const cvs = layers[activeLayerIndex].canvas;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
});

btnUndo.addEventListener("click", undoCommand);
window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undoCommand();
    }
});

btnDownload.addEventListener("click", () => {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = window.innerWidth;
    tempCanvas.height = window.innerHeight;
    const tempCtx = tempCanvas.getContext("2d");

    // Fondo base blanco como hoja
    tempCtx.fillStyle = "#ffffff";
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Pintar capas en orden inverso (del back al top)
    // layers array: índice 0 es FRONT, ultimo índice es BACK.
    for (let i = layers.length - 1; i >= 0; i--) {
        if (layers[i].visible) {
            tempCtx.drawImage(layers[i].canvas, 0, 0);
        }
    }

    const link = document.createElement("a");
    link.download = `toon-draw-${Date.now()}.png`;
    link.href = tempCanvas.toDataURL("image/png");
    link.click();
});

btnAddLayer.addEventListener("click", () => {
    createLayer();
});

// =============================
// LÓGICA DE ESPEJO MÓVIL
// =============================
const updateMirrorAxis = (x) => {
    mirrorX = Math.max(0, Math.min(window.innerWidth, x));
    mirrorAxisEl.style.left = `${mirrorX}px`;
};

mirrorAxisEl.addEventListener("mousedown", (e) => {
    isDraggingMirror = true;
});

window.addEventListener("mousemove", (e) => {
    if (isDraggingMirror) {
        updateMirrorAxis(e.clientX);
    }
});

window.addEventListener("mouseup", () => {
    isDraggingMirror = false;
});

mirrorAxisEl.addEventListener("touchstart", (e) => {
    isDraggingMirror = true;
    e.preventDefault();
}, { passive: false });

window.addEventListener("touchmove", (e) => {
    if (isDraggingMirror && e.touches.length > 0) {
        updateMirrorAxis(e.touches[0].clientX);
    }
}, { passive: false });

window.addEventListener("touchend", () => {
    isDraggingMirror = false;
});
