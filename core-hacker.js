import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const GRID_SIZE = 3;
const BLOCK_SIZE = 1;
const GAP = 0.1;
const TOTAL_SIZE = BLOCK_SIZE + GAP;

const COLOR_NORMAL = 0x3366ff;
const COLOR_CORE = 0xff3366;
const COLOR_TARGET = 0x00ff00;
const COLOR_FIREWALL = 0x222222;
const COLOR_HINT = 0x00ffcc;
const COLOR_HINT_ACTIVE = 0x00ff88;
const DEBUG_MODE = new URLSearchParams(window.location.search).has('debug');
const SWIPE_THRESHOLD = 18;
const SWIPE_PREVIEW_THRESHOLD = 10;
const SWIPE_SCORE_THRESHOLD = 0.55;
const SWIPE_PREVIEW_SCORE = 0.35;

const LEVELS = [
    {
        id: 'boot',
        name: 'Boot Sector',
        moveLimit: 12,
        target: { x: 2, y: 2, z: 2 },
        blocks: [
            { x: 0, y: 0, z: 0, type: 2 },
            { x: 0, y: 0, z: 1, type: 1 },
            { x: 0, y: 1, z: 0, type: 1 },
            { x: 1, y: 0, z: 1, type: 1 },
            { x: 1, y: 1, z: 0, type: 1 },
            { x: 2, y: 0, z: 0, type: 1 },
            { x: 2, y: 1, z: 1, type: 1 }
        ]
    },
    {
        id: 'firewall',
        name: 'Firewall Maze',
        moveLimit: 16,
        target: { x: 2, y: 2, z: 2 },
        blocks: [
            { x: 0, y: 0, z: 0, type: 2 },
            { x: 0, y: 0, z: 1, type: 1 },
            { x: 1, y: 0, z: 1, type: 1 },
            { x: 2, y: 0, z: 1, type: 1 },
            { x: 0, y: 1, z: 0, type: 1 },
            { x: 2, y: 0, z: 0, type: 1 },
            { x: 1, y: 0, z: 2, type: 1 },
            { x: 1, y: 1, z: 1, type: 3 },
            { x: 1, y: 2, z: 1, type: 3 },
            { x: 2, y: 1, z: 2, type: 3 }
        ]
    },
    {
        id: 'core-lock',
        name: 'Core Lock',
        moveLimit: 20,
        target: { x: 2, y: 2, z: 2 },
        blocks: [
            { x: 0, y: 0, z: 0, type: 2 },
            { x: 0, y: 0, z: 1, type: 1 },
            { x: 0, y: 1, z: 1, type: 1 },
            { x: 1, y: 0, z: 1, type: 1 },
            { x: 1, y: 0, z: 2, type: 1 },
            { x: 2, y: 0, z: 1, type: 1 },
            { x: 2, y: 1, z: 1, type: 1 },
            { x: 0, y: 2, z: 1, type: 1 },
            { x: 2, y: 2, z: 0, type: 1 },
            { x: 1, y: 1, z: 1, type: 3 },
            { x: 2, y: 1, z: 0, type: 3 },
            { x: 1, y: 2, z: 0, type: 3 }
        ]
    }
];

let scene;
let camera;
let renderer;
let controls;
let raycaster;
let pointer;
let pointerStates = new Map();
let blocks = [];
let gridData = [];
let selectedBlock = null;
let targetZoneMesh = null;
let moveHintGroup = null;
let moveHintGeometry = null;
let moveHintMaterial = null;
let swipePreview = null;
let isXRayMode = false;
let isAnimating = false;
let isGameClear = false;
let currentLevelIndex = 0;
let targetPos = { x: 2, y: 2, z: 2 };
let moveCount = 0;
let moveHistory = [];

let currentLevelName = '';

const PROGRESS_KEY = 'core_hacker_progress';

const ui = {
    message: document.getElementById('message-box'),
    levelText: document.getElementById('level-text'),
    moveText: document.getElementById('move-text'),
    resetBtn: document.getElementById('reset-btn'),
    undoBtn: document.getElementById('undo-btn'),
    xrayBtn: document.getElementById('xray-btn'),
    helpBtn: document.getElementById('help-btn'),
    modal: document.getElementById('victory-modal'),
    modalButton: document.getElementById('modal-next-btn'),
    introModal: document.getElementById('intro-modal'),
    startBtn: document.getElementById('start-game-btn')
};

class LevelGenerator {
    static generate(levelNum) {
        // Increase complexity based on level number
        const scrambleMoves = 5 + Math.floor(levelNum * 1.5);
        const dataBlockCount = Math.min(8 + Math.floor(levelNum * 0.5), 18);
        const firewallCount = Math.min(Math.floor(levelNum / 5), 4);

        const id = `gen-${levelNum}`;
        const name = `Sector ${levelNum}`;
        const target = { x: 2, y: 2, z: 2 }; // Fixed exit for consistency

        let grid = Array(GRID_SIZE).fill().map(() =>
            Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(0))
        );

        // Start with Core at target
        let corePos = { ...target };
        grid[corePos.x][corePos.y][corePos.z] = 2;

        // Add Firewalls at random (avoid target)
        let firewallsAdded = 0;
        while (firewallsAdded < firewallCount) {
            const rx = Math.floor(Math.random() * 3);
            const ry = Math.floor(Math.random() * 3);
            const rz = Math.floor(Math.random() * 3);
            if (grid[rx][ry][rz] === 0 && !(rx === target.x && ry === target.y && rz === target.z)) {
                grid[rx][ry][rz] = 3;
                firewallsAdded++;
            }
        }

        // Add Data Blocks at random
        let dataAdded = 0;
        while (dataAdded < dataBlockCount) {
            const rx = Math.floor(Math.random() * 3);
            const ry = Math.floor(Math.random() * 3);
            const rz = Math.floor(Math.random() * 3);
            if (grid[rx][ry][rz] === 0) {
                grid[rx][ry][rz] = 1;
                dataAdded++;
            }
        }

        // Scramble (Reverse-play)
        const axes = ['x', 'y', 'z'];
        let actualMoves = 0;
        let timeout = 0;

        while (actualMoves < scrambleMoves && timeout < 500) {
            timeout++;
            const axis = axes[Math.floor(Math.random() * 3)];
            const dir = Math.random() > 0.5 ? 1 : -1;

            // Find a block that can move in this direction (including Core)
            const movableBlocks = [];
            for (let x = 0; x < 3; x++) {
                for (let y = 0; y < 3; y++) {
                    for (let z = 0; z < 3; z++) {
                        const type = grid[x][y][z];
                        if (type === 1 || type === 2) {
                            const nx = x + (axis === 'x' ? dir : 0);
                            const ny = y + (axis === 'y' ? dir : 0);
                            const nz = z + (axis === 'z' ? dir : 0);

                            if (nx >= 0 && nx < 3 && ny >= 0 && ny < 3 && nz >= 0 && nz < 3) {
                                if (grid[nx][ny][nz] === 0) {
                                    movableBlocks.push({ x, y, z, nx, ny, nz, type });
                                }
                            }
                        }
                    }
                }
            }

            if (movableBlocks.length > 0) {
                const move = movableBlocks[Math.floor(Math.random() * movableBlocks.length)];
                grid[move.nx][move.ny][move.nz] = move.type;
                grid[move.x][move.y][move.z] = 0;
                actualMoves++;
            }
        }

        // Final Safety Check: Ensure Core is in the grid and not at the target
        let coreFound = false;
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {
                    if (grid[x][y][z] === 2) {
                        if (x === target.x && y === target.y && z === target.z) {
                            // If core ended up at target, try to move it one step away if possible
                            const adj = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
                            for (const [dx, dy, dz] of adj) {
                                const nx = x + dx, ny = y + dy, nz = z + dz;
                                if (nx >= 0 && nx < 3 && ny >= 0 && ny < 3 && nz >= 0 && nz < 3 && grid[nx][ny][nz] === 0) {
                                    grid[nx][ny][nz] = 2;
                                    grid[x][y][z] = 0;
                                    coreFound = true;
                                    break;
                                }
                            }
                        } else {
                            coreFound = true;
                        }
                    }
                }
            }
        }

        // If still not found or stuck at target, force a position (last resort)
        if (!coreFound) {
            grid[0][0][0] = 2;
        }

        // Extract blocks for level object
        const blocks = [];
        for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
                for (let z = 0; z < 3; z++) {
                    if (grid[x][y][z] !== 0) {
                        blocks.push({ x, y, z, type: grid[x][y][z] });
                    }
                }
            }
        }

        return {
            id,
            name,
            moveLimit: Math.floor(scrambleMoves * 1.5),
            target,
            blocks
        };
    }
}

function init() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.FogExp2(0x1a1a1a, 0.08);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(7, 6, 7);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x00ffcc, 1, 10);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    const gridHelper = new THREE.GridHelper(10, 10, 0x333333, 0x222222);
    gridHelper.position.y = -2.5;
    scene.add(gridHelper);

    const geometry = new THREE.BoxGeometry(GRID_SIZE * 1.2, GRID_SIZE * 1.2, GRID_SIZE * 1.2);
    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x444444 }));
    scene.add(line);

    setupMoveHints();
    createTargetZone();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', onKeyDown);
    renderer.domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
    renderer.domElement.addEventListener('pointermove', onPointerMove, { capture: true });
    renderer.domElement.addEventListener('pointerup', onPointerUp, { capture: true });
    renderer.domElement.addEventListener('pointercancel', onPointerUp, { capture: true });

    ui.resetBtn.addEventListener('click', resetLevel);
    ui.modalButton.addEventListener('click', nextLevel);
    ui.xrayBtn.addEventListener('click', toggleXRay);
    ui.undoBtn.addEventListener('click', undoMove);
    ui.helpBtn.addEventListener('click', showIntro);
    ui.startBtn.addEventListener('click', hideIntro);

    setupMoveButtons();
    exposeDebugApi();

    // Load progress or show intro
    const progress = localStorage.getItem(PROGRESS_KEY);
    if (!progress) {
        showIntro();
        currentLevelIndex = 0;
    } else {
        currentLevelIndex = parseInt(progress, 10) || 0;
    }

    loadLevel(currentLevelIndex);

    setTimeout(() => {
        document.getElementById('loader').style.opacity = 0;
        setTimeout(() => document.getElementById('loader').remove(), 500);
    }, 1000);

    animate();
}

function setupMoveButtons() {
    const bindMove = (id, axis, dir) => {
        const btn = document.getElementById(id);
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            moveSelectedBlock(axis, dir);
        });
    };

    bindMove('move-x-pos', 'x', 1);
    bindMove('move-x-neg', 'x', -1);
    bindMove('move-y-pos', 'y', 1);
    bindMove('move-y-neg', 'y', -1);
    bindMove('move-z-pos', 'z', 1);
    bindMove('move-z-neg', 'z', -1);
}

function setupMoveHints() {
    moveHintGeometry = new THREE.BoxGeometry(BLOCK_SIZE * 0.55, BLOCK_SIZE * 0.55, BLOCK_SIZE * 0.55);
    moveHintMaterial = new THREE.MeshBasicMaterial({
        color: COLOR_HINT,
        transparent: true,
        opacity: 0.35,
        depthWrite: false
    });
    moveHintGroup = new THREE.Group();
    scene.add(moveHintGroup);
}

function exposeDebugApi() {
    if (!DEBUG_MODE) {
        return;
    }

    window.__coreHackerDebug = {
        selectBlockAt: (x, y, z) => {
            const mesh = blocks.find(
                (block) => block.userData.gx === x && block.userData.gy === y && block.userData.gz === z
            );
            if (!mesh) {
                return false;
            }
            selectBlock(mesh);
            return true;
        },
        getScreenPos: (x, y, z) => {
            if (!isInBounds(x, y, z)) {
                return null;
            }
            if (!gridData[x] || !gridData[x][y] || gridData[x][y][z] === 0) {
                return null;
            }
            return worldToScreen(getWorldPos(x, y, z));
        },
        getScreenPosAny: (x, y, z) => {
            if (!isInBounds(x, y, z)) {
                return null;
            }
            return worldToScreen(getWorldPos(x, y, z));
        },
        getSelectedScreenPos: () => {
            if (!selectedBlock) {
                return null;
            }
            return worldToScreen(selectedBlock.position.clone());
        },
        move: (axis, dir) => {
            moveSelectedBlock(axis, dir);
        },
        undo: () => {
            undoMove();
        },
        reset: () => {
            resetLevel();
        },
        toggleXRay: () => {
            toggleXRay();
        },
        getCameraState: () => ({
            position: camera.position.toArray(),
            target: controls.target.toArray()
        }),
        getValidMoves: () => {
            if (!selectedBlock) {
                return [];
            }
            const { gx, gy, gz, type } = selectedBlock.userData;
            if (type === 3) {
                return [];
            }
            const candidates = [
                { axis: 'x', dir: 1, nx: gx + 1, ny: gy, nz: gz },
                { axis: 'x', dir: -1, nx: gx - 1, ny: gy, nz: gz },
                { axis: 'y', dir: 1, nx: gx, ny: gy + 1, nz: gz },
                { axis: 'y', dir: -1, nx: gx, ny: gy - 1, nz: gz },
                { axis: 'z', dir: 1, nx: gx, ny: gy, nz: gz + 1 },
                { axis: 'z', dir: -1, nx: gx, ny: gy, nz: gz - 1 }
            ];
            return candidates
                .filter((candidate) => isInBounds(candidate.nx, candidate.ny, candidate.nz))
                .filter((candidate) => gridData[candidate.nx][candidate.ny][candidate.nz] === 0)
                .map((candidate) => ({
                    axis: candidate.axis,
                    dir: candidate.dir,
                    x: candidate.nx,
                    y: candidate.ny,
                    z: candidate.nz
                }));
        },
        getTapTarget: () => {
            if (!blocks.length) {
                return null;
            }
            let best = null;
            let bestDistance = Infinity;
            blocks.forEach((block) => {
                const distance = block.position.distanceTo(camera.position);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = block;
                }
            });
            if (!best) {
                return null;
            }
            return {
                x: best.userData.gx,
                y: best.userData.gy,
                z: best.userData.gz,
                screen: worldToScreen(best.position.clone())
            };
        },
        forceWin: () => {
            const core = blocks.find((block) => block.userData.type === 2);
            if (!core) {
                return false;
            }
            const from = { x: core.userData.gx, y: core.userData.gy, z: core.userData.gz };
            const to = { ...targetPos };
            if (!isInBounds(to.x, to.y, to.z)) {
                return false;
            }
            if (gridData[to.x][to.y][to.z] !== 0) {
                return false;
            }
            selectBlock(core);
            applyMove(core, from, to, true);
            return true;
        },
        getState: () => ({
            moveCount,
            isGameClear,
            currentLevelIndex,
            xray: isXRayMode,
            targetPos: { ...targetPos },
            selected: selectedBlock
                ? {
                    x: selectedBlock.userData.gx,
                    y: selectedBlock.userData.gy,
                    z: selectedBlock.userData.gz,
                    type: selectedBlock.userData.type
                }
                : null
        })
    };
}

function onKeyDown(event) {
    if (event.repeat) {
        return;
    }

    const key = event.key.toLowerCase();
    if (key === 'r') {
        resetLevel();
        return;
    }
    if (key === 'u') {
        undoMove();
        return;
    }
    if (key === 'x') {
        toggleXRay();
        return;
    }

    if (!selectedBlock || isAnimating || isGameClear) {
        return;
    }

    switch (key) {
        case 'arrowleft':
            moveSelectedBlock('x', -1);
            break;
        case 'arrowright':
            moveSelectedBlock('x', 1);
            break;
        case 'arrowup':
            moveSelectedBlock('y', 1);
            break;
        case 'arrowdown':
            moveSelectedBlock('y', -1);
            break;
        case 'q':
            moveSelectedBlock('z', 1);
            break;
        case 'e':
            moveSelectedBlock('z', -1);
            break;
        default:
            break;
    }
}

function getWorldPos(x, y, z) {
    const offset = (GRID_SIZE - 1) / 2 * TOTAL_SIZE;
    return new THREE.Vector3(
        x * TOTAL_SIZE - offset,
        y * TOTAL_SIZE - offset,
        z * TOTAL_SIZE - offset
    );
}

function createTargetZone() {
    const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    const edges = new THREE.EdgesGeometry(geometry);
    targetZoneMesh = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: COLOR_TARGET,
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    }));

    const glowGeo = new THREE.BoxGeometry(BLOCK_SIZE * 0.8, BLOCK_SIZE * 0.8, BLOCK_SIZE * 0.8);
    const glowMat = new THREE.MeshBasicMaterial({
        color: COLOR_TARGET,
        transparent: true,
        opacity: 0.1,
        wireframe: true
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    targetZoneMesh.add(glowMesh);

    scene.add(targetZoneMesh);
}

function createEmptyGrid() {
    const grid = [];
    for (let x = 0; x < GRID_SIZE; x += 1) {
        grid[x] = [];
        for (let y = 0; y < GRID_SIZE; y += 1) {
            grid[x][y] = [];
            for (let z = 0; z < GRID_SIZE; z += 1) {
                grid[x][y][z] = 0;
            }
        }
    }
    return grid;
}

function loadLevel(index) {
    currentLevelIndex = index;
    localStorage.setItem(PROGRESS_KEY, currentLevelIndex);

    let level;
    if (index < LEVELS.length) {
        level = LEVELS[index];
    } else {
        level = LevelGenerator.generate(index + 1);
    }
    targetPos = { ...level.target };
    moveCount = 0;
    moveHistory = [];

    ui.modal.classList.remove('show');
    isGameClear = false;

    blocks.forEach((block) => scene.remove(block));
    blocks = [];
    gridData = createEmptyGrid();

    level.blocks.forEach((block) => {
        if (!isInBounds(block.x, block.y, block.z)) {
            return;
        }
        gridData[block.x][block.y][block.z] = block.type;
    });

    targetZoneMesh.position.copy(getWorldPos(targetPos.x, targetPos.y, targetPos.z));
    createBlocksFromGrid();
    deselect();

    isXRayMode = false;
    ui.xrayBtn.classList.remove('active');
    updateXRayVisuals();

    currentLevelName = level.name;
    updateStats();
    updateMessage(`${currentLevelName} - 코어를 탈출구로 이동하세요.`);
}

function resetLevel() {
    loadLevel(currentLevelIndex);
}

function nextLevel() {
    loadLevel(currentLevelIndex + 1);
}

function showIntro() {
    ui.introModal.classList.add('show');
}

function hideIntro() {
    ui.introModal.classList.remove('show');
}

function updateStats() {
    const level = currentLevelIndex < LEVELS.length ? LEVELS[currentLevelIndex] : null;
    ui.levelText.textContent = `${currentLevelIndex + 1}`;

    const limit = level ? level.moveLimit : Math.floor((5 + (currentLevelIndex + 1) * 1.5) * 1.5);
    const limitText = limit ? `/${limit}` : '';
    ui.moveText.textContent = `${moveCount}${limitText}`;

    if (limit && moveCount > limit) {
        ui.moveText.classList.add('over-limit');
    } else {
        ui.moveText.classList.remove('over-limit');
    }
    updateUndoState();
}

function createBlocksFromGrid() {
    const geometry = new RoundedBoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, 4, 0.1);

    for (let x = 0; x < GRID_SIZE; x += 1) {
        for (let y = 0; y < GRID_SIZE; y += 1) {
            for (let z = 0; z < GRID_SIZE; z += 1) {
                const type = gridData[x][y][z];
                if (type === 0) continue;

                const color = type === 2 ? COLOR_CORE : type === 3 ? COLOR_FIREWALL : COLOR_NORMAL;
                const material = new THREE.MeshStandardMaterial({
                    color,
                    roughness: type === 3 ? 0.8 : 0.3,
                    metalness: type === 3 ? 0.2 : 0.7,
                    transparent: true,
                    opacity: 1
                });

                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.copy(getWorldPos(x, y, z));
                mesh.userData = {
                    gx: x,
                    gy: y,
                    gz: z,
                    type,
                    originalColor: material.color.clone()
                };

                scene.add(mesh);
                blocks.push(mesh);
            }
        }
    }
}

function toggleXRay() {
    isXRayMode = !isXRayMode;
    if (isXRayMode) ui.xrayBtn.classList.add('active');
    else ui.xrayBtn.classList.remove('active');

    updateXRayVisuals();
}

function updateXRayVisuals() {
    blocks.forEach((mesh) => {
        if (mesh === selectedBlock) {
            mesh.material.opacity = 1;
            mesh.material.wireframe = false;
            mesh.material.depthWrite = true;
        } else {
            if (isXRayMode) {
                mesh.material.opacity = mesh.userData.type === 3 ? 0.5 : 0.2;
                mesh.material.wireframe = false;
                mesh.material.depthWrite = false;
            } else {
                mesh.material.opacity = 1;
                mesh.material.wireframe = false;
                mesh.material.depthWrite = true;
            }
        }
        mesh.material.needsUpdate = true;
    });
}

function getAxisScreenVector(axisVector, origin) {
    const width = renderer.domElement.clientWidth;
    const height = renderer.domElement.clientHeight;
    const start = origin.clone();
    const end = origin.clone().add(axisVector);
    const startNdc = start.project(camera);
    const endNdc = end.project(camera);
    const sx = (startNdc.x * 0.5 + 0.5) * width;
    const sy = (-startNdc.y * 0.5 + 0.5) * height;
    const ex = (endNdc.x * 0.5 + 0.5) * width;
    const ey = (-endNdc.y * 0.5 + 0.5) * height;
    return new THREE.Vector2(ex - sx, ey - sy);
}

function worldToScreen(world) {
    const rect = renderer.domElement.getBoundingClientRect();
    const projected = world.clone().project(camera);
    return {
        x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height
    };
}

function getSwipeAxisCandidate(dx, dy, threshold) {
    if (!selectedBlock) {
        return null;
    }
    const swipeVector = new THREE.Vector2(dx, dy);
    if (swipeVector.lengthSq() === 0) {
        return null;
    }
    swipeVector.normalize();

    const origin = selectedBlock.position.clone();
    const axes = [
        { axis: 'x', dir: 1, vec: new THREE.Vector3(1, 0, 0) },
        { axis: 'x', dir: -1, vec: new THREE.Vector3(-1, 0, 0) },
        { axis: 'y', dir: 1, vec: new THREE.Vector3(0, 1, 0) },
        { axis: 'y', dir: -1, vec: new THREE.Vector3(0, -1, 0) },
        { axis: 'z', dir: 1, vec: new THREE.Vector3(0, 0, 1) },
        { axis: 'z', dir: -1, vec: new THREE.Vector3(0, 0, -1) }
    ];

    let best = null;
    let bestScore = 0;
    axes.forEach((candidate) => {
        const screenVec = getAxisScreenVector(candidate.vec, origin);
        if (screenVec.lengthSq() < 0.0001) {
            return;
        }
        screenVec.normalize();
        const score = screenVec.dot(swipeVector);
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    });

    if (!best || bestScore < threshold) {
        return null;
    }
    return { axis: best.axis, dir: best.dir };
}

function onPointerDown(event) {
    if (isAnimating || isGameClear) {
        return;
    }

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(blocks);

    if (intersects.length > 0) {
        selectBlock(intersects[0].object);
        setSwipePreview(null);
        pointerStates.set(event.pointerId, {
            mode: 'block',
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY
        });
        renderer.domElement.setPointerCapture(event.pointerId);
        event.stopPropagation();
        return;
    }

    if (event.pointerType === 'mouse') {
        deselect();
    }
    pointerStates.set(event.pointerId, {
        mode: 'orbit',
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY
    });
}

function onPointerMove(event) {
    const state = pointerStates.get(event.pointerId);
    if (!state) {
        return;
    }
    state.lastX = event.clientX;
    state.lastY = event.clientY;

    if (state.mode === 'block') {
        const dx = state.lastX - state.startX;
        const dy = state.lastY - state.startY;
        const distance = Math.hypot(dx, dy);
        if (distance >= SWIPE_PREVIEW_THRESHOLD) {
            setSwipePreview(getSwipeAxisCandidate(dx, dy, SWIPE_PREVIEW_SCORE));
        } else {
            setSwipePreview(null);
        }
        event.stopPropagation();
    }
}

function onPointerUp(event) {
    const state = pointerStates.get(event.pointerId);
    if (!state) {
        return;
    }

    if (state.mode === 'block') {
        const dx = state.lastX - state.startX;
        const dy = state.lastY - state.startY;
        const distance = Math.hypot(dx, dy);

        if (distance >= SWIPE_THRESHOLD) {
            const swipe = getSwipeAxisCandidate(dx, dy, SWIPE_SCORE_THRESHOLD);
            if (swipe) {
                moveSelectedBlock(swipe.axis, swipe.dir);
            }
        }
        setSwipePreview(null);
        event.stopPropagation();
        renderer.domElement.releasePointerCapture(event.pointerId);
    }

    pointerStates.delete(event.pointerId);
}

function selectBlock(mesh) {
    if (selectedBlock) {
        selectedBlock.material.emissive.setHex(0x000000);
    }

    selectedBlock = mesh;
    selectedBlock.material.emissive.setHex(0x333333);

    const { gx, gy, gz, type } = mesh.userData;
    const blockName = type === 2 ? '코어' : type === 3 ? '방화벽' : '데이터 블록';
    const hint = type === 3 ? ' (이동 불가)' : '';
    updateMessage(`${blockName}${hint} 선택됨: [${gx}, ${gy}, ${gz}]`);

    updateMoveButtons();
    updateMoveHints();
    updateXRayVisuals();
}

function deselect() {
    if (selectedBlock) {
        selectedBlock.material.emissive.setHex(0x000000);
    }
    selectedBlock = null;
    updateMessage(`${currentLevelName} - 코어를 탈출구로 이동하세요.`);

    ['x', 'y', 'z'].forEach((axis) => {
        document.getElementById(`move-${axis}-pos`).disabled = true;
        document.getElementById(`move-${axis}-neg`).disabled = true;
    });

    updateMoveHints();
    updateXRayVisuals();
}

function updateMoveButtons() {
    if (!selectedBlock) {
        return;
    }
    const { gx, gy, gz, type } = selectedBlock.userData;
    if (type === 3) {
        ['x', 'y', 'z'].forEach((axis) => {
            document.getElementById(`move-${axis}-pos`).disabled = true;
            document.getElementById(`move-${axis}-neg`).disabled = true;
        });
        return;
    }

    const check = (nx, ny, nz) => {
        if (!isInBounds(nx, ny, nz)) return false;
        return gridData[nx][ny][nz] === 0;
    };

    document.getElementById('move-x-pos').disabled = !check(gx + 1, gy, gz);
    document.getElementById('move-x-neg').disabled = !check(gx - 1, gy, gz);
    document.getElementById('move-y-pos').disabled = !check(gx, gy + 1, gz);
    document.getElementById('move-y-neg').disabled = !check(gx, gy - 1, gz);
    document.getElementById('move-z-pos').disabled = !check(gx, gy, gz + 1);
    document.getElementById('move-z-neg').disabled = !check(gx, gy, gz - 1);
}

function clearMoveHints() {
    if (!moveHintGroup) {
        return;
    }
    while (moveHintGroup.children.length > 0) {
        moveHintGroup.remove(moveHintGroup.children[0]);
    }
}

function updateMoveHints() {
    clearMoveHints();
    if (!selectedBlock || isAnimating || isGameClear) {
        return;
    }
    const { gx, gy, gz, type } = selectedBlock.userData;
    if (type === 3) {
        return;
    }
    const directions = [
        { dx: 1, dy: 0, dz: 0 },
        { dx: -1, dy: 0, dz: 0 },
        { dx: 0, dy: 1, dz: 0 },
        { dx: 0, dy: -1, dz: 0 },
        { dx: 0, dy: 0, dz: 1 },
        { dx: 0, dy: 0, dz: -1 }
    ];

    directions.forEach((dir) => {
        const nx = gx + dir.dx;
        const ny = gy + dir.dy;
        const nz = gz + dir.dz;
        if (!isInBounds(nx, ny, nz)) {
            return;
        }
        if (gridData[nx][ny][nz] !== 0) {
            return;
        }
        const hintMaterial = moveHintMaterial.clone();
        const hint = new THREE.Mesh(moveHintGeometry, hintMaterial);
        hint.position.copy(getWorldPos(nx, ny, nz));
        hint.userData = {
            axis: dir.dx !== 0 ? 'x' : dir.dy !== 0 ? 'y' : 'z',
            dir: dir.dx !== 0 ? Math.sign(dir.dx) : dir.dy !== 0 ? Math.sign(dir.dy) : Math.sign(dir.dz)
        };
        moveHintGroup.add(hint);
    });

    applySwipePreview();
}

function setHintVisual(mesh, isActive) {
    mesh.material.opacity = isActive ? 0.75 : 0.35;
    mesh.material.color.setHex(isActive ? COLOR_HINT_ACTIVE : COLOR_HINT);
    mesh.scale.setScalar(isActive ? 1.15 : 1);
    mesh.material.needsUpdate = true;
}

function applySwipePreview() {
    if (!moveHintGroup) {
        return;
    }
    moveHintGroup.children.forEach((hint) => {
        const matches =
            swipePreview &&
            hint.userData.axis === swipePreview.axis &&
            hint.userData.dir === swipePreview.dir;
        setHintVisual(hint, Boolean(matches));
    });
}

function setSwipePreview(preview) {
    const same =
        (swipePreview?.axis === preview?.axis) &&
        (swipePreview?.dir === preview?.dir);
    if (same) {
        return;
    }
    swipePreview = preview;
    applySwipePreview();
}

function moveSelectedBlock(axis, dir) {
    if (!selectedBlock || isAnimating || isGameClear) return;

    const { gx, gy, gz, type } = selectedBlock.userData;
    if (type === 3) {
        updateMessage('방화벽 블록은 이동할 수 없습니다.');
        return;
    }
    let nx = gx;
    let ny = gy;
    let nz = gz;

    if (axis === 'x') nx += dir;
    if (axis === 'y') ny += dir;
    if (axis === 'z') nz += dir;

    if (!isInBounds(nx, ny, nz)) return;
    if (gridData[nx][ny][nz] !== 0) return;

    applyMove(selectedBlock, { x: gx, y: gy, z: gz }, { x: nx, y: ny, z: nz }, true);
}

function applyMove(block, from, to, recordHistory) {
    isAnimating = true;
    gridData[to.x][to.y][to.z] = block.userData.type;
    gridData[from.x][from.y][from.z] = 0;

    block.userData.gx = to.x;
    block.userData.gy = to.y;
    block.userData.gz = to.z;

    if (recordHistory) {
        moveHistory.push({ block, from, to });
    }

    animateBlockMove(block, from, to, () => {
        isAnimating = false;
        updateMoveButtons();
        updateMoveHints();
        updateMoveCount(recordHistory ? 1 : -1);
        updateUndoState();

        if (block.userData.type === 2 && to.x === targetPos.x && to.y === targetPos.y && to.z === targetPos.z) {
            handleVictory();
        }
    });
}

function animateBlockMove(block, from, to, onComplete) {
    const startPos = getWorldPos(from.x, from.y, from.z);
    const endPos = getWorldPos(to.x, to.y, to.z);
    const duration = 200;
    const startTime = performance.now();

    const animateMove = (time) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);

        block.position.lerpVectors(startPos, endPos, ease);

        if (progress < 1) {
            requestAnimationFrame(animateMove);
        } else {
            block.position.copy(endPos);
            if (onComplete) onComplete();
        }
    };

    requestAnimationFrame(animateMove);
}

function undoMove() {
    if (isAnimating || isGameClear) return;
    const lastMove = moveHistory.pop();
    if (!lastMove) return;

    const { block, from, to } = lastMove;
    applyMove(block, to, from, false);
}

function updateMoveCount(delta) {
    if (delta !== 0) {
        moveCount = Math.max(0, moveCount + delta);
    }
    updateStats();
}

function updateUndoState() {
    ui.undoBtn.disabled = moveHistory.length === 0 || isAnimating || isGameClear;
}

function updateMessage(text) {
    ui.message.textContent = text;
}

function handleVictory() {
    isGameClear = true;
    ui.modal.classList.add('show');
    updateUndoState();

    const animateWin = () => {
        if (!isGameClear) return;
        if (selectedBlock) {
            selectedBlock.rotation.y += 0.1;
            selectedBlock.rotation.x += 0.05;
        }
        requestAnimationFrame(animateWin);
    };
    animateWin();
}

function isInBounds(x, y, z) {
    return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE && z >= 0 && z < GRID_SIZE;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);

    if (targetZoneMesh) {
        targetZoneMesh.rotation.y += 0.01;
    }
}

init();
