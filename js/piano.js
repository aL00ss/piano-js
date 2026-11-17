// Le clavier à l'écran : 88 touches, jouables à la souris, au doigt (plusieurs
// doigts à la fois) et en glissando grâce aux Pointer Events.

import { HAUTEUR_NOIRE, NB_BLANCHES, NOTE_MIN, disposition, nomFrancais, touche, toucheSous } from "./theorie.js";

const LARGEUR_MIN_SOURIS = 22; // px par touche blanche
const LARGEUR_MIN_TACTILE = 40;

export class Piano extends EventTarget {
  #racine;
  #piste;
  #elements = new Map(); // midi -> élément
  #pointeurs = new Map(); // pointerId -> midi
  #largeur = 24;
  #decalage = 0;
  #tactile;

  constructor(racine) {
    super();
    this.#racine = racine;
    this.#tactile = globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.#piste = document.createElement("div");
    this.#piste.className = "clavier-piste";
    for (const t of disposition()) {
      const el = document.createElement("div");
      el.className = `touche ${t.noire ? "noire" : "blanche"}`;
      el.dataset.midi = t.midi;
      el.style.setProperty("--x", t.x);
      el.style.setProperty("--l", t.largeur);
      const lettre = document.createElement("span");
      lettre.className = "lettre";
      el.append(lettre);
      if (t.midi % 12 === 0) {
        const nom = document.createElement("span");
        nom.className = "nom";
        nom.textContent = nomFrancais(t.midi);
        el.append(nom);
      }
      this.#elements.set(t.midi, el);
      this.#piste.append(el);
    }
    racine.append(this.#piste);
    this.#ecouter();
    new ResizeObserver(() => this.redimensionner()).observe(racine);
    this.redimensionner();
    this.centrerSur(60, false);
  }

  // ---------------------------------------------------------------- géométrie

  get largeurBlanche() {
    return this.#largeur;
  }

  get decalage() {
    return this.#decalage;
  }

  get largeurVisible() {
    return this.#racine.clientWidth;
  }

  get largeurTotale() {
    return this.#largeur * NB_BLANCHES;
  }

  /** Vrai si le clavier dépasse de l'écran (on peut alors le faire défiler). */
  get deborde() {
    return this.largeurTotale > this.largeurVisible + 1;
  }

  redimensionner() {
    const visible = this.largeurVisible;
    if (!visible) return;
    const minimum = this.#tactile ? LARGEUR_MIN_TACTILE : LARGEUR_MIN_SOURIS;
    const centre = (this.#decalage + visible / 2) / this.#largeur;
    this.#largeur = Math.max(visible / NB_BLANCHES, minimum);
    this.#piste.style.setProperty("--w", `${this.#largeur}px`);
    this.#piste.style.width = `${this.largeurTotale}px`;
    this.definirDecalage(centre * this.#largeur - visible / 2);
    this.dispatchEvent(new CustomEvent("geometrie"));
  }

  definirDecalage(px) {
    const maximum = Math.max(0, this.largeurTotale - this.largeurVisible);
    const valeur = Math.min(maximum, Math.max(0, px));
    if (Math.abs(valeur - this.#decalage) < 0.05) return;
    this.#decalage = valeur;
    this.#piste.style.transform = `translate3d(${-valeur}px, 0, 0)`;
    this.dispatchEvent(new CustomEvent("geometrie"));
  }

  /** Abscisse (px, dans le repère de l'écran) du bord gauche et largeur d'une touche. */
  rectangle(midi) {
    const t = touche(midi);
    return { x: t.x * this.#largeur - this.#decalage, largeur: t.largeur * this.#largeur, noire: t.noire };
  }

  centrerSur(midi, anime = true) {
    const t = touche(Math.max(NOTE_MIN, midi));
    const cible = (t.x + 3.5) * this.#largeur - this.largeurVisible / 2;
    this.#piste.classList.toggle("anime", anime);
    this.definirDecalage(cible);
  }

  // ------------------------------------------------------------------ affichage

  allumer(midi, classe) {
    this.#elements.get(midi)?.classList.add(classe);
  }

  eteindre(midi, classe) {
    this.#elements.get(midi)?.classList.remove(classe);
  }

  /** Affiche les lettres du clavier de l'ordinateur sur les touches concernées. */
  etiqueter(etiquettes) {
    for (const [midi, el] of this.#elements) {
      const texte = etiquettes.get(midi) ?? "";
      el.firstChild.textContent = texte;
      el.classList.toggle("reliee", texte !== "");
    }
  }

  // --------------------------------------------------------------------- saisie

  #noteSous(evenement) {
    const cadre = this.#racine.getBoundingClientRect();
    const x = (evenement.clientX - cadre.left + this.#decalage) / this.#largeur;
    const y = (evenement.clientY - cadre.top) / cadre.height;
    const midi = toucheSous(x, Math.min(1, Math.max(0, y)));
    if (midi === null) return null;
    // Plus on frappe bas sur la touche, plus la note est forte.
    const hauteur = touche(midi).noire ? HAUTEUR_NOIRE : 1;
    const velocite = 0.45 + 0.5 * Math.min(1, Math.max(0, y / hauteur));
    return { midi, velocite };
  }

  #ecouter() {
    const racine = this.#racine;
    racine.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const cible = this.#noteSous(e);
      if (!cible) return;
      e.preventDefault();
      racine.setPointerCapture?.(e.pointerId);
      this.#pointeurs.set(e.pointerId, cible.midi);
      this.dispatchEvent(new CustomEvent("attaque", { detail: cible }));
    });
    racine.addEventListener("pointermove", (e) => {
      if (!this.#pointeurs.has(e.pointerId)) return;
      const cible = this.#noteSous(e);
      const actuelle = this.#pointeurs.get(e.pointerId);
      if (!cible || cible.midi === actuelle) return;
      // glissando : on passe d'une touche à l'autre sans lever le doigt
      this.dispatchEvent(new CustomEvent("relache", { detail: { midi: actuelle } }));
      this.#pointeurs.set(e.pointerId, cible.midi);
      this.dispatchEvent(new CustomEvent("attaque", { detail: cible }));
    });
    const lever = (e) => {
      if (!this.#pointeurs.has(e.pointerId)) return;
      const midi = this.#pointeurs.get(e.pointerId);
      this.#pointeurs.delete(e.pointerId);
      this.dispatchEvent(new CustomEvent("relache", { detail: { midi } }));
    };
    racine.addEventListener("pointerup", lever);
    racine.addEventListener("pointercancel", lever);
    racine.addEventListener("lostpointercapture", lever);
    racine.addEventListener("contextmenu", (e) => e.preventDefault());
  }
}
