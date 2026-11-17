// Théorie musicale et géométrie du clavier : fonctions pures, sans accès au DOM.

export const NOTE_MIN = 21; // la le plus grave d'un piano (A0)
export const NOTE_MAX = 108; // do le plus aigu (C8)
export const NB_BLANCHES = 52;

const NOMS_FR = ["Do", "Do♯", "Ré", "Ré♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
const NOMS_EN = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOIRES = new Set([1, 3, 6, 8, 10]);

// Décalage du centre de chaque touche noire par rapport à la jointure de ses
// deux voisines blanches (en largeur de touche blanche), comme sur un vrai piano.
const DECALAGE_NOIRE = { 1: -0.07, 3: 0.07, 6: -0.1, 8: 0, 10: 0.1 };
export const LARGEUR_NOIRE = 0.58;
export const HAUTEUR_NOIRE = 0.63; // part de la hauteur du clavier

export const estNoire = (midi) => NOIRES.has(((midi % 12) + 12) % 12);

/** Nom français, avec l'octave française (La3 = 440 Hz). */
export function nomFrancais(midi) {
  return `${NOMS_FR[midi % 12]}${Math.floor(midi / 12) - 2}`;
}

/** Nom international (A4 = 440 Hz), celui qu'attend Tone.js. */
export function nomAnglais(midi) {
  return `${NOMS_EN[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function frequence(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Géométrie des 88 touches. Les abscisses sont exprimées en largeurs de touche
 * blanche : le clavier complet mesure donc 52 unités.
 */
export function disposition() {
  const touches = [];
  let blanches = 0;
  for (let midi = NOTE_MIN; midi <= NOTE_MAX; midi++) {
    if (estNoire(midi)) {
      const centre = blanches + DECALAGE_NOIRE[midi % 12];
      touches.push({ midi, noire: true, x: centre - LARGEUR_NOIRE / 2, largeur: LARGEUR_NOIRE });
    } else {
      touches.push({ midi, noire: false, x: blanches, largeur: 1 });
      blanches++;
    }
  }
  return touches;
}

const TOUCHES = disposition();
const PAR_MIDI = new Map(TOUCHES.map((t) => [t.midi, t]));
const BLANCHES = TOUCHES.filter((t) => !t.noire);
const NOIRES_TRIEES = TOUCHES.filter((t) => t.noire);

export const touche = (midi) => PAR_MIDI.get(midi);

/**
 * Touche située sous un point. `x` est en largeurs de touche blanche,
 * `y` entre 0 (haut du clavier) et 1 (bas). Renvoie un numéro MIDI ou null.
 */
export function toucheSous(x, y) {
  if (x < 0 || x >= NB_BLANCHES || y < 0 || y > 1) return null;
  if (y <= HAUTEUR_NOIRE) {
    for (const t of NOIRES_TRIEES) {
      if (x >= t.x && x < t.x + t.largeur) return t.midi;
    }
  }
  return BLANCHES[Math.floor(x)].midi;
}

/** Durée lisible : 185 -> « 3:05 ». */
export function formaterDuree(secondes) {
  const s = Math.max(0, Math.round(secondes));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
