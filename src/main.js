import * as THREE from 'three';
import { World, SPAWN, CAVE, VOLCANO, LAKE, DRAGON, MOUNTAIN, SPAWN2, MINE } from './world.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { TouchControls } from './touch.js';
import { GameAudio } from './audio.js';
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

let world = new World(scene);
const player = new Player(camera, canvas, world);
player.mobile = IS_TOUCH;
scene.add(player.object);

const hud = new HUD();
const touch = IS_TOUCH ? new TouchControls(player) : null;
const audio = new GameAudio();
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
  diamonds: 0, // "plata" que se gana resolviendo pistas
  stars: 0,
  world: 1, // 1 = isla, 2 = bosque
};
const worldOf = (pista) => (pista.num <= 4 ? 1 : 2);
let hintIdx = 0; // índice de pista/hint mostrada en el acertijo actual

// ---------------------------------------------------------------- interacción
function handleInteract(it) {
  // Solo se puede interactuar con la pista activa
  if (it.pistaIdx !== state.currentPista) {
    hud.toast('Todavía no es momento para esto. Seguí la pista actual.');
    return;
  }
  if (it.kind === 'portal') { enterMundo2(); return; }
  if (it.kind === 'treasure') { grandFinale(); return; }
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
  audio.chestOpen();
  // Recompensa: diamantes + una estrella por pista resuelta
  state.diamonds += 30;
  state.stars += 1;
  updateWealth();
  hud.toast('🏆 +30 💎  +1 ⭐');
  setTimeout(() => onPistaSolved(pista, idx), 900);
}

function onPistaSolved(pista, idx) {
  const next = PISTAS[idx + 1];
  state.currentPista = idx + 1;
  hud.hideRiddle();
  if (!next) {
    // Resolviste la última pista con acertijo (el castillo): aparece el tesoro
    // final. La victoria real es abrir el cofre del tesoro.
    world.showTreasureBeacon();
    hud.setObjective(pista.nextObjective);
    hud.showClue(pista.solvedText + '\n\n➡ ' + pista.nextObjective);
    return;
  }
  if (worldOf(next) !== worldOf(pista)) {
    // Cruce de mundo: se enciende el portal de la montaña (la baliza de la
    // próxima pista está en el otro mundo).
    world.showPortalBeacon();
  } else {
    world.showBeacon(idx + 1);
  }
  hud.setObjective(pista.nextObjective);
  hud.showClue(pista.solvedText + '\n\n➡ ' + pista.nextObjective);
}

// Abrir el cofre del tesoro = final del juego.
function grandFinale() {
  audio.chestOpen();
  state.won = true;
  state.modalOpen = true;
  if (!player.mobile && player.controls.isLocked) player.controls.unlock();
  const h1 = document.querySelector('#win h1');
  const sub = document.querySelector('#win .subtitle');
  if (h1) h1.textContent = '🏆 ¡GANASTE! Encontraste el tesoro';
  if (sub) sub.textContent = '¡Completaste La Isla del Tesoro! 🏴‍☠️ Gracias por jugar. 🎉';
  hud.showWin(
    'Girás la llave y el cofre se abre en un destello: adentro brillan montañas ' +
    'de oro, joyas y la corona pirata. Tu plata final: 💎 ' + state.diamonds +
    '  ⭐ ' + state.stars + '. ¡La aventura está completa!'
  );
}

// Cruzar el portal de la montaña: cambia todo el escenario al Mundo 2 (bosque).
function enterMundo2() {
  hud.toast('🌲 Entrando al Mundo 2...');
  world.dispose();
  world = new World(scene, 'bosque');
  player.world = world;
  state.world = 2;
  player.spawn(SPAWN2);
  player.lookAt(MINE);
  state.safePos.copy(SPAWN2);
  lastStepX = SPAWN2.x; lastStepZ = SPAWN2.z;
  hud.setObjective('Estás en el bosque (Mundo 2). Buscá el CARRITO MINERO (seguí el haz de luz).');
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
  document.querySelectorAll('.hud-btn').forEach((b) => b.classList.remove('hidden'));
  hud.setLives(state.lives);
  updateWealth();
  hud.setObjective('Explorá la isla y encontrá la cueva (seguí el haz de luz).');
  hud.el.intro.classList.add('hidden');
  player.enabled = true;
  player.spawn(SPAWN);
  player.lookAt(CAVE);
  audio.init();
  audio.resume();
  audio.startAmbient();
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

// Desbloqueo de audio en celular: cualquier toque/click reactiva el contexto
// (iOS/Android exigen un gesto del usuario para que suene).
function unlockAudio() { audio.init(); audio.resume(); }
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('touchend', unlockAudio);
// Botón de acción táctil: interactúa con lo que esté en rango
actionBtn.addEventListener('click', () => {
  if (state.active && !state.modalOpen) handleInteract(state.active);
});
hud.el.resumeBtn.addEventListener('click', () => {
  hud.hideResume();
  audio.resume();
  player.controls.lock();
});

// Botón de sonido (mute / unmute)
const soundBtn = document.getElementById('sound-btn');
soundBtn.addEventListener('click', () => {
  const m = !audio.muted;
  audio.setMuted(m);
  soundBtn.textContent = m ? '🔇' : '🔊';
});

// ---------------------------------------------------------------- celular
const phoneEl = document.getElementById('phone');
const phoneHome = document.getElementById('phone-home');
const phoneApp = document.getElementById('phone-app');
const phoneAppTitle = document.getElementById('phone-app-title');
const phoneAppBody = document.getElementById('phone-app-body');

function openPhone() {
  if (!state.started || state.won || state.over) return;
  showPhoneHome();
  openModal(() => phoneEl.classList.remove('hidden'));
}
function showPhoneHome() { phoneApp.classList.add('hidden'); phoneHome.classList.remove('hidden'); }

function showApp(name) {
  phoneHome.classList.add('hidden');
  phoneApp.classList.remove('hidden');
  if (name === 'vidas') {
    phoneAppTitle.textContent = '❤️ Vidas';
    phoneAppBody.innerHTML =
      `<div class="stat-big">${'❤️'.repeat(state.lives)}${'🖤'.repeat(Math.max(0, 3 - state.lives))}</div>` +
      `<p>Te quedan <b>${state.lives}</b> de 3 vidas.</p>` +
      `<p style="font-size:13px;margin-top:10px">Se pierden solo por peligros (mar, trampas, el fuego del dragón).</p>`;
  } else if (name === 'plata') {
    phoneAppTitle.textContent = '💎 Plata';
    phoneAppBody.innerHTML =
      `<div class="stat-big">💎 ${state.diamonds}</div><div class="stat-big">⭐ ${state.stars}</div>` +
      `<p>Ganás <b>diamantes</b> y <b>estrellas</b> resolviendo pistas.</p>` +
      `<p style="font-size:13px;margin-top:10px">Pronto vas a poder gastarlos en la tienda de personajes y fondos.</p>`;
  } else if (name === 'mapa') {
    phoneAppTitle.textContent = state.world === 2 ? '🗺️ Mapa · Mundo 2' : '🗺️ Mapa · Mundo 1';
    phoneAppBody.innerHTML = state.world === 2 ? buildMapSVG2() : buildMapSVG();
  }
}

function buildMapSVG2() {
  const toX = (x) => 110 + x * 1.1;
  const toY = (z) => 115 + z * 0.78;
  const pts = [
    { x: 0, z: -28, e: '⛏️', label: 'Mina / carrito', idx: 4 },
    { x: 40, z: 4, e: '🌴', label: 'Palmera', idx: 5 },
    { x: -40, z: 2, e: '🏚️', label: 'Casa embrujada', idx: 6 },
    { x: 0, z: 50, e: '🏰', label: 'Castillo', idx: 7 },
    { x: 0, z: 84, e: '💎', label: 'Tesoro', idx: 8 },
  ];
  let pines = '';
  const seedPts = [[35, 50], [180, 60], [60, 175], [175, 175], [150, 40], [40, 130]];
  for (const [px, py] of seedPts) pines += `<text x="${px}" y="${py}" font-size="16" text-anchor="middle">🌲</text>`;
  let markers = '', legend = '';
  for (const m of pts) {
    const x = toX(m.x), y = toY(m.z);
    const done = state.solved[m.idx];
    const cur = state.currentPista === m.idx;
    const ring = done ? '#2e7d32' : cur ? '#e8a91b' : '#ffffff';
    markers += `<circle cx="${x}" cy="${y}" r="11" fill="rgba(255,255,255,.92)" stroke="${ring}" stroke-width="3"/>`;
    markers += `<text x="${x}" y="${y + 5}" font-size="13" text-anchor="middle">${m.e}</text>`;
    if (done) markers += `<text x="${x + 9}" y="${y - 6}" font-size="11" text-anchor="middle">✅</text>`;
    legend += `<div>${m.e} ${m.label} ${done ? '✅' : cur ? '⟵ estás acá' : ''}</div>`;
  }
  return `<svg class="map-svg" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
    <rect width="220" height="220" rx="12" fill="#24352b"/>
    ${pines}${markers}
  </svg><div class="map-legend">${legend}</div>`;
}

function buildMapSVG() {
  const toX = (x) => 110 + x * 1.05;
  const toY = (z) => 110 + z * 1.05;
  const pts = [
    { p: SPAWN, e: '🏴‍☠️', label: 'Barco (inicio)', idx: -1 },
    { p: CAVE, e: '🕳️', label: 'Cueva', idx: 0 },
    { p: VOLCANO, e: '🌋', label: 'Volcán', idx: 1 },
    { p: LAKE, e: '🌊', label: 'Lago', idx: 2 },
    { p: DRAGON, e: '🐉', label: 'Dragón', idx: 3 },
  ];
  let markers = '';
  let legend = '';
  for (const m of pts) {
    const x = toX(m.p.x);
    const y = toY(m.p.z);
    const done = m.idx >= 0 && state.solved[m.idx];
    const current = m.idx === state.currentPista;
    const ring = done ? '#2e7d32' : current ? '#e8a91b' : '#ffffff';
    markers += `<circle cx="${x}" cy="${y}" r="11" fill="rgba(255,255,255,.92)" stroke="${ring}" stroke-width="3"/>`;
    markers += `<text x="${x}" y="${y + 5}" font-size="13" text-anchor="middle">${m.e}</text>`;
    if (done) markers += `<text x="${x + 9}" y="${y - 6}" font-size="11" text-anchor="middle">✅</text>`;
    if (m.idx >= 0) legend += `<div>${m.e} ${m.label} ${done ? '✅' : current ? '⟵ estás acá' : ''}</div>`;
    else legend += `<div>${m.e} ${m.label}</div>`;
  }
  return `<svg class="map-svg" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
    <rect width="220" height="220" rx="12" fill="#2e7fb5"/>
    <ellipse cx="110" cy="110" rx="98" ry="96" fill="#e8dcab"/>
    <ellipse cx="110" cy="110" rx="82" ry="80" fill="#6da34d"/>
    ${markers}
  </svg><div class="map-legend">${legend}</div>`;
}

document.getElementById('phone-btn').addEventListener('click', openPhone);
document.getElementById('phone-exit').addEventListener('click', () => closeModal(() => phoneEl.classList.add('hidden')));
document.getElementById('phone-back').addEventListener('click', showPhoneHome);
for (const btn of document.querySelectorAll('.app')) {
  btn.addEventListener('click', () => showApp(btn.dataset.app));
}
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

function updateWealth() {
  document.getElementById('wealth').textContent = `💎 ${state.diamonds}   ⭐ ${state.stars}`;
}

// Juntar monedas y estrellas al caminarles encima
function checkCollectibles() {
  if (!world.collectibles) return;
  const p = player.object.position;
  for (const c of world.collectibles) {
    if (c.taken) continue;
    if (Math.hypot(p.x - c.x, p.z - c.z) < 1.7) {
      c.taken = true;
      c.group.visible = false;
      if (c.type === 'coin') { state.diamonds += c.value; audio.coin(false); }
      else { state.stars += c.value; audio.coin(true); }
      updateWealth();
      hud.toast(c.type === 'coin' ? `💎 +${c.value}` : '⭐ +1  ¡Estrella!', 1200);
    }
  }
}

// El esqueleto del castillo persigue al jugador mientras la Pista 8 está activa.
function updateSkeleton(dt) {
  const sk = world.skeleton;
  if (!sk) return;
  const active = state.currentPista === 7 && !state.solved[7];
  if (!active) { sk.group.visible = false; return; }
  sk.group.visible = true;
  const p = player.object.position;
  const near = Math.hypot(p.x - sk.homeX, p.z - sk.homeZ) < 36;
  if (near) {
    const dx = p.x - sk.x, dz = p.z - sk.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.1) { const s = 4.6 * dt; sk.x += (dx / d) * s; sk.z += (dz / d) * s; }
    sk.group.rotation.y = Math.atan2(dx, dz);
    if (d < 1.8 && player._justRespawned <= 0) {
      onDanger('¡El esqueleto te atrapó! 💀');
      sk.x = sk.homeX; sk.z = sk.homeZ;
    }
  } else {
    const dx = sk.homeX - sk.x, dz = sk.homeZ - sk.z, d = Math.hypot(dx, dz);
    if (d > 0.2) { const s = 3 * dt; sk.x += (dx / d) * s; sk.z += (dz / d) * s; }
  }
  sk.group.position.set(sk.x, world.heightAt(sk.x, sk.z), sk.z);
}

// Último punto seguro (para respawnear tras un peligro)
function updateSafePos() {
  const p = player.object.position;
  if (world.heightAt(p.x, p.z) < 1.3) return;
  for (const tr of world.traps) {
    if (Math.hypot(p.x - tr.x, p.z - tr.z) < tr.r + 2) return;
  }
  state.safePos.set(p.x, 0, p.z);
}

// ------------------------------------------------------------------ game loop
const clock = new THREE.Clock();
let stepAccum = 0;
let lastStepX = 0;
let lastStepZ = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  world.update(dt);
  if (state.started && !state.modalOpen && !state.won && !state.over) {
    player.update(dt, { onDanger });
    updateSafePos();
    checkCollectibles();
    updateSkeleton(dt);
    // Pasos: un sonido cada cierta distancia recorrida
    const p = player.object.position;
    const moved = Math.hypot(p.x - lastStepX, p.z - lastStepZ);
    lastStepX = p.x; lastStepZ = p.z;
    if (playing() && moved > 0.002 && moved < 5) {
      stepAccum += moved;
      if (stepAccum > 3.0) { audio.footstep(); stepAccum = 0; }
    }
  }
  updateInteraction();
  renderer.render(scene, camera);
}
animate();

// Debug/pruebas (world es un getter porque cambia al pasar de mundo)
window.__isla = {
  state, player, PISTAS,
  get world() { return world; },
  interact: (id) => {
    const it = world.interactables.find((i) => i.id === id);
    if (it) handleInteract(it);
  },
  checkCollectibles,
  enterMundo2,
};
