/**
 * admin.js — Admin panel
 * 2-D overhead map, real-time user tracking, geo-fence drawing, alert log, broadcast
 */
import { createSolaceBridge, TOPICS } from './shared/solace-bridge.js';

// ── DOM ─────────────────────────────────────────────────────────────────────
const canvas            = document.querySelector('#mapCanvas');
const ctx               = canvas.getContext('2d');
const mapWrapper        = document.querySelector('#mapWrapper');
const floorTabEls       = document.querySelectorAll('.floorTab');
const toolSelectBtn     = document.querySelector('#toolSelect');
const toolDrawRectBtn   = document.querySelector('#toolDrawRect');
const toolDrawCircleBtn = document.querySelector('#toolDrawCircle');
const toolDrawPolyBtn   = document.querySelector('#toolDrawPoly');
const btnPublishZones   = document.querySelector('#btnPublishZones');
const btnExportZones    = document.querySelector('#btnExportZones');
const btnImportZones    = document.querySelector('#btnImportZones');
const fileImportEl      = document.querySelector('#fileImport');
const mapHintEl         = document.querySelector('#mapHint');
const userListEl        = document.querySelector('#userList');
const userCountEl       = document.querySelector('#userCountBadge');
const zoneListEl        = document.querySelector('#zoneList');
const zoneCountEl       = document.querySelector('#zoneCountBadge');
const alertLogEl        = document.querySelector('#alertLog');
const broadcastInputEl  = document.querySelector('#broadcastInput');
const btnBroadcast      = document.querySelector('#btnBroadcast');
const btnAddSim         = document.querySelector('#btnAddSim');
const btnClearSim       = document.querySelector('#btnClearSim');
const btnClearLog       = document.querySelector('#btnClearLog');
const connPanelEl       = document.querySelector('#connPanel');
const connPanelToggle   = document.querySelector('#connPanelToggle');
const cfUrlEl           = document.querySelector('#cfUrl');
const cfVpnEl           = document.querySelector('#cfVpn');
const cfUserEl          = document.querySelector('#cfUser');
const cfPassEl          = document.querySelector('#cfPass');
const btnConnectEl      = document.querySelector('#btnConnect');
const connErrorEl       = document.querySelector('#connError');
const connStatusBadge   = document.querySelector('#connStatusBadge');
const zoneModalEl       = document.querySelector('#zoneModal');
const zoneModalTitle    = document.querySelector('#zoneModalTitle');
const mfNameEl          = document.querySelector('#mfName');
const mfTypeEl          = document.querySelector('#mfType');
const mfFloorEl         = document.querySelector('#mfFloor');
const mfWidthEl         = document.querySelector('#mfWidth');
const mfDepthEl         = document.querySelector('#mfDepth');
const mfRadiusEl        = document.querySelector('#mfRadius');
const mfSizeRectEl      = document.querySelector('#mfSizeRect');
const mfSizeCircleEl    = document.querySelector('#mfSizeCircle');
const mfPolyInfoEl      = document.querySelector('#mfPolyInfo');
const mfWarningEl       = document.querySelector('#mfWarning');
const mfColorEl         = document.querySelector('#mfColor');
const btnModalSave      = document.querySelector('#btnModalSave');
const btnModalCancel    = document.querySelector('#btnModalCancel');

// ── World coordinate system ───────────────────────────────────────────────────
// Hospital world: X ∈ [-22, 22], Z ∈ [-17, 17]
const WORLD_X_MIN = -23, WORLD_X_MAX = 23;
const WORLD_Z_MIN = -18, WORLD_Z_MAX = 18;
const FLOOR_COLORS = [null, '#162a3a', '#163331', '#32291f'];
const FLOOR_ACCENTS = [null, '#5db4ff', '#8ee6cb', '#ffd48a'];

const BASE_ZONES = [
    { id:'lobby',    name:'Main Lobby',        x:0,    z:12.5, width:12, depth:8,  color:'rgba(41,89,121,0.55)' },
    { id:'corridor', name:'Clinical Corridor',  x:0,    z:0,    width:12, depth:18, color:'rgba(33,69,92,0.55)' },
    { id:'triage',   name:'Triage Station',     x:-14.5,z:8.5,  width:15, depth:16, color:'rgba(47,116,99,0.55)' },
    { id:'pharmacy', name:'Pharmacy Prep',      x:-14.5,z:-8.5, width:15, depth:16, color:'rgba(124,106,48,0.55)' },
    { id:'icu',      name:'ICU Monitoring',     x:14.5, z:8.5,  width:15, depth:16, color:'rgba(106,82,110,0.55)' },
    { id:'records',  name:'Radiology Records',  x:14.5, z:-8.5, width:15, depth:16, color:'rgba(89,106,57,0.55)' }
];

const STAIR_POSITIONS = [
    { floorNumber:1, x:-5.2, z:12.8, label:'→2F' },
    { floorNumber:2, x:5.2,  z:12.8, label:'→1F' },
    { floorNumber:2, x:-5.2, z:12.8, label:'→3F' },
    { floorNumber:3, x:5.2,  z:12.8, label:'→2F' }
];

// ── Map projection helpers ─────────────────────────────────────────────────────
let mapOffsetX = 0, mapOffsetY = 0, mapScale = 1;

function calcMapTransform() {
    const margin = 40;
    const w = canvas.width - margin * 2;
    const h = canvas.height - margin * 2;
    const scaleX = w / (WORLD_X_MAX - WORLD_X_MIN);
    const scaleY = h / (WORLD_Z_MAX - WORLD_Z_MIN);
    mapScale = Math.min(scaleX, scaleY);
    mapOffsetX = margin + (w - (WORLD_X_MAX - WORLD_X_MIN) * mapScale) / 2;
    mapOffsetY = margin + (h - (WORLD_Z_MAX - WORLD_Z_MIN) * mapScale) / 2;
}

/** World (x, z) → Canvas (cx, cy) */
function toCanvas(wx, wz) {
    return {
        x: mapOffsetX + (wx - WORLD_X_MIN) * mapScale,
        y: mapOffsetY + (WORLD_Z_MAX - wz) * mapScale   // flip Z axis
    };
}

/** Canvas (cx, cy) → World (wx, wz) */
function toWorld(cx, cy) {
    return {
        x: WORLD_X_MIN + (cx - mapOffsetX) / mapScale,
        z: WORLD_Z_MAX - (cy - mapOffsetY) / mapScale
    };
}

function worldW(w) { return w * mapScale; }
function worldH(h) { return h * mapScale; }

// ── State ─────────────────────────────────────────────────────────────────────
let currentFloor = 1;
let activeTool = 'draw'; // 'select' | 'draw'
let drawShape  = 'rect'; // 'rect' | 'circle' | 'polygon'
let drawStart = null;    // { cx, cy, wx, wz }
let drawCurrent = null;  // { cx, cy }
let polyPoints = [];     // [{cx,cy,wx,wz}, ...] for in-progress polygon
let polyDrawing = false;
let draggingVertex = null; // { zoneId, vertexIndex }
let selectedZoneId = null;
let draggingZone = null;   // { zoneId, mode:'move'|'resize-rect'|'resize-circle', grabOffsetX?, grabOffsetZ? }
let editingZoneId = null; // null = new, string = edit

/** @type {Map<string, {userId,floor,x,z,zone,status,lastSeen,color,ghost?:boolean}>} */
const users = new Map();

/** @type {Array<{id,name,type,floorNumber,x,z,width,depth,color,warningText,enabled}>} */
const dangerZones = [];

let solaceBridge = null;
let simInterval = null;
let simUsers = [];

// Stale user cleanup (remove after 15s no updates)
setInterval(() => {
    const cutoff = Date.now() - 15000;
    for (const [id, u] of users) {
        if (!u.ghost && u.lastSeen < cutoff) users.delete(id);
    }
    renderAll();
    updateUserList();
}, 3000);

// ── Colour palette for users ───────────────────────────────────────────────────
const USER_COLORS = ['#77d5ff','#83f3ae','#ffd67d','#ff9adb','#b49aff','#ff9a77','#9affa8','#ffa97d'];
let colorIndex = 0;
function assignColor() { return USER_COLORS[colorIndex++ % USER_COLORS.length]; }

// ── Resize canvas ──────────────────────────────────────────────────────────────
function resizeCanvas() {
    canvas.width  = mapWrapper.clientWidth;
    canvas.height = mapWrapper.clientHeight;
    calcMapTransform();
    renderAll();
}
new ResizeObserver(resizeCanvas).observe(mapWrapper);
resizeCanvas();

// ── Render ─────────────────────────────────────────────────────────────────────
function renderAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawBaseZones();
    drawWalls();
    drawStairs();
    drawDangerZones();
    drawUsers();
    drawDrawingPreview();
}

function drawBackground() {
    ctx.fillStyle = FLOOR_COLORS[currentFloor] ?? '#0d1822';
    const tl = toCanvas(WORLD_X_MIN, WORLD_Z_MAX);
    const br = toCanvas(WORLD_X_MAX, WORLD_Z_MIN);
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    // edge accent
    ctx.strokeStyle = FLOOR_ACCENTS[currentFloor] ?? '#5db4ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
}

function drawBaseZones() {
    BASE_ZONES.forEach(z => {
        const c = toCanvas(z.x - z.width / 2, z.z + z.depth / 2);
        const w = worldW(z.width), h = worldH(z.depth);
        ctx.fillStyle = z.color;
        ctx.fillRect(c.x, c.y, w, h);
        // label
        const center = toCanvas(z.x, z.z);
        ctx.fillStyle = 'rgba(200,235,255,0.65)';
        ctx.font = `bold ${Math.max(10, mapScale * 1.1)}px Bahnschrift,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(z.name, center.x, center.y);
    });
}

function drawWalls() {
    // Approximate wall pattern based on main.js geometry
    ctx.strokeStyle = 'rgba(200,220,235,0.35)';
    ctx.lineWidth = Math.max(1, mapScale * 0.5);
    // outer boundary already in background border
    // inner horizontal dividers
    const walls = [
        // inner verticals (approx)
        { x1:-7, z1:-17, x2:-7, z2:-9 }, { x1:-7, z1:-5, x2:-7, z2:5 }, { x1:-7, z1:9, x2:-7, z2:17 },
        { x1:7,  z1:-17, x2:7,  z2:-9 }, { x1:7,  z1:-5, x2:7,  z2:5 }, { x1:7,  z1:9, x2:7,  z2:17 },
        // inner horizontals
        { x1:-22, z1:0, x2:-7, z2:0 }, { x1:7, z1:0, x2:22, z2:0 }
    ];
    walls.forEach(w => {
        const a = toCanvas(w.x1, w.z1), b = toCanvas(w.x2, w.z2);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
}

function drawStairs() {
    STAIR_POSITIONS.filter(s => s.floorNumber === currentFloor).forEach(s => {
        const c = toCanvas(s.x, s.z);
        ctx.fillStyle = FLOOR_ACCENTS[currentFloor] ?? '#77d5ff';
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(5, mapScale * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.max(8, mapScale * 0.7)}px Bahnschrift,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.label, c.x, c.y);
    });
}

function drawDangerZones() {
    dangerZones.filter(z => z.floorNumber === currentFloor).forEach(z => {
        const alpha = z.enabled ? 0.22 : 0.08;
        const stroke = z.enabled ? z.color : 'rgba(150,150,150,0.4)';
        const lw = selectedZoneId === z.id ? 3 : 2;
        ctx.setLineDash(z.enabled ? [] : [4, 4]);

        if (z.shape === 'circle') {
            const c = toCanvas(z.x, z.z);
            const r = (z.radius ?? 4) * mapScale;
            ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            ctx.fillStyle = hexToRgba(z.color, alpha); ctx.fill();
            ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = stroke;
            ctx.font = `bold ${Math.max(9, mapScale * 0.85)}px Bahnschrift,sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(z.name, c.x, c.y - 6);
            ctx.font = `${Math.max(8, mapScale * 0.65)}px Bahnschrift,sans-serif`;
            ctx.fillStyle = 'rgba(200,235,255,0.5)';
            ctx.fillText(`r=${(z.radius ?? 4).toFixed(1)}`, c.x, c.y + 8);

            if (activeTool === 'select' && selectedZoneId === z.id) {
                const h = getCircleHandles(z);
                ctx.beginPath();
                ctx.arc(h.move.x, h.move.y, 5.5, 0, Math.PI * 2);
                ctx.fillStyle = '#eef7fd';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = z.color;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(h.resize.x, h.resize.y, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#ffd67d';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = z.color;
                ctx.stroke();
            }

        } else if (z.shape === 'polygon' && z.points?.length >= 3) {
            ctx.beginPath();
            z.points.forEach((p, i) => {
                const c = toCanvas(p.x, p.z);
                if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y);
            });
            ctx.closePath();
            ctx.fillStyle = hexToRgba(z.color, alpha); ctx.fill();
            ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
            ctx.setLineDash([]);
            const cx = toCanvas(z.x, z.z);
            ctx.fillStyle = stroke;
            ctx.font = `bold ${Math.max(9, mapScale * 0.85)}px Bahnschrift,sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(z.name, cx.x, cx.y);

            // vertex handles when selected in select mode
            if (activeTool === 'select' && selectedZoneId === z.id) {
                z.points.forEach((p, idx) => {
                    const v = toCanvas(p.x, p.z);
                    const active = draggingVertex?.zoneId === z.id && draggingVertex?.vertexIndex === idx;
                    ctx.beginPath();
                    ctx.arc(v.x, v.y, active ? 6 : 5, 0, Math.PI * 2);
                    ctx.fillStyle = active ? '#ffd67d' : '#eef7fd';
                    ctx.fill();
                    ctx.lineWidth = 1.5;
                    ctx.strokeStyle = z.color;
                    ctx.stroke();
                });
            }

        } else {
            // rect (default)
            const c = toCanvas(z.x - (z.width ?? 4) / 2, z.z + (z.depth ?? 4) / 2);
            const w = worldW(z.width ?? 4), h = worldH(z.depth ?? 4);
            ctx.fillStyle = hexToRgba(z.color, alpha); ctx.fillRect(c.x, c.y, w, h);
            ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeRect(c.x, c.y, w, h);
            ctx.setLineDash([]);
            const center = toCanvas(z.x, z.z);
            ctx.fillStyle = stroke;
            ctx.font = `bold ${Math.max(9, mapScale * 0.85)}px Bahnschrift,sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(z.name, center.x, center.y - 6);
            ctx.font = `${Math.max(8, mapScale * 0.65)}px Bahnschrift,sans-serif`;
            ctx.fillStyle = 'rgba(200,235,255,0.5)';
            ctx.fillText(`${(z.width ?? 4).toFixed(1)} × ${(z.depth ?? 4).toFixed(1)}`, center.x, center.y + 8);

            if (activeTool === 'select' && selectedZoneId === z.id) {
                const h = getRectHandles(z);
                ctx.beginPath();
                ctx.arc(h.move.x, h.move.y, 5.5, 0, Math.PI * 2);
                ctx.fillStyle = '#eef7fd';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = z.color;
                ctx.stroke();

                ctx.beginPath();
                ctx.rect(h.resize.x - 5, h.resize.y - 5, 10, 10);
                ctx.fillStyle = '#ffd67d';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = z.color;
                ctx.stroke();
            }
        }
    });
}

function drawUsers() {
    users.forEach((u) => {
        if (u.floor !== currentFloor) return;
        const c = toCanvas(u.x, u.z);
        const radius = Math.max(7, mapScale * 0.7);
        // shadow
        ctx.beginPath(); ctx.arc(c.x, c.y + 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
        // dot
        ctx.beginPath(); ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = u.ghost ? 'rgba(130,155,175,0.7)' : u.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
        // label
        const labelText = u.ghost
            ? (u.userId ?? 'Bot').replace('_ghost_','sim-')
            : (u.userId ?? '?').split('_')[0];
        ctx.fillStyle = '#eef7fd';
        ctx.font = `600 ${Math.max(10, mapScale * 0.85)}px Bahnschrift,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(labelText, c.x, c.y - radius - 2);
    });
}

function drawDrawingPreview() {
    if (drawShape === 'polygon') {
        if (polyPoints.length === 0) return;
        ctx.strokeStyle = '#ff5e6a'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.beginPath();
        polyPoints.forEach((p, i) => { if (i === 0) ctx.moveTo(p.cx, p.cy); else ctx.lineTo(p.cx, p.cy); });
        if (drawCurrent) ctx.lineTo(drawCurrent.cx, drawCurrent.cy);
        ctx.stroke(); ctx.setLineDash([]);
        // first-point close-handle
        const fp = polyPoints[0];
        ctx.beginPath(); ctx.arc(fp.cx, fp.cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,94,106,0.5)'; ctx.fill();
        ctx.strokeStyle = '#ff5e6a'; ctx.lineWidth = 1.5; ctx.stroke();
        return;
    }
    if (!drawStart || !drawCurrent) return;
    if (drawShape === 'circle') {
        const r = Math.hypot(drawCurrent.cx - drawStart.cx, drawCurrent.cy - drawStart.cy);
        ctx.beginPath(); ctx.arc(drawStart.cx, drawStart.cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,94,106,0.15)'; ctx.fill();
        ctx.strokeStyle = '#ff5e6a'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,200,200,0.9)';
        ctx.font = '11px Bahnschrift,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(`r=${(r / mapScale).toFixed(1)}`, drawStart.cx, drawStart.cy + r + 4);
        return;
    }
    // rect
    const x = Math.min(drawStart.cx, drawCurrent.cx);
    const y = Math.min(drawStart.cy, drawCurrent.cy);
    const w = Math.abs(drawCurrent.cx - drawStart.cx);
    const h = Math.abs(drawCurrent.cy - drawStart.cy);
    ctx.fillStyle = 'rgba(255,94,106,0.15)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ff5e6a'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    const wWorld = Math.abs(drawStart.wx - toWorld(drawCurrent.cx, drawCurrent.cy).x).toFixed(1);
    const hWorld = Math.abs(drawStart.wz - toWorld(drawCurrent.cx, drawCurrent.cy).z).toFixed(1);
    ctx.fillStyle = 'rgba(255,200,200,0.9)';
    ctx.font = '11px Bahnschrift,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`${wWorld} × ${hWorld}`, x + w / 2, y + 2);
}

function hexToRgba(hex, alpha) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
}

// ── Floor switching ────────────────────────────────────────────────────────────
floorTabEls.forEach(tab => {
    tab.addEventListener('click', () => {
        currentFloor = parseInt(tab.dataset.floor, 10);
        floorTabEls.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderAll();
    });
});

// ── Tool switching ─────────────────────────────────────────────────────────────
const DRAW_HINTS = {
    select:  'Select mode: drag zone to move · drag handle to resize · double-click for exact numeric edit',
    rect:    'Drag to draw a rectangle zone · Click existing zone to edit',
    circle:  'Drag from centre to edge to draw a circle zone · Click existing zone to edit',
    polygon: 'Click to place vertices · Double-click or click near start to finish'
};

function setActiveTool(tool) {
    activeTool = tool === 'select' ? 'select' : 'draw';
    drawShape = tool === 'select' ? drawShape : tool;
    polyDrawing = false; polyPoints = []; drawStart = null; drawCurrent = null;
    [toolSelectBtn, toolDrawRectBtn, toolDrawCircleBtn, toolDrawPolyBtn].forEach(b => b?.classList.remove('active'));
    const btn = { select: toolSelectBtn, rect: toolDrawRectBtn, circle: toolDrawCircleBtn, polygon: toolDrawPolyBtn }[tool];
    btn?.classList.add('active');
    canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    mapHintEl.textContent = DRAW_HINTS[tool] ?? '';
    renderAll();
}

toolSelectBtn.addEventListener('click',     () => setActiveTool('select'));
toolDrawRectBtn.addEventListener('click',   () => setActiveTool('rect'));
toolDrawCircleBtn.addEventListener('click', () => setActiveTool('circle'));
toolDrawPolyBtn.addEventListener('click',   () => setActiveTool('polygon'));

// ── Canvas mouse events ────────────────────────────────────────────────────────
function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// ── Helper: point-in-zone (shape-aware) ───────────────────────────────────────
function pointInPolygon(px, pz, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, zi = points[i].z;
        const xj = points[j].x, zj = points[j].z;
        const intersect = ((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function recenterPolygon(zone) {
    if (!zone?.points?.length) return;
    zone.x = zone.points.reduce((s, p) => s + p.x, 0) / zone.points.length;
    zone.z = zone.points.reduce((s, p) => s + p.z, 0) / zone.points.length;
}

function findPolygonVertexAtCanvas(zone, cx, cy, maxDist = 10) {
    if (!zone?.points?.length) return -1;
    let hit = -1;
    let best = maxDist;
    zone.points.forEach((p, i) => {
        const c = toCanvas(p.x, p.z);
        const d = Math.hypot(cx - c.x, cy - c.y);
        if (d <= best) { best = d; hit = i; }
    });
    return hit;
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const wx = px - ax, wy = py - ay;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(px - ax, py - ay);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(px - bx, py - by);
    const t = c1 / c2;
    const sx = ax + t * vx, sy = ay + t * vy;
    return Math.hypot(px - sx, py - sy);
}

function findEdgeInsertIndex(zone, cx, cy, threshold = 10) {
    if (!zone?.points || zone.points.length < 2) return -1;
    const c = toCanvas(zone.x, zone.z);
    let best = threshold;
    let bestIndex = -1;
    for (let i = 0; i < zone.points.length; i++) {
        const a = zone.points[i];
        const b = zone.points[(i + 1) % zone.points.length];
        const ac = toCanvas(a.x, a.z);
        const bc = toCanvas(b.x, b.z);
        const d = pointToSegmentDistance(cx, cy, ac.x, ac.y, bc.x, bc.y);
        if (d < best) {
            best = d;
            bestIndex = i;
        }
    }
    return bestIndex;
}

function getRectHandles(zone) {
    const c = toCanvas(zone.x, zone.z);
    const hx = (zone.width ?? 4) * mapScale / 2;
    const hy = (zone.depth ?? 4) * mapScale / 2;
    return {
        move: { x: c.x, y: c.y },
        resize: { x: c.x + hx, y: c.y + hy }
    };
}

function getCircleHandles(zone) {
    const c = toCanvas(zone.x, zone.z);
    const r = (zone.radius ?? 4) * mapScale;
    return {
        move: { x: c.x, y: c.y },
        resize: { x: c.x + r, y: c.y }
    };
}

function findRectHandleAtCanvas(zone, cx, cy) {
    const h = getRectHandles(zone);
    if (Math.hypot(cx - h.resize.x, cy - h.resize.y) <= 10) return 'resize';
    if (Math.hypot(cx - h.move.x, cy - h.move.y) <= 10) return 'move';
    return null;
}

function findCircleHandleAtCanvas(zone, cx, cy) {
    const h = getCircleHandles(zone);
    if (Math.hypot(cx - h.resize.x, cy - h.resize.y) <= 10) return 'resize';
    if (Math.hypot(cx - h.move.x, cy - h.move.y) <= 10) return 'move';
    return null;
}

function isPointInZone(px, pz, z) {
    if (!z.enabled) return false;
    if (z.shape === 'circle') return Math.hypot(px - z.x, pz - z.z) <= (z.radius ?? 4);
    if (z.shape === 'polygon') return z.points?.length >= 3 && pointInPolygon(px, pz, z.points);
    return Math.abs(px - z.x) <= (z.width ?? 4) / 2 && Math.abs(pz - z.z) <= (z.depth ?? 4) / 2;
}

function findZoneAtCanvas(cx, cy) {
    const w = toWorld(cx, cy);
    // Search in reverse so the top-most drawn zone is hit first
    return [...dangerZones].reverse().find(z => {
        if (z.floorNumber !== currentFloor) return false;
        if (z.shape === 'circle') {
            const c = toCanvas(z.x, z.z);
            return Math.hypot(cx - c.x, cy - c.y) <= (z.radius ?? 4) * mapScale;
        }
        if (z.shape === 'polygon' && z.points?.length >= 3) {
            return pointInPolygon(w.x, w.z, z.points);
        }
        return w.x >= z.x - (z.width ?? 4) / 2 && w.x <= z.x + (z.width ?? 4) / 2
            && w.z >= z.z - (z.depth ?? 4) / 2 && w.z <= z.z + (z.depth ?? 4) / 2;
    }) ?? null;
}

canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const { x: cx, y: cy } = getCanvasPos(e);
    const { x: wx, z: wz } = toWorld(cx, cy);

    if (activeTool === 'select') {
        const hit = findZoneAtCanvas(cx, cy);
        selectedZoneId = hit?.id ?? null;

        if (!hit) {
            renderAll();
            return;
        }

        // Rect/Circle: drag to move, drag handle to resize.
        if (hit.shape === 'circle') {
            const handle = findCircleHandleAtCanvas(hit, cx, cy);
            if (handle === 'resize') {
                draggingZone = { zoneId: hit.id, mode: 'resize-circle' };
            } else {
                draggingZone = { zoneId: hit.id, mode: 'move', grabOffsetX: wx - hit.x, grabOffsetZ: wz - hit.z };
            }
            canvas.style.cursor = 'grabbing';
            renderAll();
            return;
        }

        if (hit.shape !== 'polygon') {
            const handle = findRectHandleAtCanvas(hit, cx, cy);
            if (handle === 'resize') {
                draggingZone = { zoneId: hit.id, mode: 'resize-rect' };
            } else {
                draggingZone = { zoneId: hit.id, mode: 'move', grabOffsetX: wx - hit.x, grabOffsetZ: wz - hit.z };
            }
            canvas.style.cursor = 'grabbing';
            renderAll();
            return;
        }

        if (hit?.shape === 'polygon' && hit.points?.length >= 3) {
            const vertexIndex = findPolygonVertexAtCanvas(hit, cx, cy);
            if (vertexIndex >= 0) {
                draggingVertex = { zoneId: hit.id, vertexIndex };
                canvas.style.cursor = 'grabbing';
                renderAll();
                return;
            }

            // Shift + click edge inserts a new vertex for fine adjustment.
            if (e.shiftKey) {
                const edgeIndex = findEdgeInsertIndex(hit, cx, cy);
                if (edgeIndex >= 0) {
                    hit.points.splice(edgeIndex + 1, 0, { x: wx, z: wz });
                    recenterPolygon(hit);
                    renderAll();
                    updateZoneList();
                    return;
                }
            }

            // Polygon click in select mode only selects by default.
        }
        renderAll();
        return;
    }

    if (drawShape === 'polygon') {
        if (!polyDrawing) {
            // Check if clicking an existing zone first
            const hit = findZoneAtCanvas(cx, cy);
            if (hit) { selectedZoneId = hit.id; openEditModal(hit.id); return; }
            polyDrawing = true;
            polyPoints = [{ cx, cy, wx, wz }];
        } else {
            // Check close-to-first-point to finish
            const fp = polyPoints[0];
            if (polyPoints.length >= 3 && Math.hypot(cx - fp.cx, cy - fp.cy) < 14) {
                finishPolygon();
                return;
            }
            polyPoints.push({ cx, cy, wx, wz });
        }
        drawCurrent = { cx, cy };
        renderAll();
        return;
    }

    // rect or circle — check for zone hit first
    const hit = findZoneAtCanvas(cx, cy);
    if (hit) { selectedZoneId = hit.id; openEditModal(hit.id); return; }

    drawStart   = { cx, cy, wx, wz };
    drawCurrent = { cx, cy };
});

canvas.addEventListener('mousemove', e => {
    if (draggingZone) {
        const { x: cx, y: cy } = getCanvasPos(e);
        const w = toWorld(cx, cy);
        const z = dangerZones.find(d => d.id === draggingZone.zoneId);
        if (!z) return;

        if (draggingZone.mode === 'move') {
            const nx = w.x - (draggingZone.grabOffsetX ?? 0);
            const nz = w.z - (draggingZone.grabOffsetZ ?? 0);
            const dx = nx - z.x;
            const dz = nz - z.z;
            z.x = nx;
            z.z = nz;
            if (z.shape === 'polygon' && z.points?.length) {
                z.points = z.points.map(p => ({ x: p.x + dx, z: p.z + dz }));
            }
        } else if (draggingZone.mode === 'resize-circle') {
            z.radius = Math.max(0.5, Math.hypot(w.x - z.x, w.z - z.z));
        } else if (draggingZone.mode === 'resize-rect') {
            z.width = Math.max(1, Math.abs(w.x - z.x) * 2);
            z.depth = Math.max(1, Math.abs(w.z - z.z) * 2);
        }
        renderAll();
        return;
    }
    if (draggingVertex) {
        const { x: cx, y: cy } = getCanvasPos(e);
        const w = toWorld(cx, cy);
        const z = dangerZones.find(d => d.id === draggingVertex.zoneId);
        if (z?.shape === 'polygon' && z.points?.[draggingVertex.vertexIndex]) {
            z.points[draggingVertex.vertexIndex] = { x: w.x, z: w.z };
            recenterPolygon(z);
            renderAll();
        }
        return;
    }
    if (drawShape === 'polygon' && polyDrawing) {
        const { x: cx, y: cy } = getCanvasPos(e);
        drawCurrent = { cx, cy };
        renderAll();
        return;
    }
    if (!drawStart) return;
    const { x: cx, y: cy } = getCanvasPos(e);
    drawCurrent = { cx, cy };
    renderAll();
});

canvas.addEventListener('mouseup', e => {
    if (draggingZone) {
        draggingZone = null;
        canvas.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
        updateZoneList();
        renderAll();
        return;
    }
    if (draggingVertex) {
        draggingVertex = null;
        canvas.style.cursor = 'default';
        updateZoneList();
        renderAll();
        return;
    }
    if (drawShape === 'polygon') return; // polygon finishes on dblclick
    if (!drawStart) return;
    const { x: cx, y: cy } = getCanvasPos(e);
    const worldEnd = toWorld(cx, cy);
    // capture before clearing (fixes null-ref bug)
    const { cx: startCx, cy: startCy, wx: startWx, wz: startWz } = drawStart;
    drawStart = null; drawCurrent = null;

    if (drawShape === 'circle') {
        const radius = Math.hypot(cx - startCx, cy - startCy) / mapScale;
        if (radius < 0.5) { renderAll(); return; }
        editingZoneId = null;
        zoneModalEl._pendingShape  = 'circle';
        zoneModalEl._pendingX      = startWx;
        zoneModalEl._pendingZ      = startWz;
        zoneModalEl._pendingRadius = radius;
        syncModalShapeFields('circle');
        zoneModalTitle.textContent = 'New Circle Geo-Fence';
        mfNameEl.value = ''; mfTypeEl.value = 'restricted';
        mfFloorEl.value = String(currentFloor);
        mfRadiusEl.value = radius.toFixed(1);
        mfWarningEl.value = ''; mfColorEl.value = '#ff5e6a';
        zoneModalEl.classList.add('open');
        renderAll();
        return;
    }

    // rect
    const width  = Math.abs(worldEnd.x - startWx);
    const depth  = Math.abs(worldEnd.z - startWz);
    if (width < 0.5 || depth < 0.5) { renderAll(); return; }
    editingZoneId = null;
    zoneModalEl._pendingShape = 'rect';
    zoneModalEl._pendingX = startWx + (worldEnd.x - startWx) / 2;
    zoneModalEl._pendingZ = startWz + (worldEnd.z - startWz) / 2;
    syncModalShapeFields('rect');
    zoneModalTitle.textContent = 'New Rectangle Geo-Fence';
    mfNameEl.value = ''; mfTypeEl.value = 'restricted';
    mfFloorEl.value = String(currentFloor);
    mfWidthEl.value = width.toFixed(1);
    mfDepthEl.value = depth.toFixed(1);
    mfWarningEl.value = ''; mfColorEl.value = '#ff5e6a';
    zoneModalEl.classList.add('open');
    renderAll();
});

canvas.addEventListener('dblclick', e => {
    if (activeTool === 'select') {
        const { x: cx, y: cy } = getCanvasPos(e);
        const hit = findZoneAtCanvas(cx, cy);
        if (hit) {
            selectedZoneId = hit.id;
            openEditModal(hit.id);
            renderAll();
            return;
        }
    }
    if (drawShape !== 'polygon' || !polyDrawing) return;
    e.preventDefault();
    // Double-click adds the final point via mousedown already, so pop duplicate if >=4
    if (polyPoints.length > 3) polyPoints.pop();
    if (polyPoints.length >= 3) finishPolygon();
});

canvas.addEventListener('mouseleave', () => {
    if (draggingZone) {
        draggingZone = null;
        canvas.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
    }
    if (draggingVertex) {
        draggingVertex = null;
        canvas.style.cursor = activeTool === 'select' ? 'default' : 'crosshair';
    }
    if (drawStart) { drawStart = null; drawCurrent = null; renderAll(); }
    if (polyDrawing) { drawCurrent = null; renderAll(); }
});

canvas.addEventListener('contextmenu', e => {
    if (activeTool !== 'select') return;
    const { x: cx, y: cy } = getCanvasPos(e);
    const hit = findZoneAtCanvas(cx, cy);
    if (!(hit?.shape === 'polygon' && hit.points?.length > 3)) return;
    const vertexIndex = findPolygonVertexAtCanvas(hit, cx, cy);
    if (vertexIndex < 0) return;
    e.preventDefault();
    hit.points.splice(vertexIndex, 1);
    recenterPolygon(hit);
    selectedZoneId = hit.id;
    renderAll();
    updateZoneList();
});

// Delete key removes selected zone
window.addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedZoneId) {
        const idx = dangerZones.findIndex(z => z.id === selectedZoneId);
        if (idx !== -1) {
            dangerZones.splice(idx, 1);
            selectedZoneId = null;
            renderAll();
            updateZoneList();
        }
    }
});

// ── Zone modal helpers ──────────────────────────────────────────────────────────
function syncModalShapeFields(shape) {
    mfSizeRectEl.style.display   = shape === 'rect'    ? '' : 'none';
    mfSizeCircleEl.style.display = shape === 'circle'  ? '' : 'none';
    mfPolyInfoEl.style.display   = shape === 'polygon' ? '' : 'none';
}

function finishPolygon() {
    if (polyPoints.length < 3) { polyDrawing = false; polyPoints = []; drawCurrent = null; renderAll(); return; }
    const pts = polyPoints.map(p => ({ x: p.wx, z: p.wz }));
    const cx  = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cz  = pts.reduce((s, p) => s + p.z, 0) / pts.length;
    polyDrawing = false; polyPoints = []; drawCurrent = null;

    editingZoneId = null;
    zoneModalEl._pendingShape  = 'polygon';
    zoneModalEl._pendingX      = cx;
    zoneModalEl._pendingZ      = cz;
    zoneModalEl._pendingPoints = pts;
    syncModalShapeFields('polygon');
    zoneModalTitle.textContent = 'New Polygon Geo-Fence';
    mfNameEl.value = ''; mfTypeEl.value = 'restricted';
    mfFloorEl.value = String(currentFloor);
    mfWarningEl.value = ''; mfColorEl.value = '#ff5e6a';
    zoneModalEl.classList.add('open');
    renderAll();
}

function openEditModal(zoneId) {
    const z = dangerZones.find(z => z.id === zoneId);
    if (!z) return;
    editingZoneId = zoneId;
    const shape = z.shape ?? 'rect';
    syncModalShapeFields(shape);
    zoneModalTitle.textContent = 'Edit Geo-Fence';
    mfNameEl.value    = z.name;
    mfTypeEl.value    = z.type ?? 'restricted';
    mfFloorEl.value   = String(z.floorNumber);
    mfWarningEl.value = z.warningText ?? '';
    mfColorEl.value   = z.color ?? '#ff5e6a';
    if (shape === 'circle') {
        mfRadiusEl.value = (z.radius ?? 4).toFixed(1);
    } else if (shape !== 'polygon') {
        mfWidthEl.value = (z.width ?? 4).toFixed(1);
        mfDepthEl.value = (z.depth ?? 4).toFixed(1);
    }
    zoneModalEl.classList.add('open');
}

btnModalSave.addEventListener('click', () => {
    const name    = mfNameEl.value.trim();
    const type    = mfTypeEl.value;
    const floor   = parseInt(mfFloorEl.value, 10);
    const warning = mfWarningEl.value.trim();
    const color   = mfColorEl.value;
    if (!name) return;

    if (editingZoneId) {
        const z = dangerZones.find(z => z.id === editingZoneId);
        if (z) {
            const shape = z.shape ?? 'rect';
            Object.assign(z, { name, type, floorNumber: floor, warningText: warning, color });
            if (shape === 'circle') {
                const r = parseFloat(mfRadiusEl.value);
                if (Number.isFinite(r) && r > 0) z.radius = r;
            } else if (shape !== 'polygon') {
                const w = parseFloat(mfWidthEl.value), d = parseFloat(mfDepthEl.value);
                if (Number.isFinite(w) && w > 0) z.width = w;
                if (Number.isFinite(d) && d > 0) z.depth = d;
            }
        }
    } else {
        const shape = zoneModalEl._pendingShape ?? 'rect';
        const base = {
            id: `zone_${Date.now()}`, name, type,
            floorNumber: floor,
            x: zoneModalEl._pendingX ?? 0,
            z: zoneModalEl._pendingZ ?? 0,
            warningText: warning, color, enabled: true, shape
        };
        if (shape === 'circle') {
            const r = parseFloat(mfRadiusEl.value);
            base.radius = Number.isFinite(r) && r > 0 ? r : (zoneModalEl._pendingRadius ?? 4);
        } else if (shape === 'polygon') {
            base.points = zoneModalEl._pendingPoints ?? [];
        } else {
            const w = parseFloat(mfWidthEl.value), d = parseFloat(mfDepthEl.value);
            if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(d) || d <= 0) return;
            base.width = w; base.depth = d;
        }
        dangerZones.push(base);
    }

    zoneModalEl.classList.remove('open');
    editingZoneId = null;
    renderAll();
    updateZoneList();
});

btnModalCancel.addEventListener('click', () => {
    zoneModalEl.classList.remove('open');
    editingZoneId = null;
});

// close modal on backdrop click
zoneModalEl.addEventListener('click', e => {
    if (e.target === zoneModalEl) {
        zoneModalEl.classList.remove('open');
        editingZoneId = null;
    }
});

// ── Zone list (sidebar) ────────────────────────────────────────────────────────
function updateZoneList() {
    zoneCountEl.textContent = dangerZones.length;
    zoneListEl.innerHTML = '';
    dangerZones.forEach(z => {
        const item = document.createElement('div');
        item.className = 'zoneItem';

        const swatch = document.createElement('div');
        swatch.className = 'zoneSwatch';
        swatch.style.background = z.color;

        const name = document.createElement('span');
        name.className = 'zoneName';
        name.textContent = z.name;

        const floor = document.createElement('span');
        floor.className = 'zoneFloor';
        floor.textContent = `${z.floorNumber}F`;

        const toggle = document.createElement('button');
        toggle.className = 'zoneToggle';
        toggle.textContent = z.enabled ? 'Active' : 'Inactive';
        toggle.style.background = z.enabled ? 'rgba(131,243,174,.14)' : 'rgba(255,94,106,.14)';
        toggle.style.color       = z.enabled ? '#83f3ae'               : '#ff5e6a';
        toggle.style.border      = 'none';
        toggle.addEventListener('click', e => {
            e.stopPropagation();
            z.enabled = !z.enabled;
            updateZoneList();
            renderAll();
        });

        const del = document.createElement('button');
        del.className = 'zoneDelete';
        del.textContent = '✕';
        del.addEventListener('click', e => {
            e.stopPropagation();
            const idx = dangerZones.findIndex(d => d.id === z.id);
            if (idx !== -1) dangerZones.splice(idx, 1);
            updateZoneList();
            renderAll();
        });

        item.append(swatch, name, floor, toggle, del);
        item.addEventListener('click', () => {
            // jump to that floor and highlight
            if (z.floorNumber !== currentFloor) {
                currentFloor = z.floorNumber;
                floorTabEls.forEach(t => t.classList.toggle('active', parseInt(t.dataset.floor,10) === currentFloor));
            }
            selectedZoneId = z.id;
            renderAll();
            openEditModal(z.id);
        });
        zoneListEl.appendChild(item);
    });
}

// ── User list (sidebar) ────────────────────────────────────────────────────────
function updateUserList() {
    userCountEl.textContent = users.size;
    userListEl.innerHTML = '';
    users.forEach((u, id) => {
        const item = document.createElement('div');
        item.className = 'userItem';

        const dot = document.createElement('div');
        dot.className = 'userDot' + (u.ghost ? ' ghost' : '');
        dot.style.background = u.ghost ? '#7e9ab0' : u.color;

        const info = document.createElement('div');
        info.innerHTML = `<div class="userName">${escHtml(u.userId?.split('_')[0] ?? id)}</div>
          <div class="userMeta">${escHtml(u.zone || '—')} · ${u.status || 'idle'}</div>`;

        const floorBadge = document.createElement('div');
        floorBadge.className = 'userFloor';
        floorBadge.textContent = `${u.floor}F`;

        item.append(dot, info, floorBadge);
        item.addEventListener('click', () => {
            // switch floor and center view
            currentFloor = u.floor;
            floorTabEls.forEach(t => t.classList.toggle('active', parseInt(t.dataset.floor,10) === currentFloor));
            renderAll();
        });
        userListEl.appendChild(item);
    });
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Alert log ─────────────────────────────────────────────────────────────────
function addAlertLog(userId, zoneName, floor, x, z) {
    const entry = document.createElement('div');
    entry.className = 'alertEntry';
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    entry.innerHTML = `<div class="aTime">${time}</div>
      <div class="aText">⚠ ${escHtml(userId.split('_')[0])} entered "${escHtml(zoneName)}" (${floor}F)</div>`;
    entry.addEventListener('click', () => {
        currentFloor = floor;
        floorTabEls.forEach(t => t.classList.toggle('active', parseInt(t.dataset.floor,10) === currentFloor));
        renderAll();
    });
    alertLogEl.insertBefore(entry, alertLogEl.firstChild);
    // keep max 80 entries
    while (alertLogEl.children.length > 80) alertLogEl.removeChild(alertLogEl.lastChild);
}

btnClearLog.addEventListener('click', () => { alertLogEl.innerHTML = ''; });

// ── Solace handlers ────────────────────────────────────────────────────────────
function onPositionUpdate(topic, payload) {
    if (!payload?.userId) return;
    const id = payload.userId;
    const existing = users.get(id);
    const color = existing?.color ?? assignColor();
    users.set(id, {
        userId: id,
        floor: payload.floor ?? 1,
        x: payload.x ?? 0,
        z: payload.z ?? 0,
        zone: payload.zone ?? '',
        status: payload.status ?? 'idle',
        lastSeen: Date.now(),
        color,
        ghost: false
    });
    renderAll();
    updateUserList();
}

function onAlertUpdate(topic, payload) {
    if (!payload?.userId) return;
    addAlertLog(payload.userId, payload.zoneName ?? 'Unknown Zone', payload.floor ?? 1, payload.x ?? 0, payload.z ?? 0);
    // Send admin alert back to that user
    if (solaceBridge?.isConnected()) {
        solaceBridge.publish(TOPICS.alertToUser(payload.userId), {
            text: `You have entered a restricted zone: ${payload.zoneName}`,
            timestamp: new Date().toISOString()
        });
    }
}

// ── Publish zones to users ─────────────────────────────────────────────────────
function publishZones() {
    if (!solaceBridge?.isConnected()) {
        alert('Not connected to Solace. Please connect first.');
        return;
    }
    solaceBridge.publish(TOPICS.zonesUpdate, {
        zones: dangerZones,
        timestamp: new Date().toISOString()
    });
    mapHintEl.textContent = `✓ Pushed ${dangerZones.length} geo-fence(s) to user endpoints`;
    setTimeout(() => { mapHintEl.textContent = DRAW_HINTS[drawShape] ?? ''; }, 3000);
}
btnPublishZones.addEventListener('click', publishZones);

// ── Export / import ────────────────────────────────────────────────────────────
btnExportZones.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(dangerZones, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `danger-zones-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
});

btnImportZones.addEventListener('click', () => fileImportEl.click());
fileImportEl.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = JSON.parse(ev.target.result);
            if (!Array.isArray(data)) throw new Error('expected array');
            dangerZones.length = 0;
            data.forEach(z => dangerZones.push({
                id: z.id || `zone_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                name: z.name ?? 'Unnamed',
                type: z.type ?? 'restricted',
                floorNumber: z.floorNumber ?? 1,
                x: z.x ?? 0, z: z.z ?? 0,
                shape: z.shape ?? 'rect',
                width:  z.width  ?? 4,
                depth:  z.depth  ?? 4,
                radius: z.radius ?? 4,
                points: z.points ?? [],
                warningText: z.warningText ?? '',
                color: z.color ?? '#ff5e6a',
                enabled: z.enabled !== false
            }));
            renderAll();
            updateZoneList();
        } catch (err) {
            alert('Import failed: ' + err.message);
        }
    };
    reader.readAsText(file);
    fileImportEl.value = '';
});

// ── Broadcast ─────────────────────────────────────────────────────────────────
btnBroadcast.addEventListener('click', () => {
    const text = broadcastInputEl.value.trim();
    if (!text) return;
    if (!solaceBridge?.isConnected()) { alert('Not connected to Solace. Please connect first.'); return; }
    solaceBridge.publish(TOPICS.broadcast, { text, timestamp: new Date().toISOString() });
    broadcastInputEl.value = '';
    addAlertLog('(Admin)', `Broadcast: ${text}`, currentFloor, 0, 0);
});
broadcastInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btnBroadcast.click(); }
});

// ── Simulate users ─────────────────────────────────────────────────────────────
const SIM_WANDER = [
    { x: 2, z: 10 }, { x: -5, z: 5 }, { x: 5, z: -5 }, { x: -10, z: 0 },
    { x: 10, z: 5 }, { x: 0, z: -8 }, { x: -3, z: 13 }, { x: 8, z: 12 }
];

function startSimUser(index) {
    const id = `sim_${index}_ghost_${Math.random().toString(36).slice(2,5)}`;
    const color = assignColor();
    let wx = (Math.random() - 0.5) * 20;
    let wz = (Math.random() - 0.5) * 20;
    let floor = Math.ceil(Math.random() * 3);
    let targetIdx = Math.floor(Math.random() * SIM_WANDER.length);

    users.set(id, { userId: id, floor, x: wx, z: wz, zone: '', status: 'moving', lastSeen: Date.now(), color, ghost: true });

    const interval = setInterval(() => {
        const target = SIM_WANDER[targetIdx];
        const dx = target.x - wx, dz = target.z - wz;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.0) {
            targetIdx = (targetIdx + 1) % SIM_WANDER.length;
        } else {
            const speed = 0.15;
            wx += (dx / dist) * speed;
            wz += (dz / dist) * speed;
        }
        const u = users.get(id);
        if (u) { u.x = wx; u.z = wz; u.lastSeen = Date.now(); }
        // check danger zones (shape-aware)
        const inDanger = dangerZones.find(z => z.floorNumber === floor && isPointInZone(wx, wz, z));
        if (inDanger) {
            addAlertLog(id, inDanger.name, floor, wx, wz);
        }
        renderAll();
        updateUserList();
    }, 200);

    simUsers.push({ id, interval });
}

btnAddSim.addEventListener('click', () => {
    if (simUsers.length >= 5) return;
    startSimUser(simUsers.length + 1);
});

btnClearSim.addEventListener('click', () => {
    simUsers.forEach(s => {
        clearInterval(s.interval);
        users.delete(s.id);
    });
    simUsers = [];
    renderAll();
    updateUserList();
});

// ── Connection panel ───────────────────────────────────────────────────────────
connPanelToggle.addEventListener('click', () => {
    connPanelEl.classList.toggle('open');
});
// start open
connPanelEl.classList.add('open');

function setConnStatus(state) {
    connStatusBadge.textContent = state === 'connected' ? 'Connected' : state === 'connecting' ? 'Connecting…' : 'Disconnected';
    connStatusBadge.className   = state === 'connected' ? 'ok' : state === 'connecting' ? 'connecting' : 'err';
}

function loadSavedConnConfig() {
    try {
        const saved = localStorage.getItem('hospital-admin-config');
        if (saved) {
            const c = JSON.parse(saved);
            cfUrlEl.value  = c.url  ?? '';
            cfVpnEl.value  = c.vpn  ?? '';
            cfUserEl.value = c.user ?? '';
            cfPassEl.value = c.pass ?? '';
        }
    } catch { /* ignore */ }
}
loadSavedConnConfig();

btnConnectEl.addEventListener('click', () => {
    const url  = cfUrlEl.value.trim();
    const vpn  = cfVpnEl.value.trim();
    const user = cfUserEl.value.trim();
    const pass = cfPassEl.value;
    if (!url || !vpn || !user) { connErrorEl.textContent = 'Please fill in all connection fields'; return; }

    connErrorEl.textContent = '';
    btnConnectEl.disabled = true;
    btnConnectEl.textContent = 'Connecting…';
    setConnStatus('connecting');

    try {
        localStorage.setItem('hospital-admin-config', JSON.stringify({ url, vpn, user, pass }));
    } catch { /* ignore */ }

    if (solaceBridge) {
        solaceBridge.disconnect();
        solaceBridge = null;
    }

    solaceBridge = createSolaceBridge(
        { url, vpn, username: user, password: pass },
        {
            onConnect() {
                setConnStatus('connected');
                btnConnectEl.disabled = false;
                btnConnectEl.textContent = 'Reconnect';
                connErrorEl.textContent = '';
                connPanelEl.classList.remove('open');
                solaceBridge.resubscribeAll();
            },
            onDisconnect() {
                setConnStatus('disconnected');
                btnConnectEl.disabled = false;
                btnConnectEl.textContent = 'Connect';
            },
            onError(e) {
                const msg = e?.message || e?.infoStr || 'Connection failed';
                connErrorEl.textContent = msg;
                setConnStatus('disconnected');
                btnConnectEl.disabled = false;
                btnConnectEl.textContent = 'Connect';
            }
        }
    );

    solaceBridge.subscribe(TOPICS.allPositions, onPositionUpdate);
    solaceBridge.subscribe(TOPICS.allAlerts,    onAlertUpdate);
});

// ── Render loop ────────────────────────────────────────────────────────────────
function animationLoop() {
    requestAnimationFrame(animationLoop);
    renderAll();
}
animationLoop();

// Initial sidebar renders
updateZoneList();
updateUserList();
