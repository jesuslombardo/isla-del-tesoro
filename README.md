# 🏴‍☠️ La Isla del Tesoro

Juego 3D en primera persona (WebGL / Three.js) sobre un naufragio y la búsqueda
de un tesoro. Corre 100% en el navegador, **sin build step** y sin dependencias
externas en tiempo de ejecución (Three.js está vendorizado en `vendor/`).

> **Estado: 🏆 JUEGO COMPLETO.** Los **2 mundos** y las **8 pistas** son jugables
> de punta a punta (naufragio → cueva, volcán, lago, dragón → montaña/portal →
> carrito, palmera, casa embrujada, castillo con esqueleto → puente + llave →
> **cofre del tesoro**). Con 3 vidas, peligros (fuego del dragón, esqueleto que
> persigue), plata (💎/⭐) que se junta, celular con mapa, audio ambiente y
> controles para **PC y celular**.

▶️ **Jugar online:** https://jesuslombardo.github.io/isla-del-tesoro/
(se publica solo vía GitHub Pages en cada push a `main`).

## 🎮 Cómo se juega

Naufragaste en una isla desconocida. Entre los restos del barco encontraste un
mapa: la primera marca apunta a una **cueva**. Cada pista te lleva a la siguiente:
explorás el lugar, leés una inscripción y con esa clave abrís el **cofre** que
revela el próximo destino (cueva → volcán → …).

Funciona en **computadora y celular** (se detecta el dispositivo automáticamente).

**En computadora:**

| Tecla | Acción |
|-------|--------|
| `W` `A` `S` `D` / flechas | Moverte |
| Mouse | Mirar (click para capturar el puntero) |
| `Shift` | Correr |
| `E` | Interactuar (leer inscripción, abrir cofre) |
| `Esc` | Liberar el mouse / pausa |
| 💡 Pista | Pedir una ayuda contextual |

**En celular / tablet:**

| Control | Acción |
|---------|--------|
| 🕹️ Joystick (abajo izq.) | Moverte |
| 👆 Deslizar en pantalla | Mirar |
| ✋ Botón | Interactuar |
| 💡 Pista | Pedir una ayuda contextual |

### Reglas

- Tenés **3 vidas** ❤️❤️❤️.
- Las vidas se pierden **solo por peligros**: hundirte en el **mar profundo** o
  caer en una **trampa** (pozo). Al perder una vida reaparecés en el último punto
  seguro. Con 0 vidas, game over.
- Para resolver una pista: **explorás**, encontrás objetos/pistas y con eso
  respondés un **acertijo**.

## ▶️ Correr localmente

Al no tener build, alcanza con servir la carpeta con cualquier servidor estático:

```bash
cd isla-del-tesoro
python3 -m http.server 8099
# abrí http://127.0.0.1:8099/
```

(o `npx serve`, la extensión *Live Server* de VS Code, etc.)

> Abrir `index.html` directo con `file://` **no** funciona: los ES modules
> necesitan servirse por HTTP.

## 🧱 Estructura

```
isla-del-tesoro/
├── index.html        # HUD, overlays e importmap de Three.js
├── style.css         # estilos del HUD y modales (estética pergamino/oro)
├── vendor/           # Three.js vendorizado (no requiere internet)
│   ├── three.module.js
│   └── PointerLockControls.js
└── src/
    ├── main.js       # orquestador: game loop, estado, interacción
    ├── world.js      # isla 3D: terreno, mar, naufragio, cueva, volcán, flora
    ├── player.js     # controlador primera persona + colisiones + peligros
    ├── hud.js        # capa de interfaz (DOM)
    └── puzzles.js    # datos y validación de las pistas
```

## 🗺️ Roadmap (diseño completo del juego)

**Mundo 1 — La Isla**
- [x] Pista 0 · Naufragio (encontrás el mapa) — *punto de partida*
- [x] **Pista 1 · Cueva** ✅
- [x] **Pista 2 · Volcán** ✅
- [x] **Pista 3 · Lago** ✅
- [x] **Pista 4 · Dragón** ✅ (escupe fuego — ¡peligro!)
- [x] Subir la montaña → **portal** al Mundo 2 ✅

**Mundo 2 — El Bosque**
- [x] **Pista 5 · Carrito minero** ✅
- [x] **Pista 6 · Palmera** ✅
- [x] **Pista 7 · Casa embrujada** ✅
- [x] **Pista 8 · Castillo** con esqueleto viviente que te persigue ✅ (¡peligro!)
- [x] Puente colgante + llave → **el cofre del tesoro** 🗝️ ✅ **¡JUEGO COMPLETO!**

> 🏆 **El juego se puede terminar de punta a punta**: naufragio → 8 pistas en dos
> mundos → tesoro final.

## 🛠️ Tecnología

- [Three.js](https://threejs.org/) r160 (WebGL), vendorizado localmente.
- JavaScript ES modules nativos (sin bundler).
- Pensado para desplegarse como sitio estático (GitHub Pages, Netlify, itch.io…).
