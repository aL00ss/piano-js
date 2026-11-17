import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { BASE_DEFAUT, caractere, decalerBase, detecterDisposition, etiquettes, noteDuCode } from "../js/clavier-ordinateur.js";
import { Lecteur } from "../js/lecteur.js";
import { depuisToneMidi, indiceA, intervallesPedale, pedaleA, preparerMorceau, touchesEnfoncees } from "../js/morceau.js";
import { gainDeVelocite } from "../js/moteur.js";
import { NOTE_MAX, NOTE_MIN, disposition, estNoire, formaterDuree, frequence, nomAnglais, nomFrancais, toucheSous } from "../js/theorie.js";

const racine = new URL("../", import.meta.url);
const lire = (chemin) => readFileSync(new URL(chemin, racine));

// @tonejs/midi est distribué en UMD : on l'évalue comme le ferait une balise <script>.
function chargerMidiJs() {
  const module = { exports: {} };
  new Function("module", "exports", lire("vendor/Midi.js").toString("utf8"))(module, module.exports);
  return module.exports.Midi;
}

const Midi = chargerMidiJs();
const catalogue = JSON.parse(lire("midi/catalogue.json").toString("utf8"));
const ouvrir = (fiche) => {
  const octets = lire(fiche.fichier);
  return depuisToneMidi(new Midi(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength)));
};

// ------------------------------------------------------------------- théorie

test("le clavier compte 88 touches : 52 blanches et 36 noires", () => {
  const touches = disposition();
  assert.equal(touches.length, 88);
  assert.equal(touches.filter((t) => !t.noire).length, 52);
  assert.equal(touches.filter((t) => t.noire).length, 36);
  assert.equal(touches[0].midi, NOTE_MIN);
  assert.equal(touches.at(-1).midi, NOTE_MAX);
});

test("les noms de notes suivent la convention française (La3 = 440 Hz)", () => {
  assert.equal(nomFrancais(69), "La3");
  assert.equal(nomAnglais(69), "A4");
  assert.equal(nomFrancais(60), "Do3");
  assert.equal(nomFrancais(61), "Do♯3");
  assert.equal(nomAnglais(21), "A0");
  assert.equal(nomAnglais(108), "C8");
});

test("la fréquence double à chaque octave", () => {
  assert.equal(frequence(69), 440);
  assert.ok(Math.abs(frequence(81) - 880) < 1e-9);
  assert.ok(Math.abs(frequence(60) - 261.6256) < 1e-3);
});

test("les touches noires sont do♯, ré♯, fa♯, sol♯ et la♯", () => {
  assert.deepEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71].map(estNoire),
    [false, true, false, true, false, false, true, false, true, false, true, false]);
});

test("les touches noires chevauchent leurs deux voisines blanches", () => {
  const touches = new Map(disposition().map((t) => [t.midi, t]));
  for (const t of touches.values()) {
    if (!t.noire) continue;
    const gauche = touches.get(t.midi - 1);
    const droite = touches.get(t.midi + 1);
    assert.ok(t.x > gauche.x && t.x < gauche.x + 1, `la touche ${t.midi} déborde à gauche`);
    assert.ok(t.x + t.largeur > droite.x && t.x + t.largeur < droite.x + 1, `la touche ${t.midi} déborde à droite`);
  }
});

test("toucheSous retrouve la touche sous le pointeur", () => {
  for (const t of disposition()) {
    const y = t.noire ? 0.3 : 0.9;
    assert.equal(toucheSous(t.x + t.largeur / 2, y), t.midi);
  }
  assert.equal(toucheSous(-0.1, 0.5), null);
  assert.equal(toucheSous(52, 0.5), null);
  // en bas d'une touche noire, on est sur une blanche
  const doDiese = disposition().find((t) => t.midi === 61);
  assert.ok(!estNoire(toucheSous(doDiese.x + doDiese.largeur / 2, 0.9)));
});

test("formaterDuree", () => {
  assert.equal(formaterDuree(0), "0:00");
  assert.equal(formaterDuree(185), "3:05");
  assert.equal(formaterDuree(59.6), "1:00");
});

// ------------------------------------------------------ clavier de l'ordinateur

test("la rangée du haut démarre au do central, celle du bas une octave en dessous", () => {
  assert.equal(noteDuCode("KeyQ"), 60);
  assert.equal(noteDuCode("KeyZ"), 48);
  assert.equal(noteDuCode("Digit2"), 61);
  assert.equal(noteDuCode("KeyS"), 49);
  assert.equal(noteDuCode("Comma"), 60);
  assert.equal(noteDuCode("BracketRight"), 79);
  assert.equal(noteDuCode("F1"), null);
});

test("les étiquettes suivent la disposition du clavier", () => {
  assert.equal(caractere("KeyQ", "azerty"), "A");
  assert.equal(caractere("KeyQ", "qwerty"), "Q");
  assert.equal(caractere("KeyZ", "azerty"), "W");
  assert.equal(caractere("Digit2", "azerty"), "é");
  assert.equal(caractere("Digit2", "qwerty"), "2");
  const azerty = etiquettes(BASE_DEFAUT, "azerty");
  assert.equal(azerty.get(60), "A");
  assert.equal(azerty.get(48), "W");
  assert.equal(azerty.size, 32); // 37 touches physiques, 5 notes en double
  for (const midi of azerty.keys()) assert.ok(midi >= 48 && midi <= 79);
});

test("le changement d'octave reste dans le piano", () => {
  assert.equal(decalerBase(48, 1), 60);
  assert.equal(decalerBase(72, 1), 72);
  assert.equal(decalerBase(24, -1), 24);
  assert.equal(noteDuCode("BracketRight", 72), 103);
  for (let base = 24; base <= 72; base += 12) {
    for (const midi of etiquettes(base).keys()) assert.ok(midi >= NOTE_MIN && midi <= NOTE_MAX);
  }
});

test("la disposition est détectée d'après le clavier, sinon d'après la langue", async () => {
  assert.equal(await detecterDisposition({ language: "fr-FR" }), "azerty");
  assert.equal(await detecterDisposition({ language: "en-US" }), "qwerty");
  const clavier = (lettre) => ({ language: "en-US", keyboard: { getLayoutMap: async () => new Map([["KeyQ", lettre]]) } });
  assert.equal(await detecterDisposition(clavier("a")), "azerty");
  assert.equal(await detecterDisposition(clavier("q")), "qwerty");
});

// --------------------------------------------------------------------- pédale

const note = (midi, temps, duree, main = 0) => ({ midi, temps, duree, velocite: 0.6, main });

test("sans pédale, une note s'arrête quand la touche est relâchée", () => {
  const m = preparerMorceau([note(60, 0, 1), note(64, 2, 0.5)]);
  assert.deepEqual(m.notes.map((n) => n.fin), [1, 2.5]);
  assert.equal(m.duree, 2.5);
});

test("la pédale prolonge les notes relâchées jusqu'à ce qu'on la lève", () => {
  const m = preparerMorceau([note(60, 0, 0.5), note(64, 1, 0.5), note(67, 3.2, 0.3)], [
    { temps: 0.2, enfoncee: true }, { temps: 3, enfoncee: false },
  ]);
  assert.deepEqual(m.notes.map((n) => n.fin), [3, 3, 3.5]);
  assert.deepEqual(m.pedale, [[0.2, 3]]);
  assert.ok(pedaleA(m, 1) && !pedaleA(m, 3.1));
});

test("une touche rejouée sous la pédale coupe sa résonance précédente", () => {
  const m = preparerMorceau([note(60, 0, 0.2), note(60, 1, 0.2)], [{ temps: 0, enfoncee: true }, { temps: 5, enfoncee: false }]);
  assert.deepEqual(m.notes.map((n) => n.fin), [1, 5]);
});

test("une pédale jamais relâchée ne fait pas durer le morceau indéfiniment", () => {
  const m = preparerMorceau([note(60, 0, 1)], [{ temps: 0.5, enfoncee: true }]);
  assert.equal(m.notes[0].fin, 1);
  assert.deepEqual(intervallesPedale([{ temps: 0.5, enfoncee: true }]), [[0.5, Infinity]]);
});

test("touchesEnfoncees renvoie les touches tenues à un instant donné", () => {
  const m = preparerMorceau([note(60, 0, 1), note(64, 0.5, 1, 1), note(67, 2, 0.01)]);
  assert.deepEqual(touchesEnfoncees(m, 0.75).map((n) => n.midi), [60, 64]);
  assert.deepEqual(touchesEnfoncees(m, 1.2).map((n) => n.midi), [64]);
  assert.deepEqual(touchesEnfoncees(m, 2.05).map((n) => n.midi), [67], "une note très brève reste visible un instant");
  assert.deepEqual(touchesEnfoncees(m, 3), []);
  assert.equal(indiceA(m.notes, 0.5), 1);
  assert.equal(indiceA(m.notes, 9), 3);
});

test("le gain croît avec la vélocité sans jamais saturer", () => {
  assert.ok(gainDeVelocite(0) > 0 && gainDeVelocite(0) < 0.15);
  assert.ok(gainDeVelocite(0.3) < gainDeVelocite(0.6) && gainDeVelocite(0.6) < gainDeVelocite(1));
  assert.equal(gainDeVelocite(1), 1);
  assert.equal(gainDeVelocite(7), 1);
});

// ------------------------------------------------------------------- morceaux

test("le catalogue propose sept morceaux, dont la Fantaisie-Impromptu et le Presto", () => {
  assert.equal(catalogue.length, 7);
  const titres = catalogue.map((f) => f.titre).join(" | ");
  for (const attendu of ["Lettre à Élise", "Clair de lune", "Adagio", "Presto", "Marche turque", "Fantaisie-Impromptu", "Prélude"]) {
    assert.ok(titres.includes(attendu), `${attendu} manque dans : ${titres}`);
  }
});

for (const fiche of catalogue) {
  test(`${fiche.titre} : le fichier MIDI est lu en entier, au tempo indiqué`, () => {
    const m = ouvrir(fiche);
    assert.equal(m.notes.length, fiche.notes);
    // la durée dépend de la carte de tempo : elle doit correspondre à celle calculée en Python
    assert.ok(Math.abs(m.duree - fiche.duree) < 0.05, `durée ${m.duree} au lieu de ${fiche.duree}`);
    assert.equal(Math.min(...m.notes.map((n) => n.midi)), fiche.grave);
    assert.equal(Math.max(...m.notes.map((n) => n.midi)), fiche.aigu);
    for (let i = 1; i < m.notes.length; i++) assert.ok(m.notes[i].temps >= m.notes[i - 1].temps);
    for (const n of m.notes) {
      assert.ok(n.midi >= NOTE_MIN && n.midi <= NOTE_MAX);
      assert.ok(n.velocite > 0 && n.velocite <= 1);
      assert.ok(n.fin >= n.temps + n.duree - 1e-6 || n.fin > n.temps);
    }
    assert.ok(m.notes.some((n) => n.main === 0) && m.notes.some((n) => n.main === 1), "deux mains");
  });
}

test("les changements de mouvement sont respectés (Fantaisie-Impromptu : Allegro, Largo, Presto)", () => {
  const m = ouvrir(catalogue.find((f) => f.id === "fantaisie-impromptu"));
  const densite = (debut, fin) => m.notes.filter((n) => n.temps >= debut && n.temps < fin).length / (fin - debut);
  const rapide = densite(5, 50);
  const lent = densite(70, 160); // Moderato cantabile, bien plus calme
  assert.ok(rapide > 2 * lent, `Allegro ${rapide.toFixed(1)} notes/s, Moderato ${lent.toFixed(1)} notes/s`);
});

// --------------------------------------------------------------------- lecteur

function faussesDependances() {
  const programmees = [];
  let sessions = 0;
  const moteur = {
    temps: 10,
    maintenant() { return this.temps; },
    creerSession() {
      sessions++;
      let ouverte = true;
      return {
        jouer: (midi, quand, duree, velocite) => ouverte && programmees.push({ midi, quand, duree, velocite }),
        arreter: () => (ouverte = false),
      };
    },
  };
  const doc = { hidden: false, addEventListener() {} };
  return { moteur, doc, programmees, sessions: () => sessions };
}

test("le lecteur programme chaque note à l'instant voulu par le morceau", async () => {
  const { moteur, doc, programmees } = faussesDependances();
  const lecteur = new Lecteur(moteur, doc);
  const m = preparerMorceau([note(60, 0, 0.5), note(64, 0.1, 0.5), note(67, 1.5, 0.5)]);
  lecteur.charger(m);
  lecteur.jouer(0);
  assert.equal(lecteur.etat, "lecture");
  // seules les notes proches sont programmées d'avance
  assert.deepEqual(programmees.map((p) => p.midi), [60, 64]);
  assert.ok(Math.abs(programmees[1].quand - programmees[0].quand - 0.1) < 1e-9);
  moteur.temps += 1.5;
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(programmees.map((p) => p.midi), [60, 64, 67]);
  assert.ok(Math.abs(programmees[2].quand - programmees[0].quand - 1.5) < 1e-9, "l'écart entre les notes est celui du morceau");
  assert.ok(Math.abs(lecteur.position - (moteur.temps - programmees[0].quand)) < 1e-9);
  lecteur.arreter();
  assert.equal(lecteur.etat, "arret");
  assert.equal(lecteur.position, 0);
});

test("le lecteur s'arrête de lui-même à la fin du morceau", async () => {
  const { moteur, doc } = faussesDependances();
  const lecteur = new Lecteur(moteur, doc);
  let fini = false;
  lecteur.addEventListener("fin", () => (fini = true));
  lecteur.charger(preparerMorceau([note(60, 0, 0.2)]));
  lecteur.jouer(0);
  moteur.temps += 5;
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(fini);
  assert.equal(lecteur.etat, "arret");
});

test("la vitesse resserre ou étire les notes sans changer leur ordre", () => {
  const { moteur, doc, programmees } = faussesDependances();
  const lecteur = new Lecteur(moteur, doc);
  lecteur.charger(preparerMorceau([note(60, 0, 0.4), note(62, 0.2, 0.4)]));
  lecteur.vitesse = 2;
  lecteur.jouer(0);
  assert.ok(Math.abs(programmees[1].quand - programmees[0].quand - 0.1) < 1e-9);
  assert.ok(Math.abs(programmees[0].duree - 0.2) < 1e-9);
  lecteur.arreter();
});

test("la pause conserve la position et la reprise repart de là", async () => {
  const { moteur, doc, programmees } = faussesDependances();
  const lecteur = new Lecteur(moteur, doc);
  const etats = [];
  lecteur.addEventListener("etat", (e) => etats.push(e.detail));
  lecteur.charger(preparerMorceau([note(60, 0, 0.5), note(62, 2, 0.5), note(64, 4, 0.5)]));
  lecteur.jouer(0);
  moteur.temps += 0.12 + 1; // délai de départ, puis une seconde de lecture
  lecteur.pause();
  assert.equal(lecteur.etat, "pause");
  assert.ok(Math.abs(lecteur.position - 1) < 1e-9);
  moteur.temps += 30; // le temps passe pendant la pause
  assert.ok(Math.abs(lecteur.position - 1) < 1e-9, "la position ne bouge pas en pause");
  lecteur.chercher(3.5);
  assert.equal(lecteur.position, 3.5);
  programmees.length = 0;
  lecteur.reprendre();
  assert.equal(lecteur.etat, "lecture");
  moteur.temps += 1;
  await new Promise((r) => setTimeout(r, 60));
  lecteur.pause();
  lecteur.reprendre();
  assert.ok(programmees.some((p) => p.midi === 64), "la reprise joue la suite du morceau");
  assert.ok(!programmees.some((p) => p.midi === 62), "les notes déjà passées ne sont pas rejouées");
  assert.deepEqual(etats, ["lecture", "pause", "lecture", "pause", "lecture"]);
  lecteur.arreter();
  assert.equal(lecteur.position, 0);
});

test("pause et reprise sont sans effet quand rien ne joue", () => {
  const { moteur, doc } = faussesDependances();
  const lecteur = new Lecteur(moteur, doc);
  lecteur.pause();
  lecteur.reprendre();
  assert.equal(lecteur.etat, "arret");
});
