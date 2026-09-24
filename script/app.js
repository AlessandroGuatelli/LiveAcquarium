import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
            scale: 2.0, // Ingranditi per essere più visibili
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
let particles, floorMesh; 
const clock = new THREE.Clock();
const simParams = { speedMultiplier: 1.0 };

const sharedGeometries = {
    cone: new THREE.ConeGeometry(0.5, 1, 8),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 16, 16)
};

// Funzione matematica assoluta per calcolare l'altezza delle dune 
// (Più sicura ed estremamente più veloce del Raycaster)
function getFloorHeight(worldX, worldZ) {
    const px = worldX;
    const py = -worldZ; // Inversione data dalla rotazione su X del piano
    
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
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.enableDamping = true;

    const hemiLight = new THREE.HemisphereLight(0x44aaff, 0x001133, 1.2);
    scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, defaultConfig.environment.ambient_light);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, defaultConfig.environment.directional_light);
    dirLight.position.set(50, 100, 50); 
    scene.add(dirLight);

    // Fondale Procedurale 
    const floorGeo = new THREE.PlaneGeometry(250, 250, 128, 128);
    const posAttribute = floorGeo.attributes.position;
    
    for (let i = 0; i < posAttribute.count; i++) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i);
        // Utilizziamo la stessa identica matematica della collisione
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

    // Sistema Particellare
    const particleCount = 1500;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    for(let i = 0; i < particleCount * 3; i++) particlePos[i] = (Math.random() - 0.5) * 200; 
    
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({ color: 0x88ffff, size: 0.2, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending });
    particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    fetch('config.json')
        .then(res => {
            if (!res.ok) throw new Error("File config.json non trovato.");
            return res.json();
        })
        .then(data => parseConfig(data))
        .catch(err => {
            console.warn(err.message + " Uso fallback.");
            parseConfig(defaultConfig);
        });

    window.addEventListener('resize', onWindowResize);
}

function parseConfig(config) {
    config.entities.forEach(entityDef => {
        for (let i = 0; i < entityDef.count; i++) {
            const entityGroup = new THREE.Group();
            
            if (entityDef.fallback_model && entityDef.fallback_model.parts) {
                const baseColor = entityDef.fallback_model.base_color;
                
                entityDef.fallback_model.parts.forEach(partDef => {
                    const geo = sharedGeometries[partDef.shape] || sharedGeometries.box;
                    const mat = new THREE.MeshStandardMaterial({ 
                        color: partDef.color || baseColor,
                        roughness: 0.3, metalness: 0.2
                    });
                    
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
            
            // Forza i coralli e i granchi sul fondale in modo infallibile
            if (entityDef.behavior.type === "bottom_crawl" || entityDef.behavior.type === "static") {
                startY = getFloorHeight(startX, startZ);
            } else {
                // Se è un pesce, assicurati che non nasca sepolto nella sabbia
                const floorY = getFloorHeight(startX, startZ);
                if (startY < floorY + 2) startY = floorY + 5;
            }
            
            entityGroup.position.set(startX, startY, startZ);
            
            // Randomizza la rotazione iniziale
            entityGroup.rotation.y = Math.random() * Math.PI * 2;
            
            scene.add(entityGroup);

            renderList.push({
                id: entityDef.id + "_" + i,
                tags: entityDef.tags || [],
                mesh: entityGroup,
                behavior: entityDef.behavior,
                target: entityGroup.position.clone(),
                seed: Math.random() * 100,
                timer: 0
            });
        }
    });
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
        
        if (behavior.type === "static") return;

        let speed = behavior.base_speed * simParams.speedMultiplier;
        let isOverridingTarget = false;
        const myRadius = behavior.collision_radius || 1.0;

        // Vettore direzionale corrente dell'oggetto
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);

        // --- GESTIONE DEI LIMITI CON RIMBALZO ELASTICO SUI BORDI ---
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

        // --- GESTIONE COLLISIONE CON IL FONDALE ---
        const floorY = getFloorHeight(mesh.position.x, mesh.position.z);
        
        if (behavior.type !== "bottom_crawl") {
            const minAllowedHeight = floorY + myRadius;
            if (mesh.position.y < minAllowedHeight) {
                // Spingi il pesce fuori dalla sabbia
                mesh.position.y = minAllowedHeight;
                
                // Se puntava verso il basso, inverti l'asse Y per farlo rimbalzare
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

        // --- SISTEMA DI COLLISIONE TRA MODELLI ---
        const pushVector = new THREE.Vector3(); 
        let closestDist = Infinity;
        let closestTarget = null;

        renderList.forEach(other => {
            if (other === entity) return;
            
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

        // --- AZIONI PREDATORE/PREDA ---
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
                if (target.y < fFloorY + 2) target.y = fFloorY + 5; // Evita di fuggire scavando
                
                speed *= 1.8; 
                isOverridingTarget = true;
            }
        }

        // --- SISTEMA DI MOVIMENTO ---
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
                if (!isOverridingTarget && entity.timer > (1 + Math.random())) {
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
                
                // Aggiorna l'altezza della sabbia e incolla il granchio
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
            if (entitiesToRemove.includes(entity.mesh)) {
                scene.remove(entity.mesh); 
                return false; 
            }
            return true;
        });
    }

    controls.update();
    renderer.render(scene, camera);
}

function setRandomTarget(targetVec, box) {
    const rx = (Math.random() - 0.5) * box.x;
    const rz = (Math.random() - 0.5) * box.z;
    let ry = (Math.random() - 0.5) * box.y;
    
    // Controlla l'altezza del fondale nel punto target e forza una Y superiore
    const tFloorY = getFloorHeight(rx, rz);
    if (ry < tFloorY + 2) {
        ry = tFloorY + 2 + Math.random() * 10;
    }
    
    targetVec.set(rx, ry, rz);
}

function steerTowards(mesh, targetPoint, rotationSpeed) {
    const targetRotation = new THREE.Matrix4().lookAt(mesh.position, targetPoint, mesh.up);
    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(targetRotation);
    mesh.quaternion.slerp(targetQuaternion, rotationSpeed * simParams.speedMultiplier);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}