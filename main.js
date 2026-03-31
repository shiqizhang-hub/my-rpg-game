import * as THREE from 'three';

const app = document.querySelector('#app');
const floorLevelEl = document.querySelector('#floorLevel');
const locationEl = document.querySelector('#location');
const statusEl = document.querySelector('#status');
const objectiveEl = document.querySelector('#objective');
const progressEl = document.querySelector('#progress');
const nextHintEl = document.querySelector('#nextHint');
const checklistEl = document.querySelector('#checklist');
const distanceEl = document.querySelector('#distance');
const accessListEl = document.querySelector('#accessList');
const dialoguePanelEl = document.querySelector('#dialoguePanel');
const dialogueSpeakerEl = document.querySelector('#dialogueSpeaker');
const dialogueTextEl = document.querySelector('#dialogueText');
const promptEl = document.querySelector('#prompt');
const restartButtonEl = document.querySelector('#restartButton');

const FLOOR_HEIGHT = 8;
const WALK_SPEED = 5.4;
const INTERACT_DISTANCE = 2.6;
const STAIR_REENTRY_DELAY = 0.35;

const FLOOR_CONFIGS = [
    { number: 1, name: 'Triage Level', accent: 0x5db4ff, floorColor: 0x162a3a },
    { number: 2, name: 'Inpatient Ward', accent: 0x8ee6cb, floorColor: 0x163331 },
    { number: 3, name: 'Diagnostics Wing', accent: 0xffd48a, floorColor: 0x32291f }
];

const BASE_ZONES = [
    { id: 'lobby', name: 'Main Lobby', x: 0, z: 12.5, width: 12, depth: 8, color: 0x295979 },
    { id: 'corridor', name: 'Clinical Corridor', x: 0, z: 0, width: 12, depth: 18, color: 0x21455c },
    { id: 'triage', name: 'Triage Station', x: -14.5, z: 8.5, width: 15, depth: 16, color: 0x2f7463 },
    { id: 'pharmacy', name: 'Pharmacy Prep', x: -14.5, z: -8.5, width: 15, depth: 16, color: 0x7c6a30 },
    { id: 'icu', name: 'ICU Monitoring', x: 14.5, z: 8.5, width: 15, depth: 16, color: 0x6a526e },
    { id: 'records', name: 'Radiology Records', x: 14.5, z: -8.5, width: 15, depth: 16, color: 0x596a39 }
];

const OBJECTIVES = [
    {
        id: 'triage-terminal',
        title: 'Inspect triage terminal',
        zoneId: 'triage',
        floorNumber: 1,
        localPosition: { x: -15, z: 10 },
        color: 0x66ffc5,
        detail: 'Emergency intake is online. Continue upward through the hospital stairwell.'
    },
    {
        id: 'icu-board',
        title: 'Inspect ICU patient board',
        zoneId: 'icu',
        floorNumber: 2,
        localPosition: { x: 15, z: 9 },
        color: 0xffa9c7,
        detail: 'ICU bed assignments are secured. One final diagnostics record remains above.'
    },
    {
        id: 'radiology-terminal',
        title: 'Inspect radiology archive terminal',
        zoneId: 'records',
        floorNumber: 3,
        localPosition: { x: 15, z: -10 },
        color: 0xffdd7c,
        detail: 'Radiology archive sweep finished. Return to Floor 1 for extraction.'
    }
];

const STAIR_NODES = [
    {
        id: 'f1-up',
        type: 'stairs',
        floorNumber: 1,
        targetFloor: 2,
        title: 'Ascend to Floor 2',
        localPosition: { x: -5.2, z: 12.8 },
        arrivalPosition: { x: 5.2, z: 11.6 },
        color: 0x7df0bb,
        detail: 'Moving up to the inpatient wing.'
    },
    {
        id: 'f2-down',
        type: 'stairs',
        floorNumber: 2,
        targetFloor: 1,
        title: 'Descend to Floor 1',
        localPosition: { x: 5.2, z: 12.8 },
        arrivalPosition: { x: -5.2, z: 11.6 },
        color: 0x5db4ff,
        detail: 'Moving down to the main hospital lobby.'
    },
    {
        id: 'f2-up',
        type: 'stairs',
        floorNumber: 2,
        targetFloor: 3,
        title: 'Ascend to Floor 3',
        localPosition: { x: -5.2, z: 12.8 },
        arrivalPosition: { x: 5.2, z: 11.6 },
        color: 0xffca72,
        detail: 'Moving up to diagnostics.'
    },
    {
        id: 'f3-down',
        type: 'stairs',
        floorNumber: 3,
        targetFloor: 2,
        title: 'Descend to Floor 2',
        localPosition: { x: 5.2, z: 12.8 },
        arrivalPosition: { x: -5.2, z: 11.6 },
        color: 0x7df0bb,
        detail: 'Moving down to the inpatient wing.'
    }
];

const DOOR_NODES = [
    { id: 'f1-triage-door', floorNumber: 1, zoneId: 'triage', title: 'Open triage doors', localPosition: { x: -7, z: 7 }, width: 2.8, color: 0x67d8be },
    { id: 'f1-pharmacy-door', floorNumber: 1, zoneId: 'pharmacy', title: 'Open pharmacy doors', localPosition: { x: -7, z: -7 }, width: 2.8, color: 0xf0c36b },
    { id: 'f1-icu-door', floorNumber: 1, zoneId: 'icu', title: 'Open observation doors', localPosition: { x: 7, z: 7 }, width: 2.8, color: 0xf0a7cc },
    { id: 'f1-records-door', floorNumber: 1, zoneId: 'records', title: 'Open records doors', localPosition: { x: 7, z: -7 }, width: 2.8, color: 0xb0d97a },
    { id: 'f2-triage-door', floorNumber: 2, zoneId: 'triage', title: 'Open ward doors', localPosition: { x: -7, z: 7 }, width: 2.8, color: 0x67d8be },
    { id: 'f2-pharmacy-door', floorNumber: 2, zoneId: 'pharmacy', title: 'Open pharmacy doors', localPosition: { x: -7, z: -7 }, width: 2.8, color: 0xf0c36b },
    { id: 'f2-icu-door', floorNumber: 2, zoneId: 'icu', title: 'Open ICU doors', localPosition: { x: 7, z: 7 }, width: 2.8, color: 0xf0a7cc, requiredAccess: 'icuClearance', lockedText: 'ICU access requires head nurse clearance.' },
    { id: 'f2-records-door', floorNumber: 2, zoneId: 'records', title: 'Open staff records doors', localPosition: { x: 7, z: -7 }, width: 2.8, color: 0xb0d97a },
    { id: 'f3-triage-door', floorNumber: 3, zoneId: 'triage', title: 'Open lab intake doors', localPosition: { x: -7, z: 7 }, width: 2.8, color: 0x67d8be },
    { id: 'f3-pharmacy-door', floorNumber: 3, zoneId: 'pharmacy', title: 'Open supply doors', localPosition: { x: -7, z: -7 }, width: 2.8, color: 0xf0c36b },
    { id: 'f3-icu-door', floorNumber: 3, zoneId: 'icu', title: 'Open imaging doors', localPosition: { x: 7, z: 7 }, width: 2.8, color: 0xf0a7cc },
    { id: 'f3-records-door', floorNumber: 3, zoneId: 'records', title: 'Open archive doors', localPosition: { x: 7, z: -7 }, width: 2.8, color: 0xb0d97a, requiredAccess: 'radiologyClearance', lockedText: 'Radiology archives require doctor authorization.' }
];

const NPC_NODES = [
    {
        id: 'head-nurse',
        type: 'npc',
        floorNumber: 1,
        title: 'Talk to head nurse',
        role: 'Head Nurse',
        localPosition: { x: -9.8, z: 11.2 },
        color: 0x7de4ff,
        grantsAccess: 'icuClearance',
        availableWhen: () => objectiveState.has('triage-terminal'),
        detail: 'Head Nurse: ICU clearance granted. You can now access the ward monitoring room.'
    },
    {
        id: 'ward-doctor',
        type: 'npc',
        floorNumber: 2,
        title: 'Talk to ward doctor',
        role: 'Ward Doctor',
        localPosition: { x: -1.5, z: -2.8 },
        color: 0xffd27f,
        grantsAccess: 'radiologyClearance',
        availableWhen: () => objectiveState.has('icu-board'),
        detail: 'Ward Doctor: Radiology authorization granted. Diagnostics archive access is now available.'
    }
];

const currentFloorState = { number: 1 };
const missionState = { extractionUnlocked: false, missionComplete: false };
const accessState = { icuClearance: false, radiologyClearance: false };
const dialogueState = { speaker: '', text: '', timeout: 0 };
const objectiveState = new Set();
const colliders = [];
const interactables = [];
const dynamicDoors = [];
const floorGroups = new Map();
const playerCollisionSize = new THREE.Vector3(1.1, 2.2, 1.1);
const playerBox = new THREE.Box3();
const moveDirection = new THREE.Vector3();
const cameraDesiredPosition = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const cameraCollisionDirection = new THREE.Vector3();
const cameraCollisionPoint = new THREE.Vector3();
const cameraCollisionRay = new THREE.Ray();
const tempDoorCenter = new THREE.Vector3();
const tempDoorSize = new THREE.Vector3();
const tempDoorBox = new THREE.Box3();
const spawnPoint = new THREE.Vector3(0, 0, 14.2);
const extractionPoint = spawnPoint.clone();

let currentZoneId = '';
let nearbyInteractable = null;
let extractionBeacon = null;
let stairCooldown = 0;
let cameraYaw = -Math.PI;
let cameraPitch = 0.92;
let targetCameraYaw = cameraYaw;
let targetCameraPitch = cameraPitch;
let cameraDistance = 11.8;
let targetCameraDistance = cameraDistance;
let isDraggingCamera = false;
let lastPointerX = 0;
let lastPointerY = 0;

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
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', 'Hospital exploration game viewport');
renderer.domElement.style.outline = 'none';
app.appendChild(renderer.domElement);
app.tabIndex = 0;

const hemiLight = new THREE.HemisphereLight(0xbfdfff, 0x0d1520, 1.15);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xf6fbff, 1.55);
dirLight.position.set(-18, 36, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.top = 44;
dirLight.shadow.camera.bottom = -12;
dirLight.shadow.camera.left = -36;
dirLight.shadow.camera.right = 36;
scene.add(dirLight);

const ambientColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(30, 38, 30, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x0d1622, transparent: true, opacity: 0.14, side: THREE.BackSide })
);
ambientColumn.position.y = FLOOR_HEIGHT;
scene.add(ambientColumn);

const grid = new THREE.GridHelper(60, 30, 0x2d5166, 0x183040);
grid.position.y = -0.02;
grid.material.opacity = 0.18;
grid.material.transparent = true;
scene.add(grid);

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xd9e1ea, roughness: 0.9 });
const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x4f5f73, roughness: 0.72 });
const propMaterial = new THREE.MeshStandardMaterial({ color: 0x8fa4b8, roughness: 0.82 });
const darkPanelMaterial = new THREE.MeshStandardMaterial({ color: 0x192634, roughness: 0.75 });
const bedMaterial = new THREE.MeshStandardMaterial({ color: 0xe5edf4, roughness: 0.88 });
const sheetMaterial = new THREE.MeshStandardMaterial({ color: 0x9ed9ef, roughness: 0.92 });
const deviceMaterial = new THREE.MeshStandardMaterial({ color: 0x566979, roughness: 0.72 });
const doorMaterial = new THREE.MeshStandardMaterial({ color: 0xc6d4e0, roughness: 0.78 });
const nurseMaterial = new THREE.MeshStandardMaterial({ color: 0x8ad8f0, roughness: 0.84 });
const doctorMaterial = new THREE.MeshStandardMaterial({ color: 0xf2d4a4, roughness: 0.84 });
const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2a33, roughness: 0.55 });
const blushMaterial = new THREE.MeshStandardMaterial({ color: 0xe7a0a0, roughness: 0.8 });
const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xeaf8ff, emissive: 0xc8f1ff, emissiveIntensity: 0.9, roughness: 0.35 });

function getFloorY(floorNumber) {
    return (floorNumber - 1) * FLOOR_HEIGHT;
}

function getFloorConfig(floorNumber) {
    return FLOOR_CONFIGS.find((floorConfig) => floorConfig.number === floorNumber);
}

function getWorldPosition(floorNumber, x, z, y = 0) {
    return new THREE.Vector3(x, getFloorY(floorNumber) + y, z);
}

function damp(current, target, smoothing, deltaTime) {
    return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-smoothing * deltaTime));
}

function dampAngle(current, target, smoothing, deltaTime) {
    const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + delta * (1 - Math.exp(-smoothing * deltaTime));
}

function addCollider(mesh, floorNumber) {
    mesh.updateMatrixWorld(true);
    colliders.push({ floorNumber, box: new THREE.Box3().setFromObject(mesh) });
}

function addColliderBox(floorNumber, x, z, width, depth, height, y = height / 2) {
    colliders.push({
        floorNumber,
        box: new THREE.Box3().setFromCenterAndSize(
            getWorldPosition(floorNumber, x, z, y),
            new THREE.Vector3(width, height, depth)
        )
    });
}

function createLabel(text, tint) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(9, 19, 29, 0.78)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = `#${tint.toString(16).padStart(6, '0')}`;
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fillStyle = '#f5fbff';
    ctx.font = '600 42px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(6.6, 1.6, 1);
    return sprite;
}

function createBlock({ parent, floorNumber, x, z, width, depth, height, material, y = height / 2, collidable = false }) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material.clone());
    mesh.position.copy(getWorldPosition(floorNumber, x, z, y));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);

    if (collidable) {
        addCollider(mesh, floorNumber);
    }

    return mesh;
}

function createZoneMesh(zone, floorNumber, parent) {
    const zoneMesh = new THREE.Mesh(
        new THREE.BoxGeometry(zone.width, 0.12, zone.depth),
        new THREE.MeshStandardMaterial({ color: zone.color, roughness: 0.95, metalness: 0.04, transparent: true, opacity: 0.92 })
    );
    zoneMesh.position.copy(getWorldPosition(floorNumber, zone.x, zone.z, 0.06));
    zoneMesh.receiveShadow = true;
    parent.add(zoneMesh);

    const label = createLabel(`F${floorNumber} ${zone.name}`, zone.color);
    label.position.copy(getWorldPosition(floorNumber, zone.x, zone.z, 3.1));
    parent.add(label);
}

function createVoxelMonitor(parent, floorNumber, x, z, rotationY = 0, tint = 0x7de4ff) {
    const group = new THREE.Group();
    group.position.copy(getWorldPosition(floorNumber, x, z));
    group.rotation.y = rotationY;

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.52), deviceMaterial.clone());
    base.position.y = 0.06;
    base.castShadow = true;
    group.add(base);

    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.02, 0.12), trimMaterial.clone());
    stem.position.y = 0.58;
    group.add(stem);

    const display = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 0.62, 0.12),
        new THREE.MeshStandardMaterial({ color: 0xdce7ef, roughness: 0.78 })
    );
    display.position.set(0, 1.18, -0.08);
    display.castShadow = true;
    group.add(display);

    const screen = new THREE.Mesh(
        new THREE.BoxGeometry(0.66, 0.42, 0.03),
        new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.65, roughness: 0.25 })
    );
    screen.position.set(0, 1.18, -0.15);
    group.add(screen);

    parent.add(group);
    addColliderBox(floorNumber, x, z, 0.92, 0.6, 1.56, 0.78);
}

function createVoxelDesk(parent, floorNumber, x, z, width, depth, height = 1.18, accent = 0x8fa4b8) {
    const group = new THREE.Group();
    group.position.copy(getWorldPosition(floorNumber, x, z));

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({ color: accent, roughness: 0.82 })
    );
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const counter = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.12, 0.14, depth + 0.12),
        darkPanelMaterial.clone()
    );
    counter.position.y = height + 0.07;
    group.add(counter);

    parent.add(group);
    addCollider(body, floorNumber);
}

function createWheelchair(parent, floorNumber, x, z, rotationY = 0) {
    const group = new THREE.Group();
    group.position.copy(getWorldPosition(floorNumber, x, z));
    group.rotation.y = rotationY;

    const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x456372, roughness: 0.84 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.62), seatMaterial);
    seat.position.y = 0.54;
    seat.castShadow = true;
    group.add(seat);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.14), deviceMaterial.clone());
    back.position.set(0, 0.92, -0.24);
    back.castShadow = true;
    group.add(back);

    const leftWheel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.82, 0.82), trimMaterial.clone());
    leftWheel.position.set(-0.42, 0.42, 0);
    group.add(leftWheel);

    const rightWheel = leftWheel.clone();
    rightWheel.position.x = 0.42;
    group.add(rightWheel);

    const handleLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.08), trimMaterial.clone());
    handleLeft.position.set(-0.18, 1.18, -0.28);
    group.add(handleLeft);

    const handleRight = handleLeft.clone();
    handleRight.position.x = 0.18;
    group.add(handleRight);

    parent.add(group);
    addColliderBox(floorNumber, x, z, 1.02, 1.02, 1.36, 0.68);
}

function createHospitalBed(parent, floorNumber, x, z, rotationY = 0) {
    const group = new THREE.Group();
    group.position.copy(getWorldPosition(floorNumber, x, z));
    group.rotation.y = rotationY;
    const pillowMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f8fb, roughness: 0.92 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.22, 1.26), bedMaterial.clone());
    frame.position.y = 0.52;
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);

    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.22, 1.02), sheetMaterial.clone());
    mattress.position.y = 0.74;
    mattress.castShadow = true;
    mattress.receiveShadow = true;
    group.add(mattress);

    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.78), pillowMaterial);
    pillow.position.set(-0.78, 0.92, 0);
    group.add(pillow);

    const headboard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.96, 1.18), deviceMaterial.clone());
    headboard.position.set(-1.16, 0.98, 0);
    group.add(headboard);

    const footboard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 1.1), deviceMaterial.clone());
    footboard.position.set(1.1, 0.72, 0);
    group.add(footboard);

    const railLeft = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.18, 0.1), deviceMaterial.clone());
    railLeft.position.set(0.02, 0.9, 0.58);
    group.add(railLeft);

    const railRight = railLeft.clone();
    railRight.position.z = -0.58;
    group.add(railRight);

    const leftWheelFront = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), trimMaterial.clone());
    leftWheelFront.position.set(-0.84, 0.22, 0.48);
    group.add(leftWheelFront);

    const leftWheelRear = leftWheelFront.clone();
    leftWheelRear.position.x = 0.82;
    group.add(leftWheelRear);

    const rightWheelFront = leftWheelFront.clone();
    rightWheelFront.position.z = -0.48;
    group.add(rightWheelFront);

    const rightWheelRear = leftWheelRear.clone();
    rightWheelRear.position.z = -0.48;
    group.add(rightWheelRear);

    parent.add(group);
    addCollider(frame, floorNumber);
}

function createMedicalCabinet(parent, floorNumber, x, z, width = 1.5, depth = 0.6) {
    const group = new THREE.Group();
    group.position.copy(getWorldPosition(floorNumber, x, z));

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, 2.1, depth), deviceMaterial.clone());
    body.position.y = 1.05;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const top = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, 0.1, depth + 0.08), darkPanelMaterial.clone());
    top.position.y = 2.14;
    group.add(top);

    for (let index = 0; index < 3; index += 1) {
        const drawer = new THREE.Mesh(
            new THREE.BoxGeometry(width * 0.9, 0.48, 0.06),
            bedMaterial.clone()
        );
        drawer.position.set(0, 0.5 + index * 0.58, depth / 2 + 0.03);
        group.add(drawer);

        const handle = new THREE.Mesh(new THREE.BoxGeometry(width * 0.18, 0.06, 0.04), trimMaterial.clone());
        handle.position.set(0, 0.5 + index * 0.58, depth / 2 + 0.08);
        group.add(handle);
    }

    parent.add(group);
    addCollider(body, floorNumber);
}

function createHospitalDecor(floorConfig, group) {
    if (floorConfig.number === 1) {
        createVoxelDesk(group, 1, -17.2, 12.5, 4.6, 2.1, 1.2, 0x7daabd);
        createVoxelMonitor(group, 1, -16.6, 10.2, 0, 0x7de4ff);
        createMedicalCabinet(group, 1, -17.8, -11.5, 1.6, 0.8);
        createMedicalCabinet(group, 1, -14.8, -11.5, 1.6, 0.8);
        createVoxelDesk(group, 1, 15.8, 10, 4.8, 1.5, 1.1, 0x91a5b7);
        createVoxelMonitor(group, 1, 16.9, 10, Math.PI, 0xffa9c7);
        createHospitalBed(group, 1, 14.2, 6.6, Math.PI / 2);
        createHospitalBed(group, 1, 14.2, -6.5, Math.PI / 2);
        createWheelchair(group, 1, 1.6, 12.6, Math.PI / 8);
    }

    if (floorConfig.number === 2) {
        createHospitalBed(group, 2, -15.8, 10.5, Math.PI / 2);
        createHospitalBed(group, 2, -15.8, 6.9, Math.PI / 2);
        createHospitalBed(group, 2, 13.8, 10.5, Math.PI / 2);
        createHospitalBed(group, 2, 13.8, 6.9, Math.PI / 2);
        createVoxelMonitor(group, 2, 17.2, 8.6, Math.PI / 2, 0xffa9c7);
        createVoxelDesk(group, 2, -15.4, -9.6, 4.6, 1.2, 1.05, 0x85996c);
        createMedicalCabinet(group, 2, -12.2, -10.8, 1.4, 0.7);
        createWheelchair(group, 2, 0.8, -4.5, -Math.PI / 10);
    }

    if (floorConfig.number === 3) {
        createMedicalCabinet(group, 3, 16.2, -10.2, 1.6, 5.8);
        createMedicalCabinet(group, 3, 12.6, -10.2, 1.6, 5.8);
        createVoxelDesk(group, 3, 15.1, 10.5, 5.4, 2, 1.1, 0x8e9da7);
        createVoxelMonitor(group, 3, 16.6, 10.4, Math.PI, 0xffdd7c);
        createMedicalCabinet(group, 3, -16.8, 11.4, 1.6, 0.7);
        createMedicalCabinet(group, 3, -16.8, 8.6, 1.6, 0.7);
        createVoxelMonitor(group, 3, -14.4, 10, -Math.PI / 2, 0x7de4ff);
    }
}

function createCorridorLights(floorConfig, group) {
    const placements = [
        { x: 0, z: 13.4 },
        { x: 0, z: 5.6 },
        { x: 0, z: -2.2 },
        { x: 0, z: -10 }
    ];

    placements.forEach((placement) => {
        const lampGroup = new THREE.Group();
        lampGroup.position.copy(getWorldPosition(floorConfig.number, placement.x, placement.z, 3.5));

        const mount = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.12, 0.5),
            deviceMaterial.clone()
        );
        mount.position.y = 0.18;
        lampGroup.add(mount);

        const stem = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.42, 0.08),
            trimMaterial.clone()
        );
        stem.position.y = -0.06;
        lampGroup.add(stem);

        const housing = new THREE.Mesh(
            new THREE.BoxGeometry(2.8, 0.18, 0.7),
            new THREE.MeshStandardMaterial({ color: 0xcfefff, emissive: floorConfig.accent, emissiveIntensity: 0.28, roughness: 0.42 })
        );
        housing.position.y = -0.42;
        lampGroup.add(housing);

        const diffuser = new THREE.Mesh(
            new THREE.BoxGeometry(2.3, 0.08, 0.52),
            lampMaterial.clone()
        );
        diffuser.position.y = -0.5;
        lampGroup.add(diffuser);

        const sideLeft = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 0.24, 0.7),
            trimMaterial.clone()
        );
        sideLeft.position.set(-1.38, -0.42, 0);
        lampGroup.add(sideLeft);

        const sideRight = sideLeft.clone();
        sideRight.position.x = 1.38;
        lampGroup.add(sideRight);

        group.add(lampGroup);

        addColliderBox(floorConfig.number, placement.x, placement.z, 2.36, 0.46, 0.18, 3.08);

        const light = new THREE.PointLight(floorConfig.accent, 0.9, 11, 2);
        light.position.copy(getWorldPosition(floorConfig.number, placement.x, placement.z, 3.02));
        group.add(light);
    });
}

function createFloorShell(floorConfig) {
    const group = new THREE.Group();
    group.name = `floor-${floorConfig.number}`;
    scene.add(group);
    floorGroups.set(floorConfig.number, group);

    const slab = new THREE.Mesh(
        new THREE.BoxGeometry(56, 0.32, 44),
        new THREE.MeshStandardMaterial({ color: floorConfig.floorColor, roughness: 0.97 })
    );
    slab.position.copy(getWorldPosition(floorConfig.number, 0, 0, -0.16));
    slab.receiveShadow = true;
    group.add(slab);

    const edge = new THREE.Mesh(
        new THREE.BoxGeometry(56.4, 0.06, 44.4),
        new THREE.MeshStandardMaterial({ color: floorConfig.accent, emissive: floorConfig.accent, emissiveIntensity: 0.18 })
    );
    edge.position.copy(getWorldPosition(floorConfig.number, 0, 0, 0.01));
    group.add(edge);

    BASE_ZONES.forEach((zone) => createZoneMesh(zone, floorConfig.number, group));

    createBlock({ parent: group, floorNumber: floorConfig.number, x: 0, z: -17, width: 44, depth: 1, height: 3.2, material: wallMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: 0, z: 17, width: 44, depth: 1, height: 3.2, material: wallMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: -22, z: 0, width: 1, depth: 34, height: 3.2, material: wallMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: 22, z: 0, width: 1, depth: 34, height: 3.2, material: wallMaterial, collidable: true });

    createBlock({ parent: group, floorNumber: floorConfig.number, x: -7, z: -13, width: 1, depth: 8, height: 3.2, material: wallMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: -7, z: 0, width: 1, depth: 10, height: 3.2, material: wallMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: -7, z: 13, width: 1, depth: 8, height: 3.2, material: wallMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: 7, z: -13, width: 1, depth: 8, height: 3.2, material: wallMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: 7, z: 0, width: 1, depth: 10, height: 3.2, material: wallMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: 7, z: 13, width: 1, depth: 8, height: 3.2, material: wallMaterial, collidable: true });

    createBlock({ parent: group, floorNumber: floorConfig.number, x: -14.5, z: 0, width: 15, depth: 1, height: 3.2, material: wallMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: 14.5, z: 0, width: 15, depth: 1, height: 3.2, material: wallMaterial, collidable: true });

    createBlock({ parent: group, floorNumber: floorConfig.number, x: -18.3, z: 12.6, width: 5.4, depth: 2.4, height: 1.2, material: propMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: -12.4, z: 6.4, width: 4.2, depth: 1.6, height: 1.1, material: propMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: -16, z: -9.5, width: 4.2, depth: 1.8, height: 0.9, material: trimMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: -12.4, z: -11.8, width: 2.2, depth: 2.2, height: 0.8, material: trimMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: 14.5, z: 8.5, width: 5.2, depth: 2.4, height: 1.05, material: propMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: 17.7, z: -9.2, width: 1.8, depth: 7.4, height: 2.2, material: propMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: 11.8, z: -9.2, width: 1.8, depth: 7.4, height: 2.2, material: propMaterial, collidable: true });

    createBlock({ parent: group, floorNumber: floorConfig.number, x: -6.4, z: 14.4, width: 1.8, depth: 1.6, height: 0.4, material: darkPanelMaterial, collidable: true });
    createBlock({ parent: group, floorNumber: floorConfig.number, x: 6.4, z: 14.4, width: 1.8, depth: 1.6, height: 0.4, material: darkPanelMaterial, collidable: true });

    createHospitalDecor(floorConfig, group);
    createCorridorLights(floorConfig, group);

    const floorBanner = createLabel(`${floorConfig.name} Hospital Wing`, floorConfig.accent);
    floorBanner.position.copy(getWorldPosition(floorConfig.number, 0, 20, 2.2));
    floorBanner.scale.set(8.6, 1.8, 1);
    group.add(floorBanner);
}

function createDoorInteractable(door) {
    const floorGroup = floorGroups.get(door.floorNumber);
    const group = new THREE.Group();
    group.position.copy(getWorldPosition(door.floorNumber, door.localPosition.x, door.localPosition.z));

    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, door.width + 0.32), deviceMaterial.clone());
    frameTop.rotation.y = Math.PI / 2;
    frameTop.position.y = 2.5;
    group.add(frameTop);

    const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, door.width * 0.46), doorMaterial.clone());
    leftPanel.position.set(0, 1.15, door.width * 0.23);
    leftPanel.castShadow = true;
    leftPanel.receiveShadow = true;
    group.add(leftPanel);

    const rightPanel = leftPanel.clone();
    rightPanel.position.z = -door.width * 0.23;
    group.add(rightPanel);

    const light = new THREE.PointLight(door.color, 0.5, 4, 2);
    light.position.y = 2.1;
    group.add(light);

    const label = createLabel(door.title, door.color);
    label.position.set(0, 3.2, 0);
    label.scale.set(4.6, 1.1, 1);
    group.add(label);

    floorGroup.add(group);

    const doorState = {
        ...door,
        type: 'door',
        position: group.position.clone(),
        group,
        leftPanel,
        rightPanel,
        light,
        isOpen: false,
        openAmount: 0,
        targetOpen: 0
    };

    dynamicDoors.push(doorState);
    interactables.push(doorState);
}

function createNpcInteractable(npc) {
    const floorGroup = floorGroups.get(npc.floorNumber);
    const group = new THREE.Group();
    group.position.copy(getWorldPosition(npc.floorNumber, npc.localPosition.x, npc.localPosition.z));

    const clothingMaterial = npc.id === 'head-nurse' ? nurseMaterial.clone() : doctorMaterial.clone();
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xf0cfb5, roughness: 0.95 });
    const hairMaterial = new THREE.MeshStandardMaterial({ color: npc.id === 'head-nurse' ? 0x4a352b : 0x5b4b38, roughness: 0.9 });
    const coatMaterial = new THREE.MeshStandardMaterial({ color: 0xe7f0f6, roughness: 0.91 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.02, 0.42), clothingMaterial);
    torso.position.y = 1.08;
    torso.castShadow = true;
    group.add(torso);

    const coatFront = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.92, 0.06), coatMaterial);
    coatFront.position.set(0, 1.02, -0.18);
    coatFront.castShadow = true;
    group.add(coatFront);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.34), clothingMaterial.clone());
    hips.position.y = 0.42;
    hips.castShadow = true;
    group.add(hips);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.54, 0.46), skinMaterial);
    head.position.y = 1.95;
    head.castShadow = true;
    group.add(head);

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.18, 0.5), hairMaterial);
    hair.position.set(0, 2.12, 0.02);
    group.add(hair);

    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMaterial.clone());
    leftEye.position.set(-0.1, 1.98, -0.25);
    group.add(leftEye);

    const rightEye = leftEye.clone();
    rightEye.position.x = 0.1;
    group.add(rightEye);

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.03), eyeMaterial.clone());
    mouth.position.set(0, 1.84, -0.245);
    group.add(mouth);

    const leftCheek = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.03), blushMaterial.clone());
    leftCheek.position.set(-0.18, 1.84, -0.24);
    group.add(leftCheek);

    const rightCheek = leftCheek.clone();
    rightCheek.position.x = 0.18;
    group.add(rightCheek);

    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.2), clothingMaterial.clone());
    leftLeg.position.set(-0.13, 0.02, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = leftLeg.clone();
    rightLeg.position.x = 0.13;
    group.add(rightLeg);

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.18), clothingMaterial.clone());
    leftArm.position.set(-0.47, 1.02, 0);
    leftArm.castShadow = true;
    group.add(leftArm);

    const rightArm = leftArm.clone();
    rightArm.position.x = 0.47;
    group.add(rightArm);

    const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.28, 0.05),
        new THREE.MeshStandardMaterial({ color: npc.color, emissive: npc.color, emissiveIntensity: 0.55 })
    );
    badge.position.set(0.16, 1.2, 0.24);
    group.add(badge);

    const label = createLabel(npc.role, npc.color);
    label.position.set(0, 2.9, 0);
    label.scale.set(4.8, 1.2, 1);
    group.add(label);

    const light = new THREE.PointLight(npc.color, 0.55, 4.5, 2);
    light.position.y = 2.3;
    group.add(light);

    floorGroup.add(group);
    addColliderBox(npc.floorNumber, npc.localPosition.x, npc.localPosition.z, 0.96, 0.72, 2.28, 1.14);

    interactables.push({
        ...npc,
        position: group.position.clone(),
        group,
        body: torso,
        badge,
        light,
        granted: false
    });
}

function getNextGoal() {
    const triageDone = objectiveState.has('triage-terminal');
    const icuDone = objectiveState.has('icu-board');
    const remainingObjective = OBJECTIVES.find((objective) => !objectiveState.has(objective.id));

    if (triageDone && !accessState.icuClearance) {
        return interactables.find((item) => item.type === 'npc' && item.id === 'head-nurse') ?? null;
    }

    if (icuDone && !accessState.radiologyClearance) {
        return interactables.find((item) => item.type === 'npc' && item.id === 'ward-doctor') ?? null;
    }

    return remainingObjective ?? null;
}

function getDoorBlockingBox(door) {
    if (door.openAmount > 0.72) {
        return null;
    }

    tempDoorCenter.set(door.position.x, getFloorY(door.floorNumber) + 1.15, door.position.z);
    tempDoorSize.set(0.9, 2.35, 2.45 * (1 - door.openAmount));
    tempDoorBox.setFromCenterAndSize(tempDoorCenter, tempDoorSize);
    return tempDoorBox;
}

function createObjectiveInteractable(objective) {
    const floorGroup = floorGroups.get(objective.floorNumber);
    const group = new THREE.Group();
    group.position.copy(getWorldPosition(objective.floorNumber, objective.localPosition.x, objective.localPosition.z));

    const pedestal = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.84, 0.92),
        new THREE.MeshStandardMaterial({ color: 0x304a5c, roughness: 0.65 })
    );
    pedestal.position.y = 0.42;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;
    group.add(pedestal);

    const core = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.36, 0.36),
        new THREE.MeshStandardMaterial({ color: objective.color, emissive: objective.color, emissiveIntensity: 1.1 })
    );
    core.position.y = 1.1;
    core.castShadow = true;
    group.add(core);

    const crown = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.12, 0.58),
        new THREE.MeshStandardMaterial({ color: 0xe8f7ff, emissive: objective.color, emissiveIntensity: 0.4 })
    );
    crown.position.y = 1.42;
    group.add(crown);

    const light = new THREE.PointLight(objective.color, 1.7, 6, 2);
    light.position.y = 1.2;
    group.add(light);

    const label = createLabel(`F${objective.floorNumber} ${objective.title}`, objective.color);
    label.position.set(0, 2.7, 0);
    label.scale.set(5.8, 1.3, 1);
    group.add(label);

    floorGroup.add(group);
    addCollider(pedestal, objective.floorNumber);

    interactables.push({
        ...objective,
        type: 'objective',
        floorNumber: objective.floorNumber,
        position: group.position.clone(),
        group,
        orb: core,
        light,
        completed: false
    });
}

function createStairInteractable(stair) {
    const floorGroup = floorGroups.get(stair.floorNumber);
    const group = new THREE.Group();
    group.position.copy(getWorldPosition(stair.floorNumber, stair.localPosition.x, stair.localPosition.z));

    const base = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.24, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x263544, roughness: 0.78 })
    );
    base.position.y = 0.12;
    base.receiveShadow = true;
    group.add(base);

    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.78, 0.22),
        new THREE.MeshStandardMaterial({ color: stair.color, emissive: stair.color, emissiveIntensity: 0.95 })
    );
    shaft.position.y = 0.12;
    arrow.add(shaft);

    const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.22, 0.62),
        new THREE.MeshStandardMaterial({ color: stair.color, emissive: stair.color, emissiveIntensity: 0.95 })
    );
    head.position.y = stair.targetFloor > stair.floorNumber ? 0.56 : -0.32;
    arrow.add(head);

    arrow.position.y = 1.0;
    group.add(arrow);

    const light = new THREE.PointLight(stair.color, 1.35, 5, 2);
    light.position.y = 1.2;
    group.add(light);

    const label = createLabel(stair.title, stair.color);
    label.position.set(0, 2.5, 0);
    label.scale.set(4.8, 1.2, 1);
    group.add(label);

    floorGroup.add(group);
    addColliderBox(stair.floorNumber, stair.localPosition.x, stair.localPosition.z, 1.05, 1.05, 0.9, 0.45);

    interactables.push({
        ...stair,
        position: group.position.clone(),
        group,
        arrow,
        light
    });
}

function createExtractionBeacon() {
    const group = new THREE.Group();
    group.position.copy(extractionPoint);

    const pad = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.12, 2.6),
        new THREE.MeshStandardMaterial({ color: 0x78b8ff, emissive: 0x78b8ff, emissiveIntensity: 0.55 })
    );
    pad.position.y = 0.06;
    group.add(pad);

    const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, 3.1, 0.44),
        new THREE.MeshStandardMaterial({ color: 0x9dd5ff, transparent: true, opacity: 0.22, emissive: 0x6aaef2, emissiveIntensity: 0.65 })
    );
    pillar.position.y = 1.55;
    group.add(pillar);

    const cap = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.18, 1.2),
        new THREE.MeshStandardMaterial({ color: 0xe8f7ff, emissive: 0x78b8ff, emissiveIntensity: 0.4 })
    );
    cap.position.y = 3.12;
    group.add(cap);

    const light = new THREE.PointLight(0x78b8ff, 0.9, 8, 2);
    light.position.y = 1.6;
    group.add(light);

    const label = createLabel('Hospital Lobby Exit', 0x78b8ff);
    label.position.set(0, 3.4, 0);
    label.scale.set(5.4, 1.3, 1);
    group.add(label);

    group.visible = false;
    floorGroups.get(1).add(group);
    extractionBeacon = { group, ring: pad, column: pillar, light };
}

function createAvatar() {
    const avatar = new THREE.Group();

    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xf0cfb5, roughness: 0.94 });
    const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x33241f, roughness: 0.88 });
    const scrubsMaterial = new THREE.MeshStandardMaterial({ color: 0x4a8fa3, roughness: 0.86 });
    const apronMaterial = new THREE.MeshStandardMaterial({ color: 0xe7f0f6, roughness: 0.91 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x68dcff, emissive: 0x68dcff, emissiveIntensity: 0.35 });
    const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x314150, roughness: 0.82 });
    const visorMaterial = new THREE.MeshStandardMaterial({
        color: 0xeaf6ff,
        roughness: 0.2,
        metalness: 0.02,
        transparent: true,
        opacity: 0.22
    });

    const torsoRig = new THREE.Group();
    torsoRig.position.y = 1.14;
    avatar.add(torsoRig);

    const hips = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.38, 0.42),
        scrubsMaterial.clone()
    );
    hips.position.y = -0.16;
    hips.castShadow = true;
    torsoRig.add(hips);

    const coat = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 1.18, 0.52),
        scrubsMaterial.clone()
    );
    coat.position.y = 0.46;
    coat.castShadow = true;
    torsoRig.add(coat);

    const apron = new THREE.Mesh(
        new THREE.BoxGeometry(0.74, 1.02, 0.08),
        apronMaterial.clone()
    );
    apron.position.set(0, 0.42, -0.24);
    apron.castShadow = true;
    torsoRig.add(apron);

    const shoulderLeft = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.18, 0.24),
        scrubsMaterial.clone()
    );
    shoulderLeft.position.set(-0.46, 0.95, 0);
    torsoRig.add(shoulderLeft);

    const shoulderRight = shoulderLeft.clone();
    shoulderRight.position.x = 0.46;
    torsoRig.add(shoulderRight);

    const idBadge = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.24, 0.03),
        accentMaterial.clone()
    );
    idBadge.position.set(0.24, 0.46, -0.29);
    torsoRig.add(idBadge);

    const headRig = new THREE.Group();
    headRig.position.y = 2.02;
    avatar.add(headRig);

    const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.12, 0.16, 12),
        skinMaterial.clone()
    );
    neck.position.y = -0.18;
    neck.castShadow = true;
    headRig.add(neck);

    const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.62, 0.52),
        skinMaterial.clone()
    );
    head.position.y = 0.18;
    head.castShadow = true;
    headRig.add(head);

    const hair = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.24, 0.56),
        hairMaterial.clone()
    );
    hair.position.set(0, 0.48, 0.02);
    headRig.add(hair);

    const fringe = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.12, 0.08),
        hairMaterial.clone()
    );
    fringe.position.set(0, 0.33, -0.23);
    headRig.add(fringe);

    const leftEye = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.04),
        eyeMaterial.clone()
    );
    leftEye.position.set(-0.11, 0.2, -0.29);
    headRig.add(leftEye);

    const rightEye = leftEye.clone();
    rightEye.position.x = 0.11;
    headRig.add(rightEye);

    const mouth = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.04, 0.03),
        eyeMaterial.clone()
    );
    mouth.position.set(0, 0.04, -0.285);
    headRig.add(mouth);

    const leftCheek = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.05, 0.03),
        blushMaterial.clone()
    );
    leftCheek.position.set(-0.19, 0.04, -0.28);
    headRig.add(leftCheek);

    const rightCheek = leftCheek.clone();
    rightCheek.position.x = 0.19;
    headRig.add(rightCheek);

    const faceShield = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.18, 0.03),
        visorMaterial
    );
    faceShield.position.set(0, 0.18, -0.28);
    headRig.add(faceShield);

    const mask = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.14, 0.04),
        apronMaterial.clone()
    );
    mask.position.set(0, 0.05, -0.27);
    headRig.add(mask);

    const leftArmRig = new THREE.Group();
    leftArmRig.position.set(-0.58, 1.83, 0);
    avatar.add(leftArmRig);

    const leftUpperArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.54, 0.2),
        scrubsMaterial.clone()
    );
    leftUpperArm.position.y = -0.26;
    leftUpperArm.castShadow = true;
    leftArmRig.add(leftUpperArm);

    const leftForearm = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.5, 0.18),
        skinMaterial.clone()
    );
    leftForearm.position.y = -0.74;
    leftForearm.castShadow = true;
    leftArmRig.add(leftForearm);

    const rightArmRig = new THREE.Group();
    rightArmRig.position.set(0.58, 1.83, 0);
    avatar.add(rightArmRig);

    const rightUpperArm = leftUpperArm.clone();
    rightArmRig.add(rightUpperArm);

    const rightForearm = leftForearm.clone();
    rightForearm.position.y = -0.74;
    rightArmRig.add(rightForearm);

    const leftLegRig = new THREE.Group();
    leftLegRig.position.set(-0.19, 0.96, 0);
    avatar.add(leftLegRig);

    const leftThigh = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.56, 0.24),
        scrubsMaterial.clone()
    );
    leftThigh.position.y = -0.28;
    leftThigh.castShadow = true;
    leftLegRig.add(leftThigh);

    const leftCalf = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.5, 0.22),
        apronMaterial.clone()
    );
    leftCalf.position.y = -0.76;
    leftCalf.castShadow = true;
    leftLegRig.add(leftCalf);

    const leftShoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.12, 0.42),
        shoeMaterial.clone()
    );
    leftShoe.position.set(0, -1.08, -0.07);
    leftShoe.castShadow = true;
    leftLegRig.add(leftShoe);

    const rightLegRig = new THREE.Group();
    rightLegRig.position.set(0.19, 0.96, 0);
    avatar.add(rightLegRig);

    const rightThigh = leftThigh.clone();
    rightLegRig.add(rightThigh);

    const rightCalf = leftCalf.clone();
    rightCalf.position.y = -0.76;
    rightLegRig.add(rightCalf);

    const rightShoe = leftShoe.clone();
    rightShoe.position.set(0, -1.08, -0.07);
    rightLegRig.add(rightShoe);

    avatar.userData = {
        torsoRig,
        coat,
        apron,
        headRig,
        head,
        leftArm: leftArmRig,
        rightArm: rightArmRig,
        leftLeg: leftLegRig,
        rightLeg: rightLegRig
    };
    avatar.position.copy(spawnPoint);
    scene.add(avatar);
    return avatar;
}

function findZone(position, floorNumber) {
    return BASE_ZONES.find((zone) => {
        const halfWidth = zone.width / 2;
        const halfDepth = zone.depth / 2;
        return position.x >= zone.x - halfWidth && position.x <= zone.x + halfWidth && position.z >= zone.z - halfDepth && position.z <= zone.z + halfDepth;
    });
}

function setStatus(text) {
    statusEl.textContent = text;
}

function setDialogue(speaker, text, duration = 4.2) {
    dialogueState.speaker = speaker;
    dialogueState.text = text;
    dialogueState.timeout = duration;
    dialogueSpeakerEl.textContent = speaker;
    dialogueTextEl.textContent = text;
    dialoguePanelEl.classList.add('visible');
}

function updateAccessUi() {
    accessListEl.innerHTML = [
        { label: 'ICU Access', value: accessState.icuClearance },
        { label: 'Radiology Archive', value: accessState.radiologyClearance }
    ].map((entry) => {
        const stateClass = entry.value ? 'badgeState online' : 'badgeState locked';
        const stateText = entry.value ? 'Granted' : 'Locked';
        return `<li><span>${entry.label}</span><span class="${stateClass}">${stateText}</span></li>`;
    }).join('');
}

function updateObjectiveUi() {
    const remaining = OBJECTIVES.filter((objective) => !objectiveState.has(objective.id));
    const nextGoal = getNextGoal();

    if (missionState.missionComplete) {
        objectiveEl.textContent = 'Primary objective: Hospital survey complete';
        nextHintEl.textContent = 'All three hospital wings are secured. Next step can be doors, staff NPCs, or patient events.';
    } else if (nextGoal?.type === 'npc') {
        objectiveEl.textContent = `Primary objective: ${nextGoal.title}`;
        nextHintEl.textContent = `Next stop: Floor ${nextGoal.floorNumber} / ${nextGoal.role}.`;
    } else if (remaining.length) {
        const nextObjective = remaining[0];
        objectiveEl.textContent = `Primary objective: ${nextObjective.title}`;
        nextHintEl.textContent = `Next stop: Floor ${nextObjective.floorNumber} / ${nextObjective.zoneId.replace('-', ' ')}.`;
    } else {
        objectiveEl.textContent = 'Primary objective: Return to Floor 1 Main Lobby';
        nextHintEl.textContent = 'Extraction unlocked. Descend and return to the blue ring in the hospital lobby.';
    }

    progressEl.innerHTML = `Collected intel points: <span class="ok">${objectiveState.size} / ${OBJECTIVES.length}</span>`;
    checklistEl.innerHTML = OBJECTIVES.map((objective) => {
        const done = objectiveState.has(objective.id);
        return `<li><span class="check ${done ? 'done' : ''}">${done ? '✓' : '•'}</span><span>F${objective.floorNumber} ${objective.title}</span></li>`;
    }).join('');
}

function updateFloorUi() {
    const floorConfig = getFloorConfig(currentFloorState.number);
    floorLevelEl.textContent = `Floor ${currentFloorState.number} - ${floorConfig.name}`;
}

function updateZoneStatus(force = false) {
    const zone = findZone(player.position, currentFloorState.number) ?? { id: 'unknown', name: 'Unassigned Zone' };
    if (force || zone.id !== currentZoneId) {
        currentZoneId = zone.id;
        locationEl.textContent = `${zone.name}`;
        setStatus(`Entered Floor ${currentFloorState.number} / ${zone.name}.`);
    }
}

function intersectsCollider() {
    playerBox.setFromCenterAndSize(
        new THREE.Vector3(player.position.x, player.position.y + playerCollisionSize.y / 2, player.position.z),
        playerCollisionSize
    );

    if (colliders.some((collider) => collider.floorNumber === currentFloorState.number && playerBox.intersectsBox(collider.box))) {
        return true;
    }

    return dynamicDoors.some((door) => door.floorNumber === currentFloorState.number && getDoorBlockingBox(door) && playerBox.intersectsBox(getDoorBlockingBox(door)));
}

function tryMove(axis, distance) {
    player.position[axis] += distance;
    if (intersectsCollider()) {
        player.position[axis] -= distance;
    }
}

function updateInteractionPrompt() {
    let closest = null;
    let closestDistance = Infinity;

    interactables.forEach((interactable) => {
        if (interactable.floorNumber !== currentFloorState.number) {
            return;
        }

        const distance = player.position.distanceTo(interactable.position);
        if (distance < INTERACT_DISTANCE && distance < closestDistance) {
            closest = interactable;
            closestDistance = distance;
        }
    });

    nearbyInteractable = closest;

    if (!nearbyInteractable) {
        if (missionState.missionComplete) {
            promptEl.textContent = 'Hospital survey complete. Continue exploring or add the next gameplay system.';
        } else if (missionState.extractionUnlocked) {
            promptEl.textContent = 'Return to the blue ring in the Floor 1 Main Lobby to finish the survey.';
        } else {
            promptEl.textContent = 'Use stairs to move between hospital floors, and press E near a glowing station to inspect it.';
        }
        return;
    }

    if (nearbyInteractable.type === 'stairs') {
        promptEl.textContent = `Press E to ${nearbyInteractable.title.toLowerCase()}.`;
        return;
    }

    if (nearbyInteractable.type === 'door') {
        if (nearbyInteractable.requiredAccess && !accessState[nearbyInteractable.requiredAccess]) {
            promptEl.textContent = nearbyInteractable.lockedText;
            return;
        }

        promptEl.textContent = nearbyInteractable.isOpen
            ? `Press E to close: ${nearbyInteractable.title}`
            : `Press E to open: ${nearbyInteractable.title}`;
        return;
    }

    if (nearbyInteractable.type === 'npc') {
        if (nearbyInteractable.granted) {
            promptEl.textContent = `${nearbyInteractable.role}: clearance already issued.`;
            return;
        }

        if (!nearbyInteractable.availableWhen()) {
            promptEl.textContent = `${nearbyInteractable.role}: finish the current station check first.`;
            return;
        }

        promptEl.textContent = `Press E to talk to ${nearbyInteractable.role}.`;
        return;
    }

    if (nearbyInteractable.completed) {
        promptEl.textContent = `${nearbyInteractable.title} already inspected.`;
        return;
    }

    promptEl.textContent = `Press E to inspect: ${nearbyInteractable.title}`;
}

function updateNavigationUi() {
    if (missionState.missionComplete) {
        distanceEl.textContent = 'Navigation: mission completed.';
        return;
    }

    const target = getNextGoal();
    if (target) {
        if (target.floorNumber !== currentFloorState.number) {
            distanceEl.textContent = `Navigation: use stairs to reach Floor ${target.floorNumber} for ${target.title}.`;
            return;
        }

        const targetPosition = target.position ?? getWorldPosition(target.floorNumber, target.localPosition.x, target.localPosition.z);
        const distance = player.position.distanceTo(targetPosition).toFixed(1);
        distanceEl.textContent = `Navigation: ${target.title} (${distance}m)`;
        return;
    }

    if (currentFloorState.number !== 1) {
        distanceEl.textContent = 'Navigation: descend to Floor 1 and return to the Main Lobby ring.';
        return;
    }

    distanceEl.textContent = `Navigation: Hospital Lobby Exit (${player.position.distanceTo(extractionPoint).toFixed(1)}m)`;
}

function setFloorAppearance(group, { visible, opacity, showLabels, dimLights }) {
    group.visible = visible;

    if (!visible) {
        return;
    }

    group.traverse((child) => {
        if (child.isSprite) {
            child.visible = showLabels;
            if (child.material) {
                child.material.transparent = opacity < 1;
                child.material.opacity = showLabels ? opacity : 0;
                child.material.depthWrite = false;
            }
            return;
        }

        if (child.isMesh) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
                material.transparent = opacity < 1;
                material.opacity = opacity;
                material.depthWrite = opacity >= 0.95;
            });
            return;
        }

        if (child.isPointLight) {
            child.visible = !dimLights;
        }
    });
}

function updateFloorVisibility() {
    floorGroups.forEach((group, floorNumber) => {
        if (floorNumber > currentFloorState.number) {
            setFloorAppearance(group, {
                visible: false,
                opacity: 0,
                showLabels: false,
                dimLights: true
            });
            return;
        }

        if (floorNumber === currentFloorState.number) {
            setFloorAppearance(group, {
                visible: true,
                opacity: 1,
                showLabels: true,
                dimLights: false
            });
            return;
        }

        setFloorAppearance(group, {
            visible: true,
            opacity: 0.16,
            showLabels: false,
            dimLights: true
        });
    });
}

function unlockExtractionIfReady() {
    if (objectiveState.size === OBJECTIVES.length && !missionState.extractionUnlocked) {
        missionState.extractionUnlocked = true;
        extractionBeacon.group.visible = true;
        setStatus('All medical records secured. Descend to Floor 1 and return to the Main Lobby ring.');
        setDialogue('Hospital Comms', 'All required records have been collected. Return to the main lobby for extraction.');
    }
}

function completeObjective(interactable) {
    if (interactable.completed) {
        return;
    }

    interactable.completed = true;
    objectiveState.add(interactable.id);
    interactable.orb.material.emissiveIntensity = 0.3;
    interactable.light.intensity = 0.45;
    setStatus(interactable.detail);
    setDialogue('System Log', interactable.detail);
    unlockExtractionIfReady();
    updateObjectiveUi();
    updateInteractionPrompt();
    updateNavigationUi();
}

function toggleDoor(door) {
    if (door.requiredAccess && !accessState[door.requiredAccess]) {
        setStatus(door.lockedText);
        setDialogue('Access Control', door.lockedText, 3.4);
        return;
    }

    door.isOpen = !door.isOpen;
    door.targetOpen = door.isOpen ? 1 : 0;
    setStatus(door.isOpen ? `${door.title} opened.` : `${door.title} closed.`);
}

function talkToNpc(npc) {
    if (npc.granted) {
        setStatus(`${npc.role} has already issued the required clearance.`);
        setDialogue(npc.role, 'I already sent your authorization through. Continue to the next checkpoint.', 3.6);
        return;
    }

    if (!npc.availableWhen()) {
        setStatus(`${npc.role} asks you to complete the current checkpoint first.`);
        setDialogue(npc.role, 'Finish the current inspection first, then I can authorize the next area.', 3.6);
        return;
    }

    npc.granted = true;
    accessState[npc.grantsAccess] = true;
    npc.light.intensity = 0.18;
    setStatus(npc.detail);
    setDialogue(npc.role, npc.detail, 4.8);
    updateAccessUi();
    updateObjectiveUi();
    updateInteractionPrompt();
    updateNavigationUi();
}

function useStairs(stair) {
    if (stairCooldown > 0) {
        return;
    }

    currentFloorState.number = stair.targetFloor;
    player.position.copy(getWorldPosition(stair.targetFloor, stair.arrivalPosition.x, stair.arrivalPosition.z));
    stairCooldown = STAIR_REENTRY_DELAY;
    currentZoneId = '';
    updateFloorUi();
    updateFloorVisibility();
    updateZoneStatus(true);
    updateNavigationUi();
    updateInteractionPrompt();
    setStatus(stair.detail);
}

function interactNearby() {
    if (!nearbyInteractable) {
        return;
    }

    if (nearbyInteractable.type === 'npc') {
        talkToNpc(nearbyInteractable);
        return;
    }

    if (nearbyInteractable.type === 'door') {
        toggleDoor(nearbyInteractable);
        return;
    }

    if (nearbyInteractable.type === 'stairs') {
        useStairs(nearbyInteractable);
        return;
    }

    completeObjective(nearbyInteractable);
}

function checkMissionCompletion() {
    if (!missionState.extractionUnlocked || missionState.missionComplete || currentFloorState.number !== 1) {
        return;
    }

    if (player.position.distanceTo(extractionPoint) < 1.8) {
        missionState.missionComplete = true;
        extractionBeacon.light.intensity = 0.25;
        extractionBeacon.column.material.opacity = 0.08;
        setStatus('Hospital survey completed. The prototype now supports vertical traversal through all three wings.');
        setDialogue('Hospital Comms', 'Survey complete. You can restart the run at any time.', 5.2);
        restartButtonEl.classList.add('visible');
        updateObjectiveUi();
        updateInteractionPrompt();
        updateNavigationUi();
    }
}

const keys = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    ArrowUp: false,
    ArrowLeft: false,
    ArrowDown: false,
    ArrowRight: false
};
const CAMERA_MIN_DISTANCE = 6.4;
const CAMERA_MAX_DISTANCE = 13.8;
const CAMERA_LOOK_HEIGHT = 1.55;
const CAMERA_MIN_PITCH = 0.54;
const CAMERA_MAX_PITCH = 1.2;
const CAMERA_MOUSE_SENSITIVITY = 0.0019;
const CAMERA_ZOOM_SENSITIVITY = 0.9;
const CAMERA_ROTATION_SMOOTHING = 18;
const CAMERA_PITCH_SMOOTHING = 16;
const CAMERA_DISTANCE_SMOOTHING = 12;
const CAMERA_COLLISION_PADDING = 0.35;

function rotateCameraFromDelta(deltaX, deltaY) {
    targetCameraYaw -= deltaX * CAMERA_MOUSE_SENSITIVITY;
    targetCameraPitch = THREE.MathUtils.clamp(
        targetCameraPitch - deltaY * CAMERA_MOUSE_SENSITIVITY,
        CAMERA_MIN_PITCH,
        CAMERA_MAX_PITCH
    );
}

function focusViewport() {
    window.focus();
    document.body?.focus?.({ preventScroll: true });
    app.focus?.({ preventScroll: true });
    renderer.domElement.focus({ preventScroll: true });
}

function handleKeyDown(event) {
    if (event.defaultPrevented || event.isComposing) {
        return;
    }

    const keyCode = event.code;

    if (Object.prototype.hasOwnProperty.call(keys, keyCode)) {
        keys[keyCode] = true;
        event.preventDefault();
    }

    if (keyCode === 'KeyE' && !event.repeat) {
        event.preventDefault();
        interactNearby();
    }
}

function handleKeyUp(event) {
    if (event.defaultPrevented || event.isComposing) {
        return;
    }

    const keyCode = event.code;
    if (Object.prototype.hasOwnProperty.call(keys, keyCode)) {
        keys[keyCode] = false;
        event.preventDefault();
    }
}

document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);
renderer.domElement.addEventListener('keydown', handleKeyDown);
renderer.domElement.addEventListener('keyup', handleKeyUp);
restartButtonEl.addEventListener('click', () => {
    window.location.reload();
});

window.addEventListener('blur', () => {
    Object.keys(keys).forEach((key) => {
        keys[key] = false;
    });
    isDraggingCamera = false;
});

renderer.domElement.addEventListener('mousedown', (event) => {
    if (event.button !== 0) {
        return;
    }

    focusViewport();
    isDraggingCamera = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    event.preventDefault();
});

renderer.domElement.addEventListener('click', () => {
    focusViewport();
});

window.addEventListener('mouseup', () => {
    isDraggingCamera = false;
});

window.addEventListener('mousemove', (event) => {
    if (!isDraggingCamera) {
        return;
    }

    rotateCameraFromDelta(event.clientX - lastPointerX, event.clientY - lastPointerY);
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
});

renderer.domElement.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) {
        return;
    }

    focusViewport();
    isDraggingCamera = true;
    lastPointerX = event.touches[0].clientX;
    lastPointerY = event.touches[0].clientY;
}, { passive: true });

renderer.domElement.addEventListener('touchmove', (event) => {
    if (!isDraggingCamera || event.touches.length !== 1) {
        return;
    }

    const touch = event.touches[0];
    rotateCameraFromDelta(touch.clientX - lastPointerX, touch.clientY - lastPointerY);
    lastPointerX = touch.clientX;
    lastPointerY = touch.clientY;
}, { passive: true });

window.addEventListener('touchend', () => {
    isDraggingCamera = false;
});

window.addEventListener('wheel', (event) => {
    targetCameraDistance = THREE.MathUtils.clamp(
        targetCameraDistance + event.deltaY * 0.01 * CAMERA_ZOOM_SENSITIVITY,
        CAMERA_MIN_DISTANCE,
        CAMERA_MAX_DISTANCE
    );
});

FLOOR_CONFIGS.forEach(createFloorShell);
OBJECTIVES.forEach(createObjectiveInteractable);
STAIR_NODES.forEach(createStairInteractable);
DOOR_NODES.forEach(createDoorInteractable);
NPC_NODES.forEach(createNpcInteractable);
createExtractionBeacon();

const player = createAvatar();
const clock = new THREE.Clock();

updateAccessUi();
updateFloorUi();
updateObjectiveUi();
updateZoneStatus(true);
updateNavigationUi();
updateFloorVisibility();
promptEl.textContent = 'Start in the hospital lobby, inspect each wing in order, and use the stair nodes to go up or down.';
focusViewport();

function updatePlayer(deltaTime, elapsedTime) {
    const rightInput = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const forwardInput = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const isMoving = rightInput !== 0 || forwardInput !== 0;

    cameraForward.set(-Math.sin(targetCameraYaw), 0, -Math.cos(targetCameraYaw)).normalize();
    cameraRight.set(Math.cos(targetCameraYaw), 0, -Math.sin(targetCameraYaw)).normalize();

    moveDirection.set(0, 0, 0);
    moveDirection.addScaledVector(cameraForward, forwardInput);
    moveDirection.addScaledVector(cameraRight, rightInput);

    if (isMoving) {
        moveDirection.normalize();
        player.rotation.y = Math.atan2(moveDirection.x, moveDirection.z) + Math.PI;

        tryMove('x', moveDirection.x * WALK_SPEED * deltaTime);
        tryMove('z', moveDirection.z * WALK_SPEED * deltaTime);
    }

    const bob = isMoving ? Math.sin(elapsedTime * 10) * 0.06 : 0;
    const swing = isMoving ? Math.sin(elapsedTime * 10) : 0;
    player.userData.torsoRig.position.y = 1.14 + bob * 0.18;
    player.userData.headRig.position.y = 2.02 + bob * 0.2;
    player.userData.headRig.rotation.z = swing * 0.02;
    player.userData.leftLeg.rotation.x = swing * 0.55;
    player.userData.rightLeg.rotation.x = -swing * 0.55;
    player.userData.leftArm.rotation.x = -swing * 0.45;
    player.userData.rightArm.rotation.x = swing * 0.45;
    player.userData.leftArm.rotation.z = -0.05;
    player.userData.rightArm.rotation.z = 0.05;
}

function updateInteractables(elapsedTime) {
    interactables.forEach((interactable, index) => {
        if (interactable.type === 'objective') {
            const wave = elapsedTime * 1.8 + index * 0.6;
            interactable.orb.position.y = 1.35 + Math.sin(wave) * 0.12;
            interactable.group.rotation.y += 0.006;
            return;
        }

        if (interactable.type === 'door') {
            interactable.openAmount = THREE.MathUtils.lerp(interactable.openAmount, interactable.targetOpen, 0.16);
            const slideOffset = interactable.width * 0.3 * interactable.openAmount;
            interactable.leftPanel.position.z = interactable.width * 0.23 + slideOffset;
            interactable.rightPanel.position.z = -interactable.width * 0.23 - slideOffset;
            interactable.light.intensity = 0.35 + interactable.openAmount * 0.4;
            return;
        }

        if (interactable.type === 'npc') {
            interactable.group.rotation.y = Math.sin(elapsedTime * 0.8 + index) * 0.15;
            interactable.badge.material.emissiveIntensity = interactable.granted ? 0.15 : 0.55;
            return;
        }

        interactable.arrow.position.y = 1.15 + Math.sin(elapsedTime * 2.5 + index) * 0.08;
        interactable.group.rotation.y += 0.004;
    });

    if (extractionBeacon && extractionBeacon.group.visible) {
        extractionBeacon.ring.rotation.z = elapsedTime * 0.7;
        extractionBeacon.column.position.y = 1.6 + Math.sin(elapsedTime * 2.2) * 0.12;
    }
}

function updateCamera(deltaTime) {
    cameraYaw = dampAngle(cameraYaw, targetCameraYaw, CAMERA_ROTATION_SMOOTHING, deltaTime);
    cameraPitch = damp(cameraPitch, targetCameraPitch, CAMERA_PITCH_SMOOTHING, deltaTime);
    cameraDistance = damp(cameraDistance, targetCameraDistance, CAMERA_DISTANCE_SMOOTHING, deltaTime);

    const horizontalDistance = Math.cos(cameraPitch) * cameraDistance;
    cameraOffset.set(
        Math.sin(cameraYaw) * horizontalDistance,
        Math.sin(cameraPitch) * cameraDistance,
        Math.cos(cameraYaw) * horizontalDistance
    );

    cameraLookTarget.copy(player.position);
    cameraLookTarget.y = player.position.y + CAMERA_LOOK_HEIGHT;

    cameraCollisionDirection.copy(cameraOffset).normalize();
    cameraCollisionRay.origin.copy(cameraLookTarget);
    cameraCollisionRay.direction.copy(cameraCollisionDirection);

    let availableDistance = cameraDistance;

    colliders.forEach((collider) => {
        if (collider.floorNumber !== currentFloorState.number) {
            return;
        }

        if (cameraCollisionRay.intersectBox(collider.box, cameraCollisionPoint)) {
            const hitDistance = cameraLookTarget.distanceTo(cameraCollisionPoint) - CAMERA_COLLISION_PADDING;
            availableDistance = Math.min(availableDistance, Math.max(CAMERA_MIN_DISTANCE, hitDistance));
        }
    });

    dynamicDoors.forEach((door) => {
        if (door.floorNumber !== currentFloorState.number) {
            return;
        }

        const doorBox = getDoorBlockingBox(door);
        if (!doorBox) {
            return;
        }

        if (cameraCollisionRay.intersectBox(doorBox, cameraCollisionPoint)) {
            const hitDistance = cameraLookTarget.distanceTo(cameraCollisionPoint) - CAMERA_COLLISION_PADDING;
            availableDistance = Math.min(availableDistance, Math.max(CAMERA_MIN_DISTANCE, hitDistance));
        }
    });

    cameraDesiredPosition.copy(cameraLookTarget).addScaledVector(cameraCollisionDirection, availableDistance);

    const lerpFactor = 1 - Math.pow(0.001, deltaTime);
    camera.position.lerp(cameraDesiredPosition, lerpFactor);
    camera.lookAt(cameraLookTarget);
}

function updateDialogue(deltaTime) {
    if (dialogueState.timeout <= 0) {
        dialoguePanelEl.classList.remove('visible');
        return;
    }

    dialogueState.timeout -= deltaTime;
    if (dialogueState.timeout <= 0) {
        dialoguePanelEl.classList.remove('visible');
    }
}

function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();
    const elapsedTime = clock.elapsedTime;

    stairCooldown = Math.max(0, stairCooldown - deltaTime);

    updatePlayer(deltaTime, elapsedTime);
    updateInteractables(elapsedTime);
    updateZoneStatus();
    updateInteractionPrompt();
    updateNavigationUi();
    checkMissionCompletion();
    updateCamera(deltaTime);
    updateDialogue(deltaTime);

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});