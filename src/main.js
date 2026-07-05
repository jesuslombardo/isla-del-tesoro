import * as THREE from 'three';
import { World, SPAWN, CAVE, terrainHeightAt } from './world.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { TouchControls } from './touch.js';
import { PISTAS, isCorrect } from './puzzles.js';

// Detección de dispositivo táctil (celular/tablet)
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ============================================================================
//  La Isla del Tesoro
//  Mundo 1: isla navegable en 3D. Pistas encadenadas (1 = cueva, 2 = volcán...).
// ============================================================================

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 600);

const world = new World(scene);
const player = new Player(camera, canvas, world);
player.mobile = IS_TOUCH;
scene.add(player.object);

const hud = new HUD();
const touch = IS_TOUCH ? new TouchControls(player) : null;
const actionBtn = document.getElementById('action-btn');

// ¿El juego está aceptando input ahora mismo?
function playing() {
  return state.started && !state.modalOpen && !state.won && !state.over &&
    (player.mobile || player.controls.isLocked);
}

const state = {
  lives: 3,
  started: false,
  currentPista: 0, // índice de la pista activa
  read: [], // read[idx] = inscripción leída
  solved: [], // solved[idx] = pista resuelta
  won: false,
  over: false,
  modalOpen: false,
  active: null,
  safePos: SPAWN.clone(),
};
let hintIdx = 0; // índice de pista/hint mostrada en el acertijo actual

// ---------------------------------------------------------------- interacción
function handleInteract(it) {
  // Solo se puede interactuar con la pista activa
  if (it.pistaIdx !== state.currentPista) {
    hud.toast('Todavía no es momento para esto. Seguí la pista actual.');
    return;
  }
  const pista = PISTAS[it.pistaIdx];
  if (it.kind === 'inscription') {
    state.read[it.pistaIdx] = true;
    openModal(() => hud.showClue(pista.inscription));
    hud.setObjective('Volvé al cofre y respondé con la palabra clave.');
  } else if (it.kind === 'chest') {
    if (state.solved[it.pistaIdx]) { hud.toast('Ese cofre ya está abierto ✅'); return; }
    hintIdx = 0;
    openModal(() =>
      hud.showRiddle(pista, {
        onSubmit: () => submitRiddle(pista, it.pistaIdx),
        onHint: () => showRiddleHint(pista),
      })
    );
  }
}

function submitRiddle(pista, idx) {
  const val = hud.el.riddleInput.value;
  if (!val.trim()) return;
  if (!isCorrect(pista, val)) {
    hud.riddleFeedback(false, 'No es la palabra. Probá de nuevo o pedí una pista 💡');
    return;
  }
  hud.riddleFeedback(true, '¡Correcto! 🗝️');
  state.solved[idx] = true;
  world.openChest(idx);
  world.hideBeacon(idx);
  setTimeout(() => onPistaSolved(pista, idx), 900);
}

function onPistaSolved(pista, idx) {
  const isLast = idx + 1 >= PISTAS.length;
  if (isLast) {
    // Última pista implementada: pantalla de victoria (fin de lo jugable)
    hud.hideRiddle();
    state.won = true;
    state.modalOpen = true;
    if (player.controls.isLocked) player.controls.unlock();
    hud.showWin(pista.solvedText);
    return;
  }
  // Avanza a la próxima pista: muestra el botín y actualiza el objetivo.
  state.currentPista = idx + 1;
  world.showBeacon(idx + 1);
  hud.setObjective(pista.nextObjective);
  // Sustituye el acertijo por el pergamino del botín (el modal sigue abierto).
  hud.hideRiddle();
  hud.showClue(pista.solvedText + '\n\n➡ ' + pista.nextObjective);
}

function showRiddleHint(pista) {
  const h = pista.hints[Math.min(hintIdx, pista.hints.length - 1)];
  hintIdx++;
  hud.riddleFeedback(true, '💡 ' + h);
}

// --------------------------------------------------------- modales / puntero
function openModal(show) {
  state.modalOpen = true;
  if (!player.mobile && player.controls.isLocked) player.controls.unlock();
  show();
}
function closeModal(hide) {
  hide();
  state.modalOpen = false;
  if (!player.mobile && state.started && !state.won && !state.over) player.controls.lock();
}

// ------------------------------------------------------------------ peligros
function onDanger(msg) {
  if (state.over || state.won) return;
  state.lives -= 1;
  hud.setLives(state.lives);
  hud.flashDamage();
  hud.toast('💔 ' + msg + '  (-1 vida)');
  if (state.lives <= 0) {
    state.over = true;
    state.modalOpen = true;
    if (!player.mobile && player.controls.isLocked) player.controls.unlock();
    hud.showGameOver();
  } else {
    player.spawn(state.safePos);
  }
}

// ------------------------------------------------------------------ arranque
function startGame() {
  state.started = true;
  hud.showHUD();
  hud.setLives(state.lives);
  hud.setObjective('Explorá la isla y encontrá la cueva (seguí el haz de luz).');
  hud.el.intro.classList.add('hidden');
  player.enabled = true;
  player.spawn(SPAWN);
  player.lookAt(CAVE);
  if (player.mobile) touch.enable();
  else player.controls.lock();
}

function restart() { window.location.reload(); }

// --------------------------------------------------------------- event wiring
// Muestra las instrucciones acordes al dispositivo
if (IS_TOUCH) {
  document.getElementById('controls-desktop').classList.add('hidden');
  document.getElementById('controls-mobile').classList.remove('hidden');
}

hud.el.startBtn.addEventListener('click', startGame);
// Botón de acción táctil: interactúa con lo que esté en rango
actionBtn.addEventListener('click', () => {
  if (state.active && !state.modalOpen) handleInteract(state.active);
});
hud.el.resumeBtn.addEventListener('click', () => {
  hud.hideResume();
  player.controls.lock();
});
hud.el.clueClose.addEventListener('click', () => closeModal(() => hud.hideClue()));
hud.el.riddleSubmit.addEventListener('click', () => {
  const p = PISTAS[state.currentPista];
  submitRiddle(p, state.currentPista);
});
hud.el.riddleHint.addEventListener('click', () => showRiddleHint(PISTAS[state.currentPista]));
hud.el.riddleClose.addEventListener('click', () => closeModal(() => hud.hideRiddle()));
hud.el.riddleInput.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') submitRiddle(PISTAS[state.currentPista], state.currentPista);
});
hud.el.winRestart.addEventListener('click', restart);
hud.el.gameoverRestart.addEventListener('click', restart);

// Botón global de pista (contextual a la pista activa)
hud.el.hintBtn.addEventListener('click', () => {
  if (state.won || state.over) return;
  const idx = state.currentPista;
  const pista = PISTAS[idx];
  if (state.solved[idx]) return;
  if (!state.read[idx]) {
    hud.toast('💡 Buscá la inscripción de ' + pista.place + ' y leela primero.');
  } else {
    hud.toast('💡 ' + pista.hints[0]);
  }
});

// Tecla E: interactuar con lo que esté en rango
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && state.active && !state.modalOpen && player.controls.isLocked) {
    handleInteract(state.active);
  }
});

player.controls.addEventListener('unlock', () => {
  if (state.started && !state.modalOpen && !state.won && !state.over) hud.showResume();
});
player.controls.addEventListener('lock', () => hud.hideResume());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --------------------------------------------------------- detección de rango
function updateInteraction() {
  if (!playing()) { hud.hidePrompt(); actionBtn.classList.add('hidden'); state.active = null; return; }
  const p = player.object.position;
  let best = null;
  let bestD = Infinity;
  for (const it of world.interactables) {
    if (it.pistaIdx !== state.currentPista) continue; // solo la pista activa
    if (it.kind === 'chest' && state.solved[it.pistaIdx]) continue;
    const d = Math.hypot(p.x - it.position.x, p.z - it.position.z);
    if (d < it.radius && d < bestD) { best = it; bestD = d; }
  }
  state.active = best;
  if (best) {
    // En celular el prompt dice "tocá el botón"; en desktop dice [E]
    hud.showPrompt(player.mobile ? best.prompt.replace('Presioná [E]', 'Tocá ✋') : best.prompt);
    if (player.mobile) actionBtn.classList.remove('hidden');
  } else {
    hud.hidePrompt();
    actionBtn.classList.add('hidden');
  }
}

// Último punto seguro (para respawnear tras un peligro)
function updateSafePos() {
  const p = player.object.position;
  if (terrainHeightAt(p.x, p.z) < 1.3) return;
  for (const tr of world.traps) {
    if (Math.hypot(p.x - tr.x, p.z - tr.z) < tr.r + 2) return;
  }
  state.safePos.set(p.x, 0, p.z);
}

// ------------------------------------------------------------------ game loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  world.update(dt);
  if (state.started && !state.modalOpen && !state.won && !state.over) {
    player.update(dt, { onDanger });
    updateSafePos();
  }
  updateInteraction();
  renderer.render(scene, camera);
}
animate();

// Debug/pruebas
window.__isla = {
  state, world, player, PISTAS,
  interact: (id) => {
    const it = world.interactables.find((i) => i.id === id);
    if (it) handleInteract(it);
  },
};
