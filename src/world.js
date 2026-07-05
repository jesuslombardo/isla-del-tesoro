import * as THREE from 'three';

// ============================================================================
//  Mundo: la Isla del Tesoro.
//  Genera terreno, mar, cielo, naufragio y los escenarios de cada pista
//  (cueva = Pista 1, volcán = Pista 2), más vegetación.
//  Expone helpers de altura, colisionadores, trampas, interactuables y balizas.
// ============================================================================

export const WATER_LEVEL = 0;
export const DROWN_LEVEL = -1.6; // por debajo de esto el jugador se ahoga

// Puntos clave de la isla (x, z en el plano; la altura se calcula del terreno)
export const SPAWN = new THREE.Vector3(14, 0, 60); // en el naufragio
export const CAVE = new THREE.Vector3(-34, 0, -14); // Pista 1
export const VOLCANO = new THREE.Vector3(48, 0, -46); // Pista 2 (cono)
export const SHRINE = new THREE.Vector3(32, 0, -31); // altar de Pista 2 (accesible)
export const LAKE = new THREE.Vector3(-8, 0, 30); // Pista 3 (lago)
const LAKE_R = 7; // radio del espejo de agua
export const DRAGON = new THREE.Vector3(-52, 0, -8); // Pista 4 (guarida del dragón)
export const MOUNTAIN = new THREE.Vector3(8, 0, -34); // montaña con portal al Mundo 2
// Mundo 2 (el bosque)
export const SPAWN2 = new THREE.Vector3(0, 0, 8); // aparición en el Mundo 2
export const MINE = new THREE.Vector3(0, 0, -28); // Pista 5 (carrito minero)
export const PALMERA = new THREE.Vector3(40, 0, 4); // Pista 6
export const CASA = new THREE.Vector3(-40, 0, 2); // Pista 7 (casa embrujada)
export const CASTILLO = new THREE.Vector3(0, 0, 50); // Pista 8 (castillo)
export const TREASURE = new THREE.Vector3(0, 0, 84); // cofre del tesoro (final)

// Terreno del bosque (Mundo 2): colinas suaves, siempre sobre el nivel 0.
export function forestHeightAt(x, z) {
  let h = 3;
  h += Math.sin(x * 0.05) * Math.cos(z * 0.06) * 2.2;
  h += Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.09) * 1.0;
  return h;
}

// --- Altura del terreno: isla como montículo radial con colinas suaves --------
export function terrainHeightAt(x, z) {
  const r = Math.hypot(x, z);
  const R = 118; // radio de la isla (más grande)
  const t = Math.min(r / R, 1);
  const base = Math.cos(t * Math.PI * 0.5); // 1 en el centro -> 0 en el borde
  let h = base * 14 - 4; // centro ~10, borde ~-4 (bajo el agua)
  h += Math.sin(x * 0.06) * Math.cos(z * 0.05) * 3;
  h += Math.sin(x * 0.13 + 2.1) * Math.sin(z * 0.11) * 1.2;
  return h;
}

function heightColor(h, color) {
  // Colorea el terreno por altura: agua-arena-pasto-roca
  if (h < 0.4) color.setHex(0xe6d3a0); // arena mojada / playa
  else if (h < 2.2) color.setHex(0xe8dcab); // arena seca
  else if (h < 8) color.setHex(0x6da34d); // pasto
  else color.setHex(0x8a8071); // roca de las colinas
  return color;
}

export class World {
  constructor(scene, variant = 'isla') {
    this.scene = scene;
    this.variant = variant;
    this.root = new THREE.Group(); // todo lo del mundo cuelga de acá (para liberarlo)
    scene.add(this.root);
    this.colliders = []; // { x, z, r }
    this.traps = []; // { x, z, r }
    this.interactables = []; // { id, kind, pistaIdx, position, radius, prompt }
    this.chests = []; // grupo del cofre por pista
    this.chestLids = []; // tapa del cofre por pista
    this.beacons = []; // haz de luz guía por pista
    this.collectibles = [];
    this._animated = []; // objetos con update(t)
    this._time = 0;

    if (variant === 'bosque') {
      this.heightAt = forestHeightAt;
      this.waterLevel = -900; // sin mar
      this.drownLevel = -900; // no te ahogás en el bosque
      this._buildForest();
    } else {
      this.heightAt = terrainHeightAt;
      this.waterLevel = WATER_LEVEL;
      this.drownLevel = DROWN_LEVEL;
      this._buildIsla();
    }
  }

  // Todo lo visual cuelga de root, para poder liberarlo al cambiar de mundo.
  add(obj) { this.root.add(obj); }

  dispose() {
    this.scene.remove(this.root);
    this._animated = [];
    this.interactables = [];
    this.collectibles = [];
    this.traps = [];
    this.colliders = [];
  }

  // ------------------------------------------------------- Mundo 1 (la isla)
  _buildIsla() {
    this._buildSky();
    this._buildLights();
    this._buildTerrain();
    this._buildWater();
    this._buildShipwreck();
    this._buildCave(); // Pista 1
    this._buildVolcano(); // cono decorativo + colisión
    this._buildVolcanoShrine(); // Pista 2 (altar accesible)
    this._buildLake(); // Pista 3 (lago)
    this._buildDragon(); // Pista 4 (dragón)
    this._buildMountainPortal(); // montaña + portal al Mundo 2 (se activa al pasar la P4)
    this._scatterVegetation();
    this._scatterCollectibles(); // monedas y estrellas para juntar
    this._scatterAnimals(); // animalitos que dan +1 vida si los cazás
    this._buildSeagulls(); // gaviotas volando
    this._buildClouds(); // nubes
    this._buildButterflies(); // mariposas sobre el pasto
    this._buildCrabs(); // cangrejos en la playa

    // Balizas: la de la cueva visible; las demás aparecen al resolver la anterior
    this._buildBeacon(0, CAVE, 0xffe08a, true);
    this._buildBeacon(1, SHRINE, 0xff9a5a, false);
    this._buildBeacon(2, LAKE, 0x7ad0ff, false);
    this._buildBeacon(3, DRAGON, 0x8fe36a, false);
  }

  // --------------------------------------------------------------- cielo / luz
  _buildSky() {
    this.scene.background = new THREE.Color(0x9fd3e8);
    this.scene.fog = new THREE.Fog(0xbfe0ee, 90, 330);

    const geo = new THREE.SphereGeometry(400, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(0x2f7fb5) },
        bottom: { value: new THREE.Color(0xd8f0f7) },
      },
      vertexShader: `
        varying vec3 vP;
        void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
        void main(){
          float h = clamp((normalize(vP).y + 0.15) / 1.0, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottom, top, h), 1.0);
        }
      `,
    });
    this._skyUniforms = mat.uniforms;
    this.add(new THREE.Mesh(geo, mat));
  }

  _buildLights() {
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.35);
    sun.position.set(60, 90, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 140;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.far = 400;
    this.add(sun);
    const hemi = new THREE.HemisphereLight(0xbfe0ee, 0x5a6a3a, 0.7);
    this.add(hemi);
    this._sun = sun;

    // Ciclo de día suave (mediodía ↔ tarde dorada), sin llegar a la noche.
    const cSun = new THREE.Color();
    this._animated.push((t) => {
      const k = (Math.sin(t * (Math.PI * 2 / 210)) + 1) / 2; // 0..1 cada ~3.5 min
      cSun.setHSL(0.13 - k * 0.05, 0.35 + k * 0.4, 0.78); // blanco -> dorado
      sun.color.copy(cSun);
      sun.intensity = 1.35 - k * 0.28;
      hemi.intensity = 0.7 - k * 0.12;
      if (this._skyUniforms) {
        this._skyUniforms.bottom.value.setHSL(0.55 - k * 0.46, 0.5 + k * 0.2, 0.86 - k * 0.05);
      }
    });
  }

  // ------------------------------------------------------------------ terreno
  _buildTerrain() {
    const size = 420;
    const seg = 260;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeightAt(x, z);
      pos.setY(i, h);
      heightColor(h, c);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.add(mesh);
  }

  // -------------------------------------------------------------------- agua
  _buildWater() {
    const geo = new THREE.PlaneGeometry(1200, 1200, 110, 110);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1c6f97,
      transparent: true,
      opacity: 0.84,
      roughness: 0.12,
      metalness: 0.35,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = WATER_LEVEL;
    this.add(water);
    this._waterBase = geo.attributes.position.array.slice();
    this._animated.push((t) => {
      const p = geo.attributes.position;
      const base = this._waterBase;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3];
        const z = base[i * 3 + 2];
        p.setY(i,
          Math.sin(x * 0.08 + t * 1.3) * 0.32 +
          Math.cos(z * 0.06 + t) * 0.32 +
          Math.sin((x + z) * 0.14 + t * 1.8) * 0.14);
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
    });

    // Espuma en la orilla (anillo blanco translúcido sobre la línea de costa)
    const waterR = 118 * 0.815; // radio aprox. de la costa
    const foam = new THREE.Mesh(
      new THREE.RingGeometry(waterR - 3.5, waterR + 2, 96),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.y = WATER_LEVEL + 0.12;
    this.add(foam);
    this._animated.push((t) => { foam.material.opacity = 0.3 + Math.sin(t * 1.5) * 0.15; });
  }

  // ---------------------------------------------------------------- naufragio
  _buildShipwreck() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x4e3620, roughness: 0.9 });
    const pinkSail = new THREE.MeshStandardMaterial({ color: 0xe86ba8, roughness: 1, side: THREE.DoubleSide });

    // Casco grande + proa en punta
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(3.4, 13, 6, 14), wood);
    hull.rotation.z = Math.PI / 2;
    hull.scale.set(1, 1, 0.62);
    hull.position.y = 1.7;
    g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 10), wood);
    bow.rotation.z = -Math.PI / 2;
    bow.scale.set(1, 1, 0.62);
    bow.position.set(9, 1.7, 0);
    g.add(bow);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(17, 0.6, 5.4), woodDark);
    deck.position.y = 2.9;
    g.add(deck);

    // Dos mástiles con velas rosas
    for (const mx of [4, -3.5]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 13, 8), woodDark);
      mast.position.set(mx, 8.5, 0);
      g.add(mast);
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 7, 6), woodDark);
      yard.rotation.x = Math.PI / 2;
      yard.position.set(mx, 12, 0);
      g.add(yard);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 5.2), pinkSail);
      sail.rotation.y = Math.PI / 2;
      sail.position.set(mx, 9.2, 0);
      g.add(sail);
    }

    // Bandera pirata (calavera) en el mástil principal
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2, 6), woodDark);
    flagPole.position.set(4, 15.5, 0);
    g.add(flagPole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.3), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide }));
    flag.position.set(4.95, 15.6, 0);
    g.add(flag);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xf0efe6 });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), boneMat);
    skull.position.set(4.95, 15.85, 0.06);
    g.add(skull);
    for (const rot of [0.7, -0.7]) {
      const boneX = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.06), boneMat);
      boneX.position.set(4.95, 15.35, 0.06);
      boneX.rotation.z = rot;
      g.add(boneX);
    }

    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });

    const wz = SPAWN.z + 8;
    const y = terrainHeightAt(SPAWN.x, wz);
    g.position.set(SPAWN.x, y - 0.6, wz);
    g.rotation.y = -0.7;
    g.rotation.z = 0.1; // escorado (encallado)
    this.add(g);
    this.colliders.push({ x: SPAWN.x, z: wz, r: 5.8 });

    // Botín a la vista en la arena seca: cofre de oro abierto + comida (barriles y frutas)
    this._buildOpenGoldChest(SPAWN.x - 6, SPAWN.z - 2);
    this._buildBarrel(SPAWN.x + 5, SPAWN.z - 1);
    this._buildBarrel(SPAWN.x + 6.6, SPAWN.z + 0.8);
  }

  _buildOpenGoldChest(x, z) {
    const ground = terrainHeightAt(x, z);
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf4c95d, metalness: 0.7, roughness: 0.3 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.4), wood);
    box.position.y = 0.6;
    g.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 1.4), wood);
    lid.position.set(0, 1.5, -0.7);
    lid.rotation.x = -1.9; // tapa abierta
    g.add(lid);
    // oro desbordando
    for (let i = 0; i < 5; i++) {
      const coin = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), gold);
      coin.position.set((i - 2) * 0.35, 1.15 + (i % 2) * 0.12, 0.1 + (i % 3) * 0.15);
      g.add(coin);
    }
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    g.position.set(x, ground, z);
    g.rotation.y = 0.4;
    this.add(g);
    this.colliders.push({ x, z, r: 1.3 });
  }

  _buildBarrel(x, z) {
    const ground = terrainHeightAt(x, z);
    const g = new THREE.Group();
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 1.4, 12),
      new THREE.MeshStandardMaterial({ color: 0x8a5a2c, roughness: 0.9 })
    );
    barrel.position.y = 0.7;
    g.add(barrel);
    for (const yy of [0.35, 1.05]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.06, 6, 14), new THREE.MeshStandardMaterial({ color: 0x3a2a18 }));
      band.rotation.x = Math.PI / 2;
      band.position.y = yy;
      g.add(band);
    }
    // frutas arriba
    const fruitColors = [0xd83b34, 0xe8a020, 0xd83b34];
    for (let i = 0; i < 3; i++) {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshStandardMaterial({ color: fruitColors[i], roughness: 0.6 }));
      fruit.position.set((i - 1) * 0.3, 1.5, (i % 2) * 0.2);
      g.add(fruit);
    }
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    g.position.set(x, ground, z);
    this.add(g);
    this.colliders.push({ x, z, r: 0.8 });
  }

  // ------------------------------------------------------------------- cueva
  _buildCave() {
    const cx = CAVE.x;
    const cz = CAVE.z;
    const ground = terrainHeightAt(cx, cz);
    const rock = new THREE.MeshStandardMaterial({ color: 0x7c7264, roughness: 1 });
    const darkRock = new THREE.MeshStandardMaterial({ color: 0x4b453c, roughness: 1 });

    // Anillo de rocas en "C" con abertura de entrada hacia +Z
    const ringR = 8;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      if (a > Math.PI * 0.3 && a < Math.PI * 0.7) continue;
      const bx = cx + Math.cos(a) * ringR;
      const bz = cz + Math.sin(a) * ringR;
      const s = 2.6 + Math.sin(a * 3) * 0.6;
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rock);
      const by = terrainHeightAt(bx, bz);
      boulder.position.set(bx, by + s * 0.4, bz);
      boulder.rotation.set(a, a * 1.7, a * 0.3);
      boulder.castShadow = true;
      boulder.receiveShadow = true;
      this.add(boulder);
      this.colliders.push({ x: bx, z: bz, r: s * 0.9 });
    }

    // Techo de roca (media esfera oscura) -> sensación de interior
    const roof = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), darkRock);
    roof.position.set(cx, ground + 7, cz);
    roof.castShadow = true;
    this.add(roof);

    // Losa con la inscripción
    const slab = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4, 0.6), darkRock);
    slab.position.set(cx - 5.2, ground + 2, cz - 4);
    slab.rotation.y = 0.6;
    slab.castShadow = true;
    this.add(slab);
    this._glowMark(cx - 4.6, ground + 3.4, cz - 3.4, 0xffd27a);

    // Antorcha (luz + llama parpadeante)
    const torchPos = new THREE.Vector3(cx + 3, ground + 3, cz - 3);
    const torchLight = new THREE.PointLight(0xffa64d, 3.2, 26, 2);
    torchLight.position.copy(torchPos);
    this.add(torchLight);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    flame.position.copy(torchPos);
    this.add(flame);
    this._animated.push((t) => {
      const f = 0.75 + Math.sin(t * 18) * 0.15 + Math.sin(t * 7) * 0.1;
      torchLight.intensity = 3.2 * f;
      flame.scale.y = 0.85 + f * 0.3;
    });

    // --- Detalles de la cueva ---
    const crystalCols = [0x7ad0ff, 0xb98cff, 0x6fe3c2];
    // Estalactitas del techo
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rr = 2 + (i % 3) * 1.8;
      const sx = cx + Math.cos(a) * rr, sz = cz + Math.sin(a) * rr;
      const len = 1.1 + (i % 3) * 0.9;
      const st = new THREE.Mesh(new THREE.ConeGeometry(0.3, len, 6), darkRock);
      st.position.set(sx, ground + 6.4 - len / 2, sz);
      st.rotation.x = Math.PI;
      this.add(st);
    }
    // Estalagmitas del piso
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3 + 0.5, rr = 3 + (i % 2) * 2;
      const sx = cx + Math.cos(a) * rr, sz = cz + Math.sin(a) * rr;
      const len = 0.8 + (i % 3) * 0.7;
      const sm = new THREE.Mesh(new THREE.ConeGeometry(0.36, len, 6), rock);
      sm.position.set(sx, terrainHeightAt(sx, sz) + len / 2, sz);
      sm.castShadow = true;
      this.add(sm);
    }
    // Cristales brillantes que laten
    const crystals = [];
    for (let i = 0; i < 7; i++) {
      const a = i * 1.1 + 1, rr = 4 + (i % 3);
      const gx = cx + Math.cos(a) * rr, gz = cz + Math.sin(a) * rr;
      const col = crystalCols[i % 3];
      const cr = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.35 + (i % 3) * 0.15, 0),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, roughness: 0.25 })
      );
      cr.position.set(gx, terrainHeightAt(gx, gz) + 0.4, gz);
      cr.rotation.set(i, i * 1.4, 0);
      this.add(cr);
      crystals.push(cr);
    }
    this._animated.push((t) => {
      for (let i = 0; i < crystals.length; i++) crystals[i].material.emissiveIntensity = 0.4 + Math.sin(t * 2 + i) * 0.3;
    });
    // Segunda antorcha
    const t2 = new THREE.Vector3(cx - 3, ground + 3, cz + 2);
    const tl2 = new THREE.PointLight(0xffa64d, 2.4, 22, 2);
    tl2.position.copy(t2); this.add(tl2);
    const fl2 = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    fl2.position.copy(t2); this.add(fl2);
    this._animated.push((t) => { const f = 0.8 + Math.sin(t * 15 + 2) * 0.2; tl2.intensity = 2.4 * f; fl2.scale.y = 0.85 + f * 0.3; });
    // Restos de un explorador
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xdedbcf, roughness: 0.9 });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 7), boneMat);
    skull.position.set(cx + 4.6, ground + 0.35, cz + 1); this.add(skull);
    for (let i = 0; i < 3; i++) {
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 5), boneMat);
      bone.position.set(cx + 4.6 + (i - 1) * 0.4, ground + 0.15, cz + 1.7);
      bone.rotation.set(0, i, Math.PI / 2); this.add(bone);
    }
    // Charco de agua
    const puddle = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 20),
      new THREE.MeshStandardMaterial({ color: 0x24506a, roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.85 })
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(cx - 1, ground + 0.06, cz + 3.6); this.add(puddle);
    // Escombros
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, rr = 2.5 + (i % 4);
      const rx = cx + Math.cos(a) * rr, rz = cz + Math.sin(a) * rr;
      const s = 0.3 + (i % 3) * 0.25;
      const rub = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rock);
      rub.position.set(rx, terrainHeightAt(rx, rz) + s * 0.4, rz);
      rub.rotation.set(i, i, i); this.add(rub);
    }

    // Cofre de la Pista 1
    const chest = this._buildChest(cx, ground, cz + 2.5, 0);

    // Trampa: pozo cerca de la entrada
    this._buildPit(cx + 6, cz + 8);

    this.interactables.push({
      id: 'insc-0', kind: 'inscription', pistaIdx: 0,
      position: new THREE.Vector3(cx - 5.2, ground + 2, cz - 4), radius: 4.5,
      prompt: 'Presioná [E] para leer la inscripción',
    });
    this.interactables.push({
      id: 'chest-0', kind: 'chest', pistaIdx: 0,
      position: chest.position.clone(), radius: 4,
      prompt: 'Presioná [E] para abrir el cofre',
    });
    this.colliders.push({ x: cx, z: cz + 2.5, r: 1.6 });
  }

  // ------------------------------------------------------------------ volcán
  _buildVolcano() {
    const x = VOLCANO.x;
    const z = VOLCANO.z;
    const base = terrainHeightAt(x, z);
    const height = 34;
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 20, height, 24, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x4a3b33, roughness: 1, side: THREE.DoubleSide })
    );
    cone.position.set(x, base + height / 2, z);
    cone.castShadow = true;
    cone.receiveShadow = true;
    this.add(cone);

    const crater = new THREE.Mesh(new THREE.CircleGeometry(4, 20), new THREE.MeshBasicMaterial({ color: 0xff5522 }));
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(x, base + height - 0.5, z);
    this.add(crater);
    const lavaLight = new THREE.PointLight(0xff5522, 2.5, 60, 2);
    lavaLight.position.set(x, base + height + 2, z);
    this.add(lavaLight);

    this.colliders.push({ x, z, r: 18 }); // no se puede atravesar

    // Humo
    const puffs = [];
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 10; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), smokeMat.clone());
      puff.position.set(x, base + height, z);
      puff.userData.o = Math.random() * 6;
      this.add(puff);
      puffs.push(puff);
    }
    const topY = base + height;
    this._animated.push((t) => {
      for (const p of puffs) {
        const life = (t * 0.5 + p.userData.o) % 6;
        const k = life / 6;
        p.position.y = topY + k * 22;
        p.position.x = x + Math.sin(p.userData.o + t * 0.3) * (2 + k * 6);
        p.scale.setScalar(1 + k * 2.5);
        p.material.opacity = 0.5 * (1 - k);
      }
    });
  }

  // ------------------------------------------------------ altar del volcán (P2)
  _buildVolcanoShrine() {
    const sx = SHRINE.x;
    const sz = SHRINE.z;
    const ground = terrainHeightAt(sx, sz);
    const darkRock = new THREE.MeshStandardMaterial({ color: 0x3a3330, roughness: 1 });

    // Obelisco de piedra volcánica con vetas de lava (la inscripción)
    const obelisk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5, 2.4), darkRock);
    obelisk.position.set(sx, ground + 2.5, sz);
    obelisk.rotation.y = 0.4;
    obelisk.castShadow = true;
    obelisk.receiveShadow = true;
    this.add(obelisk);

    // Vetas de lava brillante en el obelisco
    const veins = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 5.1, 0.15),
      new THREE.MeshBasicMaterial({ color: 0xff6a2a })
    );
    veins.position.set(sx, ground + 2.5, sz);
    veins.rotation.y = 0.4;
    this.add(veins);
    this._animated.push((t) => {
      veins.material.color.setHSL(0.03, 1, 0.45 + Math.sin(t * 4) * 0.12);
    });
    this._glowMark(sx, ground + 5.4, sz, 0xff8a3a);

    // Pequeñas rocas de lava alrededor
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
      const rx = sx + Math.cos(a) * 4;
      const rz = sz + Math.sin(a) * 4;
      const s = 1 + Math.sin(a * 2) * 0.4;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), darkRock);
      r.position.set(rx, terrainHeightAt(rx, rz) + s * 0.4, rz);
      r.rotation.set(a, a, a);
      r.castShadow = true;
      this.add(r);
      this.colliders.push({ x: rx, z: rz, r: s * 0.8 });
    }

    // Cofre de la Pista 2
    const chest = this._buildChest(sx - 5, terrainHeightAt(sx - 5, sz + 2), sz + 2, 1);

    this.interactables.push({
      id: 'insc-1', kind: 'inscription', pistaIdx: 1,
      position: new THREE.Vector3(sx, ground + 2.5, sz), radius: 4.5,
      prompt: 'Presioná [E] para leer las vetas de lava',
    });
    this.interactables.push({
      id: 'chest-1', kind: 'chest', pistaIdx: 1,
      position: chest.position.clone(), radius: 4,
      prompt: 'Presioná [E] para abrir el cofre',
    });
    this.colliders.push({ x: sx, z: sz, r: 1.8 });
    this.colliders.push({ x: chest.position.x, z: chest.position.z, r: 1.6 });
    // Detalle: obsidiana, calaveras y huesos alrededor del altar de lava
    this._scatterProps(sx, sz, ['obsidian', 'skull', 'bone', 'obsidian'], 14, 3.5, 10, 3217);
  }

  // -------------------------------------------------------------- lago (P3)
  _buildLake() {
    const cx = LAKE.x;
    const cz = LAKE.z;
    const ground = terrainHeightAt(cx, cz);

    // Espejo de agua (disco reflectante)
    const waterGeo = new THREE.CircleGeometry(LAKE_R, 48);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2a7fb8, transparent: true, opacity: 0.8, roughness: 0.12, metalness: 0.35,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(cx, ground + 0.08, cz);
    water.receiveShadow = true;
    this.add(water);
    this._animated.push((t) => {
      waterMat.color.setHSL(0.55, 0.6, 0.4 + Math.sin(t * 1.5) * 0.05);
    });

    // Orilla de piedras
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
      const rx = cx + Math.cos(a) * (LAKE_R + 0.6);
      const rz = cz + Math.sin(a) * (LAKE_R + 0.6);
      const s = 0.6 + Math.abs(Math.sin(a * 3)) * 0.5;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(s, 0),
        new THREE.MeshStandardMaterial({ color: 0x7d766a, roughness: 1 })
      );
      rock.position.set(rx, terrainHeightAt(rx, rz) + s * 0.3, rz);
      rock.rotation.set(a, a, a);
      rock.castShadow = true;
      this.add(rock);
    }

    // Juncos alrededor del agua
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.3;
      const rr = LAKE_R * 0.78 + (i % 3) * 0.4;
      const rx = cx + Math.cos(a) * rr;
      const rz = cz + Math.sin(a) * rr;
      const h = 1.4 + (i % 3) * 0.4;
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, h, 5), reedMat);
      reed.position.set(rx, ground + h / 2, rz);
      reed.rotation.z = Math.sin(i) * 0.2;
      reed.castShadow = true;
      this.add(reed);
    }

    // Nenúfares flotando
    const padMat = new THREE.MeshStandardMaterial({ color: 0x3f9b47, roughness: 1, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      const rr = LAKE_R * 0.5;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.8, 10), padMat);
      pad.rotateX(-Math.PI / 2);
      pad.position.set(cx + Math.cos(a) * rr, ground + 0.12, cz + Math.sin(a) * rr);
      this.add(pad);
    }

    // Piedra musgosa con la inscripción
    const tx = cx;
    const tz = cz - (LAKE_R + 2);
    const tg = terrainHeightAt(tx, tz);
    const tablet = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2.4, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x5c6b4a, roughness: 1 })
    );
    tablet.position.set(tx, tg + 1.2, tz);
    tablet.rotation.set(-0.12, 0.2, 0);
    tablet.castShadow = true;
    tablet.receiveShadow = true;
    this.add(tablet);
    this._glowMark(tx, tg + 2.6, tz, 0x9be2ff);

    // Cofre de la Pista 3
    const chx = cx + (LAKE_R + 2);
    const chz = cz;
    const chest = this._buildChest(chx, terrainHeightAt(chx, chz), chz, 2);

    this.interactables.push({
      id: 'insc-2', kind: 'inscription', pistaIdx: 2,
      position: new THREE.Vector3(tx, tg + 1.2, tz), radius: 4.5,
      prompt: 'Presioná [E] para leer la piedra musgosa',
    });
    this.interactables.push({
      id: 'chest-2', kind: 'chest', pistaIdx: 2,
      position: chest.position.clone(), radius: 4,
      prompt: 'Presioná [E] para abrir el cofre',
    });
    this.colliders.push({ x: tx, z: tz, r: 1.8 });
    this.colliders.push({ x: chx, z: chz, r: 1.6 });

    // --- Detalle del lago ---
    // Tronco caído en la orilla
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 5, 8), new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 1 }));
    log.rotation.z = Math.PI / 2; log.rotation.y = 0.6;
    const lgx = cx + LAKE_R - 1, lgz = cz + 4;
    log.position.set(lgx, terrainHeightAt(lgx, lgz) + 0.5, lgz);
    log.castShadow = true; this.add(log);
    this.colliders.push({ x: lgx, z: lgz, r: 1.6 });
    // Ranita sobre un nenúfar
    const frog = new THREE.Group();
    const fbody = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0x4f9b3a, roughness: 0.8 }));
    fbody.scale.set(1, 0.7, 1.2); fbody.position.y = 0.2; frog.add(fbody);
    for (const ex of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffe000 }));
      eye.position.set(ex, 0.42, 0.18); frog.add(eye);
    }
    frog.position.set(cx + 2, ground + 0.16, cz - 1); this.add(frog);
    // Luciérnagas que titilan sobre el agua
    const flies = [];
    for (let i = 0; i < 9; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), new THREE.MeshBasicMaterial({ color: 0xd8ff70 }));
      f.position.set(cx + (Math.sin(i * 2.1) * LAKE_R * 0.8), ground + 1.2 + (i % 3) * 0.6, cz + (Math.cos(i * 1.7) * LAKE_R * 0.8));
      f.userData = { ox: f.position.x, oz: f.position.z, oy: f.position.y, ph: i };
      this.add(f); flies.push(f);
    }
    this._animated.push((t) => {
      for (const f of flies) {
        f.position.x = f.userData.ox + Math.sin(t * 0.8 + f.userData.ph) * 1.4;
        f.position.z = f.userData.oz + Math.cos(t * 0.7 + f.userData.ph) * 1.4;
        f.position.y = f.userData.oy + Math.sin(t * 1.5 + f.userData.ph) * 0.4;
        f.material.opacity = 0.4 + Math.abs(Math.sin(t * 3 + f.userData.ph)) * 0.6;
        f.material.transparent = true;
      }
    });
    // Hongos y piedras en la orilla
    this._scatterProps(cx, cz, ['mushroom', 'rock', 'mushroom'], 10, LAKE_R + 1.5, LAKE_R + 7, 9911);
  }

  // ----------------------------------------------------------- dragón (P4)
  _buildDragon() {
    const cx = DRAGON.x;
    const cz = DRAGON.z;
    const ground = terrainHeightAt(cx, cz);

    const green = new THREE.MeshStandardMaterial({ color: 0x4a7a3a, roughness: 0.9 });
    const greenDark = new THREE.MeshStandardMaterial({ color: 0x35592a, roughness: 1 });
    const belly = new THREE.MeshStandardMaterial({ color: 0x7fae52, roughness: 1 });
    const claw = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 1 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x3f6b32, roughness: 1, side: THREE.DoubleSide });

    // Grupo del dragón: mira hacia +X (de donde llega el jugador)
    const d = new THREE.Group();
    d.position.set(cx, ground, cz);
    this.add(d);

    // Cuerpo (elipsoide)
    const body = new THREE.Mesh(new THREE.SphereGeometry(2, 18, 14), green);
    body.scale.set(2.0, 1.3, 1.4);
    body.position.set(0, 2, 0);
    d.add(body);
    const bellyMesh = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12), belly);
    bellyMesh.scale.set(1.7, 1.0, 1.2);
    bellyMesh.position.set(0.2, 1.5, 0);
    d.add(bellyMesh);

    // Patas
    for (const [lx, lz] of [[1.4, 1.0], [1.4, -1.0], [-1.3, 1.0], [-1.3, -1.0]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2, 8), green);
      leg.position.set(lx, 1, lz);
      d.add(leg);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), greenDark);
      foot.position.set(lx + 0.2, 0.2, lz);
      d.add(foot);
    }

    // Cola (cono hacia -X)
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6, 8), green);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-4.4, 1.8, 0);
    d.add(tail);

    // Cuello + cabeza (mira a +X, arriba)
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 3.2, 10), green);
    neck.position.set(2.3, 3.1, 0);
    neck.rotation.z = -0.9;
    d.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.2), green);
    head.position.set(3.7, 3.7, 0);
    d.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.9), green);
    snout.position.set(4.6, 3.5, 0);
    d.add(snout);
    // Boca (interior rojo)
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.8), new THREE.MeshBasicMaterial({ color: 0x8a1010 }));
    mouth.position.set(5.05, 3.4, 0);
    d.add(mouth);
    // Ojos
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe000 }));
      eye.position.set(4.0, 4.1, 0.5 * s);
      d.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      pupil.position.set(4.18, 4.1, 0.5 * s);
      d.add(pupil);
      // Cuernos
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1, 6), claw);
      horn.position.set(3.3, 4.6, 0.4 * s);
      horn.rotation.z = 0.5;
      d.add(horn);
    }

    // Púas en el lomo
    for (let i = 0; i < 7; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 5), greenDark);
      spike.position.set(2.0 - i * 0.9, 3.2 - Math.abs(i - 3) * 0.12, 0);
      d.add(spike);
    }

    // Alas (membranas que se abren hacia arriba y aletean)
    const wingL = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), wingMat);
    wingL.position.set(-0.6, 3.6, 1.2);
    wingL.rotation.set(0.5, 0.3, 1.0);
    d.add(wingL);
    const wingR = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), wingMat);
    wingR.position.set(-0.6, 3.6, -1.2);
    wingR.rotation.set(-0.5, -0.3, 1.0);
    d.add(wingR);

    d.traverse((o) => { o.castShadow = true; });

    // Tesoro (montón de oro) + placa con la inscripción, al costado sur
    const hoardX = cx - 4;
    const hoardZ = cz - 12;
    const gold = new THREE.MeshStandardMaterial({ color: 0xf4c95d, metalness: 0.7, roughness: 0.35 });
    const hoard = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    hoard.position.set(hoardX, terrainHeightAt(hoardX, hoardZ), hoardZ);
    hoard.scale.set(1.4, 0.5, 1.4);
    hoard.castShadow = true;
    this.add(hoard);
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.4), gold);
    const pg = terrainHeightAt(hoardX, hoardZ);
    plaque.position.set(hoardX, pg + 1.4, hoardZ);
    plaque.rotation.set(-0.25, 0.3, 0);
    plaque.castShadow = true;
    this.add(plaque);
    this._glowMark(hoardX, pg + 2.8, hoardZ, 0xffe08a);

    // Cofre de la Pista 4 (al costado sur, para llegar rodeando el fuego)
    const chz = cz - 12;
    const chx = cx;
    const chest = this._buildChest(chx, terrainHeightAt(chx, chz), chz, 3);

    // --- Fuego: sale de la boca hacia +X, por ciclos ---
    const mouthX = cx + 5.2;
    const mouthY = ground + 3.4;
    const mouthZ = cz;
    const fireGroup = new THREE.Group();
    fireGroup.position.set(mouthX, mouthY, mouthZ);
    this.add(fireGroup);
    const fireColors = [0xffe23a, 0xffa020, 0xff5a10, 0xff2a05];
    for (let i = 0; i < 4; i++) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.55 + i * 0.3, 1.8, 8),
        new THREE.MeshBasicMaterial({ color: fireColors[i], transparent: true, opacity: 0.85 })
      );
      flame.rotation.z = -Math.PI / 2; // apunta a +X
      flame.position.set(1 + i * 1.25, 0, 0);
      fireGroup.add(flame);
    }
    const fireLight = new THREE.PointLight(0xff5a10, 0, 30, 2);
    fireLight.position.set(mouthX + 3, mouthY, mouthZ);
    this.add(fireLight);

    // Zona de peligro del fuego (trampa que se activa solo en la ráfaga)
    const fireTrap = { x: mouthX + 3, z: mouthZ, r: 4.6, active: false, msg: '¡El dragón te quemó con su fuego! 🔥' };
    this.traps.push(fireTrap);

    // Colisión del cuerpo del dragón
    this.colliders.push({ x: cx, z: cz, r: 3.2 });
    this.colliders.push({ x: chx, z: chz, r: 1.6 });

    // Interactuables de la Pista 4
    this.interactables.push({
      id: 'insc-3', kind: 'inscription', pistaIdx: 3,
      position: new THREE.Vector3(hoardX, pg + 1.4, hoardZ), radius: 4.5,
      prompt: 'Presioná [E] para leer la placa de oro',
    });
    this.interactables.push({
      id: 'chest-3', kind: 'chest', pistaIdx: 3,
      position: chest.position.clone(), radius: 4,
      prompt: 'Presioná [E] para abrir el cofre',
    });

    // Detalle: el botín del dragón desparramado (oro, huesos y calaveras)
    this._scatterProps(cx, cz, ['gold', 'gold', 'bone', 'skull'], 22, 3.5, 10, 6543);

    // Animación: idle + aleteo + ciclo de fuego
    const CYCLE = 6;
    this._animated.push((t) => {
      d.position.y = ground + Math.sin(t * 1.2) * 0.12;
      const flap = Math.sin(t * 2.2) * 0.18;
      wingL.rotation.z = 1.0 + flap;
      wingR.rotation.z = 1.0 + flap;
      head.rotation.z = Math.sin(t * 0.8) * 0.05;

      const c = t % CYCLE;
      let f = 0, active = false;
      if (c > 3.8 && c < 4.6) f = ((c - 3.8) / 0.8) * 0.45; // preparación
      else if (c >= 4.6 && c < 5.8) { f = 1; active = true; } // ráfaga
      else if (c >= 5.8 && c < 6.0) f = (6.0 - c) / 0.2; // se apaga
      const flick = 0.82 + Math.sin(t * 28) * 0.18;
      fireGroup.visible = f > 0.01;
      fireGroup.scale.setScalar(Math.max(0.001, f * flick));
      fireLight.intensity = f > 0 ? 5 * f * flick : 0;
      fireTrap.active = active;
    });
  }

  // ------------------------------------------------------------------- cofre
  _buildChest(x, ground, z, idx) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xf4c95d, metalness: 0.6, roughness: 0.3 });

    const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.6), wood);
    box.position.y = 0.7;
    g.add(box);

    const lid = new THREE.Group();
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 1.6), wood);
    lidMesh.position.set(0, 0.35, 0);
    lid.add(lidMesh);
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.25, 0.2), gold);
    band.position.set(0, 0.35, 0);
    lid.add(band);
    lid.position.set(0, 1.4, -0.8);
    g.add(lid);

    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), gold);
    lock.position.set(0, 0.8, 0.85);
    g.add(lock);

    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    g.position.set(x, ground, z);
    this.add(g);
    this.chests[idx] = g;
    this.chestLids[idx] = lid;
    return g;
  }

  openChest(idx) {
    const lid = this.chestLids[idx];
    const chest = this.chests[idx];
    if (!lid) return;
    const start = performance.now();
    const glow = this._glowMark(chest.position.x, chest.position.y + 1.2, chest.position.z, 0xfff1a8);
    const tick = () => {
      const k = Math.min((performance.now() - start) / 700, 1);
      lid.rotation.x = -k * (Math.PI * 0.6);
      glow.scale.setScalar(1 + k * 2.5);
      glow.material.opacity = 0.9 * (1 - k * 0.3);
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  _buildPit(x, z) {
    const y = terrainHeightAt(x, z);
    const ring = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.05, z);
    this.add(ring);
    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.35, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0x5b5348, roughness: 1 })
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(x, y + 0.1, z);
    edge.castShadow = true;
    this.add(edge);
    this.traps.push({ x, z, r: 2.2 });
  }

  // ------------------------------------------------------------- vegetación
  _scatterVegetation() {
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const blocked = (x, z) =>
      Math.hypot(x - CAVE.x, z - CAVE.z) < 12 ||
      Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 22 ||
      Math.hypot(x - SHRINE.x, z - SHRINE.z) < 11 ||
      Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE_R + 5 ||
      Math.hypot(x - DRAGON.x, z - DRAGON.z) < 18 ||
      Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) < 16 ||
      Math.hypot(x - SPAWN.x, z - SPAWN.z) < 9;
    // Isla más grande y frondosa: muchas más plantas repartidas.
    for (let i = 0; i < 420; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = 8 + rnd() * 106;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const h = terrainHeightAt(x, z);
      if (h < 0.8 || h > 11) continue;
      if (blocked(x, z)) continue;
      const r = rnd();
      if (r < 0.24) this._palm(x, h, z, rnd);
      else if (r < 0.42) this._rock(x, h, z, rnd);
      else if (r < 0.66) this._bush(x, h, z, rnd);
      else if (r < 0.88) this._grassTuft(x, h, z, rnd);
      else this._flower(x, h, z, rnd);
    }
  }

  _bush(x, y, z, rnd) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: rnd() < 0.5 ? 0x3f7d38 : 0x4f8a3a, roughness: 1 });
    const n = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const s = 0.5 + rnd() * 0.5;
      const blob = new THREE.Mesh(new THREE.SphereGeometry(s, 7, 6), mat);
      blob.position.set((rnd() - 0.5) * 1.1, s * 0.7, (rnd() - 0.5) * 1.1);
      blob.castShadow = true;
      g.add(blob);
    }
    g.position.set(x, y, z);
    this.add(g);
  }

  _grassTuft(x, y, z, rnd) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x6fae3f, roughness: 1, side: THREE.DoubleSide });
    const n = 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5 + rnd() * 0.4, 3), mat);
      const a = rnd() * Math.PI * 2;
      blade.position.set(Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2);
      blade.rotation.z = (rnd() - 0.5) * 0.4;
      g.add(blade);
    }
    g.position.set(x, y, z);
    this.add(g);
  }

  _flower(x, y, z, rnd) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x4f8a3a }));
    stem.position.y = 0.3;
    g.add(stem);
    const colors = [0xe8556d, 0xf4c95d, 0xe86ba8, 0xffffff, 0xff8a3a];
    const petals = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6), new THREE.MeshStandardMaterial({ color: colors[Math.floor(rnd() * colors.length)], roughness: 0.7 }));
    petals.position.y = 0.62; petals.scale.y = 0.6;
    g.add(petals);
    g.position.set(x, y, z);
    this.add(g);
  }

  _palm(x, y, z, rnd) {
    const g = new THREE.Group();
    const trunkH = 4 + rnd() * 2.5;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.42, trunkH, 7),
      new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1 })
    );
    trunk.position.y = trunkH / 2;
    trunk.rotation.z = (rnd() - 0.5) * 0.3;
    g.add(trunk);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9b47, roughness: 1, side: THREE.DoubleSide });
    for (let k = 0; k < 6; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 4), leafMat);
      const a = (k / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.4, trunkH + 0.2, Math.sin(a) * 1.4);
      leaf.rotation.z = Math.PI / 2.4;
      leaf.rotation.y = -a;
      g.add(leaf);
    }
    g.traverse((o) => { o.castShadow = true; });
    g.position.set(x, y, z);
    this.add(g);
    this.colliders.push({ x, z, r: 0.8 });
  }

  _rock(x, y, z, rnd) {
    const s = 0.8 + rnd() * 1.8;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(s, 0),
      new THREE.MeshStandardMaterial({ color: 0x8a8071, roughness: 1 })
    );
    rock.position.set(x, y + s * 0.4, z);
    rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    this.add(rock);
    this.colliders.push({ x, z, r: s * 0.8 });
  }

  // --------------------------------------------- coleccionables (monedas/estrellas)
  _scatterCollectibles() {
    this.collectibles = [];
    let seed = 90210;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf4c95d, metalness: 0.6, roughness: 0.3,
      emissive: 0x7a5a00, emissiveIntensity: 0.6, side: THREE.DoubleSide,
    });
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe23a, side: THREE.DoubleSide });

    const place = (type) => {
      for (let tries = 0; tries < 30; tries++) {
        const ang = rnd() * Math.PI * 2;
        const rad = 14 + rnd() * 98;
        const x = Math.cos(ang) * rad;
        const z = Math.sin(ang) * rad;
        const h = terrainHeightAt(x, z);
        if (h < 1.4 || h > 8.5) continue;
        if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 20) continue;
        if (Math.hypot(x - DRAGON.x, z - DRAGON.z) < 12) continue;
        // no encima de un colisionador
        let blocked = false;
        for (const c of this.colliders) { if (Math.hypot(x - c.x, z - c.z) < c.r + 1.2) { blocked = true; break; } }
        if (blocked) continue;

        const group = new THREE.Group();
        group.position.set(x, h + 1.1, z);
        if (type === 'coin') {
          const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18), goldMat);
          coin.rotation.x = Math.PI / 2;
          coin.castShadow = true;
          group.add(coin);
        } else {
          group.add(new THREE.Mesh(this._starGeo(), starMat));
        }
        this.add(group);
        const item = { group, x, z, type, value: type === 'coin' ? 5 : 1, taken: false, phase: rnd() * 6 };
        this.collectibles.push(item);
        this._animated.push((t) => {
          if (item.taken) return;
          group.rotation.y = t * 2 + item.phase;
          group.position.y = h + 1.1 + Math.sin(t * 2 + item.phase) * 0.18;
        });
        return;
      }
    };

    for (let i = 0; i < 26; i++) place('coin');
    for (let i = 0; i < 8; i++) place('star');
  }

  _starGeo() {
    if (this._starGeoCache) return this._starGeoCache;
    const s = new THREE.Shape();
    const spikes = 5, outer = 0.55, inner = 0.24;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) s.moveTo(px, py); else s.lineTo(px, py);
    }
    s.closePath();
    this._starGeoCache = new THREE.ShapeGeometry(s);
    return this._starGeoCache;
  }

  // ------------------------------------------- props sueltos (detalle de escenas)
  _prop(kind, x, y, z, rnd) {
    if (kind === 'rock' || kind === 'obsidian') {
      const s = 0.3 + rnd() * 0.6;
      const mat = kind === 'obsidian'
        ? new THREE.MeshStandardMaterial({ color: 0x2a2430, roughness: 0.4, metalness: 0.3 })
        : new THREE.MeshStandardMaterial({ color: 0x7d766a, roughness: 1 });
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat);
      m.position.set(x, y + s * 0.4, z); m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      m.castShadow = true; this.add(m);
    } else if (kind === 'bone') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 5), new THREE.MeshStandardMaterial({ color: 0xdedbcf, roughness: 0.9 }));
      m.position.set(x, y + 0.1, z); m.rotation.set(rnd() * 3, rnd() * 3, Math.PI / 2); this.add(m);
    } else if (kind === 'skull') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 7), new THREE.MeshStandardMaterial({ color: 0xdedbcf, roughness: 0.9 }));
      m.position.set(x, y + 0.28, z); m.castShadow = true; this.add(m);
    } else if (kind === 'gold') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 12), new THREE.MeshStandardMaterial({ color: 0xf4c95d, metalness: 0.7, roughness: 0.3, emissive: 0x5a4300, emissiveIntensity: 0.3 }));
      m.position.set(x, y + 0.05, z); m.rotation.set(Math.PI / 2, 0, rnd() * 3); this.add(m);
    } else if (kind === 'mushroom') {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0xe8e0cf, roughness: 1 }));
      stem.position.y = 0.18; g.add(stem);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: rnd() < 0.5 ? 0xd83b34 : 0xe86ba8, roughness: 0.8 }));
      cap.position.y = 0.35; g.add(cap);
      g.position.set(x, y, z); this.add(g);
    }
  }

  _scatterProps(cx, cz, list, count, rMin, rMax, seedN) {
    let seed = seedN;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2, rr = rMin + rnd() * (rMax - rMin);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      this._prop(list[Math.floor(rnd() * list.length)], x, this.heightAt(x, z), z, rnd);
    }
  }

  // --------------------------------------------------------- gaviotas y nubes
  _buildSeagulls() {
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 1, side: THREE.DoubleSide });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdedcd4, roughness: 1 });
    const gulls = [];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), bodyMat);
      body.scale.set(1, 0.7, 1.8);
      g.add(body);
      const wl = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), wingMat);
      wl.position.x = -1.2;
      g.add(wl);
      const wr = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), wingMat);
      wr.position.x = 1.2;
      g.add(wr);
      g.userData = { r: 45 + i * 9, base: (i / 8) * Math.PI * 2, h: 46 + (i % 3) * 6, spd: 0.06 + (i % 4) * 0.015, ph: i, wl, wr };
      this.add(g);
      gulls.push(g);
    }
    this._animated.push((t) => {
      for (const g of gulls) {
        const u = g.userData;
        const a = u.base + t * u.spd;
        g.position.set(Math.cos(a) * u.r, u.h + Math.sin(t * 0.5 + u.ph) * 2, Math.sin(a) * u.r);
        g.rotation.y = -a;
        const flap = Math.sin(t * 5 + u.ph) * 0.5;
        u.wl.rotation.z = 0.35 + flap;
        u.wr.rotation.z = -0.35 - flap;
      }
    });
  }

  _buildButterflies() {
    const cols = [0xf4c95d, 0xe86ba8, 0x7ad0ff, 0xff8a3a, 0xffffff, 0xb98cff];
    let seed = 321;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const flutter = [];
    for (let i = 0; i < 10; i++) {
      let x = 0, z = 0, h = -9, tries = 0;
      while (tries++ < 20) {
        const a = rnd() * Math.PI * 2, rr = 15 + rnd() * 85;
        x = Math.cos(a) * rr; z = Math.sin(a) * rr; h = terrainHeightAt(x, z);
        if (h > 1.5 && h < 8) break;
      }
      if (h <= 1.5) continue;
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.7, side: THREE.DoubleSide });
      const wl = new THREE.Mesh(new THREE.CircleGeometry(0.22, 8), mat); wl.position.x = -0.12; g.add(wl);
      const wr = new THREE.Mesh(new THREE.CircleGeometry(0.22, 8), mat); wr.position.x = 0.12; g.add(wr);
      g.position.set(x, h + 1.6, z);
      this.add(g);
      flutter.push({ g, wl, wr, cx: x, cz: z, h, r: 2 + rnd() * 3, spd: 0.4 + rnd() * 0.5, ph: rnd() * 6 });
    }
    this._animated.push((t) => {
      for (const b of flutter) {
        const a = b.ph + t * b.spd;
        b.g.position.set(b.cx + Math.cos(a) * b.r, b.h + 1.5 + Math.sin(t * 2 + b.ph) * 0.5, b.cz + Math.sin(a) * b.r);
        b.g.rotation.y = -a + Math.PI / 2;
        const fl = Math.sin(t * 12 + b.ph) * 1.1;
        b.wl.rotation.y = fl; b.wr.rotation.y = -fl;
      }
    });
  }

  _buildCrabs() {
    let seed = 8080;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const crabs = [];
    for (let i = 0; i < 6; i++) {
      let x = 0, z = 0, h = -9, tries = 0;
      while (tries++ < 30) {
        const a = rnd() * Math.PI * 2, rr = 90 + rnd() * 18;
        x = Math.cos(a) * rr; z = Math.sin(a) * rr; h = terrainHeightAt(x, z);
        if (h > 0.1 && h < 1.8) break;
      }
      if (h <= 0.1 || h > 1.8) continue;
      const g = new THREE.Group();
      const red = new THREE.MeshStandardMaterial({ color: 0xd8433a, roughness: 0.7 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), red);
      body.scale.set(1.3, 0.6, 1); body.position.y = 0.25; g.add(body);
      for (const sx of [-0.4, 0.4]) {
        const claw = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), red);
        claw.position.set(sx, 0.22, 0.3); g.add(claw);
        for (const lz of [-0.2, 0, 0.2]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 4), red);
          leg.position.set(sx * 0.9, 0.1, lz); leg.rotation.z = sx > 0 ? -0.6 : 0.6; g.add(leg);
        }
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 5), new THREE.MeshBasicMaterial({ color: 0x111 }));
        eye.position.set(sx * 0.3, 0.4, 0.28); g.add(eye);
      }
      g.position.set(x, h, z);
      this.add(g);
      crabs.push({ g, cx: x, cz: z, h, ph: rnd() * 6, r: 1.5 + rnd() * 1.5 });
    }
    this._animated.push((t) => {
      for (const c of crabs) {
        const s = Math.sin(t * 0.8 + c.ph);
        c.g.position.x = c.cx + s * c.r;
        c.g.position.z = c.cz + Math.cos(t * 0.5 + c.ph) * 0.6;
        c.g.rotation.y = s > 0 ? 0.2 : -0.2; // se mueve de costado
      }
    });
  }

  _buildClouds() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9 });
    let seed = 77;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const clouds = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const s = 4 + rnd() * 5;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 7, 6), mat);
        puff.position.set((rnd() - 0.5) * 16, (rnd() - 0.5) * 3, (rnd() - 0.5) * 10);
        puff.scale.y = 0.6;
        c.add(puff);
      }
      c.position.set((rnd() - 0.5) * 260, 70 + rnd() * 20, (rnd() - 0.5) * 260);
      c.userData = { spd: 0.4 + rnd() * 0.5 };
      this.add(c);
      clouds.push(c);
    }
    this._animated.push((t) => {
      for (const c of clouds) {
        c.position.x += c.userData.spd * 0.02;
        if (c.position.x > 200) c.position.x = -200;
      }
    });
  }

  // --------------------------------------------- animalitos (dan +1 vida al cazar)
  _scatterAnimals() {
    this.animals = [];
    let seed = 555;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let placed = 0, tries = 0;
    while (placed < 9 && tries < 260) {
      tries++;
      const ang = rnd() * Math.PI * 2;
      const rad = 16 + rnd() * 92;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const h = terrainHeightAt(x, z);
      if (h < 1.6 || h > 8) continue;
      if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 22) continue;
      if (Math.hypot(x - DRAGON.x, z - DRAGON.z) < 14) continue;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 12) continue;
      this._buildAnimal(x, z, rnd);
      placed++;
    }
  }

  _buildAnimal(x, z, rnd) {
    const g = new THREE.Group();
    const furColor = [0xd8c8a8, 0xb89060, 0xe8e0d0, 0x9a7a54][Math.floor(rnd() * 4)];
    const fur = new THREE.MeshStandardMaterial({ color: furColor, roughness: 1 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), fur);
    body.scale.set(1, 0.8, 1.3); body.position.y = 0.5;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 8), fur);
    head.position.set(0, 0.72, 0.55);
    g.add(head);
    for (const sx of [-0.13, 0.13]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 5), fur);
      ear.position.set(sx, 1.1, 0.5); ear.rotation.x = -0.2;
      g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
      eye.position.set(sx, 0.75, 0.83);
      g.add(eye);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
    tail.position.set(0, 0.5, -0.72);
    g.add(tail);
    g.traverse((o) => { o.castShadow = true; });
    g.position.set(x, terrainHeightAt(x, z), z);
    this.add(g);
    this.animals.push({ group: g, x, z, alive: true, dir: rnd() * Math.PI * 2, wt: rnd() * 6, hop: 0 });
  }

  // --------------------------------------------------------- marcadores UI 3D
  _glowMark(x, y, z, color) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    m.position.set(x, y, z);
    this.add(m);
    this._animated.push((t) => {
      m.position.y = y + Math.sin(t * 2) * 0.15;
    });
    return m;
  }

  // Haz de luz que guía hacia una pista
  _buildBeacon(idx, pos, color, visible) {
    const y = this.heightAt(pos.x, pos.z);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 2, 40, 12, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    beam.position.set(pos.x, y + 20, pos.z);
    beam.visible = visible;
    this.add(beam);
    this.beacons[idx] = beam;
    this._animated.push((t) => {
      beam.material.opacity = 0.18 + Math.sin(t * 2) * 0.08;
    });
  }

  showBeacon(idx) { if (this.beacons[idx]) this.beacons[idx].visible = true; }
  hideBeacon(idx) { if (this.beacons[idx]) this.beacons[idx].visible = false; }

  // ----------------------------------------------- montaña + portal al Mundo 2
  _buildMountainPortal() {
    const cx = MOUNTAIN.x, cz = MOUNTAIN.z;
    const base = terrainHeightAt(cx, cz);
    const height = 30;
    const rock = new THREE.MeshStandardMaterial({ color: 0x6f6a63, roughness: 1 });
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(16, height, 8), rock);
    mtn.position.set(cx, base + height / 2, cz);
    mtn.castShadow = true; mtn.receiveShadow = true;
    this.add(mtn);
    const snow = new THREE.Mesh(new THREE.ConeGeometry(6, 9, 8), new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 1 }));
    snow.position.set(cx, base + height - 4.5, cz);
    this.add(snow);

    // Portal (arco brillante) al pie de la montaña, mirando +Z
    const portalZ = cz + 15;
    const pg = terrainHeightAt(cx, portalZ);
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.6, 10, 20, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x5a4b86, emissive: 0x3a2a66, emissiveIntensity: 0.6, roughness: 0.6 })
    );
    arch.position.set(cx, pg + 2.4, portalZ);
    this.add(arch);
    const portal = new THREE.Mesh(
      new THREE.CircleGeometry(2.5, 24),
      new THREE.MeshBasicMaterial({ color: 0x9a7be0, transparent: true, opacity: 0.85 })
    );
    portal.position.set(cx, pg + 2.4, portalZ + 0.06);
    this.add(portal);
    this._animated.push((t) => {
      portal.material.opacity = 0.55 + Math.sin(t * 3) * 0.22;
      portal.scale.setScalar(1 + Math.sin(t * 2) * 0.04);
    });

    this.colliders.push({ x: cx, z: cz, r: 11 }); // no atravesar la montaña
    this.interactables.push({
      id: 'portal', kind: 'portal', pistaIdx: 4,
      position: new THREE.Vector3(cx, pg + 2, portalZ), radius: 4.5,
      prompt: 'Presioná [E] para cruzar el portal al Mundo 2',
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 2, 44, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xb69bff, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    beam.position.set(cx, pg + 22, portalZ);
    beam.visible = false;
    this.add(beam);
    this._portalBeacon = beam;
  }
  showPortalBeacon() { if (this._portalBeacon) this._portalBeacon.visible = true; }

  // ==================================================== Mundo 2 (el bosque) ===
  _buildForest() {
    this.scene.background = new THREE.Color(0x2a3d2c);
    this.scene.fog = new THREE.Fog(0x33482f, 34, 180);

    const sun = new THREE.DirectionalLight(0xe6f6dc, 1.0);
    sun.position.set(40, 70, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const d = 110;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d; sun.shadow.camera.far = 300;
    this.add(sun);
    this.add(new THREE.HemisphereLight(0x9ab890, 0x2a3a24, 0.95));

    // Suelo del bosque
    const geo = new THREE.PlaneGeometry(300, 300, 120, 120);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = forestHeightAt(x, z);
      pos.setY(i, h);
      c.setHex(h > 4.2 ? 0x40602f : 0x35502a);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    ground.receiveShadow = true;
    this.add(ground);

    // Pinos del bosque
    let seed = 4242;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 150; i++) {
      const x = (rnd() - 0.5) * 230;
      const z = (rnd() - 0.5) * 230;
      if (Math.hypot(x - MINE.x, z - MINE.z) < 16) continue;
      if (Math.hypot(x - SPAWN2.x, z - SPAWN2.z) < 8) continue;
      if (Math.hypot(x - PALMERA.x, z - PALMERA.z) < 12) continue;
      if (Math.hypot(x - CASA.x, z - CASA.z) < 16) continue;
      if (Math.hypot(x - CASTILLO.x, z - CASTILLO.z) < 22) continue;
      if (Math.abs(x) < 4 && z > 56 && z < 84) continue; // camino del puente
      this._pine(x, z, rnd);
    }

    this._buildMine(); // Pista 5
    this._buildPalmera(); // Pista 6
    this._buildCasa(); // Pista 7
    this._buildCastillo(); // Pista 8 (+ esqueleto que persigue)
    this._buildBridgeTreasure(); // final: puente + cofre del tesoro

    this._buildBeacon(4, MINE, 0xffb14a, true);
    this._buildBeacon(5, PALMERA, 0xffe24a, false);
    this._buildBeacon(6, CASA, 0xb98cff, false);
    this._buildBeacon(7, CASTILLO, 0xff6a6a, false);
    this._buildTreasureBeacon();
  }

  _pine(x, z, rnd) {
    const y = forestHeightAt(x, z);
    const g = new THREE.Group();
    const trunkH = 1.8 + rnd() * 1.2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, trunkH, 6), new THREE.MeshStandardMaterial({ color: 0x5a3d22, roughness: 1 }));
    trunk.position.y = trunkH / 2;
    g.add(trunk);
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 1 });
    const tiers = 3;
    for (let t = 0; t < tiers; t++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4 - t * 0.6, 2.4, 7), leaf);
      cone.position.y = trunkH + t * 1.5;
      g.add(cone);
    }
    g.traverse((o) => { o.castShadow = true; });
    g.position.set(x, y, z);
    g.scale.setScalar(0.8 + rnd() * 0.8);
    this.add(g);
    this.colliders.push({ x, z, r: 0.9 });
  }

  _buildMine() {
    const cx = MINE.x, cz = MINE.z;
    const g = forestHeightAt(cx, cz);
    const metal = new THREE.MeshStandardMaterial({ color: 0x5a5550, metalness: 0.4, roughness: 0.6 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
    const cartMat = new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.85 });

    // Pared rocosa con boca de túnel (fondo de la mina)
    const wall = new THREE.Mesh(new THREE.BoxGeometry(22, 13, 5), new THREE.MeshStandardMaterial({ color: 0x574f47, roughness: 1 }));
    wall.position.set(cx, forestHeightAt(cx, cz - 11) + 5.5, cz - 11);
    wall.castShadow = true; wall.receiveShadow = true;
    this.add(wall);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 1), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
    mouth.position.set(cx, g + 3, cz - 8.4);
    this.add(mouth);
    this.colliders.push({ x: cx, z: cz - 11, r: 9 });

    // Vigas de madera de la entrada
    for (const sx of [-2.8, 2.8]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), wood);
      beam.position.set(cx + sx, g + 3, cz - 8);
      this.add(beam);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.6, 0.6), wood);
    lintel.position.set(cx, g + 6, cz - 8);
    this.add(lintel);

    // Rieles + durmientes
    for (const sx of [-0.8, 0.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 22), metal);
      rail.position.set(cx + sx, g + 0.12, cz);
      rail.castShadow = true;
      this.add(rail);
    }
    for (let zz = cz - 9; zz <= cz + 9; zz += 1.4) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.4), wood);
      tie.position.set(cx, g + 0.05, zz);
      this.add(tie);
    }

    // Carrito minero
    const cart = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.7), cartMat);
    body.position.y = 1.15;
    cart.add(body);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 1.4), new THREE.MeshStandardMaterial({ color: 0x2a1c10 }));
    inner.position.y = 1.35;
    cart.add(inner);
    for (const wx of [-0.9, 0.9]) {
      for (const wz of [-0.6, 0.6]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x2a2724 }));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.45, wz);
        cart.add(wheel);
      }
    }
    cart.traverse((o) => { o.castShadow = true; });
    cart.position.set(cx, g, cz + 2);
    this.add(cart);
    this.colliders.push({ x: cx, z: cz + 2, r: 1.7 });

    // Cartel de madera con la inscripción
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), wood);
    post.position.set(cx - 5, g + 1.3, cz + 4);
    this.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 0.16), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1 }));
    board.position.set(cx - 5, g + 2.1, cz + 4);
    board.rotation.y = 0.35;
    board.castShadow = true;
    this.add(board);
    this._glowMark(cx - 5, g + 3.1, cz + 4, 0xffd27a);

    // Cofre de la Pista 5
    const chest = this._buildChest(cx + 4, forestHeightAt(cx + 4, cz + 2), cz + 2, 4);

    this.interactables.push({
      id: 'insc-4', kind: 'inscription', pistaIdx: 4,
      position: new THREE.Vector3(cx - 5, g + 2, cz + 4), radius: 4.5,
      prompt: 'Presioná [E] para leer el cartel de la mina',
    });
    this.interactables.push({
      id: 'chest-4', kind: 'chest', pistaIdx: 4,
      position: chest.position.clone(), radius: 4,
      prompt: 'Presioná [E] para abrir el cofre',
    });
    this.colliders.push({ x: cx - 5, z: cz + 4, r: 0.9 });
    this.colliders.push({ x: chest.position.x, z: chest.position.z, r: 1.6 });
  }

  // ------------------------------------------------- helper: cartel + cofre (P6-P8)
  _signAndChest(sx, sz, cx, cz, idx, signPrompt) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
    const sg = this.heightAt(sx, sz);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), wood);
    post.position.set(sx, sg + 1.3, sz);
    this.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 0.16), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1 }));
    board.position.set(sx, sg + 2.1, sz);
    board.rotation.y = 0.3;
    board.castShadow = true;
    this.add(board);
    this._glowMark(sx, sg + 3.1, sz, 0xffd27a);
    const chest = this._buildChest(cx, this.heightAt(cx, cz), cz, idx);
    this.interactables.push({ id: `insc-${idx}`, kind: 'inscription', pistaIdx: idx, position: new THREE.Vector3(sx, sg + 2, sz), radius: 4.5, prompt: signPrompt });
    this.interactables.push({ id: `chest-${idx}`, kind: 'chest', pistaIdx: idx, position: chest.position.clone(), radius: 4, prompt: 'Presioná [E] para abrir el cofre' });
    this.colliders.push({ x: sx, z: sz, r: 0.9 });
    this.colliders.push({ x: chest.position.x, z: chest.position.z, r: 1.6 });
  }

  // --------------------------------------------------------------- Pista 6: palmera
  _buildPalmera() {
    const cx = PALMERA.x, cz = PALMERA.z, g = forestHeightAt(cx, cz);
    const palm = new THREE.Group();
    const trunkH = 7;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.62, trunkH, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1 }));
    trunk.position.y = trunkH / 2; trunk.rotation.z = 0.08;
    palm.add(trunk);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f9b47, roughness: 1, side: THREE.DoubleSide });
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 4), leafMat);
      const a = (k / 7) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.7, trunkH + 0.2, Math.sin(a) * 1.7);
      leaf.rotation.z = Math.PI / 2.3; leaf.rotation.y = -a;
      palm.add(leaf);
    }
    for (let k = 0; k < 3; k++) {
      const coco = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), new THREE.MeshStandardMaterial({ color: 0x5a3d22 }));
      coco.position.set(Math.cos(k * 2) * 0.6, trunkH - 0.5, Math.sin(k * 2) * 0.6);
      palm.add(coco);
    }
    palm.traverse((o) => { o.castShadow = true; });
    palm.position.set(cx, g, cz);
    this.add(palm);
    this.colliders.push({ x: cx, z: cz, r: 1 });
    // piedras del claro
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const rx = cx + Math.cos(a) * 5.5, rz = cz + Math.sin(a) * 5.5;
      const s = 0.6 + (a % 1) * 0.4;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), new THREE.MeshStandardMaterial({ color: 0x7d766a, roughness: 1 }));
      rock.position.set(rx, forestHeightAt(rx, rz) + s * 0.3, rz);
      this.add(rock);
    }
    this._signAndChest(cx - 4, cz + 4, cx + 4, cz + 3, 5, 'Presioná [E] para leer la tabla bajo la palmera');
  }

  // ------------------------------------------------------- Pista 7: casa embrujada
  _buildCasa() {
    const cx = CASA.x, cz = CASA.z, g = forestHeightAt(cx, cz);
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 7), darkWood);
    body.position.set(cx, g + 2.5, cz); body.castShadow = true; body.receiveShadow = true;
    this.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 3, 4), new THREE.MeshStandardMaterial({ color: 0x2f2016, roughness: 1 }));
    roof.rotation.y = Math.PI / 4; roof.position.set(cx, g + 6.4, cz); roof.castShadow = true;
    this.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3, 0.2), dark);
    door.position.set(cx, g + 1.5, cz + 3.55);
    this.add(door);
    for (const sx of [-2.4, 2.4]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.2), dark);
      win.position.set(cx + sx, g + 3.2, cz + 3.55);
      this.add(win);
    }
    // cerco de madera (frente y laterales, con hueco de entrada)
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x5e4a35, roughness: 1 });
    for (let i = -7; i <= 7; i += 1.6) {
      for (const [px, pz] of [[i, 7.5], [i, -7.5], [7.5, i], [-7.5, i]]) {
        if (pz === 7.5 && Math.abs(px) < 1.6) continue; // hueco de entrada
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.22), fenceMat);
        post.position.set(cx + px, forestHeightAt(cx + px, cz + pz) + 0.75, cz + pz);
        this.add(post);
      }
    }
    this.colliders.push({ x: cx, z: cz, r: 5 });
    this._signAndChest(cx - 2.8, cz + 6.5, cx + 2.8, cz + 6.5, 6, 'Presioná [E] para leer la pared de la casa');
  }

  // ----------------------------------------------------------- Pista 8: castillo
  _buildCastillo() {
    const cx = CASTILLO.x, cz = CASTILLO.z, g = forestHeightAt(cx, cz);
    const stone = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x141210, roughness: 1 });
    const keep = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 12), stone);
    keep.position.set(cx, g + 4.5, cz); keep.castShadow = true; keep.receiveShadow = true;
    this.add(keep);
    // almenas
    for (let i = -3; i <= 3; i++) {
      for (const zz of [cz - 6, cz + 6]) {
        const merlon = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), stone);
        merlon.position.set(cx + i * 2.3, g + 9.6, zz);
        this.add(merlon);
      }
    }
    // torre
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 13, 10), stone);
    tower.position.set(cx - 9, g + 6.5, cz - 3); tower.castShadow = true;
    this.add(tower);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1), stone);
      merlon.position.set(cx - 9 + Math.cos(a) * 2.7, g + 13.2, cz - 3 + Math.sin(a) * 2.7);
      this.add(merlon);
    }
    // portón oscuro (norte, hacia el jugador)
    const gate = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5, 0.5), dark);
    gate.position.set(cx, g + 2.5, cz - 6.2);
    this.add(gate);
    // arañas (bolitas negras colgando)
    for (const [sx, sy, sz] of [[4, 7, -6.3], [-5, 6, -6.3]]) {
      const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2, 4), dark);
      thread.position.set(cx + sx, g + sy + 1, cz + sz);
      this.add(thread);
      const spider = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), dark);
      spider.position.set(cx + sx, g + sy, cz + sz);
      this.add(spider);
    }
    this.colliders.push({ x: cx, z: cz, r: 9 });
    this.colliders.push({ x: cx - 9, z: cz - 3, r: 3 });

    this._buildSkeleton(cx, cz - 15);
    this._signAndChest(cx - 4, cz - 13, cx + 4, cz - 13, 7, 'Presioná [E] para leer la placa del castillo');
  }

  _buildSkeleton(x, z) {
    const g = new THREE.Group();
    const bone = new THREE.MeshStandardMaterial({ color: 0xeae6d8, roughness: 0.8 });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), bone);
    skull.position.y = 3.3; g.add(skull);
    for (const ex of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      eye.position.set(ex, 3.35, 0.42); g.add(eye);
    }
    const rib = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.6), bone);
    rib.position.y = 2.1; g.add(rib);
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6), bone);
    spine.position.y = 2.7; g.add(spine);
    for (const sx of [-0.7, 0.7]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 6), bone);
      arm.position.set(sx, 2.1, 0); arm.rotation.z = sx > 0 ? 0.3 : -0.3; g.add(arm);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.8, 6), bone);
      leg.position.set(sx * 0.5, 0.9, 0); g.add(leg);
    }
    g.traverse((o) => { o.castShadow = true; });
    g.position.set(x, forestHeightAt(x, z), z);
    g.visible = false;
    this.add(g);
    this.skeleton = { group: g, x, z, homeX: x, homeZ: z };
  }

  // ----------------------------------------------- final: puente + cofre del tesoro
  _buildBridgeTreasure() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
    const rope = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 1 });
    const baseY = forestHeightAt(0, 70);
    // abismo oscuro
    const chasm = new THREE.Mesh(new THREE.BoxGeometry(34, 5, 20), new THREE.MeshBasicMaterial({ color: 0x070707 }));
    chasm.position.set(0, baseY - 2.6, 70);
    this.add(chasm);
    // puente de tablas
    const bridge = new THREE.Group();
    for (let zz = 62; zz <= 78; zz += 1.1) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 0.9), wood);
      plank.position.set(0, baseY, zz);
      bridge.add(plank);
    }
    for (const sx of [-1.6, 1.6]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 16, 5), rope);
      r.rotation.x = Math.PI / 2;
      r.position.set(sx, baseY + 1.3, 70);
      bridge.add(r);
      for (let zz = 62; zz <= 78; zz += 2.2) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 4), rope);
        post.position.set(sx, baseY + 0.7, zz);
        bridge.add(post);
      }
    }
    bridge.traverse((o) => { o.castShadow = true; });
    this.add(bridge);

    // pedestal + cofre del tesoro
    const tx = TREASURE.x, tz = TREASURE.z, tg = forestHeightAt(tx, tz);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 1.5, 12), new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 1 }));
    pedestal.position.set(tx, tg + 0.75, tz); pedestal.receiveShadow = true;
    this.add(pedestal);
    const gold = new THREE.MeshStandardMaterial({ color: 0xf4c95d, metalness: 0.7, roughness: 0.3, emissive: 0x6a4e00, emissiveIntensity: 0.4 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 2.6), new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.8 }));
    box.position.set(tx, tg + 2.6, tz); box.castShadow = true;
    this.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.4, 2.7), gold);
    band.position.set(tx, tg + 3.1, tz);
    this.add(band);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.3), gold);
    lock.position.set(tx, tg + 2.6, tz + 1.35);
    this.add(lock);
    const glow = new THREE.PointLight(0xffe08a, 2.2, 30, 2);
    glow.position.set(tx, tg + 4, tz);
    this.add(glow);
    this._glowMark(tx, tg + 4.6, tz, 0xfff1a8);

    this.interactables.push({ id: 'treasure', kind: 'treasure', pistaIdx: 8, position: new THREE.Vector3(tx, tg + 2.5, tz), radius: 5, prompt: 'Presioná [E] para abrir el COFRE DEL TESORO' });
    this.colliders.push({ x: tx, z: tz, r: 2.6 });
  }

  _buildTreasureBeacon() {
    const y = forestHeightAt(TREASURE.x, TREASURE.z);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 2.2, 48, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.24, side: THREE.DoubleSide })
    );
    beam.position.set(TREASURE.x, y + 24, TREASURE.z);
    beam.visible = false;
    this.add(beam);
    this._treasureBeacon = beam;
    this._animated.push((t) => { beam.material.opacity = 0.18 + Math.sin(t * 2) * 0.09; });
  }
  showTreasureBeacon() { if (this._treasureBeacon) this._treasureBeacon.visible = true; }

  update(dt) {
    this._time += dt;
    for (const fn of this._animated) fn(this._time);
  }
}
