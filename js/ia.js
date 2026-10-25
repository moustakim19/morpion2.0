/* =========================================================
   ia.js — L'ordinateur (marche sans internet)
   ---------------------------------------------------------
   Sur une grille 3 × 3, il n'y a que 9 cases : l'ordinateur
   peut donc imaginer TOUTES les suites possibles de la partie.
   C'est l'algorithme MINIMAX :

   - Il essaie chaque case libre.
   - Pour chacune, il imagine que TU joues ton meilleur coup,
     puis lui son meilleur coup, puis toi… jusqu'à la fin.
   - Une fin où il gagne vaut +10, une fin où tu gagnes vaut -10,
     un match nul vaut 0.
   - Lui cherche le MAXimum, toi (dans sa tête) le MINimum :
     d'où le nom « minimax ».

   On retire un peu de points selon la profondeur : il préfère
   gagner VITE et perdre le plus TARD possible.
   ========================================================= */

const IA = (() => {
  // Les 8 lignes gagnantes possibles (3 lignes, 3 colonnes, 2 diagonales)
  const LIGNES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  /** Qui a gagné dans cette grille ? 0 = personne pour l'instant. */
  function vainqueur(grille) {
    for (const [a, b, c] of LIGNES) {
      if (grille[a] && grille[a] === grille[b] && grille[a] === grille[c]) return grille[a];
    }
    return 0;
  }

  /** Les numéros des cases vides. */
  function casesLibres(grille) {
    const libres = [];
    for (let i = 0; i < NB_CASES; i++) if (grille[i] === 0) libres.push(i);
    return libres;
  }

  /** Choisit au hasard un élément d'une liste. */
  function auHasard(liste) {
    return liste[Math.floor(Math.random() * liste.length)];
  }

  /**
   * Note une position avec minimax + « élagage alpha-bêta ».
   * Alpha-bêta = un raccourci : dès qu'on sait qu'une branche est moins
   * bonne qu'une autre déjà trouvée, on arrête de l'explorer.
   * Le résultat est exactement le même, mais des centaines de fois plus rapide.
   * @param {number} joueur - qui doit jouer maintenant
   * @param {number} moi - le numéro de l'ordinateur
   * @param {number} profondeur - combien de coups on a imaginé
   * @param {number} alpha - la meilleure note déjà garantie pour l'ordinateur
   * @param {number} beta - la meilleure note déjà garantie pour l'adversaire
   */
  function minimax(grille, joueur, moi, profondeur, alpha, beta) {
    const g = vainqueur(grille);
    if (g === moi) return 10 - profondeur;   // il gagne (mieux si c'est rapide)
    if (g !== 0) return profondeur - 10;      // il perd (moins grave si c'est tard)
    const libres = casesLibres(grille);
    if (!libres.length) return 0;             // match nul

    if (joueur === moi) {
      let meilleur = -Infinity;
      for (const i of libres) {
        grille[i] = joueur;                    // on essaie…
        meilleur = Math.max(meilleur, minimax(grille, 3 - joueur, moi, profondeur + 1, alpha, beta));
        grille[i] = 0;                         // … puis on annule
        alpha = Math.max(alpha, meilleur);
        if (alpha >= beta) break;              // inutile de chercher plus loin
      }
      return meilleur;
    }
    let pire = Infinity;
    for (const i of libres) {
      grille[i] = joueur;
      pire = Math.min(pire, minimax(grille, 3 - joueur, moi, profondeur + 1, alpha, beta));
      grille[i] = 0;
      beta = Math.min(beta, pire);
      if (alpha >= beta) break;
    }
    return pire;
  }

  /** Une case qui fait gagner `joueur` immédiatement (ou -1). */
  function coupGagnant(grille, joueur) {
    for (const i of casesLibres(grille)) {
      grille[i] = joueur;
      const gagne = chercherVictoire(grille, i);
      grille[i] = 0;
      if (gagne) return i;
    }
    return -1;
  }

  /**
   * Point d'entrée : renvoie la case choisie par l'ordinateur.
   * @param {number[]} grilleReelle - la grille actuelle
   * @param {number} moi - le numéro de l'ordinateur (1 ou 2)
   * @param {"facile"|"moyen"|"difficile"} niveau
   */
  function choisirCoup(grilleReelle, moi, niveau) {
    const grille = grilleReelle.slice(); // copie : on ne touche pas à la vraie grille
    const adversaire = 3 - moi;
    const libres = casesLibres(grille);
    const gagne = coupGagnant(grille, moi);
    const bloque = coupGagnant(grille, adversaire);

    // ---------- FACILE : presque au hasard ----------
    if (niveau === "facile") {
      if (gagne >= 0 && Math.random() < 0.5) return gagne;
      if (bloque >= 0 && Math.random() < 0.3) return bloque;
      return auHasard(libres);
    }

    // ---------- MOYEN : gagne, bloque, sinon joue « bien » sans tout calculer ----------
    if (niveau === "moyen") {
      if (gagne >= 0) return gagne;
      if (bloque >= 0) return bloque;              // il bloque tes alignements
      if (grille[4] === 0 && Math.random() < 0.7) return 4; // le centre est la meilleure case
      const coins = [0, 2, 6, 8].filter((i) => grille[i] === 0);
      if (coins.length && Math.random() < 0.6) return auHasard(coins);
      return auHasard(libres);                     // … mais il ne voit pas les pièges
    }

    // ---------- DIFFICILE : minimax, il ne perd jamais ----------
    // Grille vide : inutile de calculer, le centre ou un coin sont les meilleurs coups
    if (libres.length === NB_CASES) return auHasard([0, 2, 4, 4, 6, 8]);
    let meilleureNote = -Infinity;
    let meilleurs = [];
    for (const i of libres) {
      grille[i] = moi;
      // Fenêtre (note - 1, +∞) : on garde les égalités pour pouvoir varier les coups
      const note = minimax(grille, adversaire, moi, 1, meilleureNote - 1, Infinity);
      grille[i] = 0;
      if (note > meilleureNote) { meilleureNote = note; meilleurs = [i]; }
      else if (note === meilleureNote) meilleurs.push(i);
    }
    // Plusieurs coups aussi bons ? Il en prend un au hasard pour varier les parties
    return auHasard(meilleurs);
  }

  return { choisirCoup };
})();
