// DOM Nodes
const canvasContainer = document.getElementById("canvas-container");
const colorPicker = document.getElementById("colorPicker");
const brushSize = document.getElementById("brushSize");
const layerListEl = document.getElementById("layer-list");

const tools = {
    pen: document.getElementById("btn-pen"),
    eraser: document.getElementById("btn-eraser"),
    ruler: document.getElementById("btn-ruler")
};

const btnMirror = document.getElementById("btn-mirror");
const btnClear = document.getElementById("btn-clear");
const btnDownload = document.getElementById("btn-download");
const btnAddLayer = document.getElementById("btn-add-layer");

// State
let layers = []; // Index 0 is the topmost layer visually
let activeLayerIndex = 0;
let layerCounter = 1;

let isDrawing = false;
let currentTool = 'pen'; 
let isMirrorEnabled = false;
let startX = 0, startY = 0;
let lastX = 0, lastY = 0;

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
};
window.addEventListener("resize", resizeCanvases);

const initialSetup = () => {
    previewCanvas.width = window.innerWidth;
    previewCanvas.height = window.innerHeight;
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
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    if (currentTool === 'eraser') {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = colorPicker.value;
    }
};

const startDrawing = (e) => {
    if (e.type === "touchstart") e.preventDefault();
    if (!layers[activeLayerIndex].visible) return; // No dibujar en capa oculta

    isDrawing = true;
    const pos = getPos(e);
    startX = pos.x; startY = pos.y;
    lastX = pos.x; lastY = pos.y;
};

const draw = (e) => {
    if (!isDrawing) return;
    if (e.type === "touchmove") e.preventDefault();
    
    const pos = getPos(e);
    const ctx = getActiveCtx();
    
    if (currentTool === 'ruler') {
        // En Regla usamos el Preview Canvas
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        configCtx(previewCtx);
        
        previewCtx.beginPath();
        previewCtx.moveTo(startX, startY);
        previewCtx.lineTo(pos.x, pos.y);
        previewCtx.stroke();
        
        if (isMirrorEnabled) {
            previewCtx.beginPath();
            previewCtx.moveTo(window.innerWidth - startX, startY);
            previewCtx.lineTo(window.innerWidth - pos.x, pos.y);
            previewCtx.stroke();
        }
    } else {
        // Trazo Curvo Continuo
        configCtx(ctx);
        const midX = lastX + (pos.x - lastX) / 2;
        const midY = lastY + (pos.y - lastY) / 2;

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.quadraticCurveTo(lastX, lastY, midX, midY);
        ctx.stroke();

        if (isMirrorEnabled) {
            const mStartX = window.innerWidth - lastX;
            const mMidX = window.innerWidth - midX;
            ctx.beginPath();
            ctx.moveTo(mStartX, lastY);
            ctx.quadraticCurveTo(mStartX, lastY, mMidX, midY);
            ctx.stroke();
        }
        
        lastX = pos.x;
        lastY = pos.y;
    }
};

const stopDrawing = (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    
    const pos = getPosEnd(e) || {x: lastX, y: lastY};
    const ctx = getActiveCtx();
    
    if (currentTool === 'ruler') {
        // Plasmar preview en la capa activa
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        
        configCtx(ctx);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        
        if (isMirrorEnabled) {
            ctx.beginPath();
            ctx.moveTo(window.innerWidth - startX, startY);
            ctx.lineTo(window.innerWidth - pos.x, pos.y);
            ctx.stroke();
        }
    } else {
        // Acabar curvas
        configCtx(ctx);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(lastX, lastY);
        ctx.stroke();
        
        if (isMirrorEnabled) {
            ctx.beginPath();
            const mX = window.innerWidth - lastX;
            ctx.moveTo(mX, lastY);
            ctx.lineTo(mX, lastY);
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
    if(isMirrorEnabled) btnMirror.classList.add('active');
    else btnMirror.classList.remove('active');
});

btnClear.addEventListener("click", () => {
    const ctx = getActiveCtx();
    const cvs = layers[activeLayerIndex].canvas;
    ctx.clearRect(0, 0, cvs.width, cvs.height);
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
