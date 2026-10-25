/* =========================================================
   jeu.js — Les règles du Morpion 2.0 (Gomoku 15 × 15)
   ---------------------------------------------------------
   Ce fichier ne touche pas à l'écran : il contient seulement
   les règles. Comme ça, l'ordinateur (ia.js) et l'affichage
   (app.js) peuvent tous les deux s'en servir.
   ========================================================= */

// La grille fait 15 cases de côté → 15 × 15 = 225 cases
const TAILLE = 15;
const NB_CASES = TAILLE * TAILLE;

// Il faut aligner 5 gemmes pour gagner
const ALIGNEMENT = 5;

/*
  Comment on range la grille ?
  Au lieu d'un tableau à 2 dimensions, on utilise UNE liste de 225 cases :
    case 0   = ligne 0, colonne 0 (en haut à gauche)
    case 14  = ligne 0, colonne 14 (en haut à droite)
    case 15  = ligne 1, colonne 0
    ...
  Formule : index = ligne × 15 + colonne
  Chaque case vaut : 0 = vide, 1 = joueur 1 (violet), 2 = joueur 2 (turquoise)
*/

// Les 4 directions à tester. Chaque direction = [déplacement en ligne, déplacement en colonne]
// (les 4 autres directions sont juste les opposées : on les teste en reculant)
const DIRECTIONS = [
  [0, 1],   // → horizontale
  [1, 0],   // ↓ verticale
  [1, 1],   // ↘ diagonale descendante
  [1, -1],  // ↙ diagonale montante
];

/** Crée une grille vide (225 zéros). */
function creerGrille() {
  return new Array(NB_CASES).fill(0);
}

/** Transforme (ligne, colonne) en numéro de case. */
function versIndex(ligne, colonne) {
  return ligne * TAILLE + colonne;
}

/** Retrouve la ligne d'une case. Exemple : case 37 → ligne 2 (car 37 ÷ 15 = 2,46). */
function ligneDe(index) {
  return Math.floor(index / TAILLE);
}

/** Retrouve la colonne d'une case. Exemple : case 37 → colonne 7 (reste de 37 ÷ 15). */
function colonneDe(index) {
  return index % TAILLE;
}

/** Vrai si (ligne, colonne) est bien à l'intérieur de la grille. */
function dansGrille(ligne, colonne) {
  return ligne >= 0 && ligne < TAILLE && colonne >= 0 && colonne < TAILLE;
}

/**
 * L'ALGORITHME QUI DÉTECTE LES 5 GEMMES ALIGNÉES
 * ------------------------------------------------
 * Idée clé : on n'a PAS besoin de vérifier toute la grille !
 * Une nouvelle ligne de 5 ne peut apparaître qu'en passant par
 * la gemme qu'on vient de poser. Donc on part de cette gemme et,
 * pour chacune des 4 directions :
 *   1. on avance case par case tant qu'on trouve la même couleur,
 *   2. on recule case par case tant qu'on trouve la même couleur,
 *   3. on additionne : si on a au moins 5 gemmes → victoire !
 *
 * Exemple en horizontale, on vient de poser X au milieu :
 *        . O X X [X] X X . .
 *   reculer ← 2 gemmes     → avancer 2 gemmes
 *   total = 2 + 1 (celle posée) + 2 = 5 → gagné
 *
 * Au maximum on regarde 4 directions × 2 sens × 4 cases = 32 cases,
 * au lieu de 225 : c'est très rapide.
 *
 * @param {number[]} grille - la grille (225 cases)
 * @param {number} index - la case où l'on vient de jouer
 * @returns {number[]|null} la liste des cases gagnantes (dans l'ordre), ou null
 */
function chercherVictoire(grille, index) {
  const joueur = grille[index];
  if (!joueur) return null; // case vide : rien à chercher

  const l0 = ligneDe(index);
  const c0 = colonneDe(index);

  for (const [dl, dc] of DIRECTIONS) {
    // On démarre la ligne avec la gemme qu'on vient de poser
    const ligne = [index];

    // 1) On AVANCE dans la direction tant que c'est la même couleur
    let l = l0 + dl;
    let c = c0 + dc;
    while (dansGrille(l, c) && grille[versIndex(l, c)] === joueur) {
      ligne.push(versIndex(l, c)); // ajoute à la fin
      l += dl;
      c += dc;
    }

    // 2) On RECULE dans le sens opposé tant que c'est la même couleur
    l = l0 - dl;
    c = c0 - dc;
    while (dansGrille(l, c) && grille[versIndex(l, c)] === joueur) {
      ligne.unshift(versIndex(l, c)); // ajoute au début (pour garder l'ordre)
      l -= dl;
      c -= dc;
    }

    // 3) Au moins 5 à la suite ? C'est gagné !
    if (ligne.length >= ALIGNEMENT) return ligne;
  }

  return null; // aucune direction ne fait 5
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

/** Convertit la grille texte de la base de données ("0012...") en liste de nombres. */
function grilleDepuisTexte(texte) {
  const grille = creerGrille();
  for (let i = 0; i < NB_CASES; i++) grille[i] = Number(texte[i]) || 0;
  return grille;
}
