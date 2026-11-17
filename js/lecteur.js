// Lecteur de morceaux : programme les notes un peu à l'avance sur l'horloge audio
// (précise à l'échantillon près) et fournit la position de lecture à l'affichage.

import { indiceA } from "./morceau.js";

const PERIODE = 25; // ms entre deux passes de programmation
const HORIZON = 0.25; // secondes programmées à l'avance
const HORIZON_ARRIERE_PLAN = 2.5; // onglet masqué : les minuteries sont ralenties
const DELAI_DEPART = 0.12;

export class Lecteur extends EventTarget {
  #moteur;
  #morceau = null;
  #session = null;
  #minuterie = null;
  #etat = "arret"; // "arret" | "lecture"
  #vitesse = 1;
  #origineAudio = 0; // instant audio correspondant à #originePosition
  #originePosition = 0;
  #prochaine = 0; // indice de la prochaine note à programmer
  #document;

  constructor(moteur, doc = globalThis.document) {
    super();
    this.#moteur = moteur;
    this.#document = doc;
    doc?.addEventListener("visibilitychange", () => this.#programmer());
  }

  get etat() {
    return this.#etat;
  }

  get morceau() {
    return this.#morceau;
  }

  get vitesse() {
    return this.#vitesse;
  }

  get duree() {
    return this.#morceau?.duree ?? 0;
  }

  /** Position de lecture, en secondes du morceau. */
  get position() {
    if (this.#etat !== "lecture") return this.#originePosition;
    const ecoule = (this.#moteur.maintenant() - this.#origineAudio) * this.#vitesse;
    return Math.min(this.duree, this.#originePosition + ecoule);
  }

  charger(morceau) {
    this.arreter();
    this.#morceau = morceau;
  }

  jouer(depuis = 0) {
    if (!this.#morceau) return;
    this.#couper();
    this.#originePosition = Math.max(0, Math.min(depuis, this.duree));
    this.#origineAudio = this.#moteur.maintenant() + DELAI_DEPART;
    this.#prochaine = indiceA(this.#morceau.notes, this.#originePosition);
    this.#session = this.#moteur.creerSession();
    this.#changerEtat("lecture");
    this.#minuterie = setInterval(() => this.#programmer(), PERIODE);
    this.#programmer();
  }

  arreter() {
    this.#couper();
    this.#originePosition = 0;
    if (this.#etat !== "arret") this.#changerEtat("arret");
  }

  /** Saute à une position (en secondes) pendant la lecture. */
  chercher(position) {
    if (this.#etat === "lecture") this.jouer(position);
  }

  set vitesse(valeur) {
    const vitesse = Math.min(4, Math.max(0.25, valeur));
    if (this.#etat === "lecture") {
      const position = this.position;
      this.#vitesse = vitesse;
      this.jouer(position);
    } else {
      this.#vitesse = vitesse;
    }
  }

  #couper() {
    clearInterval(this.#minuterie);
    this.#minuterie = null;
    this.#session?.arreter();
    this.#session = null;
  }

  #changerEtat(etat) {
    this.#etat = etat;
    this.dispatchEvent(new CustomEvent("etat", { detail: etat }));
  }

  /** Programme toutes les notes qui démarrent dans l'horizon à venir. */
  #programmer() {
    if (this.#etat !== "lecture" || !this.#session) return;
    const maintenant = this.#moteur.maintenant();
    const horizon = this.#document?.hidden ? HORIZON_ARRIERE_PLAN : HORIZON;
    const limite = this.#originePosition + (maintenant + horizon - this.#origineAudio) * this.#vitesse;
    const { notes } = this.#morceau;
    while (this.#prochaine < notes.length && notes[this.#prochaine].temps < limite) {
      const note = notes[this.#prochaine++];
      const quand = this.#origineAudio + (note.temps - this.#originePosition) / this.#vitesse;
      const duree = (note.fin - note.temps) / this.#vitesse;
      this.#session.jouer(note.midi, Math.max(quand, maintenant), duree, note.velocite);
    }
    if (this.position >= this.duree) {
      // les dernières notes finissent de résonner : on ne coupe pas la session
      clearInterval(this.#minuterie);
      this.#minuterie = null;
      const session = this.#session;
      this.#session = null;
      setTimeout(() => session.arreter(), 1500);
      this.#originePosition = 0;
      this.#changerEtat("arret");
      this.dispatchEvent(new CustomEvent("fin"));
    }
  }
}
