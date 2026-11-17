// Moteur sonore : un piano à queue échantillonné, piloté avec Tone.js.
// Les 30 échantillons (un toutes les tierces mineures) sont transposés par
// Tone.Sampler pour couvrir les 88 touches.

import { nomAnglais } from "./theorie.js";

const NOTES_ECHANTILLONS = ["A0", "C1", "D#1", "F#1", "A1", "C2", "D#2", "F#2", "A2", "C3", "D#3", "F#3", "A3", "C4",
  "D#4", "F#4", "A4", "C5", "D#5", "F#5", "A5", "C6", "D#6", "F#6", "A6", "C7", "D#7", "F#7", "A7", "C8"];

const RELACHEMENT = 0.7; // secondes : l'étouffoir retombe sur la corde

/** Vélocité MIDI (0 à 1) -> gain : un pianissimo reste audible, un fortissimo ne sature pas. */
export function gainDeVelocite(velocite) {
  const v = Math.min(1, Math.max(0, velocite));
  return 0.08 + 0.92 * v ** 1.6;
}

export class Moteur {
  #Tone;
  #base;
  #tampons = {}; // nom de note -> AudioBuffer
  #direct = null; // sampler du jeu en direct
  #bus;
  #reverb;
  #envoi;
  #sortie;
  #analyseur;
  #enfoncees = new Set();
  #tenues = new Set();
  #pedale = false;
  #volume = 0.9;
  #reverberation = 0.2;
  pret = false;
  notesJouees = 0;
  reconnexions = 0;

  constructor(Tone, base = "samples/salamander/") {
    this.#Tone = Tone;
    this.#base = base;
    this.#construire();
  }

  /** Crée le contexte audio et la chaîne d'effets (les échantillons déjà décodés sont réutilisés). */
  #construire() {
    const Tone = this.#Tone;
    // Latence minimale : la note part dès que la touche est enfoncée.
    Tone.setContext(new Tone.Context({ latencyHint: "interactive", lookAhead: 0 }));
    this.#sortie = new Tone.Gain(this.#volume);
    const compresseur = new Tone.Compressor({ threshold: -16, ratio: 3, attack: 0.004, release: 0.2 });
    this.#analyseur = new Tone.Analyser("waveform", 1024);
    this.#sortie.chain(compresseur, Tone.getDestination());
    compresseur.connect(this.#analyseur);
    this.#bus = new Tone.Gain(1).connect(this.#sortie);
    this.#reverb = new Tone.Reverb({ decay: 2.8, preDelay: 0.012, wet: 1 }).connect(this.#sortie);
    this.#envoi = new Tone.Gain(this.#reverberation).connect(this.#reverb);
    this.#bus.connect(this.#envoi);
    if (this.pret) this.#direct = this.#creerSampler(RELACHEMENT).connect(this.#bus);
  }

  /**
   * Repart d'un contexte audio neuf. Utile quand la sortie audio change : un contexte créé
   * sans sortie utilisable (Firefox, par exemple) peut rester suspendu pour toujours.
   */
  async reconnecter() {
    const ancien = this.#Tone.getContext();
    this.#enfoncees.clear();
    this.#tenues.clear();
    this.#construire();
    if (this.pret) await this.#reverb.ready;
    this.reconnexions++;
    try {
      await Promise.race([ancien.close(), new Promise((fin) => setTimeout(fin, 500))]);
    } catch {
      // l'ancien contexte était peut-être déjà fermé
    }
  }

  /** Télécharge et décode les échantillons. `progression(faits, total)` suit l'avancement. */
  async charger(progression = () => {}) {
    const Tone = this.#Tone;
    let faits = 0;
    await Promise.all(NOTES_ECHANTILLONS.map(async (note) => {
      const tampon = await Tone.ToneAudioBuffer.fromUrl(`${this.#base}${note.replace("#", "s")}.mp3`);
      this.#tampons[note] = tampon.get();
      progression(++faits, NOTES_ECHANTILLONS.length);
    }));
    await this.#reverb.ready;
    this.#direct = this.#creerSampler(RELACHEMENT).connect(this.#bus);
    this.pret = true;
  }

  #creerSampler(relachement) {
    return new this.#Tone.Sampler({ urls: { ...this.#tampons }, release: relachement, curve: "exponential" });
  }

  /** À appeler depuis un geste de l'utilisateur : les navigateurs bloquent le son avant. */
  async demarrer() {
    if (this.#Tone.getContext().state !== "running") await this.#Tone.start();
  }

  get actif() {
    return this.#Tone.getContext().state === "running";
  }

  /** Horloge audio, en secondes. */
  maintenant() {
    return this.#Tone.getContext().currentTime;
  }

  // ------------------------------------------------------------ jeu en direct

  attaquer(midi, velocite = 0.75) {
    if (!this.pret) return;
    const nom = nomAnglais(midi);
    const instant = this.#Tone.immediate();
    if (this.#enfoncees.has(midi) || this.#tenues.has(midi)) this.#direct.triggerRelease(nom, instant);
    this.#tenues.delete(midi);
    this.#enfoncees.add(midi);
    this.#direct.triggerAttack(nom, instant, gainDeVelocite(velocite));
    this.notesJouees++;
  }

  relacher(midi) {
    if (!this.pret || !this.#enfoncees.delete(midi)) return;
    if (this.#pedale) this.#tenues.add(midi);
    else this.#direct.triggerRelease(nomAnglais(midi), this.#Tone.immediate());
  }

  /** Pédale forte : les notes relâchées continuent de résonner tant qu'elle est enfoncée. */
  pedale(enfoncee) {
    this.#pedale = enfoncee;
    if (enfoncee || !this.pret) return;
    for (const midi of this.#tenues) {
      if (!this.#enfoncees.has(midi)) this.#direct.triggerRelease(nomAnglais(midi), this.#Tone.immediate());
    }
    this.#tenues.clear();
  }

  get pedaleEnfoncee() {
    return this.#pedale;
  }

  toutRelacher() {
    this.#enfoncees.clear();
    this.#tenues.clear();
    this.#direct?.releaseAll(this.#Tone.immediate());
  }

  // --------------------------------------------------- lecture d'un morceau

  /**
   * Une session regroupe les notes programmées d'une lecture. L'arrêter coupe
   * aussi les notes déjà planifiées dans le futur.
   */
  creerSession() {
    const Tone = this.#Tone;
    const sampler = this.#creerSampler(0.5);
    const gain = new Tone.Gain(1).connect(this.#bus);
    sampler.connect(gain);
    let ouverte = true;
    return {
      jouer: (midi, quand, duree, velocite) => {
        if (!ouverte) return;
        sampler.triggerAttackRelease(nomAnglais(midi), Math.max(0.03, duree), quand, gainDeVelocite(velocite));
        this.notesJouees++;
      },
      arreter: () => {
        if (!ouverte) return;
        ouverte = false;
        gain.gain.rampTo(0, 0.07);
        setTimeout(() => {
          sampler.dispose();
          gain.dispose();
        }, 300);
      },
    };
  }

  // ----------------------------------------------------------------- réglages

  set volume(valeur) {
    this.#volume = Math.min(1.2, Math.max(0, valeur));
    this.#sortie.gain.rampTo(this.#volume, 0.05);
  }

  set reverberation(valeur) {
    this.#reverberation = Math.min(0.6, Math.max(0, valeur));
    this.#envoi.gain.rampTo(this.#reverberation, 0.05);
  }

  /** Niveau efficace du signal de sortie (0 = silence). */
  niveau() {
    const onde = this.#analyseur.getValue();
    let somme = 0;
    for (const v of onde) somme += v * v;
    return Math.sqrt(somme / onde.length);
  }
}
