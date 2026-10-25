/* =========================================================
   ia.js — L'ordinateur (marche sans internet)
   ---------------------------------------------------------
   Comment l'ordinateur choisit son coup ?
   1. Il liste les cases intéressantes : les cases vides proches
      des gemmes déjà posées (inutile de jouer dans un coin vide).
   2. Pour chaque case, il calcule DEUX notes :
        - ATTAQUE : à quel point cette case l'aide LUI à aligner,
        - DÉFENSE : à quel point cette case aiderait TOI à aligner
          (si c'est une super case pour toi, il a intérêt à la prendre !).
   3. Selon le niveau, il combine ces notes différemment.

   Pour noter une case, on regarde les 4 directions autour d'elle
   et on cherche des « motifs » connus, écrits avec 3 symboles :
     x = ma gemme   _ = case vide   o = adversaire ou bord
   Par exemple "_xxxx_" (4 gemmes avec les 2 bouts libres) est
   imparable : l'adversaire ne peut pas boucher les deux côtés.
   ========================================================= */

const IA = (() => {
  // Liste des motifs et leur valeur (plus c'est gros, plus c'est dangereux)
  const MOTIFS = [
    ["xxxxx", 1000000],                     // 5 alignées : victoire
    ["_xxxx_", 60000],                      // « quatre ouvert » : imparable
    ["xxxx_", 8000], ["_xxxx", 8000],        // « quatre » : menace de gagner au prochain coup
    ["xxx_x", 8000], ["x_xxx", 8000], ["xx_xx", 8000],
    ["_xxx__", 3500], ["__xxx_", 3500],      // « trois ouvert » : deviendra un quatre ouvert
    ["_xx_x_", 3200], ["_x_xx_", 3200],      // trois ouvert avec un trou
    ["_xxx_", 900],                          // trois coincé entre deux murs proches
    ["xxx__", 500], ["__xxx", 500],          // trois bloqué d'un côté
    ["xx_x_", 450], ["_x_xx", 450], ["x_xx_", 450], ["_xx_x", 450],
    ["xx__x", 350], ["x__xx", 350], ["x_x_x", 350],
    ["__xx__", 300],                         // deux ouvert
    ["_xx__", 180], ["__xx_", 180],
    ["_x_x_", 150], ["_x__x_", 90],
    ["xx___", 40], ["___xx", 40],
    ["__x__", 20], ["_x___", 10], ["___x_", 10],
  ].sort((a, b) => b[1] - a[1]); // triés du plus fort au plus faible

  // Au-dessus de ce score, une direction est une vraie « menace »
  const SEUIL_MENACE = 3200;
  const VICTOIRE = 1000000;

  /**
   * Construit le texte de 11 cases autour de `i` dans une direction,
   * en imaginant que `joueur` a posé une gemme en `i` (au centre = position 5).
   * Exemple : "o__xx[x]_o___"
   */
  function ligneAutour(grille, i, joueur, dl, dc) {
    const l0 = ligneDe(i);
    const c0 = colonneDe(i);
    let texte = "";
    for (let k = -5; k <= 5; k++) {
      if (k === 0) { texte += "x"; continue; }
      const l = l0 + dl * k;
      const c = c0 + dc * k;
      if (!dansGrille(l, c)) { texte += "o"; continue; } // le bord bloque comme un adversaire
      const v = grille[versIndex(l, c)];
      texte += v === joueur ? "x" : v === 0 ? "_" : "o";
    }
    return texte;
  }

  /** Trouve le meilleur motif qui passe par le centre (position 5) du texte. */
  function scoreDirection(texte) {
    for (const [motif, points] of MOTIFS) {
      let pos = texte.indexOf(motif);
      while (pos !== -1) {
        // Le motif doit contenir la case centrale (celle qu'on évalue)
        if (pos <= 5 && 5 < pos + motif.length) return points;
        pos = texte.indexOf(motif, pos + 1);
      }
    }
    return 0;
  }

  /** Note totale d'une case pour un joueur (somme des 4 directions + bonus). */
  function scoreCase(grille, i, joueur) {
    let total = 0;
    let menaces = 0;
    for (const [dl, dc] of DIRECTIONS) {
      const s = scoreDirection(ligneAutour(grille, i, joueur, dl, dc));
      total += s;
      if (s >= SEUIL_MENACE) menaces++;
    }
    // Deux menaces en même temps (ex : un quatre ET un trois ouvert) :
    // l'adversaire ne peut pas tout bloquer → presque une victoire assurée
    if (menaces >= 2) total += 50000;
    return total;
  }

  /** Les cases vides à une distance ≤ rayon d'une gemme déjà posée. */
  function candidats(grille, rayon = 2) {
    const liste = [];
    for (let i = 0; i < NB_CASES; i++) {
      if (grille[i] !== 0) continue;
      const l0 = ligneDe(i);
      const c0 = colonneDe(i);
      let proche = false;
      for (let dl = -rayon; dl <= rayon && !proche; dl++) {
        for (let dc = -rayon; dc <= rayon && !proche; dc++) {
          const l = l0 + dl;
          const c = c0 + dc;
          if (dansGrille(l, c) && grille[versIndex(l, c)] !== 0) proche = true;
        }
      }
      if (proche) liste.push(i);
    }
    return liste;
  }

  /** Choisit au hasard un élément d'une liste. */
  function auHasard(liste) {
    return liste[Math.floor(Math.random() * liste.length)];
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
    const centre = versIndex(7, 7);

    // Grille vide : on joue au centre (ou à côté, en facile)
    if (grille.every((v) => v === 0)) {
      return niveau === "facile" ? versIndex(6 + Math.floor(Math.random() * 3), 6 + Math.floor(Math.random() * 3)) : centre;
    }

    const cases = candidats(grille, niveau === "facile" ? 1 : 2);
    // On note chaque case candidate en attaque et en défense
    const notes = cases.map((i) => ({
      i,
      attaque: scoreCase(grille, i, moi),
      defense: scoreCase(grille, i, adversaire),
    }));

    const gagnant = notes.find((n) => n.attaque >= VICTOIRE);   // je peux gagner tout de suite ?
    const urgence = notes.find((n) => n.defense >= VICTOIRE);   // l'adversaire gagne au prochain coup ?

    // ---------- FACILE : il joue un peu au hasard ----------
    if (niveau === "facile") {
      if (gagnant && Math.random() < 0.6) return gagnant.i;
      if (urgence && Math.random() < 0.4) return urgence.i;
      // Note « floue » : le hasard compte plus que la stratégie
      let meilleur = notes[0];
      let max = -Infinity;
      for (const n of notes) {
        const note = Math.log(1 + n.attaque + n.defense * 0.6) + Math.random() * 5;
        if (note > max) { max = note; meilleur = n; }
      }
      return meilleur.i;
    }

    // ---------- MOYEN : gagne si possible, bloque tes alignements de 4 ----------
    if (niveau === "moyen") {
      if (gagnant) return gagnant.i;
      if (urgence) return urgence.i; // tu as 4 gemmes alignées : il bouche !
      // Tu peux faire un « quatre ouvert » imparable ? Il bloque souvent.
      const danger = notes.filter((n) => n.defense >= 60000);
      if (danger.length && Math.random() < 0.7) return auHasard(danger).i;
      // Sinon il construit ses lignes (avec un peu de hasard)
      let meilleur = notes[0];
      let max = -Infinity;
      for (const n of notes) {
        const note = (n.attaque + n.defense * 0.5) * (0.75 + Math.random() * 0.5);
        if (note > max) { max = note; meilleur = n; }
      }
      return meilleur.i;
    }

    // ---------- DIFFICILE : attaque + défense + il anticipe ta réponse ----------
    if (gagnant) return gagnant.i;
    if (urgence) return urgence.i;
    // Il peut créer une menace imparable (quatre ouvert / double menace) ? Il fonce.
    const tueur = notes.filter((n) => n.attaque >= 50000).sort((a, b) => b.attaque - a.attaque)[0];
    if (tueur) return tueur.i;

    // Note combinée : l'attaque compte un peu plus que la défense
    notes.forEach((n) => { n.note = n.attaque * 1.15 + n.defense + (14 - Math.abs(ligneDe(n.i) - 7) - Math.abs(colonneDe(n.i) - 7)); });
    const top = notes.sort((a, b) => b.note - a.note).slice(0, 8);

    // Il « imagine » chacun de ses 8 meilleurs coups et regarde
    // la meilleure réponse que TU pourrais faire ensuite.
    let choix = top[0];
    let meilleureValeur = -Infinity;
    for (const n of top) {
      grille[n.i] = moi; // il essaie le coup…
      let meilleureReponse = 0;
      for (const r of candidats(grille, 2)) {
        const valeur = scoreCase(grille, r, adversaire) + scoreCase(grille, r, moi) * 0.4;
        if (valeur > meilleureReponse) meilleureReponse = valeur;
      }
      grille[n.i] = 0; // … puis l'annule
      const valeur = n.note - 0.7 * meilleureReponse;
      if (valeur > meilleureValeur) { meilleureValeur = valeur; choix = n; }
    }
    return choix.i;
  }

  return { choisirCoup };
})();
