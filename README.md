# Piano JS — un piano en JavaScript

[![Tests](https://github.com/aL00ss/piano-js/actions/workflows/tests.yml/badge.svg)](https://github.com/aL00ss/piano-js/actions/workflows/tests.yml)

Un piano de **88 touches** dans le navigateur, écrit en **JavaScript**. On peut y jouer avec le
clavier de l'ordinateur, la souris ou les doigts, et il interprète tout seul sept grands
classiques, du début à la fin.

👉 **Démo en ligne : https://al00ss.github.io/piano-js/**

La page est volontairement sobre : les boutons des morceaux, une barre de lecture et le clavier.

## Les morceaux

| # | Morceau | Compositeur | Durée |
| --- | --- | --- | --- |
| 1 | La Lettre à Élise | Beethoven | 2:59 |
| 2 | Clair de lune | Debussy | 4:53 |
| 3 | Sonate au clair de lune — Adagio | Beethoven | 5:11 |
| 4 | Sonate au clair de lune — Presto | Beethoven | 6:53 |
| 5 | Marche turque | Mozart | 3:33 |
| 6 | Fantaisie-Impromptu, op. 66 | Chopin | 4:36 |
| 7 | Prélude en do majeur | Bach | 2:08 |

Un clic sur un bouton lance le morceau ; un second clic (ou `Échap`) l'arrête. La barre de lecture
met en pause et reprend (`Entrée`), permet de se déplacer dans le morceau et règle le tempo
(50 à 150 %) et le volume ; ces réglages et la disposition du clavier sont mémorisés.

Le piano s'adapte tout seul aux changements de **sortie audio** (casque branché, sortie changée
dans le système) : si aucune sortie n'est utilisable, il l'indique, garde le morceau demandé et
réessaie ; dès que le son revient, le morceau démarre ou reprend là où il s'était arrêté. Chaque morceau
est joué **au tempo de sa partition**, changements de mouvement, points d'orgue et ralentis
compris, avec ses nuances et sa pédale. On peut jouer par-dessus pendant la lecture.

## Rechercher une partition en ligne

La barre de recherche, au-dessus des morceaux, interroge [BitMidi](https://bitmidi.com) (plus de
100 000 fichiers MIDI). Un clic sur un résultat (ou `↓` puis `Entrée`) le joue aussitôt au piano,
sans ajouter de bouton : la barre de lecture le contrôle comme les autres morceaux. La batterie
et les notes hors des 88 touches sont ignorées ; les noms venus d'Internet sont affichés comme du
texte. La liste de suggestions est celle d'[autoComplete.js](https://tarekraafat.github.io/autoComplete.js/)
(sans dépendance, fournie dans `vendor/`).

## Jouer

| Moyen | Comment |
| --- | --- |
| Clavier | deux rangées de touches : `W`…`!` (octave grave) et `A`…`$` (octave aiguë), les touches noires sur la rangée du dessus |
| Souris, doigts | clic ou toucher, plusieurs doigts à la fois, glissando ; plus on frappe bas sur la touche, plus la note est forte |
| `Espace` | pédale forte |
| `Entrée` | lecture / pause du morceau |
| `←` `→` | changer d'octave |
| Clavier MIDI | reconnu automatiquement s'il est déjà autorisé dans le navigateur |

Les touches sont repérées par leur **position physique** (`event.code`) : la disposition est la
même en AZERTY et en QWERTY, seules les lettres affichées changent.

## Bibliothèques

| Bibliothèque | Rôle |
| --- | --- |
| [Tone.js](https://tonejs.github.io) 15 | `Sampler` (30 échantillons transposés sur 88 touches), `Reverb`, compresseur, horloge audio |
| [@tonejs/midi](https://github.com/Tonejs/Midi) 2 | lecture des fichiers MIDI et de leur carte de tempo |
| Web Audio API | son à faible latence |
| Pointer Events | souris, tactile multipoint, glissando |
| Web MIDI API | clavier maître externe |

Les deux bibliothèques sont fournies dans `vendor/` : le site fonctionne sans CDN ni outil de
compilation. D'autres options ont été étudiées : `smplr` (pédale encore instable),
`@tonejs/piano` (plus maintenu), `soundfont-player` et `WebAudioFont` (timbre moins réaliste).

## Fonctionnement

- **`js/lecteur.js`** programme les notes 250 ms à l'avance sur l'horloge audio, précise à
  l'échantillon près ; l'affichage se contente de lire la position de lecture.
- **`js/morceau.js`** applique la pédale : une note relâchée pendant que la pédale est enfoncée
  résonne jusqu'à ce qu'on la lève.
- **`js/piano.js`** dessine les touches et convertit la position du pointeur en note.

```
index.html                 la page
assets/style.css           styles
js/theorie.js              notes, fréquences, géométrie du clavier
js/clavier-ordinateur.js   correspondance touches du clavier → notes
js/morceau.js              préparation des notes, pédale
js/moteur.js               son (Tone.js)
js/lecteur.js              lecture automatique
js/recherche.js            recherche de partitions en ligne (BitMidi)
js/piano.js                clavier à l'écran
js/main.js                 interface
midi/                      les sept morceaux
samples/salamander/        échantillons du piano
vendor/                    Tone.js, @tonejs/midi et autoComplete.js
tests/piano.test.js        tests unitaires
```

## En local

```bash
npm test          # 36 tests (Node.js 20 ou plus récent)
npm start         # puis ouvrir http://localhost:8080
```

> Le site doit être servi en HTTP (pas ouvert en `file://`) : il charge des modules ES.

## Crédits et licences

Conçu et développé par **Alexandre Besnier** — [github.com/aL00ss](https://github.com/aL00ss).
Code sous licence MIT.

- **Partitions** : gravures du [Mutopia Project](https://www.mutopiaproject.org), dans le
  domaine public (Stelios Samelis, Keith OHara, Rune Zedeler et Chris Sawer, Guy D. Lederfein,
  Tobias Erbsland). Les deux mouvements de la Sonate au clair de lune (Chris Sawer et Stewart
  Holmes) sont sous licence [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/),
  comme leurs adaptations `midi/sonate-au-clair-de-lune*.mid`. Les fichiers de `midi/` ont été
  préparés (reprises dépliées, nuances, tempo, pédale) par le script du dépôt
  [piano-python](https://github.com/aL00ss/piano-python).
- **Échantillons** : Salamander Grand Piano d'Alexander Holm,
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), dans leur version publiée par Tone.js.
- **Tone.js** et **@tonejs/midi** : licence MIT, © Yotam Mann.
