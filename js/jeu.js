/* =========================================================
   jeu.js — Les règles du Morpion 2.0 (grille 3 × 3)
   ---------------------------------------------------------
   Ce fichier ne touche pas à l'écran : il contient seulement
   les règles. Comme ça, l'ordinateur (ia.js) et l'affichage
   (app.js) peuvent tous les deux s'en servir.
   ========================================================= */

// La grille fait 3 cases de côté → 3 × 3 = 9 cases
const TAILLE = 3;
const NB_CASES = TAILLE * TAILLE;

// Il faut aligner 3 symboles pour gagner
const ALIGNEMENT = 3;

/*
  Comment on range la grille ?
  Au lieu d'un tableau à 2 dimensions, on utilise UNE liste de 9 cases :

      0 | 1 | 2
     ---+---+---
      3 | 4 | 5
     ---+---+---
      6 | 7 | 8

  Formule : index = ligne × 3 + colonne
  Chaque case vaut : 0 = vide, 1 = joueur X, 2 = joueur O
*/

// Les 4 directions à tester. Chaque direction = [déplacement en ligne, déplacement en colonne]
// (les 4 autres directions sont juste les opposées : on les teste en reculant)
const DIRECTIONS = [
  [0, 1],   // → horizontale
  [1, 0],   // ↓ verticale
  [1, 1],   // ↘ diagonale descendante
  [1, -1],  // ↙ diagonale montante
];

/** Crée une grille vide (9 zéros). */
function creerGrille() {
  return new Array(NB_CASES).fill(0);
}

/** Transforme (ligne, colonne) en numéro de case. */
function versIndex(ligne, colonne) {
  return ligne * TAILLE + colonne;
}

/** Retrouve la ligne d'une case. Exemple : case 7 → ligne 2 (car 7 ÷ 3 = 2,33). */
function ligneDe(index) {
  return Math.floor(index / TAILLE);
}

/** Retrouve la colonne d'une case. Exemple : case 7 → colonne 1 (reste de 7 ÷ 3). */
function colonneDe(index) {
  return index % TAILLE;
}

/** Vrai si (ligne, colonne) est bien à l'intérieur de la grille. */
function dansGrille(ligne, colonne) {
  return ligne >= 0 && ligne < TAILLE && colonne >= 0 && colonne < TAILLE;
}

/**
 * L'ALGORITHME QUI DÉTECTE LES 3 SYMBOLES ALIGNÉS
 * ------------------------------------------------
 * Idée clé : une nouvelle ligne ne peut apparaître qu'en passant
 * par le symbole qu'on vient de poser. Donc on part de cette case et,
 * pour chacune des 4 directions :
 *   1. on avance case par case tant qu'on trouve le même symbole,
 *   2. on recule case par case tant qu'on trouve le même symbole,
 *   3. on additionne : si on a au moins 3 → victoire !
 *
 * Exemple : on vient de poser X au milieu (case 4)
 *     X | . | .        diagonale ↘ :
 *     . |[X]| .          reculer → case 0 = X (1)
 *     . | . | X          avancer → case 8 = X (1)
 *                        total = 1 + 1 (posé) + 1 = 3 → gagné !
 *
 * Cette méthode marche pour n'importe quelle taille de grille
 * (il suffit de changer TAILLE et ALIGNEMENT en haut du fichier).
 *
 * @param {number[]} grille - la grille (9 cases)
 * @param {number} index - la case où l'on vient de jouer
 * @returns {number[]|null} la liste des cases gagnantes (dans l'ordre), ou null
 */
function chercherVictoire(grille, index) {
  const joueur = grille[index];
  if (!joueur) return null; // case vide : rien à chercher

  const l0 = ligneDe(index);
  const c0 = colonneDe(index);

  for (const [dl, dc] of DIRECTIONS) {
    // On démarre la ligne avec le symbole qu'on vient de poser
    const ligne = [index];

    // 1) On AVANCE dans la direction tant que c'est le même symbole
    let l = l0 + dl;
    let c = c0 + dc;
    while (dansGrille(l, c) && grille[versIndex(l, c)] === joueur) {
      ligne.push(versIndex(l, c)); // ajoute à la fin
      l += dl;
      c += dc;
    }

    // 2) On RECULE dans le sens opposé tant que c'est le même symbole
    l = l0 - dl;
    c = c0 - dc;
    while (dansGrille(l, c) && grille[versIndex(l, c)] === joueur) {
      ligne.unshift(versIndex(l, c)); // ajoute au début (pour garder l'ordre)
      l -= dl;
      c -= dc;
    }

    // 3) Au moins 3 à la suite ? C'est gagné !
    if (ligne.length >= ALIGNEMENT) return ligne;
  }

  return null; // aucune direction ne fait 3
}

/** Vrai si plus aucune case n'est vide (match nul). */
function grillePleine(grille) {
  return grille.every((valeur) => valeur !== 0);
}

/** Donne le nom de la direction d'un alignement (pour l'afficher). */
function nomDirection(cases) {
  if (!cases || cases.length < 2) return "";
  const dl = ligneDe(cases[1]) - ligneDe(cases[0]);
  const dc = colonneDe(cases[1]) - colonneDe(cases[0]);
  if (dl === 0) return "à l'horizontale";
  if (dc === 0) return "à la verticale";
  return "en diagonale";
}

/** Convertit la grille texte de la base de données ("001200000") en liste de nombres. */
function grilleDepuisTexte(texte) {
  const grille = creerGrille();
  for (let i = 0; i < NB_CASES; i++) grille[i] = Number(texte[i]) || 0;
  return grille;
}
