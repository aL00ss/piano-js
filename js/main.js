// Point d'entrée : relie le clavier, le moteur sonore, le lecteur et l'interface.

import { BASE_DEFAUT, caractere, decalerBase, detecterDisposition, etiquettes, noteDuCode } from "./clavier-ordinateur.js";
import { Lecteur } from "./lecteur.js";
import { depuisToneMidi, indiceA, touchesEnfoncees } from "./morceau.js";
import { Moteur } from "./moteur.js";
import { Piano } from "./piano.js";
import { NB_BLANCHES, disposition, formaterDuree, touche } from "./theorie.js";

const $ = (selecteur) => document.querySelector(selecteur);
const horloge = () => performance.now() / 1000;

/** Réglages mémorisés d'une visite à l'autre (le navigateur peut refuser le stockage). */
const preferences = {
  lire(cle, defaut) {
    try {
      const valeur = localStorage.getItem(`piano.${cle}`);
      return valeur === null ? defaut : JSON.parse(valeur);
    } catch {
      return defaut;
    }
  },
  ecrire(cle, valeur) {
    try {
      localStorage.setItem(`piano.${cle}`, JSON.stringify(valeur));
    } catch {
      // stockage indisponible (navigation privée stricte) : le réglage vaut pour cette visite
    }
  },
};

const moteur = new Moteur(globalThis.Tone);
const lecteur = new Lecteur(moteur);
const piano = new Piano($("#clavier"));

const etat = {
  base: BASE_DEFAUT,
  disposition: "azerty",
  catalogue: [],
  morceaux: new Map(), // id -> morceau préparé
  courant: null, // fiche du morceau chargé
  demande: 0,
  appuis: new Map(), // midi -> nombre de sources qui tiennent la touche
  codes: new Map(), // touche physique -> midi joué
  allumees: new Map(), // midi -> classe posée par la lecture automatique
  suiviSuspendu: 0,
};

// ------------------------------------------------------------------ jeu en direct

function attaquer(midi, velocite = 0.75) {
  reveillerLeSon();
  moteur.attaquer(midi, velocite);
  etat.appuis.set(midi, (etat.appuis.get(midi) ?? 0) + 1);
  piano.allumer(midi, "active");
}

function relacher(midi) {
  const reste = (etat.appuis.get(midi) ?? 0) - 1;
  if (reste > 0) {
    etat.appuis.set(midi, reste);
    return;
  }
  etat.appuis.delete(midi);
  moteur.relacher(midi);
  piano.eteindre(midi, "active");
}

function toutRelacher() {
  for (const midi of [...etat.appuis.keys()]) {
    etat.appuis.set(midi, 1);
    relacher(midi);
  }
  etat.codes.clear();
  moteur.pedale(false);
}

piano.addEventListener("attaque", (e) => {
  etat.suiviSuspendu = horloge() + 4;
  attaquer(e.detail.midi, e.detail.velocite);
});
piano.addEventListener("relache", (e) => relacher(e.detail.midi));

// --------------------------------------------------------- clavier de l'ordinateur

const surUneCommande = (cible) => cible instanceof Element && cible.matches("button, a");
const surUneGlissiere = (cible) => cible instanceof HTMLInputElement;

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === "Escape") {
    lecteur.arreter();
    return;
  }
  if (e.code === "Enter" || e.code === "NumpadEnter") {
    if (surUneCommande(e.target) || surUneGlissiere(e.target)) return;
    e.preventDefault();
    if (!e.repeat) basculerLecture();
    return;
  }
  if (e.code === "Space" && !surUneCommande(e.target)) {
    e.preventDefault();
    if (!e.repeat) moteur.pedale(true);
    return;
  }
  if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
    if (surUneGlissiere(e.target)) return; // les flèches règlent la glissière qui a le focus
    e.preventDefault();
    if (!e.repeat) changerOctave(e.code === "ArrowLeft" ? -1 : 1);
    return;
  }
  const midi = noteDuCode(e.code, etat.base);
  if (midi === null) return;
  e.preventDefault(); // évite la recherche rapide de Firefox sur « / » et « ' »
  if (e.repeat || etat.codes.has(e.code)) return;
  etat.codes.set(e.code, midi);
  attaquer(midi, 0.72);
});

document.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    moteur.pedale(false);
    return;
  }
  const midi = etat.codes.get(e.code);
  if (midi === undefined) return;
  etat.codes.delete(e.code);
  relacher(midi);
});

window.addEventListener("blur", toutRelacher);

// Après un clic à la souris, on rend le clavier au piano (sinon Espace réactiverait le bouton).
document.addEventListener("click", (e) => {
  if (e.detail > 0) e.target.closest?.("button")?.blur();
});

function changerOctave(sens) {
  const base = decalerBase(etat.base, sens);
  if (base === etat.base) return;
  etat.base = base;
  majEtiquettes();
  piano.centrerSur(base + 12);
}

function majEtiquettes() {
  piano.etiqueter(etiquettes(etat.base, etat.disposition));
  $("#disposition").textContent = etat.disposition.toUpperCase();
  $("#aide-bas").textContent = caractere("KeyZ", etat.disposition);
  $("#aide-bas-fin").textContent = caractere("Slash", etat.disposition);
  $("#aide-haut").textContent = caractere("KeyQ", etat.disposition);
  $("#aide-haut-fin").textContent = caractere("BracketRight", etat.disposition);
}

$("#disposition").addEventListener("click", () => {
  etat.disposition = etat.disposition === "azerty" ? "qwerty" : "azerty";
  preferences.ecrire("disposition", etat.disposition);
  majEtiquettes();
});

// ------------------------------------------------------------------- clavier MIDI
// Un clavier maître déjà autorisé par le navigateur est reconnu automatiquement.

navigator.permissions?.query({ name: "midi" }).then(async (permission) => {
  if (permission.state !== "granted") return;
  const acces = await navigator.requestMIDIAccess();
  const brancher = () => {
    for (const entree of acces.inputs.values()) entree.onmidimessage = surMessageMidi;
  };
  acces.onstatechange = brancher;
  brancher();
}).catch(() => {});

function surMessageMidi({ data }) {
  const [statut, numero, valeur = 0] = data;
  const commande = statut & 0xf0;
  if (commande === 0x90 && valeur > 0) attaquer(numero, valeur / 127);
  else if (commande === 0x80 || commande === 0x90) relacher(numero);
  else if (commande === 0xb0 && numero === 64) moteur.pedale(valeur >= 64);
}

// ------------------------------------------------------------------------ morceaux

function creerCarte(fiche, rang) {
  const li = document.createElement("li");
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "carte";
  bouton.dataset.id = fiche.id;
  const ajouter = (classe, texte) => {
    const span = document.createElement("span");
    span.className = classe;
    span.textContent = texte;
    bouton.append(span);
    return span;
  };
  ajouter("carte-num", String(rang + 1).padStart(2, "0"));
  const icone = ajouter("carte-icone", "");
  icone.setAttribute("aria-hidden", "true");
  icone.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
  ajouter("carte-titre", fiche.titre);
  ajouter("carte-auteur", fiche.compositeur);
  ajouter("carte-meta", formaterDuree(fiche.duree));
  ajouter("carte-barre", "").append(document.createElement("i"));
  bouton.setAttribute("aria-label", `${fiche.titre}, ${fiche.compositeur}, ${formaterDuree(fiche.duree)}`);
  bouton.setAttribute("aria-pressed", "false");
  bouton.title = `${fiche.oeuvre} (${fiche.annee})`;
  bouton.addEventListener("click", () => choisir(fiche));
  li.append(bouton);
  return li;
}

async function chargerMorceau(fiche) {
  if (!etat.morceaux.has(fiche.id)) {
    const reponse = await fetch(fiche.fichier);
    if (!reponse.ok) throw new Error(`Fichier introuvable : ${fiche.fichier}`);
    // @tonejs/midi convertit les tics en secondes en suivant la carte de tempo du fichier
    const midi = new globalThis.Midi(await reponse.arrayBuffer());
    etat.morceaux.set(fiche.id, depuisToneMidi(midi));
  }
  return etat.morceaux.get(fiche.id);
}

/** Un clic sur un morceau le joue du début à la fin ; un second clic l'arrête. */
async function choisir(fiche) {
  reveillerLeSon(); // dans le geste de l'utilisateur
  const demande = ++etat.demande;
  if (etat.courant?.id === fiche.id && lecteur.etat === "lecture") {
    lecteur.arreter();
    return;
  }
  if (etat.courant?.id === fiche.id && lecteur.etat === "pause") {
    lecteur.reprendre();
    return;
  }
  const carte = document.querySelector(`.carte[data-id="${fiche.id}"]`);
  carte.classList.add("charge");
  try {
    const [morceau] = await Promise.all([chargerMorceau(fiche), pianoPret]);
    if (demande !== etat.demande) return;
    // Sans sortie audio utilisable, on ne reste pas figé : le morceau est mis en attente
    // et démarrera tout seul dès que le son sera revenu.
    if (!(await essayerLeSon(2000))) {
      if (demande === etat.demande) sonIndisponible(fiche);
      return;
    }
    if (demande !== etat.demande) return;
    son.enAttente = null;
    etat.courant = fiche;
    lecteur.charger(morceau);
    lecteur.jouer(0);
  } catch (erreur) {
    console.error(erreur);
    $("#statut-texte").textContent = "Impossible de charger ce morceau.";
  } finally {
    carte.classList.remove("charge");
  }
}

function majCartes() {
  const actif = lecteur.etat !== "arret";
  for (const carte of document.querySelectorAll(".carte")) {
    const actuelle = actif && carte.dataset.id === etat.courant?.id;
    carte.classList.toggle("en-cours", actuelle);
    carte.classList.toggle("pause", actuelle && lecteur.etat === "pause");
    carte.setAttribute("aria-pressed", String(actuelle));
    if (!actuelle) carte.style.removeProperty("--ratio");
  }
  const titre = etat.courant ? `${etat.courant.titre} — ${etat.courant.compositeur}` : "";
  $("#statut-texte").textContent = son.bloque ? MESSAGE_SANS_SON
    : { lecture: titre, pause: `En pause · ${titre}`, arret: "Piano prêt" }[lecteur.etat];
  document.body.classList.toggle("sans-son", son.bloque);
  majBarre();
}

lecteur.addEventListener("etat", majCartes);

// -------------------------------------------------------------- sortie audio
// Le piano s'adapte tout seul aux changements de sortie audio (casque branché, sortie
// changée dans le système…). Si le son ne peut pas démarrer, il le dit, garde le morceau
// demandé et réessaie ; un contexte audio resté bloqué est remplacé par un neuf.

const MESSAGE_SANS_SON = "Aucune sortie audio utilisable : le son reviendra tout seul dès qu'une sortie sera disponible.";
const son = { voulu: false, bloque: false, enAttente: null, reprendre: false, verification: null, relancer: false, derniere: 0 };
const delai = (ms) => new Promise((fin) => setTimeout(fin, ms));

/** À chaque geste : tente de démarrer le son, et relance la vérification s'il manque. */
function reveillerLeSon() {
  son.voulu = true;
  moteur.demarrer().catch(() => {});
  if (son.bloque) verifierSortie();
}

/** Vrai si le son tourne, après au plus `attente` millisecondes. */
async function essayerLeSon(attente = 1500) {
  if (moteur.actif) return true;
  await Promise.race([moteur.demarrer().catch(() => {}), delai(attente)]);
  return moteur.actif;
}

function sonIndisponible(fiche = null) {
  if (fiche) son.enAttente = fiche;
  if (!son.bloque) {
    son.bloque = true;
    majCartes();
  }
}

function sonRetabli() {
  if (!son.bloque) return;
  son.bloque = false;
  majCartes();
  if (son.reprendre) {
    son.reprendre = false;
    lecteur.reprendre();
  }
  if (son.enAttente) {
    const fiche = son.enAttente;
    son.enAttente = null;
    choisir(fiche);
  }
}

/**
 * Vérifie que le son tourne ; sinon réessaie, puis reconstruit le contexte audio. Une
 * vérification automatique (sans geste ni changement de sortie) reconstruit moins souvent.
 */
function verifierSortie(automatique = false) {
  // Un branchement ou un geste pendant une vérification automatique n'est pas perdu :
  // une vérification complète suivra.
  if (son.verification) {
    if (!automatique) son.relancer = true;
    return son.verification;
  }
  son.verification = (async () => {
    try {
      if (await essayerLeSon()) return sonRetabli();
      if (!moteur.pret || performance.now() - son.derniere < (automatique ? 15000 : 3000)) return sonIndisponible();
      son.derniere = performance.now();
      // L'horloge va changer : la lecture est mise en pause pour reprendre au même endroit.
      if (lecteur.etat === "lecture") {
        lecteur.pause();
        son.reprendre = true;
      }
      await moteur.reconnecter();
      if (await essayerLeSon()) sonRetabli();
      else sonIndisponible();
    } finally {
      son.verification = null;
      if (son.relancer) {
        son.relancer = false;
        if (!moteur.actif) verifierSortie();
      }
    }
  })();
  return son.verification;
}

navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  if (son.voulu) verifierSortie();
});
// Filet de sécurité : la sortie peut disparaître ou revenir sans événement.
setInterval(() => {
  if (son.voulu && moteur.pret && !moteur.actif) verifierSortie(true);
}, 2000);

// -------------------------------------------------------------- barre de lecture

const barre = $("#lecture-barre");
let glisse = false; // l'utilisateur déplace le curseur : l'affichage ne le contrarie pas

function basculerLecture() {
  reveillerLeSon();
  if (lecteur.etat === "lecture") lecteur.pause();
  else if (lecteur.etat === "pause") lecteur.reprendre();
  else if (etat.courant) choisir(etat.courant);
}

function majBarre() {
  const actif = lecteur.etat !== "arret";
  $("#lecture").dataset.etat = lecteur.etat;
  const bouton = $("#lecture-bouton");
  bouton.disabled = !etat.courant;
  bouton.setAttribute("aria-label", lecteur.etat === "lecture" ? "Pause" : "Lecture");
  $("#lecture-titre").textContent = etat.courant ? `${etat.courant.titre} — ${etat.courant.compositeur}` : "Choisissez un morceau";
  barre.disabled = !actif;
  $("#lecture-duree").textContent = formaterDuree(etat.courant ? lecteur.duree || etat.courant.duree : 0);
  if (!actif) {
    barre.value = 0;
    $("#lecture-position").textContent = formaterDuree(0);
  }
}

$("#lecture-bouton").addEventListener("click", basculerLecture);

barre.addEventListener("input", () => {
  glisse = true;
  $("#lecture-position").textContent = formaterDuree((barre.value / 1000) * lecteur.duree);
});
barre.addEventListener("change", () => {
  glisse = false;
  lecteur.chercher((barre.value / 1000) * lecteur.duree);
});

const tempo = $("#tempo");
function appliquerTempo(valeur) {
  tempo.value = valeur;
  $("#tempo-valeur").textContent = `${valeur}\u00a0%`;
}
tempo.addEventListener("input", () => appliquerTempo(tempo.value));
tempo.addEventListener("change", () => {
  lecteur.vitesse = tempo.value / 100; // appliqué au relâchement : la lecture n'est relancée qu'une fois
  preferences.ecrire("tempo", Number(tempo.value));
});

const volume = $("#volume");
function appliquerVolume(valeur) {
  volume.value = valeur;
  $("#volume-valeur").textContent = `${valeur}\u00a0%`;
  moteur.volume = (valeur / 100) * 1.2;
}
volume.addEventListener("input", () => {
  appliquerVolume(volume.value);
  preferences.ecrire("volume", Number(volume.value));
});

// Après un réglage à la souris, les flèches reviennent au changement d'octave.
for (const glissiere of document.querySelectorAll(".glissiere")) {
  glissiere.addEventListener("pointerup", () => glissiere.blur());
}

// ------------------------------------------------------------------------- aperçu
// Sur un petit écran, le clavier dépasse : une réglette permet de s'y déplacer.

const apercu = $("#apercu");
const apercuCanvas = $("#apercu-canvas");

function dessinerApercu() {
  apercu.hidden = !piano.deborde;
  if (apercu.hidden) return;
  const densite = Math.min(2, devicePixelRatio || 1);
  const L = apercu.clientWidth;
  const H = apercu.clientHeight;
  if (apercuCanvas.width !== Math.round(L * densite)) {
    apercuCanvas.width = Math.round(L * densite);
    apercuCanvas.height = Math.round(H * densite);
    const ctx = apercuCanvas.getContext("2d");
    ctx.setTransform(densite, 0, 0, densite, 0, 0);
    const unite = L / NB_BLANCHES;
    ctx.fillStyle = "#e9e6dc";
    ctx.fillRect(0, 0, L, H);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    for (let i = 1; i < NB_BLANCHES; i++) ctx.fillRect(Math.round(i * unite), 0, 1, H);
    ctx.fillStyle = "#15161b";
    for (const t of disposition()) if (t.noire) ctx.fillRect(t.x * unite, 0, t.largeur * unite, H * 0.6);
  }
  const fenetre = $("#apercu-fenetre");
  fenetre.style.left = `${(piano.decalage / piano.largeurTotale) * 100}%`;
  fenetre.style.width = `${(piano.largeurVisible / piano.largeurTotale) * 100}%`;
}

piano.addEventListener("geometrie", dessinerApercu);

function deplacerApercu(e) {
  const cadre = apercu.getBoundingClientRect();
  const ratio = (e.clientX - cadre.left) / cadre.width;
  piano.definirDecalage(ratio * piano.largeurTotale - piano.largeurVisible / 2);
  etat.suiviSuspendu = horloge() + 4;
}
apercu.addEventListener("pointerdown", (e) => {
  apercu.setPointerCapture(e.pointerId);
  deplacerApercu(e);
});
apercu.addEventListener("pointermove", (e) => {
  if (apercu.hasPointerCapture(e.pointerId)) deplacerApercu(e);
});

// -------------------------------------------------------------- boucle d'affichage

/** Sur petit écran, le clavier suit les mains pendant la lecture. */
function suivre(morceau, position) {
  if (!piano.deborde || horloge() < etat.suiviSuspendu) return;
  const { notes } = morceau;
  let somme = 0;
  let nombre = 0;
  for (let i = indiceA(notes, position - 0.3); i < notes.length && notes[i].temps < position + 1.5; i++) {
    const t = touche(notes[i].midi);
    somme += t.x + t.largeur / 2;
    nombre++;
  }
  if (!nombre) return;
  const cible = (somme / nombre) * piano.largeurBlanche - piano.largeurVisible / 2;
  piano.definirDecalage(piano.decalage + (cible - piano.decalage) * 0.05);
}

function image() {
  const morceau = lecteur.etat === "lecture" ? lecteur.morceau : null;
  const position = lecteur.position;

  // touches enfoncées par la lecture automatique
  const voulues = new Map();
  if (morceau) for (const note of touchesEnfoncees(morceau, position)) voulues.set(note.midi, note.main === 0 ? "main-d" : "main-g");
  for (const [midi, classe] of etat.allumees) {
    if (voulues.get(midi) !== classe) {
      piano.eteindre(midi, classe);
      etat.allumees.delete(midi);
    }
  }
  for (const [midi, classe] of voulues) {
    if (!etat.allumees.has(midi)) {
      piano.allumer(midi, classe);
      etat.allumees.set(midi, classe);
    }
  }

  if (morceau) {
    document.querySelector(".carte.en-cours")?.style.setProperty("--ratio", position / lecteur.duree);
    suivre(morceau, position);
  }
  if (lecteur.etat !== "arret" && !glisse && lecteur.duree) {
    barre.value = Math.round((position / lecteur.duree) * 1000);
    const texte = formaterDuree(position);
    if ($("#lecture-position").textContent !== texte) $("#lecture-position").textContent = texte;
  }
  requestAnimationFrame(image);
}

// ----------------------------------------------------------------------- démarrage

let pianoPret;

async function demarrer() {
  etat.disposition = preferences.lire("disposition", null) ?? (await detecterDisposition());
  majEtiquettes();
  appliquerVolume(preferences.lire("volume", 75));
  appliquerTempo(preferences.lire("tempo", 100));
  lecteur.vitesse = tempo.value / 100;
  requestAnimationFrame(image);

  pianoPret = moteur.charger((faits, total) => {
    $("#statut-texte").textContent = `Chargement du piano… ${faits}/${total}`;
    $("#statut").style.setProperty("--ratio", faits / total);
  }).then(() => {
    document.body.classList.add("pret");
    $("#statut-texte").textContent = "Piano prêt";
  });

  const reponse = await fetch("midi/catalogue.json");
  etat.catalogue = await reponse.json();
  $("#cartes").replaceChildren(...etat.catalogue.map(creerCarte));
  await pianoPret;
}

demarrer().catch((erreur) => {
  console.error(erreur);
  $("#statut-texte").textContent = "Le piano n'a pas pu être chargé.";
  document.body.classList.add("erreur");
});

// Accès pour les tests automatisés et la console du navigateur.
globalThis.__piano = {
  pret: () => moteur.pret,
  niveau: () => moteur.niveau(),
  notesJouees: () => moteur.notesJouees,
  etatLecteur: () => lecteur.etat,
  pause: () => lecteur.pause(),
  sonBloque: () => son.bloque,
  reconnexions: () => moteur.reconnexions,
  reprendre: () => lecteur.reprendre(),
  position: () => lecteur.position,
  duree: () => lecteur.duree,
  vitesse: (valeur) => (lecteur.vitesse = valeur),
  chercher: (position) => lecteur.chercher(position),
  notes: () => (lecteur.morceau?.notes ?? []).map((n) => [n.temps, n.midi, n.fin, n.velocite, n.main]),
  attaquer,
  relacher,
};
