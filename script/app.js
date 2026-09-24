import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

let scene, camera, renderer, controls;
let floorMesh, particles, ambientLightRef, directionalLightRef;
let renderList = [];
let modelCache = new Map();
let loadedModelPaths = new Set();
let failedModelPaths = new Set();
let paused = false;
let lowPowerMode = false;
let showStats = true;
let modelStatusReady = false;
let modelDiagnostics = new Map();
let showDiagnostics = false;
let showLabels = false;
let fps = 0;
let frameCounter = 0;
let fpsTimer = 0;

const clock = new THREE.Clock();
const simParams = {
    speedMultiplier: 1,
    populationMultiplier: 1
};

const defaultConfig = {
    environment: {
        water_color: '#006994',
        fog_density: 0.005,
        ambient_light: 0.8,
        directional_light: 2
    },
    entities: []
};

const sharedGeometries = {
    cone: new THREE.ConeGeometry(0.5, 1, 8),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 12, 12)
};

const materialCache = {};
const modelLoader = new GLTFLoader();

function getMaterial(color) {
    if (!materialCache[color]) {
        materialCache[color] = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.45,
            metalness: 0.08
        });
    }
    return materialCache[color];
}

function getFloorHeight(x, z) {
    const px = x;
    const py = -z;
    return -18
        + Math.sin(px * 0.02) * 1.5
        + Math.cos(py * 0.03) * 2
        + Math.sin(px * 0.1 + py * 0.1) * 0.5;
}

function isMobile() {
    return window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
}

function init() {
    const container = document.getElementById('canvas-container');
    if (!container) throw new Error('canvas-container non trovato.');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(defaultConfig.environment.water_color);
    scene.fog = new THREE.FogExp2(defaultConfig.environment.water_color, defaultConfig.environment.fog_density);

    camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
    camera.position.set(0, isMobile() ? 12 : 15, isMobile() ? 72 : 80);

    renderer = new THREE.WebGLRenderer({
        antialias: !isMobile(),
        powerPreference: 'high-performance'
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.domElement.id = 'aquarium-canvas';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    applyRendererQuality();

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = !isMobile();
    controls.minDistance = 22;
    controls.maxDistance = 180;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.target.set(0, -2, 0);
    controls.saveState();

    const hemiLight = new THREE.HemisphereLight(0x44aaff, 0x001133, 1.2);
    scene.add(hemiLight);

    ambientLightRef = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLightRef);

    directionalLightRef = new THREE.DirectionalLight(0xffffff, 2);
    directionalLightRef.position.set(50, 100, 50);
    scene.add(directionalLightRef);

    createFloor();
    createParticles();
    setupUI();
    setupMobileUI();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', () => setTimeout(onWindowResize, 100));

    loadConfig();
}

function applyRendererQuality() {
    const mobile = isMobile();
    lowPowerMode = mobile;

    const maxDpr = mobile ? 1.35 : 1.75;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    resizeRenderer();
}

function createFloor() {
    const segments = isMobile() ? 80 : 128;
    const floorGeo = new THREE.PlaneGeometry(250, 250, segments, segments);
    const pos = floorGeo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        pos.setZ(i,
            Math.sin(x * 0.02) * 1.5 +
            Math.cos(y * 0.03) * 2 +
            Math.sin(x * 0.1 + y * 0.1) * 0.5
        );
    }

    floorGeo.computeVertexNormals();
    floorMesh = new THREE.Mesh(
        floorGeo,
        new THREE.MeshStandardMaterial({ color: 0xe0cda9, roughness: 0.8, metalness: 0.05 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -18;
    scene.add(floorMesh);
}

function createParticles() {
    const count = isMobile() ? 700 : 1500;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < positions.length; i++) {
        positions[i] = (Math.random() - 0.5) * 200;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    particles = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
            color: 0x88ffff,
            size: isMobile() ? 0.16 : 0.2,
            transparent: true,
            opacity: 0.55,
            blending: THREE.AdditiveBlending
        })
    );
    scene.add(particles);
}

async function loadConfig() {
    try {
        const response = await fetch('config.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error('config.json non trovato.');
        const config = await response.json();
        applyEnvironment(config.environment);
        await parseConfig(config);
        updateHUD();
    } catch (error) {
        console.warn(error);
        applyEnvironment(defaultConfig.environment);
        await parseConfig(defaultConfig);
        updateHUD();
    }
}

function applyEnvironment(environment = {}) {
    const waterColor = new THREE.Color(environment.water_color || '#006994');
    scene.background = waterColor;
    scene.fog.color = waterColor;
    scene.fog.density = Number(environment.fog_density) || 0.005;

    if (ambientLightRef) ambientLightRef.intensity = Number(environment.ambient_light) || 0.8;
    if (directionalLightRef) directionalLightRef.intensity = Number(environment.directional_light) || 2;

    const colorInput = document.getElementById('waterColor');
    if (colorInput) colorInput.value = '#' + waterColor.getHexString();
}

async function parseConfig(config) {
    const entities = Array.isArray(config.entities) ? config.entities : [];

    const assets = await Promise.all(
        entities.map(async entityDef => ({
            entityDef,
            modelAsset: await loadModelAsset(entityDef.model)
        }))
    );

    for (const { entityDef, modelAsset } of assets) {
        for (let i = 0; i < Number(entityDef.count) || 0; i++) {
            const group = new THREE.Group();
            let mixer = null;

            if (modelAsset?.scene) {
                const model = SkeletonUtils.clone(modelAsset.scene);
                const recoveredSkinnedMeshes = recoverSkinnedModelForRendering(model);
                prepareModel(model, entityDef.model || {});
                model.updateMatrixWorld(true);
                group.add(model);
                if (recoveredSkinnedMeshes > 0) {
                    console.info('GLB rig recuperato in rendering statico:', entityDef.model?.path, recoveredSkinnedMeshes);
                }
                modelDiagnostics.set(entityDef.model?.path || entityDef.id, collectModelDiagnostics(model));

                // Le animazioni embedded dei GLB marini non vengono riprodotte automaticamente:
                // alcuni asset contengono clip di prova che fanno ruotare il modello su se stesso.
                // La locomozione viene gestita dal sistema fisico dell'acquario.
                const requested = entityDef.model?.animation;
                if (requested && modelAsset.animations?.length) {
                    mixer = new THREE.AnimationMixer(model);
                    const clip = THREE.AnimationClip.findByName(modelAsset.animations, requested);
                    if (clip) mixer.clipAction(clip).play();
                }
            } else {
                buildFallback(group, entityDef.fallback_model);
            }

            const logicalScale = Number(entityDef.scale) || 1;
            group.scale.setScalar(logicalScale);

            const box = entityDef.behavior?.bounding_box || { x: 100, y: 20, z: 100 };
            // I pesci partono nella zona centrale della vasca, sicuramente inquadrata
            // dalla camera iniziale; dopo possono esplorare tutta la bounding box.
            const spawnWidth = entityDef.type === 'fish' ? Math.min(Number(box.x) || 100, 80) : (Number(box.x) || 100);
            const spawnDepth = entityDef.type === 'fish' ? Math.min(Number(box.z) || 100, 80) : (Number(box.z) || 100);
            const x = (Math.random() - 0.5) * spawnWidth;
            const z = (Math.random() - 0.5) * spawnDepth;
            let y = (Math.random() - 0.5) * box.y;
            const floorY = getFloorHeight(x, z);

            if (entityDef.behavior?.type === 'bottom_crawl' || entityDef.behavior?.type === 'static') {
                y = floorY;
            } else {
                // Nuota sempre con un margine netto dal fondale: evita che un GLB
                // finisca parzialmente sotto il pavimento dopo il centraggio.
                y = Math.max(y, floorY + 8);
            }

            group.position.set(x, y, z);
            scene.add(group);

            renderList.push({
                id: entityDef.id,
                type: entityDef.type,
                tags: entityDef.tags || [],
                mesh: group,
                behavior: entityDef.behavior || { type: 'static', bounding_box: box },
                target: group.position.clone(),
                seed: Math.random() * 100,
                timer: 0,
                zigzagPeriod: 1 + Math.random() * 2,
                mixer,
                baseVisible: true
            });
        }
    }

    // Tutte le creature partono visibili; il controllo della popolazione
    // viene applicato solo quando l'utente modifica lo slider.
    for (const entity of renderList) {
        entity.baseVisible = true;
        entity.mesh.visible = true;
    }

    modelStatusReady = true;
}

function hasRenderableGeometry(model) {
    let meshCount = 0;
    let geometryCount = 0;
    model.traverse(node => {
        if (node.isMesh) {
            meshCount++;
            if (node.geometry?.attributes?.position?.count > 0) geometryCount++;
        }
    });
    return meshCount > 0 && geometryCount > 0;
}

function recoverSkinnedModelForRendering(model) {
    // I GLB delle creature marine sono skinned/rigged. Per garantire il rendering
    // anche su browser/GPU che gestiscono male il clone dello skeleton, manteniamo
    // la geometria ma sostituiamo ogni SkinnedMesh con un Mesh statico in bind pose.
    // La locomozione dell'acquario continua a funzionare a livello di Group.
    const replacements = [];

    model.traverse(node => {
        if (!node.isSkinnedMesh || !node.parent) return;

        const replacement = new THREE.Mesh(node.geometry, node.material);
        replacement.name = node.name + '_static_render';
        replacement.position.copy(node.position);
        replacement.quaternion.copy(node.quaternion);
        replacement.scale.copy(node.scale);
        replacement.visible = true;
        replacement.frustumCulled = false;
        replacement.castShadow = node.castShadow;
        replacement.receiveShadow = node.receiveShadow;

        if (node.morphTargetInfluences) {
            replacement.morphTargetInfluences = [...node.morphTargetInfluences];
        }

        replacements.push({ oldNode: node, replacement });
    });

    for (const { oldNode, replacement } of replacements) {
        oldNode.parent.add(replacement);
        oldNode.parent.remove(oldNode);
    }

    return replacements.length;
}

function collectModelDiagnostics(model) {
    let meshes = 0;
    let skinned = 0;
    let vertices = 0;
    model.traverse(node => {
        if (!node.isMesh) return;
        meshes++;
        if (node.isSkinnedMesh) skinned++;
        if (node.geometry?.attributes?.position) vertices += node.geometry.attributes.position.count;
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    return { meshes, skinned, vertices, size: [size.x, size.y, size.z] };
}

function prepareModel(model, modelConfig) {
    // I modelli GLB possono avere impostazioni di culling/materiali diverse:
    // normalizziamo la scena una volta per garantire che ogni creatura sia renderizzata.
    model.traverse(node => {
        if (!node.isMesh) return;
        node.visible = true;
        node.frustumCulled = false;

        if (node.material) {
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach(material => {
                material.side = THREE.DoubleSide;
                material.transparent = false;
                material.opacity = 1;
                material.alphaTest = 0;
                material.depthWrite = true;
                material.depthTest = true;
                material.needsUpdate = true;
            });
        }
    });

    if (Array.isArray(modelConfig.position)) model.position.set(...modelConfig.position);
    if (Array.isArray(modelConfig.rotation)) model.rotation.set(...modelConfig.rotation);

    const requestedScale = Array.isArray(modelConfig.scale) ? modelConfig.scale : [1, 1, 1];
    model.scale.set(...requestedScale);

    // Normalizza i GLB in base alla dimensione reale: evita modelli enormi o minuscoli.
    const targetSize = Number(modelConfig.target_size);
    if (targetSize > 0) {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z);

        if (maxDimension > 0) {
            const factor = targetSize / maxDimension;
            model.scale.multiplyScalar(factor);
        }
    }

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    // Riporta il modello sul piano locale in modo coerente con l'animazione.
    const centeredBox = new THREE.Box3().setFromObject(model);
    model.position.y -= centeredBox.min.y;
}

async function loadModelAsset(modelDefinition) {
    const modelPath = typeof modelDefinition === 'string'
        ? modelDefinition
        : modelDefinition?.path;

    if (!modelPath) return null;
    if (modelCache.has(modelPath)) return modelCache.get(modelPath);

    try {
        // Risoluzione esplicita rispetto alla pagina: gestisce correttamente anche
        // percorsi come "models/Manta ray.glb" con spazi nel nome.
        const resolvedPath = new URL(modelPath, document.baseURI).href;
        const asset = await modelLoader.loadAsync(resolvedPath);
        if (!asset?.scene || !hasRenderableGeometry(asset.scene)) {
            throw new Error('GLB caricato ma senza geometria renderizzabile');
        }
        modelCache.set(modelPath, asset);
        loadedModelPaths.add(modelPath);
        return asset;
    } catch (error) {
        failedModelPaths.add(modelPath);
        console.warn('Modello GLB non disponibile:', modelPath, error);
        modelCache.set(modelPath, null);
        return null;
    }
}

function buildFallback(group, fallback = {}) {
    const baseColor = fallback.base_color || '#777777';
    const parts = Array.isArray(fallback.parts) ? fallback.parts : [];

    for (const part of parts) {
        const geo = sharedGeometries[part.shape] || sharedGeometries.box;
        const mesh = new THREE.Mesh(geo, getMaterial(part.color || baseColor));

        if (Array.isArray(part.scale)) mesh.scale.set(...part.scale);
        if (Array.isArray(part.position)) mesh.position.set(...part.position);
        if (Array.isArray(part.rotation)) mesh.rotation.set(...part.rotation);

        group.add(mesh);
    }
}

function setupUI() {
    const fishScale = document.getElementById('fishScale');
    const swimSpeed = document.getElementById('swimSpeed');
    const lightIntensity = document.getElementById('lightIntensity');
    const waterColor = document.getElementById('waterColor');

    fishScale?.addEventListener('input', event => {
        simParams.populationMultiplier = Number(event.target.value) / 100;
        document.getElementById('valFish').textContent = simParams.populationMultiplier.toFixed(1) + 'x';
        applyPopulationVisibility();
        updateHUD();
    });

    swimSpeed?.addEventListener('input', event => {
        simParams.speedMultiplier = Number(event.target.value) / 100;
        document.getElementById('valSpeed').textContent = simParams.speedMultiplier.toFixed(1) + 'x';
    });

    lightIntensity?.addEventListener('input', event => {
        const factor = Number(event.target.value) / 100;
        ambientLightRef.intensity = factor * 0.8;
        directionalLightRef.intensity = factor * 2;
    });

    waterColor?.addEventListener('input', event => {
        const color = new THREE.Color(event.target.value);
        scene.background = color;
        scene.fog.color = color;
    });

    document.getElementById('btnPause')?.addEventListener('click', togglePause);
    document.getElementById('btnReset')?.addEventListener('click', resetCamera);
    document.getElementById('btnFullscreen')?.addEventListener('click', toggleFullscreen);
    document.getElementById('btnStats')?.addEventListener('click', () => {
        showStats = !showStats;
        document.getElementById('stats').classList.toggle('hidden', !showStats);
    });
    document.getElementById('btnDiagnostics')?.addEventListener('click', () => {
        showDiagnostics = !showDiagnostics;
        document.getElementById('modelDiagnostics')?.classList.toggle('hidden', !showDiagnostics);
        updateHUD();
    });
    document.getElementById('btnCenter')?.addEventListener('click', centerCreatures);
    document.getElementById('btnRepopulate')?.addEventListener('click', repopulateCreatures);
}

function setupMobileUI() {
    const mobileToggle = document.getElementById('mobileHudToggle');
    const panel = document.getElementById('ui-container');

    mobileToggle?.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        mobileToggle.textContent = panel.classList.contains('collapsed') ? '☰' : '×';
    });

    document.getElementById('mobilePause')?.addEventListener('click', togglePause);
    document.getElementById('mobileReset')?.addEventListener('click', resetCamera);
}

function togglePause() {
    paused = !paused;
    const label = paused ? '▶ Riprendi' : 'Ⅱ Pausa';
    document.querySelectorAll('[data-pause-label]').forEach(el => el.textContent = label);
    document.getElementById('pauseBadge')?.classList.toggle('active', paused);
}

function resetCamera() {
    controls.reset();
    camera.position.set(0, isMobile() ? 12 : 15, isMobile() ? 72 : 80);
    controls.target.set(0, -2, 0);
    controls.update();
}

async function centerCreatures() {
    for (const entity of renderList) {
        const box = entity.behavior?.bounding_box || {x:80,y:25,z:80};
        const x = (Math.random() - 0.5) * Math.min(Number(box.x) || 80, 60);
        const z = (Math.random() - 0.5) * Math.min(Number(box.z) || 80, 60);
        const floorY = getFloorHeight(x, z);

        if (entity.type === 'crustacean' || entity.type === 'plant') {
            entity.mesh.position.set(x, floorY, z);
        } else {
            const profile = getMotionProfile(entity);
            const minY = floorY + (entity.id === 'manta' ? 8 : 10);
            entity.mesh.position.set(x, minY + Math.random() * 8, z);
        }

        entity.target.copy(entity.mesh.position);
    }
}

function repopulateCreatures() {
    for (const entity of renderList) entity.mesh.visible = true;
    simParams.populationMultiplier = 1;
    const slider = document.getElementById('fishScale');
    if (slider) slider.value = '100';
    const value = document.getElementById('valFish');
    if (value) value.textContent = '1.0x';
    centerCreatures();
    updateHUD();
}

function toggleFullscreen() {
    try {
        const action = document.fullscreenElement
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen();

        if (action && typeof action.catch === 'function') {
            action.catch(error => {
                console.warn('Fullscreen non disponibile:', error);
            });
        }
    } catch (error) {
        console.warn('Fullscreen non disponibile:', error);
    }
}

function applyPopulationVisibility() {
    const fish = renderList.filter(entity => entity.type === 'fish');
    const groups = {};

    fish.forEach(entity => {
        if (!groups[entity.id]) groups[entity.id] = [];
        groups[entity.id].push(entity);
    });

    Object.values(groups).forEach(group => {
        const visibleCount = Math.round(group.length * simParams.populationMultiplier);
        group.forEach((entity, index) => {
            entity.baseVisible = index < visibleCount;
            entity.mesh.visible = entity.baseVisible;
        });
    });
}

function updateHUD() {
    const counts = {};
    renderList.forEach(entity => {
        if (!entity.mesh.visible) return;
        counts[entity.type] = (counts[entity.type] || 0) + 1;
    });

    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const modelCount = loadedModelPaths.size;
    const failedCount = failedModelPaths.size;

    const totalEl = document.getElementById('statTotal');
    const modelsEl = document.getElementById('statModels');
    const modeEl = document.getElementById('statMode');

    if (totalEl) totalEl.textContent = String(total);
    if (modelsEl) modelsEl.textContent = modelCount + (failedCount ? ' / ' + (modelCount + failedCount) : '');
    if (modeEl) modeEl.textContent = lowPowerMode ? 'Mobile' : 'Desktop';

    const detail = document.getElementById('statDetail');
    if (detail) {
        detail.textContent =
            'Pesci: ' + (counts.fish || 0) +
            ' · Granchi: ' + (counts.crustacean || 0) +
            ' · Coralli: ' + (counts.plant || 0);
    }

    const speciesEl = document.getElementById('speciesDetail');
    if (speciesEl) {
        const species = {};
        renderList.forEach(entity => {
            if (!entity.mesh.visible) return;
            species[entity.id] = (species[entity.id] || 0) + 1;
        });
        const labels = {
            squalo_bianco: '🦈 Squali',
            pesce_pagliaccio: '🐠 Pagliacci',
            pesce_variante_1: '🐟 Variante 1',
            pesce_variante_2: '🐟 Variante 2',
            granchio: '🦀 Granchi',
            delfino: '🐬 Delfini',
            manta: '🌊 Mante',
            balena: '🐋 Balena',
            corallo: '🪸 Coralli'
        };
        speciesEl.textContent = Object.entries(labels)
            .filter(([id]) => species[id])
            .map(([id,label]) => label + ': ' + species[id])
            .join(' · ') || 'Nessuna creatura visibile';
    }

    const modelStatus = document.getElementById('modelStatus');
    if (modelStatus) {
        modelStatus.textContent = failedCount
            ? '⚠ ' + failedCount + ' modello/i non trovato/i: uso fallback'
            : (modelStatusReady ? '✓ Modelli caricati' : 'Caricamento modelli…');
    }

    const fpsEl = document.getElementById('statFps');
    if (fpsEl) fpsEl.textContent = String(fps);
    const diag = document.getElementById('modelDiagnostics');
    if (diag && showDiagnostics) {
        const rows = [];
        for (const [path, d] of modelDiagnostics) {
            rows.push(path.split('/').pop() + ': ' + d.meshes + ' mesh · ' + d.vertices + ' vertici · ' + d.size.map(v => v.toFixed(1)).join('×'));
        }
        diag.textContent = rows.length ? rows.join(' | ') : 'Nessun GLB diagnostico';
    }
}

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsedTime();
    frameCounter++;
    if (time - fpsTimer >= 0.5) {
        fps = Math.round(frameCounter / Math.max(0.5, time - fpsTimer));
        frameCounter = 0;
        fpsTimer = time;
    }

    if (!paused) {
        if (particles) {
            particles.rotation.y = time * 0.01;
            particles.position.y = Math.sin(time * 0.2) * 2;
        }

        updateEntities(delta, time);
    }

    controls.update();
    renderer.render(scene, camera);
    updateHUD();
}

function getMotionProfile(entity) {
    const id = entity.id || '';
    const type = entity.type;

    if (type === 'crustacean') {
        return {
            turn: 0.09,
            arrival: 2.5,
            vertical: 0,
            bob: 0,
            bank: 0,
            sway: 0.02
        };
    }

    if (id === 'squalo_bianco') {
        return { turn: 0.055, arrival: 7, vertical: 0.32, bob: 0.35, bank: 0.16, sway: 0.035 };
    }
    if (id === 'delfino') {
        return { turn: 0.075, arrival: 5, vertical: 0.55, bob: 0.65, bank: 0.18, sway: 0.055 };
    }
    if (id === 'manta') {
        return { turn: 0.045, arrival: 6, vertical: 0.7, bob: 0.5, bank: 0.22, sway: 0.045 };
    }
    if (id === 'balena') {
        return { turn: 0.032, arrival: 10, vertical: 0.22, bob: 0.25, bank: 0.10, sway: 0.025 };
    }

    return { turn: 0.11, arrival: 3.5, vertical: 0.45, bob: 0.45, bank: 0.12, sway: 0.07 };
}

function chooseSwimmingTarget(entity, behavior, profile) {
    const box = behavior.bounding_box || { x: 100, y: 20, z: 100 };
    const margin = Math.min(8, Math.max(3, profile.arrival));
    const x = (Math.random() - 0.5) * Math.max(10, box.x - margin * 2);
    const z = (Math.random() - 0.5) * Math.max(10, box.z - margin * 2);
    const floorY = getFloorHeight(x, z);
    const maxY = floorY + Math.max(9, Number(box.y) || 20);
    const minY = floorY + (entity.id === 'manta' ? 8 : 10);
    const y = THREE.MathUtils.lerp(minY, maxY, Math.random());

    entity.target.set(x, y, z);
}

function updateEntities(delta, time) {
    const entitiesToRespawn = [];

    for (const entity of renderList) {
        const { mesh, behavior, target } = entity;

        if (entity.mixer && mesh.visible) entity.mixer.update(delta);

        // I coralli restano fermi ma hanno una piccola oscillazione organica.
        if (behavior.type === 'static') {
            if (entity.type === 'plant') {
                // Il punto di origine del corallo è il suo appoggio: lo manteniamo
                // sempre esattamente sul fondale anche quando il terreno è ondulato.
                const coralFloor = getFloorHeight(mesh.position.x, mesh.position.z);
                mesh.position.y = coralFloor;
                mesh.rotation.z = Math.sin(time * 0.8 + entity.seed) * 0.012;
                mesh.rotation.x = Math.cos(time * 0.65 + entity.seed) * 0.008;
            }
            continue;
        }

        if (!mesh.visible) continue;

        const profile = getMotionProfile(entity);
        const radius = Number(behavior.collision_radius) || 1;
        const box = behavior.bounding_box || { x: 100, y: 20, z: 100 };
        const halfX = (Number(box.x) || 100) / 2;
        const halfZ = (Number(box.z) || 100) / 2;
        let speed = (Number(behavior.base_speed) || 0.04) * simParams.speedMultiplier;
        let overrideTarget = false;

        // Evita gli angoli: quando ci avviciniamo al bordo, il prossimo target
        // viene scelto verso il centro invece di "rimbalzare" contro il muro.
        const edgeX = halfX - 6;
        const edgeZ = halfZ - 6;
        if (Math.abs(mesh.position.x) > edgeX || Math.abs(mesh.position.z) > edgeZ) {
            const center = new THREE.Vector3(0, mesh.position.y, 0);
            const toCenter = center.sub(mesh.position).normalize();
            target.copy(mesh.position).add(toCenter.multiplyScalar(25));
            overrideTarget = true;
        }

        const floorY = getFloorHeight(mesh.position.x, mesh.position.z);

        if (behavior.type === 'bottom_crawl') {
            mesh.position.y = floorY + radius * 0.25;
        } else {
            const minY = floorY + Math.max(radius, 6);
            if (mesh.position.y < minY) mesh.position.y += (minY - mesh.position.y) * Math.min(1, delta * 4);

            if (mesh.position.y > floorY + (Number(box.y) || 20) + 4) {
                const desiredY = floorY + (Number(box.y) || 20) - 2;
                target.y = THREE.MathUtils.lerp(target.y, desiredY, Math.min(1, delta * 2));
            }
        }

        // Evita di scegliere un target troppo vicino: produce traiettorie più lunghe e naturali.
        if (!overrideTarget && mesh.position.distanceTo(target) < profile.arrival) {
            chooseSwimmingTarget(entity, behavior, profile);
        }

        let closestTarget = null;
        let closestDistance = Infinity;

        for (const other of renderList) {
            if (other === entity || !other.mesh.visible) continue;

            const distance = mesh.position.distanceTo(other.mesh.position);
            if (distance >= closestDistance) continue;

            const wantsPrey = (behavior.target_tags || []).some(tag => other.tags.includes(tag));
            const wantsFlee = (behavior.flee_tags || []).some(tag => other.tags.includes(tag));

            if (wantsPrey || wantsFlee) {
                closestDistance = distance;
                closestTarget = { mesh: other.mesh, prey: wantsPrey, predator: wantsFlee };
            }
        }

        if (closestTarget) {
            if (closestTarget.prey && closestDistance < (behavior.hunting_radius || 0)) {
                if (closestDistance <= (behavior.eat_distance || 0)) {
                    entitiesToRespawn.push(closestTarget.mesh);
                } else {
                    target.copy(closestTarget.mesh.position);
                    speed *= 1.15;
                    overrideTarget = true;
                }
            }

            if (closestTarget.predator && closestDistance < (behavior.flee_radius || 0)) {
                const flee = new THREE.Vector3().subVectors(mesh.position, closestTarget.mesh.position);
                flee.y *= 0.45;
                flee.normalize();
                target.copy(mesh.position).add(flee.multiplyScalar(20));
                target.y = Math.max(target.y, getFloorHeight(target.x, target.z) + 8);
                speed *= 1.35;
                overrideTarget = true;
            }
        }

        if (behavior.type === 'bottom_crawl') {
            if (!overrideTarget && mesh.position.distanceTo(target) < profile.arrival) {
                setRandomGroundTarget(target, box);
            }
            target.y = floorY + radius * 0.25;
            steerTowards(mesh, target, profile.turn, false);
            mesh.translateZ(speed);
            mesh.rotation.x = 0;
            mesh.rotation.z = 0;
            continue;
        }

        // Nuoto: accelerazione morbida + variazione laterale/verticale, invece di
        // cambiare bruscamente direzione o velocità.
        const distanceToTarget = mesh.position.distanceTo(target);
        const arrivalFactor = THREE.MathUtils.clamp(distanceToTarget / 18, 0.35, 1);
        const cruise = speed * THREE.MathUtils.lerp(0.72, 1, arrivalFactor);

        // Orientamento morbido + roll/pitch organici applicati come offset quaternion,
        // senza sovrascrivere gli assi Euler della direzione di marcia.
        const phase = time * (1.2 + profile.sway * 10) + entity.seed;
        steerTowards(mesh, target, profile.turn, true);
        mesh.translateZ(cruise);

        // Corregge dolcemente la quota verso il target, evitando salti verticali.
        if (profile.vertical > 0) {
            const verticalDelta = target.y - mesh.position.y;
            mesh.position.y += verticalDelta * Math.min(1, delta * (1.2 + profile.vertical));
        }
    }

    for (const preyMesh of entitiesToRespawn) {
        const entity = renderList.find(item => item.mesh === preyMesh);
        if (!entity || !entity.tags.includes('prey')) continue;

        const box = entity.behavior.bounding_box || { x: 100, y: 20, z: 100 };
        const x = (Math.random() - 0.5) * box.x;
        const z = (Math.random() - 0.5) * box.z;
        const floorY = getFloorHeight(x, z);
        const y = floorY + 10 + Math.random() * Math.max(2, Number(box.y) - 10);

        entity.mesh.position.set(x, y, z);
        chooseSwimmingTarget(entity, entity.behavior, getMotionProfile(entity));
        entity.mesh.visible = entity.baseVisible;
    }
}

function setRandomGroundTarget(target, box = { x: 100, y: 0, z: 100 }) {
    const margin = 5;
    target.set(
        (Math.random() - 0.5) * Math.max(10, box.x - margin * 2),
        0,
        (Math.random() - 0.5) * Math.max(10, box.z - margin * 2)
    );
}

function setRandomTarget(target, box = { x: 100, y: 20, z: 100 }) {
    const x = (Math.random() - 0.5) * box.x;
    const z = (Math.random() - 0.5) * box.z;
    const floorY = getFloorHeight(x, z);
    const y = floorY + 10 + Math.random() * Math.max(2, Number(box.y) - 10);
    target.set(x, y, z);
}

function steerTowards(mesh, target, rotationSpeed = 0.08, swimming = true, bank = 0, pitch = 0, phase = 0) {
    const direction = new THREE.Vector3().subVectors(target, mesh.position);
    if (swimming) direction.y *= 0.65;

    if (direction.lengthSq() < 0.0001) return;

    direction.normalize();

    // I GLB marini sono orientati verso -Z dopo la rotazione definita in config.
    // Allineiamo quindi il -Z locale alla direzione di marcia, evitando che pesci,
    // squali e cetacei nuotino all'indietro.
    const forward = new THREE.Vector3(0, 0, -1);
    const desired = new THREE.Quaternion().setFromUnitVectors(forward, direction);

    mesh.quaternion.slerp(
        desired,
        Math.min(1, Math.max(0.015, Number(rotationSpeed) * simParams.speedMultiplier))
    );

    if (swimming) {
        const roll = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            Math.sin(phase) * bank
        );
        const pitchOffset = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            Math.cos(phase * 0.7) * pitch
        );
        mesh.quaternion.multiply(roll).multiply(pitchOffset);
    }
}

function resizeRenderer() {
    if (!renderer || !camera) return;

    const canvas = renderer.domElement;
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) ||
        canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false);
    }

    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
}

function onWindowResize() {
    applyRendererQuality();
    resizeRenderer();
}

init();
animate();
