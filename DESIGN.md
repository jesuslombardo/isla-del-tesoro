# 🏴‍☠️ La Isla del Tesoro — Biblia de diseño

Documento vivo con la visión del juego, basado en los bocetos hechos a mano
(con los chicos). Sirve de referencia para ir construyendo cada escena.

> Estado actual jugable: **Mundo 1**, Pistas 1 (cueva), 2 (volcán) y 3 (lago),
> encadenadas, con 3 vidas, hints y controles de PC + celular.

---

## 🎮 Concepto

Naufragás en una isla y seguís un rastro de pistas hasta el cofre del tesoro.
- 3D primera persona, estética low-poly cálida (tipo aventura).
- **3 vidas**; se pierden **solo por peligros** (mar profundo, trampas, el fuego
  del dragón, el esqueleto que persigue).
- Cada pista: **explorar + acertijo**. Encontrás una inscripción, y con esa
  clave abrís un cofre que revela el próximo destino.
- Se puede pedir **pistas (hints)**.

---

## 🗺️ Mundo 1 — La Isla

### Pista 0 · El barco (naufragio) — *inicio*
- **Barco pirata** con **velas rosas/magenta** y una **calavera** (bandera).
- **Empezás ADENTRO** del barco.
- Adentro hay **comida** y un **cofre con oro**.
- Ahí encontrás el **mapa** que arranca la aventura.
- *(Mejora pendiente: hoy el barco es un casco encallado simple → hacerlo barco
  pirata con velas rosas + calavera, y spawnear al jugador adentro.)*

### Pista 1 · La cueva ✅
- Cueva oscura; adentro hay una inscripción y el cofre. Antorcha.

### Pista 2 · El volcán ✅
- Altar de lava (obelisco con vetas) + cofre. Volcán humeante de fondo.

### Pista 3 · El lago ✅
- Espejo de agua en el corazón de la isla, juncos, nenúfares, piedra musgosa.

### Pista 4 · El dragón 🔜 (en construcción)
- **Dragón verde** con 4 patas, alas, cuello largo y **fuego rojo** por la boca.
- Es el **guardián del paso** al Mundo 2.
- **Peligro**: su fuego quita una vida → hay que rodearlo para llegar al cofre.

### Transición → subir la montaña → **Mundo 2**

---

## 🌲 Mundo 2 — El Bosque (otro plano)

### Pista 5 · El carrito minero
- **Carritos sobre rieles** en una mina/túnel (varios vagones encadenados).
- Te acercás / te subís y buscás la pista.

### Pista 6 · La palmera
- Palmera (tronco marrón, hojas verdes) en un entorno de mucho cielo/agua.
- Hay una pista.

### Pista 7 · La casa embrujada
- Casa con un **cerco de madera** alrededor, rodeada de **bosque**.
- Entrás y **adentro hay una pista**. Clima tenso/misterioso.

### Pista 8 · El castillo
- Castillo con **almenas**, **retratos/cuadros** con personajes, **arañas**,
  **escaleras**.
- Un **esqueleto que está vivo y TE PERSIGUE** → **peligro** (si te alcanza,
  perdés vida). El jugador lleva una antorcha.

### Final · El puente colgante
- Puente colgante con una **llave** → llegás al **cofre del tesoro**. 🗝️

---

## 🤿 Mecánica extra · El submarino
- Zona de **río + cielo** con un **submarino navegable**.
- Cambia el ritmo: en vez de caminar, **piloteás** el submarino y buscás una
  pista (bajo el agua / siguiendo el río).

---

## 🔊 Audio (pedido)
- **Ambiente de isla**: mar/viento suave + **pajaritos** cada tanto.
- **Pasos** al caminar (y algo distinto según arena / pasto / cueva).
- **Abrir el cofre**: crujido de madera + "chikachín" dorado.
- Extras: chapoteo del lago, crepitar de antorcha, rugido del volcán, rugido del
  dragón, ruidos del esqueleto en el castillo.
- Botón **🔊/🔇** para silenciar. Sonido sintetizado (Web Audio), sin archivos
  externos; si más adelante hay audios con licencia, se reemplazan.

---

---

## 📱 Celular / Inventario (idea nueva)

En el HUD hay un **celular chiquito**. Al apretarlo, se abre un **celular grande**
con una pantalla y varias **apps**:

- **🗺️ Mapa**: muestra el mapa del mundo actual. Al pasar de mundo, el mapa del
  Mundo 1 desaparece y aparece el del Mundo 2 (hay dos mapas dibujados que se
  intercambian).
- **❤️ Vidas**: cuántas vidas te quedan.
- **💎 Plata / Diamantes / Estrellas**: cuánta "plata" (diamantes o estrellas)
  tenés juntada.
- **🍗 Comida / Panza**: cuánta comida tenés; si la panza está vacía, hay que
  comer.
- **🧑 Tienda de personajes**: aparecen imágenes de personajes (los invento yo),
  y abajo de cada uno el precio en diamantes/estrellas. Comprás uno y en el
  juego **aparecés con ese personaje** (ese estilo).
- **🖼️ Fondo de pantalla del celu**: comprás fondos para la pantalla del celular
  (ej: Stitch, Mario Bros, u otros que invento), cada uno con su precio.

### Navegación del celular
- Cada **app** tiene una **flecha para volver** a la pantalla de apps del celular.
- La pantalla de apps del celular tiene una **flecha para salir** y volver al
  juego (queda el celular chiquito en el HUD y seguís jugando).

### 💰 Economía
- Moneda: **diamantes / estrellas** ("plata").
- Se gastan en la tienda (personajes y fondos).
- *(Pendiente definir: cómo se ganan — resolviendo pistas, juntando estrellas
  en el mapa, etc.)*

> Nota: es un sistema grande (UI de celular + apps + economía + skins + comida).
> Conviene construirlo por etapas: primero el celular con Mapa/Vidas/Plata, y
> después la tienda de personajes, fondos y la comida.

---

*Este documento se irá actualizando a medida que construimos cada escena.*
