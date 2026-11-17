// Correspondance entre le clavier de l'ordinateur et les touches du piano.
// On utilise `event.code` (la position physique de la touche) : la disposition
// reste donc la même sur un clavier AZERTY ou QWERTY, seules les étiquettes changent.

import { NOTE_MAX, NOTE_MIN } from "./theorie.js";

// Rangée du bas : une octave et demie à partir du do de base.
const RANGEE_BASSE = ["KeyZ", "KeyS", "KeyX", "KeyD", "KeyC", "KeyV", "KeyG", "KeyB", "KeyH", "KeyN", "KeyJ", "KeyM",
  "Comma", "KeyL", "Period", "Semicolon", "Slash"];
// Rangée du haut : à partir du do de l'octave suivante.
const RANGEE_HAUTE = ["KeyQ", "Digit2", "KeyW", "Digit3", "KeyE", "KeyR", "Digit5", "KeyT", "Digit6", "KeyY", "Digit7",
  "KeyU", "KeyI", "Digit9", "KeyO", "Digit0", "KeyP", "BracketLeft", "Equal", "BracketRight"];

/** code physique -> nombre de demi-tons au-dessus du do de base */
export const DEMI_TONS = new Map([
  ...RANGEE_BASSE.map((code, i) => [code, i]),
  ...RANGEE_HAUTE.map((code, i) => [code, 12 + i]),
]);

export const BASE_DEFAUT = 48; // do2 français (C3) : la rangée du haut démarre au do central
export const BASE_MIN = 24;
export const BASE_MAX = 72;

const AZERTY = { KeyQ: "A", KeyW: "Z", KeyA: "Q", KeyZ: "W", KeyM: ",", Comma: ";", Period: ":", Slash: "!",
  Semicolon: "M", Digit2: "é", Digit3: '"', Digit5: "(", Digit6: "-", Digit7: "è", Digit9: "ç", Digit0: "à",
  BracketLeft: "^", Equal: "=", BracketRight: "$" };
const QWERTY = { Comma: ",", Period: ".", Slash: "/", Semicolon: ";", BracketLeft: "[", Equal: "=", BracketRight: "]" };

/** Caractère gravé sur une touche physique, selon la disposition. */
export function caractere(code, dispositionClavier = "azerty") {
  const table = dispositionClavier === "azerty" ? AZERTY : QWERTY;
  if (table[code]) return table[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return "";
}

/** Note MIDI jouée par une touche physique, ou null. */
export function noteDuCode(code, base = BASE_DEFAUT) {
  if (!DEMI_TONS.has(code)) return null;
  const midi = base + DEMI_TONS.get(code);
  return midi >= NOTE_MIN && midi <= NOTE_MAX ? midi : null;
}

/** Étiquettes à afficher sur le piano : note MIDI -> caractère du clavier. */
export function etiquettes(base = BASE_DEFAUT, dispositionClavier = "azerty") {
  const resultat = new Map();
  for (const code of [...RANGEE_BASSE, ...RANGEE_HAUTE]) {
    const midi = noteDuCode(code, base);
    if (midi !== null) resultat.set(midi, caractere(code, dispositionClavier));
  }
  return resultat;
}

/** Décale le do de base d'un nombre d'octaves, sans sortir du piano. */
export function decalerBase(base, octaves) {
  return Math.min(BASE_MAX, Math.max(BASE_MIN, base + 12 * octaves));
}

/** Devine la disposition du clavier (AZERTY pour un navigateur en français). */
export async function detecterDisposition(nav = globalThis.navigator) {
  try {
    const carte = await nav?.keyboard?.getLayoutMap?.();
    const q = carte?.get("KeyQ");
    if (q) return q.toLowerCase() === "a" ? "azerty" : "qwerty";
  } catch {
    // API indisponible ou refusée : on se rabat sur la langue
  }
  return (nav?.language ?? "fr").toLowerCase().startsWith("fr") ? "azerty" : "qwerty";
}
