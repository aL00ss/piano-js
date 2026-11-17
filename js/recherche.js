// Recherche de partitions de piano en ligne : l'API publique de BitMidi (plus de 100 000
// fichiers MIDI, accessible depuis le navigateur) et la liste de suggestions d'autoComplete.js.
// Un clic sur un résultat le joue aussitôt : aucun bouton n'est ajouté à la page.

const API = "https://bitmidi.com/api/midi/search";
const ORIGINE = "https://bitmidi.com";

/** « chopin-ballade_1.mid » -> « chopin ballade 1 » */
export function nomLisible(nom) {
  return String(nom).replace(/\.midi?$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "Sans titre";
}

/** Les noms viennent d'Internet : ils sont échappés avant d'être affichés. */
export function echapper(texte) {
  const entites = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(texte).replace(/[&<>"']/g, (c) => entites[c]);
}

/** Résultat de BitMidi -> fiche de morceau, comme celles du catalogue. */
export function versFiche(resultat) {
  return {
    id: `bitmidi-${resultat.id}`,
    titre: nomLisible(resultat.name),
    compositeur: "BitMidi",
    oeuvre: resultat.name,
    fichier: new URL(resultat.downloadUrl, ORIGINE).href,
    duree: 0,
    ecoutes: resultat.plays ?? 0,
    enLigne: true,
  };
}

/** Cherche des partitions ; `recuperer` remplace `fetch` dans les tests. */
export async function chercher(requete, recuperer = globalThis.fetch) {
  const reponse = await recuperer(`${API}?q=${encodeURIComponent(requete)}&page=0`);
  if (!reponse.ok) throw new Error(`Recherche impossible (HTTP ${reponse.status})`);
  const { result } = await reponse.json();
  return (result?.results ?? []).filter((r) => r.downloadUrl).map(versFiche);
}

const formatNombre = new Intl.NumberFormat("fr-FR");

/** Relie le champ de recherche à autoComplete.js ; `surChoix(fiche)` joue le morceau choisi. */
export function brancherRecherche(selecteur, surChoix, AutoComplete = globalThis.autoComplete) {
  const champ = document.querySelector(selecteur);
  let erreur = false;
  return new AutoComplete({
    selector: selecteur,
    threshold: 2,
    debounce: 350,
    submit: false,
    data: {
      src: async (requete) => {
        champ.setAttribute("aria-busy", "true");
        try {
          const fiches = await chercher(requete);
          erreur = false;
          return fiches;
        } catch {
          erreur = true;
          return [];
        } finally {
          champ.removeAttribute("aria-busy");
        }
      },
      keys: ["titre"],
      cache: false,
    },
    // BitMidi a déjà trié les résultats : on les garde tous, échappés.
    searchEngine: (_requete, valeur) => echapper(valeur),
    resultsList: {
      class: "resultats",
      maxResults: 15,
      noResults: true,
      tabSelect: true,
      element: (liste, donnees) => {
        if (donnees.results.length) return;
        const vide = document.createElement("li");
        vide.className = "resultat-vide";
        vide.textContent = erreur
          ? "Recherche indisponible pour le moment : vérifiez la connexion."
          : `Aucune partition trouvée pour « ${donnees.query} ».`;
        liste.append(vide);
      },
    },
    resultItem: {
      class: "resultat",
      selected: "resultat-actif",
      element: (element, donnees) => {
        const fiche = donnees.value;
        element.replaceChildren();
        const ajouter = (classe, texte) => {
          const span = document.createElement("span");
          span.className = classe;
          span.textContent = texte;
          element.append(span);
        };
        ajouter("resultat-icone", "");
        ajouter("resultat-titre", fiche.titre);
        ajouter("resultat-meta", `${formatNombre.format(fiche.ecoutes)} écoutes`);
        element.title = fiche.oeuvre;
      },
    },
    events: {
      input: {
        selection: (evenement) => {
          const fiche = evenement.detail.selection.value;
          champ.value = fiche.titre;
          champ.blur();
          surChoix(fiche);
        },
      },
    },
  });
}
