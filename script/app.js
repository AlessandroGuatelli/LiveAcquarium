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
                prepareModel(model, entityDef.model || {});
                group.add(model);

                if (modelAsset.animations?.length) {
                    mixer = new THREE.AnimationMixer(model);
                    const requested = entityDef.model?.animation;
                    const clip = requested
                        ? THREE.AnimationClip.findByName(modelAsset.animations, requested)
                        : modelAsset.animations[0];

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
            group.rotation.y = Math.random() * Math.PI * 2;
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

async function toggleFullscreen() {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        } else {
            await document.exitFullscreen();
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

    const modelStatus = document.getElementById('modelStatus');
    if (modelStatus) {
        modelStatus.textContent = failedCount
            ? '⚠ ' + failedCount + ' modello/i non trovato/i: uso fallback'
            : (modelStatusReady ? '✓ Modelli caricati' : 'Caricamento modelli…');
    }
}

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsedTime();

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

function updateEntities(delta, time) {
    const entitiesToRespawn = [];

    for (const entity of renderList) {
        const { mesh, behavior, target } = entity;

        if (entity.mixer && mesh.visible) entity.mixer.update(delta);
        if (!mesh.visible || behavior.type === 'static') continue;

        let speed = (Number(behavior.base_speed) || 0.04) * simParams.speedMultiplier;
        let overriding = false;
        const radius = Number(behavior.collision_radius) || 1;

        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
        const halfX = (Number(behavior.bounding_box?.x) || 100) / 2;
        const halfZ = (Number(behavior.bounding_box?.z) || 100) / 2;

        if (Math.abs(mesh.position.x) > halfX) {
            mesh.position.x = Math.sign(mesh.position.x) * halfX;
            forward.x *= -1;
            overriding = true;
        }

        if (Math.abs(mesh.position.z) > halfZ) {
            mesh.position.z = Math.sign(mesh.position.z) * halfZ;
            forward.z *= -1;
            overriding = true;
        }

        const floorY = getFloorHeight(mesh.position.x, mesh.position.z);

        if (behavior.type !== 'bottom_crawl') {
            const minY = floorY + radius;
            if (mesh.position.y < minY) {
                mesh.position.y = minY;
                if (forward.y < 0) forward.y *= -1;
                overriding = true;
            }
        }

        if (overriding) {
            target.copy(mesh.position).add(forward.multiplyScalar(20));
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
                closestTarget = {
                    mesh: other.mesh,
                    prey: wantsPrey,
                    predator: wantsFlee
                };
            }
        }

        if (closestTarget && !overriding) {
            if (closestTarget.prey && closestDistance < (behavior.hunting_radius || 0)) {
                if (closestDistance <= (behavior.eat_distance || 0)) {
                    entitiesToRespawn.push(closestTarget.mesh);
                } else {
                    target.copy(closestTarget.mesh.position);
                    speed *= 1.5;
                    overriding = true;
                }
            }

            if (closestTarget.predator && closestDistance < (behavior.flee_radius || 0)) {
                const flee = new THREE.Vector3()
                    .subVectors(mesh.position, closestTarget.mesh.position)
                    .normalize();

                target.copy(mesh.position).add(flee.multiplyScalar(15));
                target.y = Math.max(target.y, getFloorHeight(target.x, target.z) + 5);
                speed *= 1.8;
                overriding = true;
            }
        }

        switch (behavior.type) {
            case 'swim_random':
                if (!overriding && mesh.position.distanceTo(target) < 5) {
                    setRandomTarget(target, behavior.bounding_box);
                }
                steerTowards(mesh, target, behavior.rotation_speed);
                mesh.translateZ(speed);
                mesh.rotation.z = Math.sin(time * 3 + entity.seed) * 0.08;
                break;

            case 'zigzag':
                entity.timer += delta;
                if (!overriding && entity.timer > entity.zigzagPeriod) {
                    entity.timer = 0;
                    setRandomTarget(target, behavior.bounding_box);
                }
                steerTowards(mesh, target, behavior.rotation_speed);
                mesh.translateZ(speed);
                break;

            case 'bottom_crawl':
                if (!overriding && mesh.position.distanceTo(target) < 3) {
                    setRandomTarget(target, behavior.bounding_box);
                }
                mesh.position.y = floorY + radius * 0.25;
                target.y = mesh.position.y;
                steerTowards(mesh, target, behavior.rotation_speed);
                mesh.translateZ(speed);
                mesh.rotation.x = 0;
                mesh.rotation.z = 0;
                break;
        }
    }

    for (const preyMesh of entitiesToRespawn) {
        const entity = renderList.find(item => item.mesh === preyMesh);
        if (!entity || !entity.tags.includes('prey')) continue;

        const box = entity.behavior.bounding_box;
        const x = (Math.random() - 0.5) * box.x;
        const z = (Math.random() - 0.5) * box.z;
        let y = (Math.random() - 0.5) * box.y;
        const floorY = getFloorHeight(x, z);

        y = Math.max(y, floorY + 8);
        entity.mesh.position.set(x, y, z);
        entity.target.copy(entity.mesh.position);
        entity.mesh.visible = entity.baseVisible;
    }
}

function setRandomTarget(target, box = { x: 100, y: 20, z: 100 }) {
    const x = (Math.random() - 0.5) * box.x;
    const z = (Math.random() - 0.5) * box.z;
    let y = (Math.random() - 0.5) * box.y;
    const floorY = getFloorHeight(x, z);

    y = Math.max(y, floorY + 8);
    target.set(x, y, z);
}

function steerTowards(mesh, target, rotationSpeed = 0.08) {
    const matrix = new THREE.Matrix4().lookAt(mesh.position, target, mesh.up);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);

    mesh.quaternion.slerp(
        quaternion,
        Math.min(1, Math.max(0.01, Number(rotationSpeed) * simParams.speedMultiplier))
    );
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
