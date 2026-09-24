import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// --- CONFIGURAZIONE DI FALLBACK INTERNA ---
const defaultConfig = {
    environment: {
        water_color: "#006994",
        fog_density: 0.005,
        ambient_light: 0.8,
        directional_light: 2.0
    },
    entities: [
        {
            id: "squalo_bianco",
            type: "fish",
            tags: ["predator"],
            count: 2,
            scale: 1.5,
            fallback_model: {
                base_color: "#7a8a9a",
                parts: [
                    { shape: "sphere", scale: [1, 1.2, 3.5], position: [0, 0, 0], rotation: [0, 0, 0] },
                    { shape: "cone", scale: [0.5, 2, 0.2], position: [0, 0, -2.5], rotation: [1.57, 0, 0] },
                    { shape: "cone", scale: [0.3, 1.2, 0.8], position: [0, 1.2, 0.5], rotation: [0, 0, 0] },
                    { shape: "cone", scale: [1.5, 0.2, 0.6], position: [0, -0.5, 1], rotation: [0, 0, 0] }
                ]
            },
            behavior: {
                type: "swim_random",
                base_speed: 0.12,
                rotation_speed: 0.05,
                bounding_box: { x: 140, y: 30, z: 140 },
                collision_radius: 3.0,
                hunting_radius: 40,
                eat_distance: 4.5,
                target_tags: ["prey"]
            }
        },
        {
            id: "pesce_pagliaccio",
            type: "fish",
            tags: ["prey"],
            count: 40,
            scale: 0.6,
            fallback_model: {
                base_color: "#ff7700",
                parts: [
                    { shape: "sphere", scale: [0.8, 1.5, 2], position: [0, 0, 0], rotation: [0, 0, 0] },
                    { shape: "cylinder", color: "#ffffff", scale: [0.85, 0.5, 1.8], position: [0, 0, 0.5], rotation: [1.57, 0, 0] },
                    { shape: "cone", scale: [0.1, 1, 0.8], position: [0, 0, -1.2], rotation: [1.57, 0, 0] }
                ]
            },
            behavior: {
                type: "zigzag",
                base_speed: 0.07,
                rotation_speed: 0.12,
                bounding_box: { x: 120, y: 25, z: 120 },
                collision_radius: 1.0,
                flee_radius: 30,
                flee_tags: ["predator"]
            }
        },
        {
            id: "granchio",
            type: "crustacean",
            tags: ["neutral"],
            count: 15,
            scale: 0.6,
            fallback_model: {
                base_color: "#cc3300",
                parts: [
                    { shape: "box", scale: [2, 0.8, 1.5], position: [0, 0.4, 0], rotation: [0, 0, 0] },
                    { shape: "cylinder", scale: [0.2, 1.5, 0.2], position: [1.2, 0, 0], rotation: [0, 0, 0.5] },
                    { shape: "cylinder", scale: [0.2, 1.5, 0.2], position: [-1.2, 0, 0], rotation: [0, 0, -0.5] },
                    { shape: "box", scale: [0.8, 0.8, 0.8], position: [0.8, 0.8, 1], rotation: [0, 0, 0] },
                    { shape: "box", scale: [0.8, 0.8, 0.8], position: [-0.8, 0.8, 1], rotation: [0, 0, 0] }
                ]
            },
            behavior: {
                type: "bottom_crawl",
                base_speed: 0.04,
                rotation_speed: 0.08,
                bounding_box: { x: 140, y: 0, z: 140 },
                collision_radius: 1.2
            }
        },
        {
            id: "corallo",
            type: "plant",
            tags: ["obstacle"],
            count: 40,
            scale: 2.0,
            fallback_model: {
                base_color: "#ff3366",
                parts: [
                    { shape: "cylinder", scale: [0.5, 3, 0.5], position: [0, 1.5, 0], rotation: [0, 0, 0] },
  
                  { shape: "cylinder", scale: [0.4, 2, 0.4], position: [0.8, 2, 0], rotation: [0, 0, -0.6] },
                    { shape: "cylinder", scale: [0.4, 2, 0.4], position: [-0.8, 1.5, 0.5], rotation: [0.5, 0, 0.5] },
                    { shape: "sphere", scale: [1, 1, 1], position: [0, 3.2, 0], rotation: [0, 0, 0], color: "#ff77aa" },
                    { shape: "sphere", scale: [0.8, 0.8, 0.8], position: [1.5, 2.8, 0], rotation: [0, 0, 0], color: "#ff77aa" }
                ]
            },
            behavior: {
                type: "static",
                bounding_box: { x: 180, y: 0, z: 180 },
                collision_radius: 2.5
            }
        }
    ]
};

// --- VARIABILI GLOBALI ---
let scene, camera, renderer, controls;
let renderList = []; 
let particles, floorMesh, ambientLightRef; 
const clock = new THREE.Clock();
const simParams = { speedMultiplier: 1.0, populationMultiplier: 1.0 };
let currentEnvironment = { ...defaultConfig.environment };

const sharedGeometries = {
    cone: new THREE.ConeGeometry(0.5, 1, 8),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 16, 16)
};

// Loader e cache dei modelli GLB: ogni file viene caricato una sola volta
const modelLoader = new GLTFLoader();
const modelCache = new Map();

// Cache dei materiali condivisi: riduce il numero di materiali e draw call
const materialCache = {};
function getMaterial(color) {
    if (!materialCache[color]) {
        materialCache[color] = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.2 });
    }
    return materialCache[color];
}

function getFloorHeight(worldX, worldZ) {
    const px = worldX;
    const py = -worldZ;
    const wave1 = Math.sin(px * 0.02) * 1.5;
    const wave2 = Math.cos(py * 0.03) * 2.0;
    const noise = Math.sin(px * 0.1 + py * 0.1) * 0.5; 
    return -18 + wave1 + wave2 + noise;
}

init();
animate();

function init() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(defaultConfig.environment.water_color);
    scene.fog = new THREE.FogExp2(defaultConfig.environment.water_color, defaultConfig.environment.fog_density);

    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 15, 80);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.enableDamping = true;
    // Limiti di zoom: la camera non può avvicinarsi troppo né allontanarsi oltre il fondale
    controls.minDistance = 10;
    controls.maxDistance = 180;

    const hemiLight = new THREE.HemisphereLight(0x44aaff, 0x001133, 1.2);
    scene.add(hemiLight);

    ambientLightRef = new THREE.AmbientLight(0xffffff, defaultConfig.environment.ambient_light);
    scene.add(ambientLightRef);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, defaultConfig.environment.directional_light);
    dirLight.position.set(50, 100, 50); 
    scene.add(dirLight);

    // Fondale Procedurale 
    const floorGeo = new THREE.PlaneGeometry(250, 250, 128, 128);
    const posAttribute = floorGeo.attributes.position;
    
    for (let i = 0; i < posAttribute.count; i++) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i);
        const wave1 = Math.sin(x * 0.02) * 1.5;
        const wave2 = Math.cos(y * 0.03) * 2.0;
        const noise = Math.sin(x * 0.1 + y * 0.1) * 0.5; 
        posAttribute.setZ(i, wave1 + wave2 + noise);
    }
    
    floorGeo.computeVertexNormals();
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xe0cda9, roughness: 0.8, metalness: 0.1 });
 
   floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -18;
    scene.add(floorMesh);

    // Particelle
    const particleCount = 1500;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    for(let i = 0; i < particleCount * 3; i++) particlePos[i] = (Math.random() - 0.5) * 200; 
    
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({ color: 0x88ffff, size: 0.2, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
    particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Fetch del JSON con fallback automatico
    fetch('config.json')
        .then(res => {
            if (!res.ok) throw new Error("File config.json non trovato.");
            return res.json();
        })
        .then(async data => {
            applyEnvironment(data.environment);
            await parseConfig(data);
            setupUI();
        })
        .catch(async err => {
            console.warn(err.message + " Uso fallback.");
            applyEnvironment(defaultConfig.environment);
            await parseConfig(defaultConfig);
            setupUI();
        });

    window.addEventListener('resize', onWindowResize);
}

function applyEnvironment(environment = {}) {
    currentEnvironment = {
        ...defaultConfig.environment,
        ...environment
    };

    const waterColor = new THREE.Color(currentEnvironment.water_color);
    scene.background = waterColor;
    scene.fog.color = waterColor;
    scene.fog.density = Number(currentEnvironment.fog_density) || defaultConfig.environment.fog_density;

    if (ambientLightRef) {
        ambientLightRef.intensity = Number(currentEnvironment.ambient_light) || defaultConfig.environment.ambient_light;
    }
}

async function parseConfig(config) {
    const entityAssets = await Promise.all(
        config.entities.map(async entityDef => ({
            entityDef,
            modelAsset: await loadModelAsset(entityDef.model)
        }))
    );

    entityAssets.forEach(({ entityDef, modelAsset }) => {
        for (let i = 0; i < entityDef.count; i++) {
            const entityGroup = new THREE.Group();
            let mixer = null;

            if (modelAsset) {
                const model = SkeletonUtils.clone(modelAsset.scene);
                const modelConfig = entityDef.model || {};

                if (Array.isArray(modelConfig.position)) {
                    model.position.set(...modelConfig.position);
                }
                if (Array.isArray(modelConfig.rotation)) {
                    model.rotation.set(...modelConfig.rotation);
                }
                if (Array.isArray(modelConfig.scale)) {
                    model.scale.set(...modelConfig.scale);
                }

                entityGroup.add(model);

                if (modelAsset.animations?.length) {
                    mixer = new THREE.AnimationMixer(model);
                    const animationName = modelConfig.animation;
                    const clip = animationName
                        ? THREE.AnimationClip.findByName(modelAsset.animations, animationName)
                        : modelAsset.animations[0];

                    if (clip) {
                        mixer.clipAction(clip).play();
                    }
                }
            } else if (entityDef.fallback_model?.parts) {
                const baseColor = entityDef.fallback_model.base_color;

                entityDef.fallback_model.parts.forEach(partDef => {
                    const geo = sharedGeometries[partDef.shape] || sharedGeometries.box;
                    const mat = getMaterial(partDef.color || baseColor);

                    const partMesh = new THREE.Mesh(geo, mat);

                    if (partDef.scale) partMesh.scale.set(...partDef.scale);

                    if (partDef.position) partMesh.position.set(...partDef.position);
                    if (partDef.rotation) partMesh.rotation.set(...partDef.rotation);

                    entityGroup.add(partMesh);
                });
            }

            entityGroup.scale.setScalar(entityDef.scale || 1.0);

            const box = entityDef.behavior.bounding_box;
            const startX = (Math.random() - 0.5) * box.x;
            const startZ = (Math.random() - 0.5) * box.z;

            let startY = (Math.random() - 0.5) * box.y;
            if (entityDef.behavior.type === "bottom_crawl" || entityDef.behavior.type === "static") {
                startY = getFloorHeight(startX, startZ);
            } else {
                const floorY = getFloorHeight(startX, startZ);
                if (startY < floorY + 2) startY = floorY + 5;
            }

            entityGroup.position.set(startX, startY, startZ);
            entityGroup.rotation.y = Math.random() * Math.PI * 2;

            scene.add(entityGroup);

            renderList.push({
                id: entityDef.id,
                type: entityDef.type,
                tags: entityDef.tags || [],
                mesh: entityGroup,
                behavior: entityDef.behavior,
                target: entityGroup.position.clone(),
                seed: Math.random() * 100,
                timer: 0,
                zigzagPeriod: 1 + Math.random() * 2,
                mixer
            });
        }
    });
}

async function loadModelAsset(modelDefinition) {
    const modelPath = typeof modelDefinition === "string"
        ? modelDefinition
        : modelDefinition?.path;

    if (!modelPath) return null;

    if (!modelCache.has(modelPath)) {
        const loadPromise = modelLoader.loadAsync(modelPath).catch(error => {
            console.warn(`Impossibile caricare il modello "${modelPath}". Uso il fallback procedurale.`, error);
            return null;
        });
        modelCache.set(modelPath,
 loadPromise);
    }

    return modelCache.get(modelPath);
}

// --- SETUP CONTROLLI UI (SLIDER E COLOR PICKER) ---
function setupUI() {
    // 1. Moltiplicatore Pesci
    const fishScaleInput = document.getElementById('fishScale');
    if (fishScaleInput) {
        fishScaleInput.addEventListener('input', (e) => {
            simParams.populationMultiplier = e.target.value / 100;
            document.getElementById('valFish').innerText = simParams.populationMultiplier.toFixed(1) + "x";
            
            // Conta quanti elementi ci sono per tipo e mostra/nascondi in base al moltiplicatore
            const typeCounts = {};
            renderList.forEach(entity => {
                if (entity.type === "fish") {
                    if (!typeCounts[entity.id]) typeCounts[entity.id] = [];
                    typeCounts[entity.id].push(entity);
                }
            });

            Object.keys(typeCounts).forEach(id => {
                const group = typeCounts[id];
                const targetVisibleCount = Math.max(0, Math.min(
                    group.length,
                    Math.round(group.length * simParams.populationMultiplier)
                ));
                group.forEach((entity, index) => {
                    const shouldBeVisible = index < targetVisibleCount;
                    entity.mesh.visible = shouldBeVisible;
                });
            });
        });
    }

    // 2. Velocità di Nuoto
    const swimSpeedInput = document.getElementById('swimSpeed');
    if (swimSpeedInput) {
        swimSpeedInput.addEventListener('input', (e) => {
            simParams.speedMultiplier = e.target.value / 100;
            document.getElementById('valSpeed').innerText = simParams.speedMultiplier.toFixed(1) + "x";
        });
    }

    // 3. Luce Ambiente
    const lightInput = document.getElementById('lightIntensity');
    if (lightInput && ambientLightRef) {
        lightInput.addEventListener('input', (e) => {
            ambientLightRef.intensity = (e.target.value / 100) * Number(currentEnvironment.ambient_light);
        });
    }

    // 4. Colore Acqua / Nebbia
    const colorInput = document.getElementById('waterColor');
    if (colorInput) {
        colorInput.addEventListener('input', (e) => {
            const newColor = new THREE.Color(e.target.value);
            scene.background = newColor;
            scene.fog.color = newColor;
        });
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    if (particles) {
        particles.rotation.y = time * 0.01;
        particles.position.y = Math.sin(time * 0.2) * 2; 
    }

    const entitiesToRemove = [];

    renderList.forEach(entity => {
        const { mesh, behavior, target, tags } = entity;

        if (entity.mixer) {
            entity.mixer.update(delta);
        }
        
        // Se il pesce è nascosto via UI, saltiamo i calcoli fisici e di movimento
        if (!mesh.visible) return;
        if (behavior.type === "static") return;

        let speed = behavior.base_speed * simParams.speedMultiplier;
        let isOverridingTarget = false;
        const myRadius = behavior.collision_radius || 1.0;

        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);

        const halfX = behavior.bounding_box.x / 2;
        const halfZ = behavior.bounding_box.z / 2;
        let hitWall = false;

        if (Math.abs(mesh.position.x) > halfX) {
            forward.x *= -1; 
            mesh.position.x = Math.sign(mesh.position.x) * halfX; 
            hitWall = true;
        }
        if (Math.abs(mesh.position.z) > halfZ) {
            forward.z *= -1;
            mesh.position.z = Math.sign(mesh.position.z) * halfZ;
            hitWall = true;
        }

        const floorY = getFloorHeight(mesh.position.x, mesh.position.z);
        
        if (behavior.type !== "bottom_crawl") {
            const minAllowedHeight = floorY + myRadius;
            if (mesh.position.y < minAllowedHeight) {
                mesh.position.y = minAllowedHeight;
                if (forward.y < 0) {
                    forward.y *= -1;
                    hitWall = true; 
                }
            }
        }

        if (hitWall) {
            target.copy(mesh.position).add(forward.multiplyScalar(20));
            mesh.lookAt(target);
            isOverridingTarget = true;
        }

        const pushVector = new THREE.Vector3(); 
        let closestDist = Infinity;
        let closestTarget = null;

        renderList.forEach(other => {
            if (other === entity || !other.mesh.visible) return;
            
            const dist = mesh.position.distanceTo(other.mesh.position);
            const otherRadius = other.behavior.collision_radius || 1.0;
            const minAllowedDist = myRadius + otherRadius;

            if (dist < minAllowedDist && dist > 0.01) {
                const overlap = minAllowedDist - dist;
                const awayVector = new THREE.Vector3().subVectors(mesh.position, other.mesh.position).normalize();
                
                if (other.behavior.type === "static") {
                    pushVector.add(awayVector.multiplyScalar(overlap));
                } else {
                    pushVector.add(awayVector.multiplyScalar(overlap * 0.5));
                }
            }
            
            if (!hitWall) {
                const isPrey = behavior.target_tags && behavior.target_tags.some(tag => other.tags.includes(tag));
                const isPredator = behavior.flee_tags && behavior.flee_tags.some(tag => other.tags.includes(tag));
                
                if (isPrey || isPredator) {
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestTarget = { mesh: other.mesh, isPrey, isPredator };
                    }
                }
            }
        });

        if (pushVector.lengthSq() > 0) {
            mesh.position.add(pushVector);
            target.add(pushVector); 
        }

        if (closestTarget && !hitWall) {
            if (closestTarget.isPrey && closestDist < behavior.hunting_radius) {
                if (closestDist <= behavior.eat_distance) {
                    if (!entitiesToRemove.includes(closestTarget.mesh)) entitiesToRemove.push(closestTarget.mesh);
                } else {
                    target.copy(closestTarget.mesh.position);
                    speed *= 1.5; 
                    isOverridingTarget = true;
                }
            }
            
            if (closestTarget.isPredator && closestDist < behavior.flee_radius) {
                const fleeVector = new THREE.Vector3().subVectors(mesh.position, closestTarget.mesh.position).normalize();
                target.copy(mesh.position).add(fleeVector.multiplyScalar(15));
                
                const fFloorY = getFloorHeight(target.x, target.z);
                if (target.y < fFloorY + 2) target.y = fFloorY + 5;
                
                speed *= 1.8; 
                isOverridingTarget = true;
            }
        }

        switch (behavior.type) {
            case "swim_random":
                if (!isOverridingTarget && mesh.position.distanceTo(target) < 5) {
                    setRandomTarget(target, behavior.bounding_box);
                }
                steerTowards(mesh, target, behavior.rotation_speed);
                mesh.translateZ(speed);
                mesh.rotation.z = Math.sin(time * 3 + entity.seed) * 0.1;
                break;

            case "zigzag":
                entity.timer += delta;
                if (!isOverridingTarget && entity.timer > entity.zigzagPeriod) {
                    entity.timer = 0;
      
              setRandomTarget(target, behavior.bounding_box);
                }
                steerTowards(mesh, target, behavior.rotation_speed);
                mesh.translateZ(speed);
                break;

            case "bottom_crawl":
                if (!isOverridingTarget && mesh.position.distanceTo(target) < 3) {
                    setRandomTarget(target, behavior.bounding_box);
                }
                mesh.position.y = floorY + (myRadius * 0.4); 
                target.y = floorY; 
                steerTowards(mesh, target, behavior.rotation_speed);
                mesh.translateZ(speed);
                mesh.rotation.x = 0;
                mesh.rotation.z = 0;
                break;
        }
    });

    if (entitiesToRemove.length > 0) {
        renderList = renderList.filter(entity => {
            if (!entitiesToRemove.includes(entity.mesh)) return true;

            // Le prede riappaiono in un punto casuale: l'ecosistema resta in equilibrio
            if (entity.tags.includes("prey")) {
                const box = entity.behavior.bounding_box;
                const rx = (Math.random() - 0.5) * box.x;
                const rz = (Math.random() - 0.5) * box.z;
                let ry = (Math.random() - 0.5) * box.y;
                const fY = getFloorHeight(rx, rz);
                if (ry < fY + 2) ry = fY + 5;
                entity.mesh.position.set(rx, ry, rz);
                entity.target.copy(entity.mesh.position);
                entity.mesh.visible = true;
                return true;
            }

            scene.remove(entity.mesh);
            return false;
        });
    }

    controls.update();
    renderer.render(scene, camera);
}

function setRandomTarget(targetVec, box) {
    const rx = (Math.random() - 0.5) * box.x;
    const rz = (Math.random() - 0.5) * box.z;
    let ry = (Math.random() - 0.5) * box.y;
    
    const tFloorY = getFloorHeight(rx, rz);
    if (ry
 < tFloorY + 2) {
        ry = tFloorY + 2 + Math.random() * 10;
    }
    targetVec.set(rx, ry, rz);
}

function steerTowards(mesh, targetPoint, rotationSpeed) {
    const targetRotation = new THREE.Matrix4().lookAt(mesh.position, targetPoint, mesh.up);
    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(targetRotation);
    mesh.quaternion.slerp(
        targetQuaternion,
        Math.min(1, Math.max(0, rotationSpeed * simParams.speedMultiplier))
    );
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
