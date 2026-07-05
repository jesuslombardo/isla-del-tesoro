import * as THREE from 'three';
import { PointerLockControls } from '../vendor/PointerLockControls.js';
import { terrainHeightAt, DROWN_LEVEL, WATER_LEVEL } from './world.js';

// Controlador de jugador en primera persona.
// Desktop: WASD + mouse look (PointerLockControls).
// Celular: joystick para moverse + deslizar para mirar (modo táctil manual).

const EYE = 1.7;
const RADIUS = 1.1;
const WALK = 9;
const RUN = 15;

export class Player {
  constructor(camera, domElement, world) {
    this.camera = camera;
    this.world = world;
    this.controls = new PointerLockControls(camera, domElement);
    this.keys = {};
    this.enabled = false;
    this.mobile = false; // se activa en dispositivos táctiles
    this.moveVec = { x: 0, y: 0 }; // joystick: x = lateral, y = adelante(+)
    this._yaw = 0;
    this._pitch = 0;
    this._justRespawned = 0;

    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  get object() { return this.controls.getObject(); }

  spawn(pos) {
    const y = terrainHeightAt(pos.x, pos.z);
    this.object.position.set(pos.x, Math.max(y, WATER_LEVEL) + EYE, pos.z);
    this._justRespawned = 1.2; // segundos de gracia tras respawnear
  }

  lookAt(target) {
    const p = this.object.position;
    const dir = new THREE.Vector3(target.x - p.x, 0, target.z - p.z);
    this._yaw = Math.atan2(-dir.x, -dir.z);
    this._pitch = 0;
    if (this.mobile) this._applyRotation();
    else this.object.rotation.y = this._yaw;
  }

  // Mirar con el dedo (celular): dx/dy en píxeles
  applyLook(dx, dy) {
    const s = 0.005;
    this._yaw -= dx * s;
    this._pitch = Math.max(-1.3, Math.min(1.3, this._pitch - dy * s));
    this._applyRotation();
  }

  _applyRotation() {
    this.camera.rotation.set(this._pitch, this._yaw, 0, 'YXZ');
  }

  update(dt, callbacks = {}) {
    if (this._justRespawned > 0) this._justRespawned -= dt;
    if (!this.enabled) return;
    if (!this.mobile && !this.controls.isLocked) return;

    // --- dirección de movimiento ---
    let forward, strafe, speed;
    if (this.mobile) {
      strafe = this.moveVec.x;
      forward = this.moveVec.y;
      speed = WALK;
    } else {
      forward = (this.keys.KeyW || this.keys.ArrowUp ? 1 : 0) - (this.keys.KeyS || this.keys.ArrowDown ? 1 : 0);
      strafe = (this.keys.KeyD || this.keys.ArrowRight ? 1 : 0) - (this.keys.KeyA || this.keys.ArrowLeft ? 1 : 0);
      speed = (this.keys.ShiftLeft || this.keys.ShiftRight ? RUN : WALK);
    }

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3();
    move.addScaledVector(dir, forward);
    move.addScaledVector(right, strafe);
    // En móvil el joystick ya trae magnitud (0..1); no re-normalizamos para permitir andar lento.
    if (this.mobile) {
      const m = Math.min(1, Math.hypot(forward, strafe));
      if (m > 0.001) move.setLength(speed * dt * m);
    } else if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
    }

    const obj = this.object;
    let nx = obj.position.x + move.x;
    let nz = obj.position.z + move.z;

    // --- colisiones contra props (círculos) ---
    for (const c of this.world.colliders) {
      const dx = nx - c.x;
      const dz = nz - c.z;
      const dist = Math.hypot(dx, dz);
      const min = c.r + RADIUS;
      if (dist < min && dist > 0.0001) {
        const push = (min - dist);
        nx += (dx / dist) * push;
        nz += (dz / dist) * push;
      }
    }

    // --- límite del mundo ---
    const worldR = Math.hypot(nx, nz);
    if (worldR > 150) {
      nx = (nx / worldR) * 150;
      nz = (nz / worldR) * 150;
    }

    obj.position.x = nx;
    obj.position.z = nz;

    // --- altura del terreno / agua ---
    const groundH = terrainHeightAt(nx, nz);
    const floor = Math.max(groundH, WATER_LEVEL - 0.4);
    obj.position.y += (floor + EYE - obj.position.y) * Math.min(1, dt * 12);

    // --- peligros ---
    if (this._justRespawned <= 0) {
      if (groundH < DROWN_LEVEL) {
        callbacks.onDanger && callbacks.onDanger('¡Te hundiste en el mar profundo!');
        return;
      }
      for (const tr of this.world.traps) {
        if (Math.hypot(nx - tr.x, nz - tr.z) < tr.r) {
          callbacks.onDanger && callbacks.onDanger('¡Caíste en un pozo trampa!');
          return;
        }
      }
    }
  }
}
