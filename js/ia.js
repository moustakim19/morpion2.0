/* =========================================================
   ia.js — L'ordinateur (marche sans internet)
   ---------------------------------------------------------
   L'ordinateur utilise l'algorithme MINIMAX :

   - Il essaie chaque case libre.
   - Pour chacune, il imagine que TU joues ton meilleur coup,
     puis lui son meilleur coup, puis toi… plusieurs coups à l'avance.
   - Lui cherche la note MAXimum, toi (dans sa tête) la note MINimum :
     d'où le nom « minimax ».

   Sur une grille 4 × 4, il y a trop de parties possibles pour toutes
   les imaginer jusqu'au bout. Alors il regarde seulement quelques
   coups à l'avance, puis il NOTE la position avec une évaluation :
   une ligne où il n'y a que ses symboles est bonne pour lui
   (et encore meilleure s'il y en a beaucoup), une ligne où il n'y a
   que les tiens est dangereuse.
   ========================================================= */

const IA = (() => {
  // Toutes les lignes gagnantes possibles, calculées automatiquement :
  // en 4 × 4 → 4 lignes + 4 colonnes + 2 diagonales = 10 lignes
  const LIGNES = [];
  for (let i = 0; i < NB_CASES; i++) {
    for (const [dl, dc] of DIRECTIONS) {
      const ligne = [];
      for (let k = 0; k < ALIGNEMENT; k++) {
        const l = ligneDe(i) + dl * k;
        const c = colonneDe(i) + dc * k;
        if (!dansGrille(l, c)) break;
        ligne.push(versIndex(l, c));
      }
      if (ligne.length === ALIGNEMENT) LIGNES.push(ligne);
    }
  }

  // Les cases du centre (les plus utiles : elles touchent le plus de lignes)
  const CENTRE = [];
  for (let i = 0; i < NB_CASES; i++) {
    const l = ligneDe(i);
    const c = colonneDe(i);
    if (l > 0 && l < TAILLE - 1 && c > 0 && c < TAILLE - 1) CENTRE.push(i);
  }

  const VICTOIRE = 100000;

  /** Qui a gagné dans cette grille ? 0 = personne pour l'instant. */
  function vainqueur(grille) {
    for (const ligne of LIGNES) {
      const v = grille[ligne[0]];
      if (v && ligne.every((i) => grille[i] === v)) return v;
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
   * Évaluation d'une position (sans regarder plus loin) :
   * chaque ligne « encore possible » rapporte des points.
   * 1 symbole = 1, 2 symboles = 10, 3 symboles = 100.
   */
  function evaluer(grille, moi) {
    let note = 0;
    for (const ligne of LIGNES) {
      let miens = 0;
      let siens = 0;
      for (const i of ligne) {
        if (grille[i] === moi) miens++;
        else if (grille[i] !== 0) siens++;
      }
      if (miens && !siens) note += 10 ** (miens - 1);
      else if (siens && !miens) note -= 10 ** (siens - 1);
    }
    return note;
  }

  /**
   * Minimax avec « élagage alpha-bêta » et profondeur limitée.
   * Alpha-bêta = un raccourci : dès qu'on sait qu'une branche est moins
   * bonne qu'une autre déjà trouvée, on arrête de l'explorer.
   * @param {number} joueur - qui doit jouer maintenant
   * @param {number} moi - le numéro de l'ordinateur
   * @param {number} profondeur - combien de coups il reste à imaginer
   */
  function minimax(grille, joueur, moi, profondeur, alpha, beta) {
    const g = vainqueur(grille);
    if (g === moi) return VICTOIRE + profondeur;    // il gagne (mieux si c'est rapide)
    if (g !== 0) return -VICTOIRE - profondeur;     // il perd (moins grave si c'est tard)
    const libres = casesLibres(grille);
    if (!libres.length) return 0;                   // match nul
    if (profondeur === 0) return evaluer(grille, moi); // on s'arrête et on note

    if (joueur === moi) {
      let meilleur = -Infinity;
      for (const i of libres) {
        grille[i] = joueur;                         // on essaie…
        meilleur = Math.max(meilleur, minimax(grille, 3 - joueur, moi, profondeur - 1, alpha, beta));
        grille[i] = 0;                              // … puis on annule
        alpha = Math.max(alpha, meilleur);
        if (alpha >= beta) break;                   // inutile de chercher plus loin
      }
      return meilleur;
    }
    let pire = Infinity;
    for (const i of libres) {
      grille[i] = joueur;
      pire = Math.min(pire, minimax(grille, 3 - joueur, moi, profondeur - 1, alpha, beta));
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
      const gagne = vainqueur(grille) === joueur;
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
      if (bloque >= 0 && Math.random() < 0.4) return bloque;
      return auHasard(libres);
    }

    // ---------- MOYEN : gagne, bloque, sinon joue au centre ou au hasard ----------
    if (niveau === "moyen") {
      if (gagne >= 0) return gagne;
      if (bloque >= 0) return bloque;               // tu as 3 symboles alignés : il bouche
      const centre = CENTRE.filter((i) => grille[i] === 0);
      if (centre.length && Math.random() < 0.6) return auHasard(centre);
      return auHasard(libres);
    }

    // ---------- DIFFICILE : minimax, 6 coups à l'avance ----------
    if (gagne >= 0) return gagne;
    if (bloque >= 0) return bloque;
    if (libres.length >= NB_CASES - 1) {
      // Début de partie : le centre est toujours le meilleur choix
      const centre = CENTRE.filter((i) => grille[i] === 0);
      return auHasard(centre);
    }
    let meilleureNote = -Infinity;
    let meilleurs = [];
    for (const i of libres) {
      grille[i] = moi;
      const note = minimax(grille, adversaire, moi, 5, meilleureNote - 1, Infinity);
      grille[i] = 0;
      if (note > meilleureNote) { meilleureNote = note; meilleurs = [i]; }
      else if (note === meilleureNote) meilleurs.push(i);
    }
    // Plusieurs coups aussi bons ? Il en prend un au hasard pour varier les parties
    return auHasard(meilleurs);
  }

  return { choisirCoup };
})();
