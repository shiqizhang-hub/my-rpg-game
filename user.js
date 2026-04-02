/**
 * user.js — 用户端：WASD 自由移动 + 向 Solace 实时发布位置
 * 订阅管理员推送的危险区域配置和广播消息
 */
import * as THREE from 'three';
import { createSolaceBridge, TOPICS } from './shared/solace-bridge.js';

// ── DOM refs ────────────────────────────────────────────────────────────────
const loginOverlayEl = document.querySelector('#loginOverlay');
const loginErrorEl   = document.querySelector('#loginError');
const btnEnterEl     = document.querySelector('#btnEnter');
const inputUsernameEl     = document.querySelector('#inputUsername');
const inputUrlEl          = document.querySelector('#inputUrl');
const inputVpnEl          = document.querySelector('#inputVpn');
const inputSolaceUserEl   = document.querySelector('#inputSolaceUser');
const inputSolacePassEl   = document.querySelector('#inputSolacePass');
const hudUserEl  = document.querySelector('#hudUser');
const hudFloorEl = document.querySelector('#hudFloor');
const hudZoneEl  = document.querySelector('#hudZone');
const hudPosEl   = document.querySelector('#hudPos');
const connBadgeEl = document.querySelector('#connBadge');
const alertOverlayEl  = document.querySelector('#alertOverlay');
const alertBannerEl   = document.querySelector('#alertBanner');
const alertZoneNameEl = document.querySelector('#alertZoneName');
const broadcastToastEl = document.querySelector('#broadcastToast');
const broadcastTextEl  = document.querySelector('#broadcastText');
const stairPromptEl = document.querySelector('#stairPrompt');
const stairPromptTextEl = document.querySelector('#stairPromptText');
const stairConfirmBtnEl = document.querySelector('#stairConfirmBtn');
const stairCancelBtnEl = document.querySelector('#stairCancelBtn');
const miniMapCanvasEl = document.querySelector('#miniMapCanvas');
const dangerHintPanelEl = document.querySelector('#dangerHintPanel');
const dangerHintTextEl = document.querySelector('#dangerHintText');
const appEl = document.querySelector('#app');
const miniMapCtx = miniMapCanvasEl.getContext('2d');

// ── Constants ────────────────────────────────────────────────────────────────
const FLOOR_HEIGHT       = 8;
const WALK_SPEED         = 5.2;
const WALK_ACCEL         = 9.5;
const WALK_ANIM_FREQ     = 8.2;
const INTERACT_DISTANCE  = 2.6;
const PUBLISH_INTERVAL   = 200; // ms
const STAIR_COOLDOWN     = 0.6; // s
const WORLD_X_MIN        = -23;
const WORLD_X_MAX        = 23;
const WORLD_Z_MIN        = -18;
const WORLD_Z_MAX        = 18;
const MINIMAP_PADDING    = 12;
const ALERT_PUBLISH_COOLDOWN_MS = 15000;
const DANGER_NEAR_DISTANCE = 3;
const DANGER_FAR_DISTANCE = 8;

const FLOOR_CONFIGS = [
    { number: 1, name: 'Triage Level',   accent: 0x5db4ff, floorColor: 0x162a3a },
    { number: 2, name: 'Inpatient Ward', accent: 0x8ee6cb, floorColor: 0x163331 },
    { number: 3, name: 'Diagnostics Wing', accent: 0xffd48a, floorColor: 0x32291f }
];

const BASE_ZONES = [
    { id: 'lobby',    name: 'Main Lobby',        x:  0,    z: 12.5, width: 12, depth:  8 },
    { id: 'corridor', name: 'Clinical Corridor',  x:  0,    z:  0,   width: 12, depth: 18 },
    { id: 'triage',   name: 'Triage Station',     x: -14.5, z:  8.5, width: 15, depth: 16 },
    { id: 'pharmacy', name: 'Pharmacy Prep',      x: -14.5, z: -8.5, width: 15, depth: 16 },
    { id: 'icu',      name: 'ICU Monitoring',     x: 14.5,  z:  8.5, width: 15, depth: 16 },
    { id: 'records',  name: 'Radiology Records',  x: 14.5,  z: -8.5, width: 15, depth: 16 }
];

const STAIR_NODES = [
    { id:'f1-up',   floorNumber:1, targetFloor:2, localPosition:{x:-5.2,z:12.8}, arrivalPosition:{x:5.2,z:9.6},  color:0x7df0bb, title:'To Floor 2' },
    { id:'f2-down', floorNumber:2, targetFloor:1, localPosition:{x:5.2,z:12.8},  arrivalPosition:{x:-5.2,z:9.6}, color:0x5db4ff, title:'To Floor 1' },
    { id:'f2-up',   floorNumber:2, targetFloor:3, localPosition:{x:-5.2,z:12.8}, arrivalPosition:{x:5.2,z:9.6},  color:0xffca72, title:'To Floor 3' },
    { id:'f3-down', floorNumber:3, targetFloor:2, localPosition:{x:5.2,z:12.8},  arrivalPosition:{x:-5.2,z:9.6}, color:0x7df0bb, title:'To Floor 2' }
];

// ── Scene globals ────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x09131d);
scene.fog = new THREE.Fog(0x09131d, 30, 95);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 220);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
appEl.appendChild(renderer.domElement);

// lights
scene.add(new THREE.HemisphereLight(0xbfdfff, 0x0d1520, 1.15));
const dirLight = new THREE.DirectionalLight(0xf6fbff, 1.55);
dirLight.position.set(-18, 36, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
Object.assign(dirLight.shadow.camera, { top:44, bottom:-12, left:-36, right:36 });
scene.add(dirLight);

// grid
const grid = new THREE.GridHelper(60, 30, 0x2d5166, 0x183040);
grid.position.y = -0.02;
grid.material.opacity = 0.18;
grid.material.transparent = true;
scene.add(grid);

// ── Materials ────────────────────────────────────────────────────────────────
const wallMaterial     = new THREE.MeshStandardMaterial({ color: 0xd9e1ea, roughness: 0.9 });
const trimMaterial     = new THREE.MeshStandardMaterial({ color: 0x4f5f73, roughness: 0.72 });
const propMaterial     = new THREE.MeshStandardMaterial({ color: 0x8fa4b8, roughness: 0.82 });
const darkPanelMaterial= new THREE.MeshStandardMaterial({ color: 0x192634, roughness: 0.75 });
const doorMaterial     = new THREE.MeshStandardMaterial({ color: 0xc6d4e0, roughness: 0.78 });
const deviceMaterial   = new THREE.MeshStandardMaterial({ color: 0x566979, roughness: 0.72 });
const lampMaterial     = new THREE.MeshStandardMaterial({ color: 0xeaf8ff, emissive: 0xc8f1ff, emissiveIntensity: 0.9, roughness: 0.35 });

// ── State ─────────────────────────────────────────────────────────────────────
const colliders = [];
const floorGroups = new Map();
const stairObjects = [];
const dangerZones = []; // managed by admin, populated via Solace
const npcActors = [];
const currentFloor = { number: 1 };
const playerCollisionSize = new THREE.Vector3(1.1, 2.2, 1.1);
const playerBox = new THREE.Box3();
const moveDirection = new THREE.Vector3();
const spawnPoint = new THREE.Vector3(0, 0, 15.6);
const keys = { w: false, a: false, s: false, d: false };

let player = null;
let stairCooldown = 0;
let cameraYaw = -Math.PI;
let cameraPitch = 0.88;
let targetYaw = cameraYaw;
let targetPitch = cameraPitch;
let cameraDistance = 11.8;
let isDragging = false;
let lastPX = 0, lastPY = 0;
let solaceBridge = null;
let publishTimer = 0;
let userId = '';
let alertActive = false;
let broadcastTimer = null;
let activeAlertZoneId = '';
let pendingStair = null;
let currentMoveSpeed = 0;
let playerStepPhase = 0;
const lastAlertPublishedAt = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────
function getFloorY(n) { return (n - 1) * FLOOR_HEIGHT; }
function getFloorConfig(n) { return FLOOR_CONFIGS.find(f => f.number === n); }
function worldPos(floorNumber, x, z, y = 0) {
    return new THREE.Vector3(x, getFloorY(floorNumber) + y, z);
}
function damp(cur, tgt, s, dt) { return THREE.MathUtils.lerp(cur, tgt, 1 - Math.exp(-s * dt)); }

function worldToMiniMap(x, z) {
    const width = miniMapCanvasEl.width - MINIMAP_PADDING * 2;
    const height = miniMapCanvasEl.height - MINIMAP_PADDING * 2;
    return {
        x: MINIMAP_PADDING + ((x - WORLD_X_MIN) / (WORLD_X_MAX - WORLD_X_MIN)) * width,
        y: MINIMAP_PADDING + ((WORLD_Z_MAX - z) / (WORLD_Z_MAX - WORLD_Z_MIN)) * height
    };
}

function addColliderBox(floorNumber, x, z, w, d, h, y = h / 2) {
    colliders.push({
        floorNumber,
        box: new THREE.Box3().setFromCenterAndSize(
            worldPos(floorNumber, x, z, y),
            new THREE.Vector3(w, h, d)
        )
    });
}

function createBlock({ parent, floorNumber, x, z, width, depth, height, material, y = height / 2, collidable = false }) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material.clone());
    mesh.position.copy(worldPos(floorNumber, x, z, y));
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    if (collidable) {
        mesh.updateMatrixWorld(true);
        colliders.push({ floorNumber, box: new THREE.Box3().setFromObject(mesh) });
    }
    return mesh;
}

function createLabel(text, tint) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(9,19,29,0.78)'; ctx.fillRect(0,0,512,128);
    ctx.strokeStyle = `#${tint.toString(16).padStart(6,'0')}`; ctx.lineWidth = 8;
    ctx.strokeRect(8,8,496,112);
    ctx.fillStyle = '#f5fbff'; ctx.font = '600 42px Segoe UI';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(6.6, 1.6, 1);
    return sprite;
}

function createCylinder({ parent, floorNumber, x, z, radiusTop, radiusBottom, height, material, y = height / 2, collidable = false }) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 16), material.clone());
    mesh.position.copy(worldPos(floorNumber, x, z, y));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (collidable) {
        colliders.push({
            floorNumber,
            box: new THREE.Box3().setFromCenterAndSize(worldPos(floorNumber, x, z, y), new THREE.Vector3(radiusTop * 2, height, radiusTop * 2))
        });
    }
    return mesh;
}

function addFloorDetails(group, cfg) {
    // nurse station desk cluster
    // Keep entrance lane clear: move the desk cluster deeper into the lobby.
    createBlock({ parent:group, floorNumber:cfg.number, x:0, z:9.8, width:7.6, depth:1.3, height:1.0, material:trimMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:0, z:9.05, width:6.8, depth:0.7, height:0.12, material:darkPanelMaterial, y:1.02 });
    createBlock({ parent:group, floorNumber:cfg.number, x:0, z:10.45, width:7.8, depth:0.14, height:0.7, y:1.15, material:new THREE.MeshStandardMaterial({ color:0x84d8ff, emissive:0x58bfff, emissiveIntensity:0.48 }) });

    // bed-like blocks in side wings
    const bedRows = [
        { x:-14.6, zs:[6.6, 10.6, -6.4, -10.4] },
        { x:14.6, zs:[6.6, 10.6, -6.4, -10.4] }
    ];
    bedRows.forEach(row => {
        row.zs.forEach(z => {
            createBlock({ parent:group, floorNumber:cfg.number, x:row.x, z, width:3.2, depth:1.4, height:0.7, material:propMaterial, collidable:true });
            createBlock({ parent:group, floorNumber:cfg.number, x:row.x - 1.0, z, width:0.18, depth:1.2, height:1.0, material:trimMaterial });
            createBlock({ parent:group, floorNumber:cfg.number, x:row.x + 1.0, z, width:0.18, depth:1.2, height:1.0, material:trimMaterial });
        });
    });

    // glass partitions around central corridor
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x93d0f3, transparent: true, opacity: 0.2, roughness: 0.08, metalness: 0.06 });
    [
        { x:-2.4, z:7.4, w:0.08, d:3.4 },
        { x:2.4, z:7.4, w:0.08, d:3.4 },
        { x:-2.4, z:-7.4, w:0.08, d:3.4 },
        { x:2.4, z:-7.4, w:0.08, d:3.4 }
    ].forEach(p => {
        createBlock({ parent:group, floorNumber:cfg.number, x:p.x, z:p.z, width:p.w, depth:p.d, height:2.4, material:glassMat });
    });

    // planters at corners
    [
        { x:-19.5, z:14.8 }, { x:19.5, z:14.8 }, { x:-19.5, z:-14.8 }, { x:19.5, z:-14.8 }
    ].forEach(p => {
        createCylinder({ parent:group, floorNumber:cfg.number, x:p.x, z:p.z, radiusTop:0.55, radiusBottom:0.58, height:0.7, material:trimMaterial, collidable:true });
        createCylinder({ parent:group, floorNumber:cfg.number, x:p.x, z:p.z, radiusTop:0.36, radiusBottom:0.4, height:1.05, y:1.1, material:new THREE.MeshStandardMaterial({ color:0x4b8a57, roughness:0.9 }) });
    });

    // central floor guide lines
    const guideMat = new THREE.MeshStandardMaterial({ color: cfg.accent, emissive: cfg.accent, emissiveIntensity: 0.2, roughness: 0.32 });
    createBlock({ parent:group, floorNumber:cfg.number, x:0, z:0, width:1.4, depth:33, height:0.03, material:guideMat, y:0.02 });
    createBlock({ parent:group, floorNumber:cfg.number, x:-5.7, z:0, width:0.22, depth:33, height:0.03, material:guideMat, y:0.02 });
    createBlock({ parent:group, floorNumber:cfg.number, x:5.7, z:0, width:0.22, depth:33, height:0.03, material:guideMat, y:0.02 });

    // wall trim band and inset voxel window strips
    const trimBandMat = new THREE.MeshStandardMaterial({ color: 0xb9c8d6, roughness: 0.68 });
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x87cdf2, emissive: cfg.accent, emissiveIntensity: 0.16, transparent: true, opacity: 0.28, roughness: 0.12, metalness: 0.04 });
    createBlock({ parent:group, floorNumber:cfg.number, x:0, z:-16.42, width:41, depth:0.08, height:0.28, y:1.95, material:trimBandMat });
    createBlock({ parent:group, floorNumber:cfg.number, x:0, z:16.42, width:41, depth:0.08, height:0.28, y:1.95, material:trimBandMat });
    createBlock({ parent:group, floorNumber:cfg.number, x:-21.42, z:0, width:0.08, depth:31, height:0.28, y:1.95, material:trimBandMat });
    createBlock({ parent:group, floorNumber:cfg.number, x:21.42, z:0, width:0.08, depth:31, height:0.28, y:1.95, material:trimBandMat });
    [
        { x:-10.8, z:16.48, w:7.6, d:0.04 }, { x:10.8, z:16.48, w:7.6, d:0.04 },
        { x:-10.8, z:-16.48, w:7.6, d:0.04 }, { x:10.8, z:-16.48, w:7.6, d:0.04 }
    ].forEach(p => {
        createBlock({ parent:group, floorNumber:cfg.number, x:p.x, z:p.z, width:p.w, depth:p.d, height:1.05, y:2.1, material:windowMat });
    });

    // interior doorway frames to make the plan read more clearly
    const doorwayMat = new THREE.MeshStandardMaterial({ color: 0x58697b, roughness: 0.6, metalness: 0.08 });
    [
        { x:-7, z:7, rot:'v' }, { x:-7, z:-7, rot:'v' }, { x:7, z:7, rot:'v' }, { x:7, z:-7, rot:'v' },
        { x:-14.5, z:0, rot:'h' }, { x:14.5, z:0, rot:'h' }
    ].forEach(d => {
        if (d.rot === 'v') {
            createBlock({ parent:group, floorNumber:cfg.number, x:d.x, z:d.z - 1.3, width:0.16, depth:0.26, height:3.0, y:1.5, material:doorwayMat });
            createBlock({ parent:group, floorNumber:cfg.number, x:d.x, z:d.z + 1.3, width:0.16, depth:0.26, height:3.0, y:1.5, material:doorwayMat });
            createBlock({ parent:group, floorNumber:cfg.number, x:d.x, z:d.z, width:0.18, depth:2.8, height:0.18, y:2.9, material:doorwayMat });
        } else {
            createBlock({ parent:group, floorNumber:cfg.number, x:d.x - 2.2, z:d.z, width:0.26, depth:0.16, height:3.0, y:1.5, material:doorwayMat });
            createBlock({ parent:group, floorNumber:cfg.number, x:d.x + 2.2, z:d.z, width:0.26, depth:0.16, height:3.0, y:1.5, material:doorwayMat });
            createBlock({ parent:group, floorNumber:cfg.number, x:d.x, z:d.z, width:4.6, depth:0.18, height:0.18, y:2.9, material:doorwayMat });
        }
    });

    // wayfinding pylons
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x243548, roughness: 0.62, metalness: 0.08 });
    [
        { x:-3.8, z:15.1 }, { x:3.8, z:15.1 }, { x:-3.8, z:-15.1 }, { x:3.8, z:-15.1 }
    ].forEach(p => {
        createBlock({ parent:group, floorNumber:cfg.number, x:p.x, z:p.z, width:0.36, depth:0.36, height:2.6, material:pylonMat, collidable:true });
        createBlock({ parent:group, floorNumber:cfg.number, x:p.x, z:p.z, width:0.32, depth:0.08, height:0.95, y:1.72, material:new THREE.MeshStandardMaterial({ color:cfg.accent, emissive:cfg.accent, emissiveIntensity:0.45 }) });
    });

    // ceiling strips and extra lights (thin and translucent to avoid blocking camera)
    [{ x:-11.5, z:0 }, { x:11.5, z:0 }].forEach(p => {
        createBlock({
            parent:group,
            floorNumber:cfg.number,
            x:p.x,
            z:p.z,
            width:0.42,
            depth:34,
            height:0.08,
            y:3.88,
            material:new THREE.MeshStandardMaterial({
                color:0xcbe8ff,
                emissive:cfg.accent,
                emissiveIntensity:0.2,
                transparent:true,
                opacity:0.22,
                depthWrite:false,
                roughness:0.4
            })
        });
        const stripLight = new THREE.PointLight(cfg.accent, 0.32, 12, 2);
        stripLight.position.copy(worldPos(cfg.number, p.x, p.z, 3.45));
        group.add(stripLight);
    });

    // floor-specific themed equipment
    if (cfg.number === 1) {
        // triage counters and kiosks
        createBlock({ parent:group, floorNumber:cfg.number, x:-2.6, z:7.6, width:2.2, depth:0.9, height:1.15, material:darkPanelMaterial, collidable:true });
        createBlock({ parent:group, floorNumber:cfg.number, x:2.6, z:7.6, width:2.2, depth:0.9, height:1.15, material:darkPanelMaterial, collidable:true });
        createBlock({ parent:group, floorNumber:cfg.number, x:-2.6, z:7.15, width:1.2, depth:0.12, height:0.55, y:1.35, material:new THREE.MeshStandardMaterial({ color:0x7fd8ff, emissive:0x4bc2ff, emissiveIntensity:0.58 }) });
        createBlock({ parent:group, floorNumber:cfg.number, x:2.6, z:7.15, width:1.2, depth:0.12, height:0.55, y:1.35, material:new THREE.MeshStandardMaterial({ color:0x7fd8ff, emissive:0x4bc2ff, emissiveIntensity:0.58 }) });

        // queue barriers to guide path while keeping central entrance open
        createBlock({ parent:group, floorNumber:cfg.number, x:-6.2, z:12.2, width:0.16, depth:6.2, height:0.9, material:trimMaterial, collidable:true });
        createBlock({ parent:group, floorNumber:cfg.number, x:6.2, z:12.2, width:0.16, depth:6.2, height:0.9, material:trimMaterial, collidable:true });

        // waiting benches and check-in kiosks in the lobby wings
        [-9.2, 9.2].forEach(x => {
            [12.2, 9.2].forEach(z => {
                createBlock({ parent:group, floorNumber:cfg.number, x, z, width:2.4, depth:0.72, height:0.42, material:propMaterial, collidable:true });
                createBlock({ parent:group, floorNumber:cfg.number, x, z: z - 0.18, width:2.2, depth:0.08, height:0.55, y:0.78, material:trimMaterial });
            });
        });
        [-13.2, 13.2].forEach(x => {
            createBlock({ parent:group, floorNumber:cfg.number, x, z:11.1, width:0.72, depth:0.72, height:1.25, material:darkPanelMaterial, collidable:true });
            createBlock({ parent:group, floorNumber:cfg.number, x, z:10.82, width:0.46, depth:0.08, height:0.46, y:1.34, material:new THREE.MeshStandardMaterial({ color:0x9edfff, emissive:0x63c6ff, emissiveIntensity:0.46 }) });
        });
    }

    if (cfg.number === 2) {
        // inpatient monitors beside beds
        [-14.6, 14.6].forEach(x => {
            [6.6, 10.6, -6.4, -10.4].forEach(z => {
                createBlock({ parent:group, floorNumber:cfg.number, x:x + (x < 0 ? 1.4 : -1.4), z, width:0.22, depth:0.22, height:1.5, material:trimMaterial });
                createBlock({ parent:group, floorNumber:cfg.number, x:x + (x < 0 ? 1.4 : -1.4), z, width:0.72, depth:0.08, height:0.42, y:1.45, material:new THREE.MeshStandardMaterial({ color:0x83e6c8, emissive:0x5fe6bf, emissiveIntensity:0.44 }) });
            });
        });

        // rolling medical carts
        [
            { x:-2.6, z:3.2 }, { x:2.8, z:-2.6 }, { x:-10.8, z:-1.8 }
        ].forEach(p => {
            createBlock({ parent:group, floorNumber:cfg.number, x:p.x, z:p.z, width:0.9, depth:0.55, height:0.72, material:propMaterial, collidable:true });
            createBlock({ parent:group, floorNumber:cfg.number, x:p.x, z:p.z, width:0.82, depth:0.08, height:0.18, y:0.88, material:darkPanelMaterial });
            [-0.28, 0.28].forEach(dx => {
                [-0.16, 0.16].forEach(dz => {
                    createCylinder({ parent:group, floorNumber:cfg.number, x:p.x + dx, z:p.z + dz, radiusTop:0.06, radiusBottom:0.06, height:0.08, y:0.08, material:trimMaterial });
                });
            });
        });
    }

    if (cfg.number === 3) {
        // diagnostics machines
        createCylinder({ parent:group, floorNumber:cfg.number, x:13.9, z:-8.5, radiusTop:1.5, radiusBottom:1.5, height:1.4, y:0.7, material:new THREE.MeshStandardMaterial({ color:0x91a3b4, roughness:0.55 }), collidable:true });
        createBlock({ parent:group, floorNumber:cfg.number, x:13.9, z:-8.5, width:1.0, depth:0.08, height:0.8, y:1.5, material:new THREE.MeshStandardMaterial({ color:0x82cfff, emissive:0x58beff, emissiveIntensity:0.52 }) });
        createBlock({ parent:group, floorNumber:cfg.number, x:-14.2, z:-8.3, width:2.6, depth:1.1, height:1.2, material:propMaterial, collidable:true });
        createBlock({ parent:group, floorNumber:cfg.number, x:-14.2, z:-8.9, width:1.4, depth:0.1, height:0.6, y:1.22, material:new THREE.MeshStandardMaterial({ color:0x91d8ff, emissive:0x6dcaff, emissiveIntensity:0.4 }) });

        // shelving and equipment racks
        [
            { x:16.8, z:7.8 }, { x:16.8, z:-7.8 }, { x:-16.8, z:7.8 }
        ].forEach(p => {
            createBlock({ parent:group, floorNumber:cfg.number, x:p.x, z:p.z, width:0.8, depth:2.8, height:2.2, material:trimMaterial, collidable:true });
            [-0.7, 0, 0.7].forEach(dz => {
                createBlock({ parent:group, floorNumber:cfg.number, x:p.x, z:p.z + dz, width:0.72, depth:0.12, height:0.08, y:0.72, material:propMaterial });
                createBlock({ parent:group, floorNumber:cfg.number, x:p.x, z:p.z + dz, width:0.72, depth:0.12, height:0.08, y:1.4, material:propMaterial });
            });
        });
    }
}

// ── Floor builder ─────────────────────────────────────────────────────────────
function buildFloor(cfg) {
    const group = new THREE.Group();
    group.name = `floor-${cfg.number}`;
    scene.add(group);
    floorGroups.set(cfg.number, group);

    // slab
    const slab = new THREE.Mesh(
        new THREE.BoxGeometry(56, 0.32, 44),
        new THREE.MeshStandardMaterial({ color: cfg.floorColor, roughness: 0.97 })
    );
    slab.position.copy(worldPos(cfg.number, 0, 0, -0.16));
    slab.receiveShadow = true;
    group.add(slab);

    // floor edge accent
    const edge = new THREE.Mesh(
        new THREE.BoxGeometry(56.4, 0.06, 44.4),
        new THREE.MeshStandardMaterial({ color: cfg.accent, emissive: cfg.accent, emissiveIntensity: 0.18 })
    );
    edge.position.copy(worldPos(cfg.number, 0, 0, 0.01));
    group.add(edge);

    // zone labels
    BASE_ZONES.forEach(zone => {
        const label = createLabel(`F${cfg.number} ${zone.name}`, 0x4f6878);
        label.position.copy(worldPos(cfg.number, zone.x, zone.z, 3.1));
        group.add(label);
    });

    // outer walls
    createBlock({ parent:group, floorNumber:cfg.number, x:0,   z:-17,  width:44, depth:1,  height:3.2, material:wallMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:0,   z:17,   width:44, depth:1,  height:3.2, material:wallMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:-22, z:0,    width:1,  depth:34, height:3.2, material:wallMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:22,  z:0,    width:1,  depth:34, height:3.2, material:wallMaterial, collidable:true });
    // inner dividers
    createBlock({ parent:group, floorNumber:cfg.number, x:-7, z:-13, width:1, depth:8,  height:3.2, material:wallMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:-7, z:0,   width:1, depth:10, height:3.2, material:wallMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:-7, z:13,  width:1, depth:8,  height:3.2, material:wallMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:7,  z:-13, width:1, depth:8,  height:3.2, material:wallMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:7,  z:0,   width:1, depth:10, height:3.2, material:wallMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:7,  z:13,  width:1, depth:8,  height:3.2, material:wallMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:-14.5,z:0, width:15, depth:1, height:3.2, material:wallMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:14.5, z:0, width:15, depth:1, height:3.2, material:wallMaterial, collidable:true });

    // props / cabinets (simplified)
    createBlock({ parent:group, floorNumber:cfg.number, x:-18.3,z:12.6, width:5.4, depth:2.4, height:1.2, material:propMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:-16, z:-9.5,  width:4.2, depth:1.8, height:0.9, material:trimMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:17.7, z:-9.2, width:1.8, depth:7.4, height:2.2, material:propMaterial, collidable:true });
    createBlock({ parent:group, floorNumber:cfg.number, x:11.8, z:-9.2, width:1.8, depth:7.4, height:2.2, material:propMaterial, collidable:true });

    addFloorDetails(group, cfg);

    // corridor lights (slimmer housings)
    [{ x:0,z:13.4 },{ x:0,z:5.6 },{ x:0,z:-2.2 },{ x:0,z:-10 }].forEach(p => {
        const lGroup = new THREE.Group();
        lGroup.position.copy(worldPos(cfg.number, p.x, p.z, 3.5));
        const housing = new THREE.Mesh(
            new THREE.BoxGeometry(2.2,0.1,0.45),
            new THREE.MeshStandardMaterial({ color:0xcfefff, emissive:cfg.accent, emissiveIntensity:0.18, roughness:0.42, transparent:true, opacity:0.35, depthWrite:false })
        );
        housing.position.y = -0.42;
        lGroup.add(housing);
        const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.9,0.05,0.36), lampMaterial.clone());
        diffuser.position.y = -0.5;
        lGroup.add(diffuser);
        group.add(lGroup);
        const light = new THREE.PointLight(cfg.accent, 0.64, 9, 2);
        light.position.copy(worldPos(cfg.number, p.x, p.z, 3.02));
        group.add(light);
    });

    // stair beacons for this floor
    STAIR_NODES.filter(s => s.floorNumber === cfg.number).forEach(stair => {
        const sg = new THREE.Group();
        sg.position.copy(worldPos(stair.floorNumber, stair.localPosition.x, stair.localPosition.z));
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.24,1.6), new THREE.MeshStandardMaterial({ color:0x263544, roughness:0.78 }));
        base.position.y = 0.12; sg.add(base);
        const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.62,0.22,0.62), new THREE.MeshStandardMaterial({ color:stair.color, emissive:stair.color, emissiveIntensity:0.95 }));
        arrow.position.y = 0.56; sg.add(arrow);
        const lbl = createLabel(stair.title, stair.color);
        lbl.position.set(0,2.5,0); sg.add(lbl);
        const sLight = new THREE.PointLight(stair.color, 1.2, 5, 2);
        sLight.position.y = 1.2; sg.add(sLight);
        group.add(sg);
        addColliderBox(stair.floorNumber, stair.localPosition.x, stair.localPosition.z, 1.0, 1.0, 0.9, 0.45);
        stairObjects.push({ ...stair, worldPos: sg.position.clone() });
    });

    // floor banner
    const banner = createLabel(`${cfg.name}`, cfg.accent);
    banner.position.copy(worldPos(cfg.number, 0, 20, 2.2));
    banner.scale.set(8.6, 1.8, 1);
    group.add(banner);

    group.visible = cfg.number === 1;
}

// ── Avatar (blocky Minecraft-like) ───────────────────────────────────────────
function createAvatar() {
    const g = new THREE.Group();
    const skinMat   = new THREE.MeshStandardMaterial({ color: 0xf0cfb5, roughness: 0.95 });
    const shirtMat  = new THREE.MeshStandardMaterial({ color: 0x4f91b7, roughness: 0.82 });
    const pantsMat  = new THREE.MeshStandardMaterial({ color: 0x2f4a66, roughness: 0.88 });
    const detailMat = new THREE.MeshStandardMaterial({ color: 0x9de1ff, emissive: 0x60c8ff, emissiveIntensity: 0.24, roughness: 0.3 });

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), skinMat);
    head.position.y = 2.0;
    head.castShadow = true;
    g.add(head);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.78, 0.28), shirtMat);
    body.position.y = 1.36;
    body.castShadow = true;
    g.add(body);

    const chestPanel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.03), detailMat);
    chestPanel.position.set(0, 1.34, 0.16);
    g.add(chestPanel);

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.18), shirtMat);
    leftArm.position.set(-0.38, 1.38, 0);
    leftArm.castShadow = true;
    g.add(leftArm);
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.18), shirtMat);
    rightArm.position.set(0.38, 1.38, 0);
    rightArm.castShadow = true;
    g.add(rightArm);

    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.74, 0.2), pantsMat);
    leftLeg.position.set(-0.14, 0.5, 0);
    leftLeg.castShadow = true;
    g.add(leftLeg);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.74, 0.2), pantsMat);
    rightLeg.position.set(0.14, 0.5, 0);
    rightLeg.castShadow = true;
    g.add(rightLeg);

    g.userData.rig = {
        head,
        body,
        leftArm,
        rightArm,
        leftLeg,
        rightLeg,
        base: {
            headY: head.position.y,
            bodyY: body.position.y,
            leftArmY: leftArm.position.y,
            rightArmY: rightArm.position.y,
            leftLegY: leftLeg.position.y,
            rightLegY: rightLeg.position.y
        }
    };

    g.position.copy(spawnPoint);
    scene.add(g);
    return g;
}

function createNpcModel(color = 0x6ab9dd) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.84, metalness: 0.02 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1d2b9, roughness: 0.92 });

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
    head.position.y = 1.93;
    head.castShadow = true;
    g.add(head);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.24), bodyMat);
    torso.position.y = 1.3;
    torso.castShadow = true;
    g.add(torso);

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.64, 0.16), bodyMat);
    leftArm.position.set(-0.33, 1.3, 0);
    leftArm.castShadow = true;
    g.add(leftArm);
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.64, 0.16), bodyMat);
    rightArm.position.set(0.33, 1.3, 0);
    rightArm.castShadow = true;
    g.add(rightArm);

    const legMat = new THREE.MeshStandardMaterial({ color: 0x394d63, roughness: 0.88 });
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.18), legMat);
    leftLeg.position.set(-0.12, 0.48, 0);
    leftLeg.castShadow = true;
    g.add(leftLeg);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.66, 0.18), legMat);
    rightLeg.position.set(0.12, 0.48, 0);
    rightLeg.castShadow = true;
    g.add(rightLeg);

    g.userData.rig = {
        head,
        torso,
        leftArm,
        rightArm,
        leftLeg,
        rightLeg,
        base: {
            headY: head.position.y,
            torsoY: torso.position.y,
            leftArmY: leftArm.position.y,
            rightArmY: rightArm.position.y,
            leftLegY: leftLeg.position.y,
            rightLegY: rightLeg.position.y
        }
    };

    return g;
}

function addNpc({ id, floor, x, z, color = 0x6ab9dd, patrol = null, speed = 1.2 }) {
    const model = createNpcModel(color);
    model.position.copy(worldPos(floor, x, z));
    scene.add(model);
    npcActors.push({
        id,
        floor,
        model,
        patrol,
        speed,
        patrolIndex: 0,
        wait: 0,
        phase: Math.random() * Math.PI * 2,
        isMoving: false
    });
}

function spawnNpcs() {
    // static staff
    addNpc({ id: 'npc_triage_1', floor: 1, x: -2.8, z: 11.4, color: 0x7ec4e3 });
    addNpc({ id: 'npc_inpatient_1', floor: 2, x: 14.2, z: 9.4, color: 0xa5d99a });
    addNpc({ id: 'npc_diag_1', floor: 3, x: -13.5, z: -8.2, color: 0xe0c07d });

    // patrolling staff / visitors
    addNpc({
        id: 'npc_patrol_f1',
        floor: 1,
        x: 0,
        z: 12,
        color: 0x5db4ff,
        patrol: [{ x: 0, z: 12 }, { x: 0, z: 4 }, { x: -5, z: -2 }, { x: 3, z: -8 }],
        speed: 1.35
    });
    addNpc({
        id: 'npc_patrol_f2',
        floor: 2,
        x: -12,
        z: 8,
        color: 0x8ee6cb,
        patrol: [{ x: -12, z: 8 }, { x: -4, z: 8 }, { x: -4, z: -8 }, { x: -12, z: -8 }],
        speed: 1.05
    });
    addNpc({
        id: 'npc_patrol_f3',
        floor: 3,
        x: 12,
        z: -8,
        color: 0xffd48a,
        patrol: [{ x: 12, z: -8 }, { x: 6, z: -8 }, { x: 6, z: 8 }, { x: 12, z: 8 }],
        speed: 1.2
    });
}

function updateNpcs(dt) {
    const now = performance.now() * 0.001;
    npcActors.forEach(npc => {
        npc.model.visible = npc.floor === currentFloor.number;
        npc.isMoving = false;
        if (!npc.patrol || npc.patrol.length < 2) {
            npc.phase += dt * 1.6;
            animateBlockRig(npc.model.userData.rig, 0, dt, now, npc.phase);
            return;
        }

        if (npc.wait > 0) {
            npc.wait -= dt;
            return;
        }

        const target = npc.patrol[npc.patrolIndex % npc.patrol.length];
        const dx = target.x - npc.model.position.x;
        const dz = target.z - npc.model.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.12) {
            npc.patrolIndex = (npc.patrolIndex + 1) % npc.patrol.length;
            npc.wait = 0.5 + Math.random() * 1.2;
            return;
        }

        const step = Math.min(dist, npc.speed * dt);
        npc.model.position.x += (dx / dist) * step;
        npc.model.position.z += (dz / dist) * step;
        npc.model.rotation.y = Math.atan2(-dx, -dz);
        npc.model.position.y = getFloorY(npc.floor);
        npc.phase += dt * WALK_ANIM_FREQ * (npc.speed / WALK_SPEED);
        npc.isMoving = step > 0.001;
        animateBlockRig(npc.model.userData.rig, npc.isMoving ? npc.speed : 0, dt, now, npc.phase);
    });
}

function animateBlockRig(rig, speed, dt, time, phase = 0) {
    if (!rig) return;
    const motion = Math.min(1, Math.max(0, speed / WALK_SPEED));
    const swing = Math.sin(phase) * (0.55 * motion);
    const idle = Math.sin(time * 1.9 + phase * 0.25) * 0.02;
    const bob = Math.abs(Math.sin(phase)) * 0.05 * motion;

    if (rig.leftArm) {
        rig.leftArm.rotation.x = swing;
        rig.leftArm.position.y = (rig.base.leftArmY ?? rig.leftArm.position.y) - bob * 0.2;
    }
    if (rig.rightArm) {
        rig.rightArm.rotation.x = -swing;
        rig.rightArm.position.y = (rig.base.rightArmY ?? rig.rightArm.position.y) - bob * 0.2;
    }
    if (rig.leftLeg) {
        rig.leftLeg.rotation.x = -swing * 0.9;
        rig.leftLeg.position.y = (rig.base.leftLegY ?? rig.leftLeg.position.y) - bob * 0.15;
    }
    if (rig.rightLeg) {
        rig.rightLeg.rotation.x = swing * 0.9;
        rig.rightLeg.position.y = (rig.base.rightLegY ?? rig.rightLeg.position.y) - bob * 0.15;
    }
    if (rig.head) {
        rig.head.rotation.y = Math.sin(phase * 0.5) * 0.08 * motion;
        rig.head.position.y = (rig.base.headY ?? rig.head.position.y) + idle + bob * 0.08;
    }
    if (rig.body) {
        rig.body.position.y = (rig.base.bodyY ?? rig.body.position.y) + idle * 0.45;
    }
    if (rig.torso) {
        rig.torso.position.y = (rig.base.torsoY ?? rig.torso.position.y) + idle * 0.45;
    }
}

// ── Build world ───────────────────────────────────────────────────────────────
FLOOR_CONFIGS.forEach(cfg => buildFloor(cfg));
player = createAvatar();
spawnNpcs();

// ── Floor visibility ──────────────────────────────────────────────────────────
function setFloor(n) {
    currentFloor.number = n;
    const targetY = getFloorY(n);
    floorGroups.forEach((group, num) => {
        group.visible = num === n;
    });
    player.position.y = targetY + 0;
    hudFloorEl.textContent = `${n}F — ${getFloorConfig(n).name}`;
    drawMiniMap();
}

// ── Collision ─────────────────────────────────────────────────────────────────
function resolveCollision() {
    const pos = player.position;
    playerBox.setFromCenterAndSize(
        new THREE.Vector3(pos.x, pos.y + 1.1, pos.z),
        playerCollisionSize
    );
    for (const c of colliders) {
        if (c.floorNumber !== currentFloor.number) continue;
        if (!playerBox.intersectsBox(c.box)) continue;
        const boxCenter = c.box.getCenter(new THREE.Vector3());
        const overlap = new THREE.Vector3(
            (playerCollisionSize.x / 2 + (c.box.max.x - c.box.min.x) / 2) - Math.abs(pos.x - boxCenter.x),
            0,
            (playerCollisionSize.z / 2 + (c.box.max.z - c.box.min.z) / 2) - Math.abs(pos.z - boxCenter.z)
        );
        if (overlap.x < overlap.z) {
            pos.x += pos.x < boxCenter.x ? -overlap.x : overlap.x;
        } else {
            pos.z += pos.z < boxCenter.z ? -overlap.z : overlap.z;
        }
    }
}

// ── Zone detection ────────────────────────────────────────────────────────────
function detectZone(pos) {
    return BASE_ZONES.find(z => {
        const hw = z.width / 2, hd = z.depth / 2;
        return pos.x >= z.x - hw && pos.x <= z.x + hw && pos.z >= z.z - hd && pos.z <= z.z + hd;
    }) ?? null;
}

function pointInPolygon(px, pz, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, zi = points[i].z;
        const xj = points[j].x, zj = points[j].z;
        if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
}

function detectDangerZone(pos, floor) {
    return dangerZones.find(z => {
        if (z.floorNumber !== floor || !z.enabled) return false;
        if (z.shape === 'circle') return Math.hypot(pos.x - z.x, pos.z - z.z) <= (z.radius ?? 4);
        if (z.shape === 'polygon' && Array.isArray(z.points) && z.points.length >= 3) return pointInPolygon(pos.x, pos.z, z.points);
        const hw = (z.width ?? 4) / 2, hd = (z.depth ?? 4) / 2;
        return pos.x >= z.x - hw && pos.x <= z.x + hw && pos.z >= z.z - hd && pos.z <= z.z + hd;
    }) ?? null;
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
    const vx = bx - ax;
    const vz = bz - az;
    const wx = px - ax;
    const wz = pz - az;
    const c1 = vx * wx + vz * wz;
    if (c1 <= 0) return { distance: Math.hypot(px - ax, pz - az), point: { x: ax, z: az } };
    const c2 = vx * vx + vz * vz;
    if (c2 <= c1) return { distance: Math.hypot(px - bx, pz - bz), point: { x: bx, z: bz } };
    const t = c1 / c2;
    const point = { x: ax + t * vx, z: az + t * vz };
    return { distance: Math.hypot(px - point.x, pz - point.z), point };
}

function getZoneReferencePoint(zone, pos) {
    if (zone.shape === 'circle') {
        const dx = zone.x - pos.x;
        const dz = zone.z - pos.z;
        const len = Math.hypot(dx, dz) || 1;
        return { x: zone.x - (dx / len) * (zone.radius ?? 4), z: zone.z - (dz / len) * (zone.radius ?? 4) };
    }
    if (zone.shape === 'polygon' && Array.isArray(zone.points) && zone.points.length >= 3) {
        let closest = { distance: Infinity, point: { x: zone.x, z: zone.z } };
        for (let i = 0; i < zone.points.length; i++) {
            const a = zone.points[i];
            const b = zone.points[(i + 1) % zone.points.length];
            const candidate = distanceToSegment(pos.x, pos.z, a.x, a.z, b.x, b.z);
            if (candidate.distance < closest.distance) closest = candidate;
        }
        return closest.point;
    }
    const halfWidth = (zone.width ?? 4) / 2;
    const halfDepth = (zone.depth ?? 4) / 2;
    return {
        x: THREE.MathUtils.clamp(pos.x, zone.x - halfWidth, zone.x + halfWidth),
        z: THREE.MathUtils.clamp(pos.z, zone.z - halfDepth, zone.z + halfDepth)
    };
}

function describeDirection(dx, dz) {
    const horizontal = Math.abs(dx) < 0.35 ? '' : dx > 0 ? 'east' : 'west';
    const vertical = Math.abs(dz) < 0.35 ? '' : dz > 0 ? 'north' : 'south';
    if (horizontal && vertical) return `${vertical}-${horizontal}`;
    if (horizontal) return horizontal;
    if (vertical) return vertical;
    return 'here';
}

function getDangerHint(pos, floor) {
    const zones = dangerZones.filter(z => z.enabled && z.floorNumber === floor);
    if (!zones.length) {
        return { text: 'No active geo-fence nearby.', level: 'safe', nearestDistance: Infinity };
    }

    const inside = detectDangerZone(pos, floor);
    if (inside) {
        return { text: `Inside danger zone: ${inside.name}. Leave immediately.`, level: 'inside', nearestDistance: 0 };
    }

    let nearest = null;
    for (const zone of zones) {
        const ref = getZoneReferencePoint(zone, pos);
        const dx = ref.x - pos.x;
        const dz = ref.z - pos.z;
        const distance = Math.hypot(dx, dz);
        if (!nearest || distance < nearest.distance) {
            nearest = { zone, dx, dz, distance };
        }
    }

    if (!nearest) {
        return { text: 'No active geo-fence nearby.', level: 'safe', nearestDistance: Infinity };
    }

    const level = nearest.distance <= DANGER_NEAR_DISTANCE
        ? 'near'
        : nearest.distance <= DANGER_FAR_DISTANCE
            ? 'far'
            : 'safe';
    return {
        text: `${nearest.zone.name}: ${nearest.distance.toFixed(1)}m ${describeDirection(nearest.dx, nearest.dz)}.`,
        level,
        nearestDistance: nearest.distance
    };
}

function getDangerLevelColor(level) {
    if (level === 'inside') return { fill: 'rgba(255,94,106,0.24)', stroke: 'rgba(255,94,106,0.95)' };
    if (level === 'near') return { fill: 'rgba(255,154,119,0.22)', stroke: 'rgba(255,154,119,0.92)' };
    if (level === 'far') return { fill: 'rgba(255,214,125,0.2)', stroke: 'rgba(255,214,125,0.9)' };
    return { fill: 'rgba(255,94,106,0.14)', stroke: 'rgba(255,94,106,0.7)' };
}

function setDangerHintLevel(level) {
    dangerHintPanelEl.classList.remove('level-far', 'level-near', 'level-inside');
    if (level === 'far') dangerHintPanelEl.classList.add('level-far');
    if (level === 'near') dangerHintPanelEl.classList.add('level-near');
    if (level === 'inside') dangerHintPanelEl.classList.add('level-inside');
}

function maybePublishDangerAlert(zone) {
    if (!zone || !solaceBridge?.isConnected()) return;
    const key = `${userId}|${zone.id ?? zone.name}`;
    const now = Date.now();
    const last = lastAlertPublishedAt.get(key) ?? 0;
    if (now - last < ALERT_PUBLISH_COOLDOWN_MS) return;
    lastAlertPublishedAt.set(key, now);
    solaceBridge.publish(TOPICS.userAlert(userId), {
        userId,
        zoneId: zone.id ?? zone.name,
        zoneName: zone.name,
        floor: currentFloor.number,
        x: parseFloat(player.position.x.toFixed(2)),
        z: parseFloat(player.position.z.toFixed(2)),
        timestamp: new Date().toISOString()
    });
}

function drawMiniMap(dangerLevel = 'safe') {
    const ctx = miniMapCtx;
    const width = miniMapCanvasEl.width;
    const height = miniMapCanvasEl.height;
    const dangerColors = getDangerLevelColor(dangerLevel);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(7,16,25,0.96)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(125,212,255,0.38)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    ctx.fillStyle = 'rgba(54,88,112,0.35)';
    BASE_ZONES.forEach(zone => {
        const topLeft = worldToMiniMap(zone.x - zone.width / 2, zone.z + zone.depth / 2);
        const bottomRight = worldToMiniMap(zone.x + zone.width / 2, zone.z - zone.depth / 2);
        ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    });

    ctx.strokeStyle = 'rgba(200,220,235,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    [
        [-7, -17, -7, -9], [-7, -5, -7, 5], [-7, 9, -7, 17],
        [7, -17, 7, -9], [7, -5, 7, 5], [7, 9, 7, 17],
        [-22, 0, -7, 0], [7, 0, 22, 0]
    ].forEach(([x1, z1, x2, z2]) => {
        const a = worldToMiniMap(x1, z1);
        const b = worldToMiniMap(x2, z2);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
    });
    ctx.stroke();

    STAIR_NODES.filter(stair => stair.floorNumber === currentFloor.number).forEach(stair => {
        const point = worldToMiniMap(stair.localPosition.x, stair.localPosition.z);
        ctx.beginPath();
        ctx.fillStyle = '#ffd67d';
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    dangerZones.filter(zone => zone.enabled && zone.floorNumber === currentFloor.number).forEach(zone => {
        ctx.fillStyle = dangerColors.fill;
        ctx.strokeStyle = dangerColors.stroke;
        ctx.lineWidth = 1.25;
        if (zone.shape === 'circle') {
            const center = worldToMiniMap(zone.x, zone.z);
            const edge = worldToMiniMap(zone.x + (zone.radius ?? 4), zone.z);
            const radius = Math.abs(edge.x - center.x);
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (zone.shape === 'polygon' && Array.isArray(zone.points) && zone.points.length >= 3) {
            ctx.beginPath();
            zone.points.forEach((point, index) => {
                const p = worldToMiniMap(point.x, point.z);
                if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else {
            const topLeft = worldToMiniMap(zone.x - (zone.width ?? 4) / 2, zone.z + (zone.depth ?? 4) / 2);
            const bottomRight = worldToMiniMap(zone.x + (zone.width ?? 4) / 2, zone.z - (zone.depth ?? 4) / 2);
            ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
            ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        }
    });

    npcActors.filter(npc => npc.floor === currentFloor.number).forEach(npc => {
        const point = worldToMiniMap(npc.model.position.x, npc.model.position.z);
        ctx.beginPath();
        ctx.fillStyle = 'rgba(119,213,255,0.72)';
        ctx.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
    });

    const playerPoint = worldToMiniMap(player.position.x, player.position.z);
    ctx.save();
    ctx.translate(playerPoint.x, playerPoint.y);
    ctx.rotate(-player.rotation.y);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.8, 6);
    ctx.lineTo(-4.8, 6);
    ctx.closePath();
    ctx.fillStyle = '#83f3ae';
    ctx.fill();
    ctx.strokeStyle = '#eef7fd';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(149,173,188,0.9)';
    ctx.font = '10px Bahnschrift, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${currentFloor.number}F`, 8, 12);
}

// ── Stair proximity ───────────────────────────────────────────────────────────
function checkStairs(pos) {
    if (stairCooldown > 0) {
        pendingStair = null;
        stairPromptEl.classList.remove('visible');
        return;
    }
    const TRIGGER = 1.8;
    let nearby = null;
    for (const stair of stairObjects) {
        if (stair.floorNumber !== currentFloor.number) continue;
        const dx = pos.x - stair.localPosition.x;
        const dz = pos.z - stair.localPosition.z;
        if (Math.hypot(dx, dz) < TRIGGER) {
            nearby = stair;
            break;
        }
    }
    if (!nearby) {
        pendingStair = null;
        stairPromptEl.classList.remove('visible');
        return;
    }
    if (!pendingStair || pendingStair.id !== nearby.id) {
        pendingStair = nearby;
        stairPromptTextEl.textContent = `Stair nearby: transfer to Floor ${nearby.targetFloor}?`;
        stairPromptEl.classList.add('visible');
    }
}

function confirmStairTransfer() {
    if (!pendingStair || stairCooldown > 0) return;
    const stair = pendingStair;
    pendingStair = null;
    stairPromptEl.classList.remove('visible');
    stairCooldown = STAIR_COOLDOWN + 0.5;
    setFloor(stair.targetFloor);
    player.position.x = stair.arrivalPosition.x;
    player.position.z = stair.arrivalPosition.z;
    player.position.y = getFloorY(stair.targetFloor);
}

stairConfirmBtnEl.addEventListener('click', confirmStairTransfer);
stairCancelBtnEl.addEventListener('click', () => {
    pendingStair = null;
    stairPromptEl.classList.remove('visible');
});

window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'e') confirmStairTransfer();
    if (e.key === 'Escape') {
        pendingStair = null;
        stairPromptEl.classList.remove('visible');
    }
});

// ── Camera ────────────────────────────────────────────────────────────────────
function updateCamera() {
    const offsetY = getFloorY(currentFloor.number);
    const sin = Math.sin(cameraYaw), cos = Math.cos(cameraYaw);
    const pitch = Math.max(0.18, Math.min(Math.PI / 2 - 0.08, cameraPitch));
    camera.position.set(
        player.position.x + Math.sin(cameraPitch) * sin * cameraDistance,
        player.position.y + Math.cos(cameraPitch) * cameraDistance + 0.6,
        player.position.z + Math.sin(cameraPitch) * cos * cameraDistance
    );
    camera.lookAt(player.position.x, player.position.y + 1.4, player.position.z);
}

// ── Input ─────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup')    keys.w = true;
    if (k === 'a' || k === 'arrowleft')  keys.a = true;
    if (k === 's' || k === 'arrowdown')  keys.s = true;
    if (k === 'd' || k === 'arrowright') keys.d = true;
});
window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup')    keys.w = false;
    if (k === 'a' || k === 'arrowleft')  keys.a = false;
    if (k === 's' || k === 'arrowdown')  keys.s = false;
    if (k === 'd' || k === 'arrowright') keys.d = false;
});

renderer.domElement.addEventListener('pointerdown', e => {
    isDragging = true; lastPX = e.clientX; lastPY = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointerup',   () => { isDragging = false; });
renderer.domElement.addEventListener('pointermove', e => {
    if (!isDragging) return;
    const dx = e.clientX - lastPX, dy = e.clientY - lastPY;
    lastPX = e.clientX; lastPY = e.clientY;
    targetYaw   -= dx * 0.006;
    targetPitch  = Math.max(0.22, Math.min(1.38, targetPitch + dy * 0.005));
});
renderer.domElement.addEventListener('wheel', e => {
    cameraDistance = Math.max(4, Math.min(22, cameraDistance + e.deltaY * 0.012));
}, { passive: true });

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Alert overlay ─────────────────────────────────────────────────────────────
function showAlert(zoneName) {
    if (activeAlertZoneId === zoneName) return;
    activeAlertZoneId = zoneName;
    alertActive = true;
    alertZoneNameEl.textContent = zoneName;
    alertOverlayEl.classList.add('active');
    alertBannerEl.classList.add('visible');
}
function hideAlert() {
    if (!alertActive) return;
    alertActive = false;
    activeAlertZoneId = '';
    alertOverlayEl.classList.remove('active');
    alertBannerEl.classList.remove('visible');
}

// ── Broadcast toast ───────────────────────────────────────────────────────────
function showBroadcast(text) {
    broadcastTextEl.textContent = text;
    broadcastToastEl.classList.add('visible');
    if (broadcastTimer) clearTimeout(broadcastTimer);
    broadcastTimer = setTimeout(() => broadcastToastEl.classList.remove('visible'), 6000);
}

// ── Solace ────────────────────────────────────────────────────────────────────
function setConnBadge(state) {
    connBadgeEl.textContent = state === 'connected' ? 'Connected' : state === 'reconnecting' ? 'Reconnecting…' : 'Offline';
    connBadgeEl.className = state === 'connected' ? 'ok' : state === 'reconnecting' ? '' : 'err';
}

function onZonesUpdate(_, payload) {
    // Replace dangerZones array contents
    dangerZones.length = 0;
    if (Array.isArray(payload.zones)) {
        dangerZones.push(...payload.zones);
        updateDangerZoneVisuals();
    }
    drawMiniMap();
}

function onBroadcast(_, payload) {
    if (payload?.text) showBroadcast(String(payload.text).slice(0, 200));
}

function onAdminAlert(_, payload) {
    if (payload?.text) showBroadcast(`⚠ Admin Alert: ${payload.text}`);
}

// ── Danger zone 3D visuals ────────────────────────────────────────────────────
const dangerZoneMeshes = new Map(); // id → THREE.Group

function updateDangerZoneVisuals() {
    // remove old
    dangerZoneMeshes.forEach(g => scene.remove(g));
    dangerZoneMeshes.clear();

    dangerZones.forEach(zone => {
        if (!zone.enabled) return;
        const g = new THREE.Group();
        const colorNum = parseInt((zone.color ?? '#ff5e6a').replace('#', ''), 16);

        if (zone.shape === 'circle') {
            const radius = zone.radius ?? 4;
            const fill = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, 0.08, 48),
                new THREE.MeshStandardMaterial({ color: colorNum, emissive: colorNum, emissiveIntensity: 0.22, transparent: true, opacity: 0.22 })
            );
            fill.position.copy(worldPos(zone.floorNumber, zone.x, zone.z, 0.05));
            g.add(fill);

            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(radius, 0.08, 16, 64),
                new THREE.MeshStandardMaterial({ color: colorNum, emissive: colorNum, emissiveIntensity: 0.38 })
            );
            ring.rotation.x = Math.PI / 2;
            ring.position.copy(worldPos(zone.floorNumber, zone.x, zone.z, 0.11));
            g.add(ring);

        } else if (zone.shape === 'polygon' && Array.isArray(zone.points) && zone.points.length >= 3) {
            const centerX = zone.points.reduce((s, p) => s + p.x, 0) / zone.points.length;
            const centerZ = zone.points.reduce((s, p) => s + p.z, 0) / zone.points.length;
            const shape = new THREE.Shape();
            zone.points.forEach((p, i) => {
                const sx = p.x - centerX;
                const sy = -(p.z - centerZ);
                if (i === 0) shape.moveTo(sx, sy); else shape.lineTo(sx, sy);
            });
            shape.closePath();

            const fill = new THREE.Mesh(
                new THREE.ShapeGeometry(shape),
                new THREE.MeshStandardMaterial({ color: colorNum, emissive: colorNum, emissiveIntensity: 0.22, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
            );
            fill.rotation.x = -Math.PI / 2;
            fill.position.copy(worldPos(zone.floorNumber, centerX, centerZ, 0.05));
            g.add(fill);

            const pts = zone.points.map(p => new THREE.Vector3(p.x - centerX, 0.06, p.z - centerZ));
            pts.push(pts[0].clone());
            const line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineBasicMaterial({ color: colorNum, transparent: true, opacity: 0.88 })
            );
            line.position.copy(worldPos(zone.floorNumber, centerX, centerZ));
            g.add(line);
            zone.x = centerX;
            zone.z = centerZ;

        } else {
            const width = zone.width ?? 4;
            const depth = zone.depth ?? 4;
            const fill = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.08, depth),
                new THREE.MeshStandardMaterial({ color: colorNum, emissive: colorNum, emissiveIntensity: 0.22, transparent: true, opacity: 0.22 })
            );
            fill.position.copy(worldPos(zone.floorNumber, zone.x, zone.z, 0.05));
            g.add(fill);

            const frame = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 1.8, depth)),
                new THREE.LineBasicMaterial({ color: colorNum, transparent: true, opacity: 0.85 })
            );
            frame.position.copy(worldPos(zone.floorNumber, zone.x, zone.z, 0.92));
            g.add(frame);
        }

        const beacon = new THREE.PointLight(colorNum, 0.45, 7, 2);
        beacon.position.copy(worldPos(zone.floorNumber, zone.x, zone.z, 1.5));
        g.add(beacon);

        const lbl = createLabel(`RESTRICTED: ${zone.name}`, colorNum);
        lbl.position.copy(worldPos(zone.floorNumber, zone.x, zone.z, 2.7));
        lbl.scale.set(7.2, 1.5, 1);
        g.add(lbl);

        scene.add(g);
        dangerZoneMeshes.set(zone.id, g);
    });
}

// ── Game loop ─────────────────────────────────────────────────────────────────
let lastTime = performance.now();
let publishAccum = 0;

function gameLoop() {
    requestAnimationFrame(gameLoop);

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (stairCooldown > 0) stairCooldown -= dt;

    // --- Smooth camera ---
    cameraYaw   = damp(cameraYaw,   targetYaw,   14, dt);
    cameraPitch = damp(cameraPitch, targetPitch,  14, dt);

    // --- Movement ---
    const movingInput = keys.w || keys.a || keys.s || keys.d;
    const desiredSpeed = movingInput ? WALK_SPEED : 0;
    currentMoveSpeed = damp(currentMoveSpeed, desiredSpeed, WALK_ACCEL, dt);

    const fwd  = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    const right= new THREE.Vector3( Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    moveDirection.set(0, 0, 0);
    if (keys.w) moveDirection.add(fwd);
    if (keys.s) moveDirection.sub(fwd);
    if (keys.d) moveDirection.add(right);
    if (keys.a) moveDirection.sub(right);

    if (moveDirection.lengthSq() > 0) {
        moveDirection.normalize();
        player.position.x += moveDirection.x * currentMoveSpeed * dt;
        player.position.z += moveDirection.z * currentMoveSpeed * dt;
        const targetRot = Math.atan2(-moveDirection.x, -moveDirection.z);
        player.rotation.y = damp(player.rotation.y, targetRot, 12, dt);
    }
    resolveCollision();

    if (currentMoveSpeed > 0.08) playerStepPhase += dt * WALK_ANIM_FREQ * (currentMoveSpeed / WALK_SPEED);
    animateBlockRig(player.userData.rig, currentMoveSpeed, dt, now * 0.001, playerStepPhase);

    checkStairs(player.position);
    updateNpcs(dt);

    // --- Zone detection ---
    const zone = detectZone(player.position);
    hudZoneEl.textContent = zone?.name ?? '—';

    // --- Danger zone detection ---
    const dangerZone = detectDangerZone(player.position, currentFloor.number);
    if (dangerZone) {
        showAlert(dangerZone.name);
        maybePublishDangerAlert(dangerZone);
    } else {
        hideAlert();
    }

    const hint = getDangerHint(player.position, currentFloor.number);
    dangerHintTextEl.textContent = hint.text;
    setDangerHintLevel(hint.level);

    // --- HUD position ---
    hudPosEl.textContent = `${player.position.x.toFixed(1)}, ${player.position.z.toFixed(1)}`;
    drawMiniMap(hint.level);

    // --- Solace publish ---
    publishAccum += dt * 1000;
    if (publishAccum >= PUBLISH_INTERVAL && solaceBridge?.isConnected()) {
        publishAccum = 0;
        solaceBridge.publish(TOPICS.userPosition(userId), {
            userId,
            floor: currentFloor.number,
            x: parseFloat(player.position.x.toFixed(2)),
            z: parseFloat(player.position.z.toFixed(2)),
            zone: zone?.name ?? '',
            status: currentMoveSpeed > 0.4 ? 'moving' : 'idle',
            timestamp: new Date().toISOString()
        });
    }

    updateCamera();
    renderer.render(scene, camera);
}

// ── Entry point (login) ───────────────────────────────────────────────────────
function loadSavedConfig() {
    try {
        const saved = localStorage.getItem('hospital-user-config');
        if (saved) {
            const cfg = JSON.parse(saved);
            inputUrlEl.value       = cfg.url          ?? '';
            inputVpnEl.value       = cfg.vpn          ?? '';
            inputSolaceUserEl.value= cfg.solaceUser    ?? '';
            inputSolacePassEl.value= cfg.solacePass    ?? '';
        }
    } catch { /* ignore */ }
}

function saveConfig(cfg) {
    try { localStorage.setItem('hospital-user-config', JSON.stringify(cfg)); } catch { /* ignore */ }
}

loadSavedConfig();

btnEnterEl.addEventListener('click', () => {
    const name = inputUsernameEl.value.trim();
    if (!name) { loginErrorEl.textContent = 'Please enter a username'; return; }

    const url        = inputUrlEl.value.trim();
    const vpn        = inputVpnEl.value.trim();
    const solaceUser = inputSolaceUserEl.value.trim();
    const solacePass = inputSolacePassEl.value;

    if (!url || !vpn || !solaceUser) {
        loginErrorEl.textContent = 'Please fill in all Solace connection details';
        return;
    }

    loginErrorEl.textContent = '';
    btnEnterEl.disabled = true;
    btnEnterEl.textContent = 'Connecting…';

    saveConfig({ url, vpn, solaceUser, solacePass });
    hudUserEl.textContent = name;
        userId = name.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_' + Math.random().toString(36).slice(2, 6);

    solaceBridge = createSolaceBridge(
        { url, vpn, username: solaceUser, password: solacePass },
        {
            onConnect() {
                setConnBadge('connected');
                solaceBridge.resubscribeAll();
                loginOverlayEl.style.display = 'none';
                setFloor(1);
                gameLoop();
            },
            onDisconnect() {
                setConnBadge('disconnected');
            },
            onError(e) {
                const msg = e?.message || e?.infoStr || 'Connection failed';
                loginErrorEl.textContent = msg;
                btnEnterEl.disabled = false;
                btnEnterEl.textContent = 'Enter Scene';
                setConnBadge('disconnected');
            }
        }
    );

    // subscribe after session is created (handlers registered regardless of connect timing)
    solaceBridge.subscribe(TOPICS.zonesUpdate, onZonesUpdate);
    solaceBridge.subscribe(TOPICS.broadcast,   onBroadcast);
    solaceBridge.subscribe(TOPICS.alertToUser(userId), onAdminAlert);

    // Fallback: if no Solace, start anyway after 9s timeout
    setTimeout(() => {
        if (loginOverlayEl.style.display !== 'none') {
            loginErrorEl.textContent = 'Connection timed out. Check Solace settings.';
            btnEnterEl.disabled = false;
            btnEnterEl.textContent = 'Enter Scene';
        }
    }, 9000);
});

// Allow Enter key to submit
inputSolacePassEl.addEventListener('keydown', e => { if (e.key === 'Enter') btnEnterEl.click(); });
