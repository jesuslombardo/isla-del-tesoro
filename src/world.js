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

// --- Altura del terreno: isla como montículo radial con colinas suaves --------
export function terrainHeightAt(x, z) {
  const r = Math.hypot(x, z);
  const R = 96;
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
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; // { x, z, r }
    this.traps = []; // { x, z, r }
    this.interactables = []; // { id, kind, pistaIdx, position, radius, prompt }
    this.chests = []; // grupo del cofre por pista
    this.chestLids = []; // tapa del cofre por pista
    this.beacons = []; // haz de luz guía por pista
    this._animated = []; // objetos con update(t)
    this._time = 0;

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
    this._scatterVegetation();

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
    this.scene.add(new THREE.Mesh(geo, mat));
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
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfe0ee, 0x5a6a3a, 0.7));
  }

  // ------------------------------------------------------------------ terreno
  _buildTerrain() {
    const size = 320;
    const seg = 220;
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
    this.scene.add(mesh);
  }

  // -------------------------------------------------------------------- agua
  _buildWater() {
    const geo = new THREE.PlaneGeometry(1200, 1200, 80, 80);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1c6f97,
      transparent: true,
      opacity: 0.82,
      roughness: 0.25,
      metalness: 0.15,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = WATER_LEVEL;
    this.scene.add(water);
    this._waterBase = geo.attributes.position.array.slice();
    this._animated.push((t) => {
      const p = geo.attributes.position;
      const base = this._waterBase;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3];
        const z = base[i * 3 + 2];
        p.setY(i, Math.sin(x * 0.08 + t * 1.3) * 0.25 + Math.cos(z * 0.06 + t) * 0.25);
      }
      p.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- naufragio
  _buildShipwreck() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x4e3620, roughness: 0.9 });

    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(3.2, 12, 6, 12), wood);
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = 0.5;
    hull.scale.set(1, 1, 0.6);
    hull.position.y = 1.4;
    g.add(hull);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(15, 0.6, 5), woodDark);
    deck.position.y = 2.4;
    deck.rotation.y = 0.5;
    g.add(deck);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 12, 8), woodDark);
    mast.position.set(1, 6.5, 0);
    mast.rotation.z = 0.45;
    g.add(mast);

    const sail = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 5),
      new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 1, side: THREE.DoubleSide })
    );
    sail.position.set(-1.4, 8, 0.1);
    sail.rotation.z = 0.45;
    g.add(sail);

    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });

    const wz = SPAWN.z + 8;
    const y = terrainHeightAt(SPAWN.x, wz);
    g.position.set(SPAWN.x, y - 0.5, wz);
    g.rotation.y = -0.6;
    this.scene.add(g);
    this.colliders.push({ x: SPAWN.x, z: wz, r: 5.5 });
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
      this.scene.add(boulder);
      this.colliders.push({ x: bx, z: bz, r: s * 0.9 });
    }

    // Techo de roca (media esfera oscura) -> sensación de interior
    const roof = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), darkRock);
    roof.position.set(cx, ground + 7, cz);
    roof.castShadow = true;
    this.scene.add(roof);

    // Losa con la inscripción
    const slab = new THREE.Mesh(new THREE.BoxGeometry(4.5, 4, 0.6), darkRock);
    slab.position.set(cx - 5.2, ground + 2, cz - 4);
    slab.rotation.y = 0.6;
    slab.castShadow = true;
    this.scene.add(slab);
    this._glowMark(cx - 4.6, ground + 3.4, cz - 3.4, 0xffd27a);

    // Antorcha (luz + llama parpadeante)
    const torchPos = new THREE.Vector3(cx + 3, ground + 3, cz - 3);
    const torchLight = new THREE.PointLight(0xffa64d, 3.2, 26, 2);
    torchLight.position.copy(torchPos);
    this.scene.add(torchLight);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    flame.position.copy(torchPos);
    this.scene.add(flame);
    this._animated.push((t) => {
      const f = 0.75 + Math.sin(t * 18) * 0.15 + Math.sin(t * 7) * 0.1;
      torchLight.intensity = 3.2 * f;
      flame.scale.y = 0.85 + f * 0.3;
    });

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
    this.scene.add(cone);

    const crater = new THREE.Mesh(new THREE.CircleGeometry(4, 20), new THREE.MeshBasicMaterial({ color: 0xff5522 }));
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(x, base + height - 0.5, z);
    this.scene.add(crater);
    const lavaLight = new THREE.PointLight(0xff5522, 2.5, 60, 2);
    lavaLight.position.set(x, base + height + 2, z);
    this.scene.add(lavaLight);

    this.colliders.push({ x, z, r: 18 }); // no se puede atravesar

    // Humo
    const puffs = [];
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.5 });
    for (let i = 0; i < 10; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), smokeMat.clone());
      puff.position.set(x, base + height, z);
      puff.userData.o = Math.random() * 6;
      this.scene.add(puff);
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
    this.scene.add(obelisk);

    // Vetas de lava brillante en el obelisco
    const veins = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 5.1, 0.15),
      new THREE.MeshBasicMaterial({ color: 0xff6a2a })
    );
    veins.position.set(sx, ground + 2.5, sz);
    veins.rotation.y = 0.4;
    this.scene.add(veins);
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
      this.scene.add(r);
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
    this.scene.add(water);
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
      this.scene.add(rock);
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
      this.scene.add(reed);
    }

    // Nenúfares flotando
    const padMat = new THREE.MeshStandardMaterial({ color: 0x3f9b47, roughness: 1, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      const rr = LAKE_R * 0.5;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.8, 10), padMat);
      pad.rotateX(-Math.PI / 2);
      pad.position.set(cx + Math.cos(a) * rr, ground + 0.12, cz + Math.sin(a) * rr);
      this.scene.add(pad);
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
    this.scene.add(tablet);
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
    this.scene.add(d);

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
    this.scene.add(hoard);
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.4), gold);
    const pg = terrainHeightAt(hoardX, hoardZ);
    plaque.position.set(hoardX, pg + 1.4, hoardZ);
    plaque.rotation.set(-0.25, 0.3, 0);
    plaque.castShadow = true;
    this.scene.add(plaque);
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
    this.scene.add(fireGroup);
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
    this.scene.add(fireLight);

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
    this.scene.add(g);
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
    this.scene.add(ring);
    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.35, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0x5b5348, roughness: 1 })
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(x, y + 0.1, z);
    edge.castShadow = true;
    this.scene.add(edge);
    this.traps.push({ x, z, r: 2.2 });
  }

  // ------------------------------------------------------------- vegetación
  _scatterVegetation() {
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 90; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = 8 + rnd() * 82;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const h = terrainHeightAt(x, z);
      if (h < 1 || h > 9) continue;
      if (Math.hypot(x - CAVE.x, z - CAVE.z) < 12) continue;
      if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 22) continue;
      if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < 11) continue;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE_R + 5) continue;
      if (Math.hypot(x - DRAGON.x, z - DRAGON.z) < 18) continue;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 10) continue;
      if (rnd() < 0.6) this._palm(x, h, z, rnd);
      else this._rock(x, h, z, rnd);
    }
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
    this.scene.add(g);
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
    this.scene.add(rock);
    this.colliders.push({ x, z, r: s * 0.8 });
  }

  // --------------------------------------------------------- marcadores UI 3D
  _glowMark(x, y, z, color) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    m.position.set(x, y, z);
    this.scene.add(m);
    this._animated.push((t) => {
      m.position.y = y + Math.sin(t * 2) * 0.15;
    });
    return m;
  }

  // Haz de luz que guía hacia una pista
  _buildBeacon(idx, pos, color, visible) {
    const y = terrainHeightAt(pos.x, pos.z);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 2, 40, 12, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    beam.position.set(pos.x, y + 20, pos.z);
    beam.visible = visible;
    this.scene.add(beam);
    this.beacons[idx] = beam;
    this._animated.push((t) => {
      beam.material.opacity = 0.18 + Math.sin(t * 2) * 0.08;
    });
  }

  showBeacon(idx) { if (this.beacons[idx]) this.beacons[idx].visible = true; }
  hideBeacon(idx) { if (this.beacons[idx]) this.beacons[idx].visible = false; }

  update(dt) {
    this._time += dt;
    for (const fn of this._animated) fn(this._time);
  }
}
