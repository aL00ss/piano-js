// Transforme un fichier MIDI analysé en une suite de notes prêtes à jouer.
// Fonctions pures : la lecture du fichier binaire est confiée à @tonejs/midi.

const CONTROLEUR_PEDALE = 64;

/**
 * Convertit l'objet produit par @tonejs/midi en notes simples.
 * La première piste qui contient des notes est la main droite.
 */
export function depuisToneMidi(midi) {
  const notes = [];
  const pedale = [];
  let main = 0;
  for (const piste of midi.tracks) {
    for (const cc of piste.controlChanges?.[CONTROLEUR_PEDALE] ?? []) {
      pedale.push({ temps: cc.time, enfoncee: cc.value >= 0.5 });
    }
    if (!piste.notes.length) continue;
    for (const n of piste.notes) {
      notes.push({ midi: n.midi, temps: n.time, duree: n.duration, velocite: n.velocity, main });
    }
    main = Math.min(1, main + 1);
  }
  return preparerMorceau(notes, pedale);
}

/** Intervalles [début, fin[ pendant lesquels la pédale forte est enfoncée. */
export function intervallesPedale(pedale) {
  const intervalles = [];
  let debut = null;
  for (const e of [...pedale].sort((a, b) => a.temps - b.temps)) {
    if (e.enfoncee && debut === null) debut = e.temps;
    else if (!e.enfoncee && debut !== null) {
      intervalles.push([debut, e.temps]);
      debut = null;
    }
  }
  if (debut !== null) intervalles.push([debut, Infinity]);
  return intervalles;
}

/**
 * Calcule pour chaque note l'instant où elle cesse réellement de sonner :
 * une touche relâchée pendant que la pédale est enfoncée continue de résonner
 * jusqu'au relâchement de la pédale, sauf si la même touche est rejouée avant.
 */
export function preparerMorceau(notesBrutes, pedale = []) {
  const notes = notesBrutes
    .map((n) => ({ ...n, fin: n.temps + n.duree }))
    .sort((a, b) => a.temps - b.temps || a.midi - b.midi);
  const intervalles = intervallesPedale(pedale);

  for (const note of notes) {
    const lache = note.temps + note.duree;
    const tenue = intervalles.find(([debut, fin]) => debut <= lache && lache < fin);
    note.fin = tenue ? tenue[1] : lache;
  }

  const prochaine = new Map(); // midi -> instant de la prochaine attaque
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i];
    const suivante = prochaine.get(note.midi);
    if (suivante !== undefined && suivante > note.temps && note.fin > suivante) note.fin = suivante;
    prochaine.set(note.midi, note.temps);
  }

  let duree = 0;
  let tenueMax = 0;
  for (const note of notes) {
    if (!Number.isFinite(note.fin)) note.fin = note.temps + note.duree;
    note.fin = Math.max(note.fin, note.temps + 0.03);
    duree = Math.max(duree, note.fin);
    tenueMax = Math.max(tenueMax, note.duree);
  }
  return { notes, pedale: intervalles, duree, tenueMax };
}

/** Indice de la première note dont l'attaque est >= `temps` (recherche dichotomique). */
export function indiceA(notes, temps) {
  let bas = 0;
  let haut = notes.length;
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    if (notes[milieu].temps < temps) bas = milieu + 1;
    else haut = milieu;
  }
  return bas;
}

/** Notes dont la touche est enfoncée à l'instant `position`. */
export function touchesEnfoncees(morceau, position, dureeMin = 0.09) {
  const actives = [];
  const { notes } = morceau;
  for (let i = indiceA(notes, position - morceau.tenueMax - dureeMin); i < notes.length; i++) {
    const note = notes[i];
    if (note.temps > position) break;
    if (position < note.temps + Math.max(note.duree, dureeMin)) actives.push(note);
  }
  return actives;
}

/** Vrai si la pédale est enfoncée à l'instant `position`. */
export function pedaleA(morceau, position) {
  return morceau.pedale.some(([debut, fin]) => debut <= position && position < fin);
}
