// Datos de las pistas del juego, en orden. Agregar una pista nueva es solo
// sumar un objeto a este array (y su escenario en world.js).

export const PISTAS = [
  {
    id: 'cueva',
    num: 1,
    place: 'la cueva',
    // Se descubre al inspeccionar la inscripción de la cueva.
    inscription:
      'Grabado en la pared de la cueva, con letras temblorosas:\n\n' +
      '  "Naufragó quien no supo leer el cielo.\n' +
      '   Donde la tierra escupe fuego y humo,\n' +
      '   duerme el segundo secreto de la isla."\n\n' +
      '(Buscá en el horizonte de la isla... algo humea a lo lejos.)',
    question:
      'El cofre pide una palabra clave. Según la inscripción, ' +
      '¿qué lugar de la isla "escupe fuego y humo"?',
    answers: ['volcan', 'volcano', 'monte', 'montana de fuego'],
    hints: [
      'Mirá a lo lejos en la isla: hay una montaña de la que sube humo.',
      'Es una montaña que puede entrar en erupción y largar lava.',
      'Empieza con "V". Es un volc____.',
    ],
    solvedText:
      '¡El cofre se abre con un crujido! Dentro hay un trozo de mapa mojado ' +
      'que marca con una X el VOLCÁN de la isla.',
    nextObjective:
      'Andá al VOLCÁN humeante y buscá la próxima pista en su altar de lava.',
  },
  {
    id: 'volcan',
    num: 2,
    place: 'el volcán',
    inscription:
      'Las vetas de lava del obelisco dibujan una frase que arde y se apaga:\n\n' +
      '  "El fuego se cansa y la sed aparece.\n' +
      '   Buscá el ojo de agua dulce,\n' +
      '   donde la isla se mira a sí misma\n' +
      '   y el cielo se refleja quieto."\n\n' +
      '(No es el mar salado... es agua calma y dulce, tierra adentro.)',
    question:
      'El cofre del altar pide otra palabra. Según las vetas de lava, ' +
      '¿cuál es ese "ojo de agua dulce" donde la isla se refleja?',
    answers: ['lago', 'laguna', 'estanque', 'lago de la isla'],
    hints: [
      'No es el mar (ese es salado). Es agua dulce y quieta, tierra adentro.',
      'Es un espejo de agua donde se reflejan las nubes.',
      'Empieza con "L". Es un lag_.',
    ],
    solvedText:
      '¡El segundo cofre cede! Adentro, otro pedazo de mapa marca un LAGO ' +
      'de aguas calmas en el corazón de la isla.',
    nextObjective:
      'Buscá el LAGO de aguas calmas en el corazón de la isla y su piedra junto al agua.',
  },
  {
    id: 'lago',
    num: 3,
    place: 'el lago',
    inscription:
      'En una piedra musgosa junto al agua, alguien grabó hace mucho:\n\n' +
      '  "En el espejo del lago no te mires vos:\n' +
      '   mirá lo que duerme detrás.\n' +
      '   Escamas verdes, aliento de fuego,\n' +
      '   guarda el paso al otro mundo."\n\n' +
      '(La bestia alada que escupe fuego... la que aparece en los cuentos.)',
    question:
      'El reflejo del lago revela a la criatura que custodia el paso. ' +
      '¿Qué bestia de escamas y fuego es?',
    answers: ['dragon', 'el dragon', 'draco', 'dragón'],
    hints: [
      'Es una criatura de los cuentos: vuela y escupe fuego.',
      'Tiene escamas verdes y alas enormes.',
      'Empieza con "D". Es un drag__.',
    ],
    solvedText:
      '¡El tercer cofre se abre! El mapa ahora arde en los bordes: marca la ' +
      'guarida del DRAGÓN, el guardián del paso hacia el Mundo 2.',
    nextObjective:
      'Cruzá la isla hasta la guarida del DRAGÓN y buscá su tesoro. ' +
      '⚠️ ¡Cuidado con su fuego! Rodealo para llegar al cofre.',
  },
  {
    id: 'dragon',
    num: 4,
    place: 'la guarida del dragón',
    inscription:
      'Entre huesos y monedas, una placa de oro derretida dice:\n\n' +
      '  "Yo guardo el fuego, pero no el camino.\n' +
      '   El otro mundo no está bajo tierra ni en el mar:\n' +
      '   está ARRIBA. Trepá lo más alto de la isla\n' +
      '   y cruzarás al otro lado."\n\n' +
      '(¿Cuál es el punto más alto que se sube para pasar al Mundo 2?)',
    question:
      'Según la placa del dragón, para cruzar al Mundo 2 hay que trepar ' +
      'lo más alto de la isla. ¿Qué hay que subir?',
    answers: ['montana', 'la montana', 'montaña', 'cima', 'cumbre', 'cerro'],
    hints: [
      'No es bajo tierra ni en el agua: hay que ir hacia ARRIBA.',
      'Es la parte más alta de la isla, que se trepa.',
      'Empieza con "M". Es una monta__.',
    ],
    solvedText:
      '¡El dragón resopla y se aparta! El cofre guarda la última pieza del ' +
      'mapa: un sendero que sube la MONTAÑA hacia el Mundo 2.',
    // Última pista implementada por ahora: al resolverla se muestra la victoria.
    nextObjective: null,
  },
];

// Normaliza una respuesta del jugador para compararla con las aceptadas.
export function normalize(text) {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes/diacríticos
    .replace(/^(el|la|los|las|un|una)\s+/, '') // quita artículo inicial
    .replace(/\s+/g, ' ');
}

export function isCorrect(pista, text) {
  const n = normalize(text);
  return pista.answers.some((a) => normalize(a) === n);
}
