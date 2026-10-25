/* =========================================================
   app.js — Le chef d'orchestre
   ---------------------------------------------------------
   Il gère les écrans, le plateau, les clics, et relie entre eux
   les règles (jeu.js), l'ordinateur (ia.js), les sons (sons.js),
   les effets (effets.js) et le mode en ligne (enligne.js).
   ========================================================= */

/* ---------- Raccourcis pour trouver des éléments dans la page ---------- */
const $ = (selecteur) => document.querySelector(selecteur);
const $$ = (selecteur) => document.querySelectorAll(selecteur);

/* ---------- Constantes ---------- */
const DUREE_COUP = 30;       // secondes pour jouer un coup en ligne
const DELAI_ABANDON = 60;    // secondes d'absence avant de perdre par abandon
// Joueur 1 = X (rose → violet), joueur 2 = O (cyan → bleu), comme le logo
const COULEURS = { 1: "#FF8FD1", 2: "#7DF9FF" };
const COULEURS_2 = { 1: "#8B5CFF", 2: "#3B82F6" };
const NOMS = { 1: "X", 2: "O" };
const NIVEAUX = { facile: "Facile", moyen: "Moyen", difficile: "Difficile" };
const PERIMETRE_CHRONO = 2 * Math.PI * 22; // longueur du cercle du chronomètre

/* ---------- L'état du jeu : tout ce qu'il faut retenir ---------- */
const etat = {
  ecran: "accueil",
  mode: null,            // "local" | "ia" | "enligne"
  niveau: "moyen",
  grille: creerGrille(),
  tour: 1,               // à qui de jouer (1 ou 2)
  premier: 1,            // qui a commencé la partie (on alterne à chaque « Rejouer »)
  fini: false,
  historique: [],        // liste des cases jouées (pour « Annuler »)
  gagnantes: null,
  verrou: false,         // vrai quand on ne peut pas cliquer (l'ordinateur réfléchit…)
  scores: { 1: 0, 2: 0 },// manches gagnées (hors ligne)
  scoresJoueurs: {},     // manches gagnées en ligne, par identifiant de joueur
  revancheEnCours: false,
  derniereFin: null,
  apresConnexion: null,  // action à lancer une fois connecté
  minuteurIA: null,
  minuteurFin: null,
  // --- en ligne ---
  partie: null,          // la ligne « games » de la base
  moi: 0,                // mon numéro dans la partie (1 ou 2)
  adversaire: null,
  debutTour: 0,
  dernierTic: 0,
  dernierAppelTemps: 0,
  dernierAppelAbandon: 0,
  adversairePresent: true,
  absentDepuis: 0,
  coupEnAttente: -1,
  finAffichee: false,
  revancheLancee: false,
  revancheAnnoncee: false,
  derniereMaj: 0,
  intervalles: [],
  tick: null,
  minuteurRecherche: null,
};

/* =========================================================
   1. OUTILS
   ========================================================= */

/** Affiche un petit message en bas de l'écran. */
function toast(message, type = "info", duree = 2800) {
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = message;
  $("#toasts").appendChild(t);
  setTimeout(() => {
    t.classList.add("sortie");
    setTimeout(() => t.remove(), 300);
  }, duree);
}

/** Fait vibrer le téléphone (si possible). */
function vibrer(motif) {
  if (navigator.vibrate) navigator.vibrate(motif);
}

/** Protège un texte avant de l'insérer en HTML (évite qu'un pseudo contienne du code). */
function echapper(texte) {
  return String(texte).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Change le texte d'un bouton qui contient une icône + un <span>. */
function texteBouton(bouton, texte) {
  bouton.querySelector("span").textContent = texte;
}

/** Fenêtre « Es-tu sûr ? ». Renvoie une promesse : true (oui) ou false (non). */
function confirmer(titre, texte, oui = "Oui") {
  return new Promise((resoudre) => {
    const voile = $("#voile-confirm");
    $("#confirm-titre").textContent = titre;
    $("#confirm-texte").textContent = texte;
    $("#confirm-oui").textContent = oui;
    voile.classList.add("ouvert");
    const fermer = (reponse) => {
      voile.classList.remove("ouvert");
      $("#confirm-oui").onclick = $("#confirm-non").onclick = null;
      resoudre(reponse);
    };
    $("#confirm-oui").onclick = () => fermer(true);
    $("#confirm-non").onclick = () => fermer(false);
  });
}

/* =========================================================
   2. NAVIGATION ENTRE LES ÉCRANS
   ========================================================= */

function afficherEcran(nom) {
  $$(".ecran").forEach((e) => e.classList.toggle("actif", e.id === "ecran-" + nom));
  etat.ecran = nom;
  document.body.classList.toggle("sur-accueil", nom === "accueil");
  window.scrollTo(0, 0);
  // Le bouton « retour » d'Android ramène en arrière au lieu de fermer l'appli
  if (nom !== "accueil" && !history.state?.morpion) history.pushState({ morpion: true }, "");
}

/** Bouton retour (en haut à gauche ou bouton du téléphone). */
async function retour() {
  switch (etat.ecran) {
    case "jeu": await quitterPartie(); break;
    case "recherche":
    case "salle": await annulerAttente(); break;
    default: afficherEcran("accueil");
  }
  if (etat.ecran !== "accueil" && !history.state?.morpion) history.pushState({ morpion: true }, "");
}

/* =========================================================
   3. LE PLATEAU
   ========================================================= */

const plateau = $("#plateau");
let cases = [];

/** Le dessin d'un X ou d'un O (SVG). Les traits « se dessinent » grâce au CSS. */
function svgPion(joueur, anime) {
  const classe = `pion pion-${joueur === 1 ? "x" : "o"}${anime ? "" : " sans-anim"}`;
  if (joueur === 1) {
    return `<svg class="${classe}" viewBox="0 0 100 100" aria-hidden="true">
      <path class="lueur" d="M26 26 74 74M74 26 26 74"/>
      <path class="trait t1" d="M26 26 74 74" pathLength="1"/>
      <path class="trait t2" d="M74 26 26 74" pathLength="1"/>
      <path class="reflet" d="M29 27 42 40"/>
    </svg>`;
  }
  return `<svg class="${classe}" viewBox="0 0 100 100" aria-hidden="true">
    <circle class="lueur" cx="50" cy="50" r="25"/>
    <circle class="trait" cx="50" cy="50" r="25" pathLength="1" transform="rotate(-90 50 50)"/>
    <path class="reflet" d="M32 40a21 21 0 0 1 13-11"/>
  </svg>`;
}

/** Crée les 16 cases (à chaque nouvelle partie, pour rejouer l'animation d'entrée). */
function construirePlateau() {
  plateau.innerHTML = "";
  cases = [];
  for (let i = 0; i < NB_CASES; i++) {
    const bouton = document.createElement("button");
    bouton.className = "case vide";
    bouton.dataset.i = i;
    bouton.style.setProperty("--i", i);
    bouton.setAttribute("aria-label", `Ligne ${ligneDe(i) + 1}, colonne ${colonneDe(i) + 1}`);
    plateau.appendChild(bouton);
    cases.push(bouton);
  }
}

// Un seul écouteur pour tout le plateau (plus simple que 16 écouteurs)
plateau.addEventListener("click", (e) => {
  const bouton = e.target.closest(".case");
  if (bouton) clicCase(Number(bouton.dataset.i));
});

/** Vide le plateau à l'écran. */
function reinitialiserPlateau() {
  construirePlateau();
  plateau.classList.remove("termine");
  cacherLigne();
}

/** Met à jour l'affichage d'une case selon la grille. */
function dessinerCase(i, anime = true) {
  const b = cases[i];
  const v = etat.grille[i];
  b.classList.toggle("vide", v === 0);
  b.classList.toggle("j1", v === 1);
  b.classList.toggle("j2", v === 2);
  b.classList.remove("gagnante", "pose");
  b.innerHTML = v ? svgPion(v, anime) : "";
  if (v && anime) {
    void b.offsetWidth; // petite astuce pour relancer l'animation de l'onde
    b.classList.add("pose");
  }
}

/** Fait briller les cases gagnantes et trace le trait lumineux. */
function surlignerGagnantes(gagnantes) {
  gagnantes.forEach((i, k) => {
    cases[i].classList.add("gagnante");
    const pion = cases[i].querySelector(".pion");
    if (pion) pion.style.animationDelay = k * 0.12 + "s";
  });
  plateau.classList.add("termine");
  dessinerLigne(gagnantes);
}

/** Trace le trait d'un bout à l'autre de l'alignement (en débordant un peu). */
function dessinerLigne(gagnantes) {
  const svg = $("#ligne-victoire");
  const cadre = svg.getBoundingClientRect();
  const a = cases[gagnantes[0]].getBoundingClientRect();
  const b = cases[gagnantes[gagnantes.length - 1]].getBoundingClientRect();
  let x1 = a.left + a.width / 2 - cadre.left;
  let y1 = a.top + a.height / 2 - cadre.top;
  let x2 = b.left + b.width / 2 - cadre.left;
  let y2 = b.top + b.height / 2 - cadre.top;
  // On prolonge le trait de 30 % d'une case de chaque côté
  const dx = (x2 - x1) / (gagnantes.length - 1) * 0.3;
  const dy = (y2 - y1) / (gagnantes.length - 1) * 0.3;
  x1 -= dx; y1 -= dy; x2 += dx; y2 += dy;
  svg.setAttribute("viewBox", `0 0 ${cadre.width} ${cadre.height}`);
  svg.querySelectorAll("line").forEach((ligne) => {
    ligne.setAttribute("x1", x1);
    ligne.setAttribute("y1", y1);
    ligne.setAttribute("x2", x2);
    ligne.setAttribute("y2", y2);
  });
  svg.classList.remove("j1", "j2", "visible");
  void svg.getBoundingClientRect(); // relance l'animation
  svg.classList.add("j" + etat.grille[gagnantes[0]], "visible");
}

function cacherLigne() {
  $("#ligne-victoire").classList.remove("visible");
}

/** Explosion de mini X / O sur chaque case gagnante, l'une après l'autre. */
function exploser(gagnantes, joueur) {
  gagnantes.forEach((i, k) => {
    setTimeout(() => {
      const r = cases[i].getBoundingClientRect();
      Effets.explosion(r.left + r.width / 2, r.top + r.height / 2,
        [COULEURS[joueur], COULEURS_2[joueur], "#ffffff"], [joueur === 1 ? "x" : "o"]);
    }, 300 + k * 140);
  });
}

/* =========================================================
   4. AFFICHAGE (cartes des joueurs, bandeau, boutons)
   ========================================================= */

/** Le joueur qui regarde l'écran peut-il cliquer sur le plateau ? */
function peutJouer() {
  if (etat.fini || etat.verrou) return false;
  if (etat.mode === "local") return true;
  if (etat.mode === "ia") return etat.tour === 1;
  if (etat.mode === "enligne") return etat.partie?.statut === "en_cours" && etat.tour === etat.moi;
  return false;
}

/** Depuis combien de secondes l'adversaire est-il absent ? (0 = présent) */
function absenceAdversaire() {
  if (etat.adversairePresent || !etat.absentDepuis) return 0;
  return (Date.now() - etat.absentDepuis) / 1000;
}

/** Secondes restantes pour le coup en cours (parties en ligne). */
function tempsRestant() {
  return Math.max(0, DUREE_COUP - (Date.now() - etat.debutTour) / 1000);
}

/** Nom et sous-titre de chaque joueur selon le mode. */
function infosJoueurs() {
  if (etat.mode === "local") {
    return { 1: { nom: "Joueur X", sous: "Joueur 1" }, 2: { nom: "Joueur O", sous: "Joueur 2" } };
  }
  if (etat.mode === "ia") {
    return { 1: { nom: "Toi", sous: "Tu joues les X" }, 2: { nom: "Ordinateur", sous: "Niveau " + NIVEAUX[etat.niveau] } };
  }
  const moi = EnLigne.profil;
  const adv = etat.adversaire;
  const absent = absenceAdversaire();
  let sousAdv = adv ? `${adv.points} pts` : "…";
  if (absent > 4 && etat.partie?.statut === "en_cours") {
    sousAdv = `Absent · ${Math.max(0, Math.ceil(DELAI_ABANDON - absent))} s`;
  }
  const infos = {};
  infos[etat.moi] = { nom: moi?.pseudo || "Toi", sous: `Toi · ${moi?.points ?? 1000} pts` };
  infos[3 - etat.moi] = { nom: adv?.pseudo || "Adversaire", sous: sousAdv, point: absent > 4 ? "hors" : "en-ligne" };
  return infos;
}

/** Petite icône X ou O (pour le bandeau et la fenêtre de fin). */
function icoDe(joueur) {
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#ico-${joueur === 1 ? "x" : "o"}"/></svg>`;
}

/** Nombre de manches gagnées par le joueur 1 ou 2 depuis le début de la session. */
function scoreDe(j) {
  if (etat.mode !== "enligne") return etat.scores[j];
  const id = j === 1 ? etat.partie?.joueur1 : etat.partie?.joueur2;
  return etat.scoresJoueurs[id] || 0;
}

let dernierBandeau = "";

function majInterface() {
  const infos = infosJoueurs();
  const enLigne = etat.mode === "enligne";
  const enCours = enLigne && etat.partie?.statut === "en_cours";
  const reste = tempsRestant();

  // --- Cartes des joueurs ---
  for (const j of [1, 2]) {
    const carte = $("#carte-j" + j);
    carte.querySelector(".nom").textContent = infos[j].nom;
    carte.querySelector(".sous-texte").textContent = infos[j].sous;
    const point = carte.querySelector(".point-ligne");
    point.hidden = !infos[j].point;
    point.classList.toggle("hors", infos[j].point === "hors");
    point.title = infos[j].point === "hors" ? "Hors ligne" : "En ligne";
    const actif = !etat.fini && etat.tour === j;
    carte.classList.toggle("actif", actif);
    // Anneau du chronomètre
    const chrono = enCours && actif;
    carte.classList.toggle("chrono-visible", chrono);
    carte.classList.toggle("urgent", chrono && reste <= 5);
    carte.querySelector(".chrono .reste").style.strokeDashoffset = chrono ? PERIMETRE_CHRONO * (1 - reste / DUREE_COUP) : 0;
    // Score (nombre de manches gagnées)
    const score = scoreDe(j);
    const badge = $("#score-j" + j);
    if (badge.textContent !== String(score)) {
      if (score > Number(badge.textContent)) {
        badge.classList.remove("bump");
        void badge.offsetWidth;
        badge.classList.add("bump");
      }
      badge.textContent = score;
    }
  }

  // --- Bandeau « À qui le tour » ---
  let icone = icoDe(etat.tour);
  let texte = "";
  let anime = false;
  let temps = "";
  const nomAdv = etat.adversaire?.pseudo || "l'adversaire";
  if (etat.fini) {
    const g = etat.derniereFin?.gagnant;
    if (!g) { texte = "Match nul"; icone = icoDe(1) + icoDe(2); }
    else {
      icone = icoDe(g);
      if (etat.mode === "local") texte = `${NOMS[g]} a gagné !`;
      else if (resultatPourMoi(g) === "victoire") texte = "Tu as gagné !";
      else texte = etat.mode === "ia" ? "L'ordinateur a gagné" : `${nomAdv} a gagné`;
    }
  } else if (etat.mode === "local") {
    texte = `Au tour de ${NOMS[etat.tour]}`;
  } else if (etat.mode === "ia") {
    texte = etat.tour === 1 ? "À toi de jouer" : "L'ordinateur réfléchit";
    anime = etat.tour === 2;
  } else if (enLigne) {
    texte = etat.tour === etat.moi ? "À toi de jouer" : `Au tour de ${nomAdv}`;
    if (enCours) temps = `<span class="temps${reste <= 5 ? " urgent" : ""}">${Math.ceil(reste)} s</span>`;
  }
  const html = `${icone}<span${anime ? ' class="points-anim"' : ""}>${echapper(texte)}</span>${temps}`;
  if (html !== dernierBandeau) {
    $("#bandeau").innerHTML = html;
    dernierBandeau = html;
  }

  // --- Plateau ---
  plateau.classList.toggle("peut-jouer", peutJouer());
  plateau.dataset.tour = enLigne ? etat.moi : etat.tour;

  // --- Boutons du bas ---
  const btnAnnuler = $("#btn-annuler-coup");
  btnAnnuler.hidden = enLigne;
  btnAnnuler.disabled = etat.fini || etat.verrou || etat.historique.length < (etat.mode === "ia" ? 2 : 1);
  const btnRejouer = $("#btn-rejouer");
  btnRejouer.hidden = enLigne && !etat.fini;
  texteBouton(btnRejouer, enLigne ? "Revanche" : "Rejouer");
}

/* =========================================================
   5. PARTIES HORS LIGNE (duel local et contre l'ordinateur)
   ========================================================= */

function lancerPartieLocale(mode, niveau) {
  quitterEnLigne();
  etat.mode = mode;
  if (niveau) etat.niveau = niveau;
  etat.premier = 1;
  etat.scores = { 1: 0, 2: 0 }; // nouveau duel : les scores repartent de zéro
  nouvellePartie(false);
  afficherEcran("jeu");
}

/** Remet tout à zéro pour une nouvelle manche. */
function nouvellePartie(alterner = true) {
  clearTimeout(etat.minuteurIA);
  clearTimeout(etat.minuteurFin);
  if (alterner) etat.premier = 3 - etat.premier; // chacun commence à son tour
  etat.grille = creerGrille();
  etat.tour = etat.premier;
  etat.fini = false;
  etat.historique = [];
  etat.gagnantes = null;
  etat.derniereFin = null;
  etat.verrou = false;
  reinitialiserPlateau();
  fermerFin();
  majInterface();
  Sons.debut();
  if (etat.mode === "ia" && etat.tour === 2) tourIA();
}

/** Clic (ou toucher) sur une case. */
function clicCase(i) {
  Sons.debloquer();
  if (etat.fini || etat.verrou || etat.grille[i] !== 0) return;
  if (etat.mode === "enligne" && etat.tour !== etat.moi) {
    Sons.erreur();
    toast("Ce n'est pas ton tour !", "erreur", 1600);
    return;
  }
  if (etat.mode === "ia" && etat.tour !== 1) return;

  if (etat.mode === "enligne") jouerEnLigne(i);
  else jouerCoup(i);
}

/** Pose un X ou un O (parties hors ligne). */
function jouerCoup(i) {
  const joueur = etat.tour;
  etat.grille[i] = joueur;
  etat.historique.push(i);
  dessinerCase(i);
  Sons.poser(joueur);
  vibrer(10);

  // Est-ce que ce coup gagne ?
  const gagnantes = chercherVictoire(etat.grille, i);
  if (gagnantes) return terminer(joueur, gagnantes);
  if (grillePleine(etat.grille)) return terminer(0, null);

  // Sinon, au tour de l'autre
  etat.tour = 3 - joueur;
  majInterface();
  if (etat.mode === "ia" && etat.tour === 2) tourIA();
}

/** L'ordinateur joue (après un petit temps de « réflexion »). */
function tourIA() {
  etat.verrou = true;
  majInterface();
  const delai = 380 + Math.random() * 450;
  etat.minuteurIA = setTimeout(() => {
    const i = IA.choisirCoup(etat.grille, 2, etat.niveau);
    etat.verrou = false;
    jouerCoup(i);
  }, delai);
}

/** Annule le dernier coup (contre l'ordinateur : annule aussi le sien). */
function annulerCoup() {
  if (etat.mode === "enligne" || etat.fini || etat.verrou || !etat.historique.length) return;
  const nombre = etat.mode === "ia" ? 2 : 1;
  if (etat.historique.length < nombre) return;
  for (let k = 0; k < nombre; k++) {
    const i = etat.historique.pop();
    etat.grille[i] = 0;
    dessinerCase(i);
  }
  // Qui doit jouer ? Ça dépend du nombre de coups restants
  etat.tour = etat.historique.length % 2 === 0 ? etat.premier : 3 - etat.premier;
  Sons.clic();
  majInterface();
  if (etat.mode === "ia" && etat.tour === 2) tourIA();
}

/* =========================================================
   6. FIN DE PARTIE
   ========================================================= */

/** Du point de vue de la personne devant l'écran. */
function resultatPourMoi(gagnant) {
  if (gagnant === 0) return "nul";
  if (etat.mode === "local") return "victoire";
  if (etat.mode === "ia") return gagnant === 1 ? "victoire" : "defaite";
  return gagnant === etat.moi ? "victoire" : "defaite";
}

/**
 * Termine la partie : surligne, explose, joue le son, puis affiche la fenêtre.
 * @param {number} gagnant - 0 (nul), 1 ou 2
 * @param {number[]|null} gagnantes - les cases alignées
 * @param {object} infos - en ligne : { raison, elo }
 */
function terminer(gagnant, gagnantes, infos = {}) {
  etat.fini = true;
  etat.verrou = false;
  etat.gagnantes = gagnantes;
  etat.derniereFin = { gagnant, infos };
  // Une manche de plus pour le gagnant
  if (gagnant) {
    if (etat.mode === "enligne") {
      const id = gagnant === 1 ? etat.partie?.joueur1 : etat.partie?.joueur2;
      if (id) etat.scoresJoueurs[id] = (etat.scoresJoueurs[id] || 0) + 1;
    } else {
      etat.scores[gagnant]++;
    }
  }
  majInterface();

  const resultat = resultatPourMoi(gagnant);
  if (gagnantes) {
    surlignerGagnantes(gagnantes);
    exploser(gagnantes, gagnant);
  }
  if (resultat === "victoire") {
    Sons.victoire();
    vibrer([40, 60, 40, 60, 120]);
    setTimeout(() => Effets.pluie([COULEURS[gagnant], COULEURS_2[gagnant], "#ffffff"], [gagnant === 1 ? "x" : "o"]), gagnantes ? 700 : 100);
  } else if (resultat === "defaite") {
    Sons.defaite();
    vibrer(220);
  } else {
    Sons.nul();
  }

  clearTimeout(etat.minuteurFin);
  etat.minuteurFin = setTimeout(() => afficherFin(gagnant, infos), gagnantes ? 1600 : 700);
}

/** Remplit et ouvre la fenêtre de fin. */
function afficherFin(gagnant, infos = {}) {
  const modal = $(".modal-fin");
  const resultat = resultatPourMoi(gagnant);
  const direction = nomDirection(etat.gagnantes);
  const nomAdv = etat.adversaire?.pseudo || "Ton adversaire";
  let titre = "";
  let texte = "";

  if (gagnant === 0) {
    titre = "Match nul";
    texte = "Aucun alignement : égalité parfaite !";
  } else if (etat.mode === "local") {
    titre = `${NOMS[gagnant]} gagne !`;
    texte = `4 symboles alignés ${direction}.`;
  } else if (etat.mode === "ia") {
    titre = gagnant === 1 ? "Victoire !" : "Défaite…";
    texte = gagnant === 1
      ? `Tu as battu l'ordinateur en niveau ${NIVEAUX[etat.niveau]} !`
      : `L'ordinateur a aligné 4 O ${direction}.`;
  } else {
    const gagne = resultat === "victoire";
    titre = gagne ? "Victoire !" : "Défaite…";
    if (infos.raison === "abandon") texte = gagne ? `${nomAdv} s'est déconnecté.` : "Tu as été absent trop longtemps.";
    else if (infos.raison === "forfait") texte = gagne ? `${nomAdv} a quitté la partie.` : "Tu as abandonné la partie.";
    else texte = gagne ? `4 symboles alignés ${direction} !` : `${nomAdv} a aligné 4 symboles.`;
  }

  modal.classList.remove("victoire", "defaite", "nul");
  modal.classList.add(resultat);
  modal.style.setProperty("--cf", gagnant ? COULEURS_2[gagnant] : "#8B5CFF");
  $("#fin-symbole").innerHTML = gagnant ? icoDe(gagnant) : icoDe(1) + icoDe(2);
  $("#fin-titre").textContent = titre;
  $("#fin-texte").textContent = texte;

  // Points Elo gagnés ou perdus (parties en ligne)
  const elo = $("#fin-elo");
  if (etat.mode === "enligne" && typeof infos.elo === "number") {
    elo.hidden = false;
    elo.className = "fin-elo " + (infos.elo >= 0 ? "positif" : "negatif");
    elo.innerHTML = `${infos.elo >= 0 ? "+" : ""}${infos.elo} <small>points</small>`;
  } else {
    elo.hidden = true;
  }

  const btn = $("#btn-fin-rejouer");
  btn.disabled = false;
  btn.classList.remove("pulse");
  texteBouton(btn, etat.mode === "enligne" ? "Revanche" : "Rejouer");
  $("#fin-info").hidden = true;
  if (etat.mode === "enligne" && etat.partie) majRevanche(etat.partie);

  $("#voile-fin").classList.add("ouvert");
}

function fermerFin() {
  $("#voile-fin").classList.remove("ouvert");
}

/* =========================================================
   7. MODE EN LIGNE
   ========================================================= */

/** Le mode en ligne est-il utilisable ? */
function enLigneDispo() {
  return navigator.onLine && EnLigne.pret;
}

function toastHorsLigne() {
  if (!EnLigne.configure()) toast("Mode en ligne : ajoute tes clés Supabase dans js/config.js", "erreur", 4200);
  else toast("Connexion requise", "erreur");
}

/** Grise les modes en ligne quand il n'y a pas internet. */
function majConnexion() {
  const dispo = enLigneDispo();
  const message = navigator.onLine && !EnLigne.configure() ? "Supabase à configurer" : "Connexion requise";
  $$(".en-ligne").forEach((carte) => {
    carte.classList.toggle("desactive", !dispo);
    carte.querySelector(".badge-requis").textContent = message;
  });
}

/** Vérifie qu'on peut jouer en ligne. Sinon, envoie vers la connexion. */
function exigerConnexion(action) {
  if (!enLigneDispo()) {
    Sons.erreur();
    toastHorsLigne();
    return false;
  }
  if (!EnLigne.user) {
    etat.apresConnexion = action;
    afficherEcran("auth");
    toast("Connecte-toi pour jouer en ligne", "info");
    return false;
  }
  return true;
}

/** Commence à écouter une partie (temps réel + « je suis là » + vérification régulière). */
function suivrePartie(partie) {
  arreterSuivi();
  etat.partie = partie;
  etat.derniereMaj = Date.now();
  // Le salon de messages : celui de la 1re partie (les revanches le partagent)
  const salon = partie.salon || partie.id;
  EnLigne.abonner(partie.id, salon, surMajPartie, surPresence, Chat.recevoir);
  Chat.ouvrirSalon(salon);
  EnLigne.ping(partie.id);
  // Toutes les 10 s : « je suis toujours là »
  etat.intervalles.push(setInterval(() => {
    if (etat.partie && etat.partie.statut !== "terminee") EnLigne.ping(etat.partie.id);
  }, 10000));
  // Toutes les 4 s : sécurité si le temps réel a raté un message
  etat.intervalles.push(setInterval(() => resynchroniser(false), 4000));
}

/** Relit la partie dans la base (secours du temps réel). */
async function resynchroniser(force) {
  const p = etat.partie;
  if (!p || !navigator.onLine) return;
  if (!force && p.statut !== "attente" && Date.now() - etat.derniereMaj < 12000) return;
  try {
    const frais = await EnLigne.chargerPartie(p.id);
    etat.derniereMaj = Date.now();
    surMajPartie(frais);
  } catch { /* on réessaiera */ }
}

function arreterSuivi() {
  etat.intervalles.forEach(clearInterval);
  etat.intervalles = [];
  EnLigne.desabonner();
}

/** Quitte proprement tout ce qui concerne le mode en ligne. */
function quitterEnLigne() {
  if (EnLigne.pret) arreterSuivi();
  Chat.fermerSalon();
  clearInterval(etat.tick);
  clearInterval(etat.minuteurRecherche);
  etat.tick = null;
  etat.partie = null;
  etat.adversaire = null;
}

/**
 * Appelée à chaque fois que la partie change dans la base.
 * Chaque modification augmente « version » : on ignore les vieux messages.
 */
function surMajPartie(p) {
  if (!p || !etat.partie || p.id !== etat.partie.id) return;
  etat.derniereMaj = Date.now();
  if (p.version <= etat.partie.version) return;
  const avant = etat.partie;
  etat.partie = p;

  if (p.statut === "annulee") {
    if (etat.ecran === "salle" || etat.ecran === "recherche") {
      quitterEnLigne();
      afficherEcran("accueil");
      toast("La partie a été annulée.");
    }
    return;
  }
  // Quelqu'un nous a rejoints !
  if (avant.statut === "attente" && p.statut !== "attente") {
    Sons.match();
    vibrer([30, 50, 30]);
    lancerPartieEnLigne(p);
    return;
  }
  if (etat.mode === "enligne" && etat.ecran === "jeu") appliquerEtatEnLigne(p, avant);
}

/** Quelqu'un arrive / part du canal temps réel (indicateur « En ligne »). */
function surPresence(presence) {
  const p = etat.partie;
  if (!p || !EnLigne.user) return;
  const idAdversaire = p.joueur1 === EnLigne.user.id ? p.joueur2 : p.joueur1;
  if (!idAdversaire) return;
  if (presence[idAdversaire]) {
    etat.adversairePresent = true;
    etat.absentDepuis = 0;
  } else if (etat.adversairePresent) {
    etat.adversairePresent = false;
    etat.absentDepuis = Date.now();
  }
  if (etat.ecran === "jeu") majInterface();
}

/** Ouvre l'écran de jeu pour une partie en ligne. */
async function lancerPartieEnLigne(p) {
  clearInterval(etat.minuteurRecherche);
  clearTimeout(etat.minuteurFin);
  Object.assign(etat, {
    mode: "enligne",
    partie: p,
    moi: p.joueur1 === EnLigne.user.id ? 1 : 2,
    grille: grilleDepuisTexte(p.grille),
    tour: p.tour,
    fini: p.statut === "terminee",
    historique: [],
    gagnantes: null,
    derniereFin: null,
    verrou: false,
    coupEnAttente: -1,
    debutTour: Date.now(),
    dernierTic: 0,
    adversairePresent: true,
    absentDepuis: 0,
    finAffichee: false,
    revancheLancee: false,
    revancheAnnoncee: false,
    adversaire: null,
  });
  // Nouvel adversaire → scores à zéro ; revanche → on garde les scores
  if (!etat.revancheEnCours) etat.scoresJoueurs = {};
  etat.revancheEnCours = false;
  reinitialiserPlateau();
  fermerFin();
  for (let i = 0; i < NB_CASES; i++) if (etat.grille[i]) dessinerCase(i, false);
  afficherEcran("jeu");
  majInterface();
  Sons.debut();
  if (!etat.tick) etat.tick = setInterval(tickEnLigne, 250);

  etat.adversaire = await EnLigne.profilDe(etat.moi === 1 ? p.joueur2 : p.joueur1);
  majInterface();
  Chat.majEntete();
  toast(etat.tour === etat.moi ? "C'est toi qui commences ! (tu joues les X)" : `${etat.adversaire?.pseudo || "L'adversaire"} commence (tu joues les O)`, "info");
}

/** Applique à l'écran le nouvel état reçu de la base. */
function appliquerEtatEnLigne(p, avant) {
  const nouvelle = grilleDepuisTexte(p.grille);
  let coupAdverse = false;
  for (let i = 0; i < NB_CASES; i++) {
    if (i === etat.coupEnAttente) continue; // mon coup est en route : on n'y touche pas
    if (nouvelle[i] !== etat.grille[i]) {
      etat.grille[i] = nouvelle[i];
      dessinerCase(i);
      if (nouvelle[i] && nouvelle[i] !== etat.moi) coupAdverse = true;
    }
  }
  if (coupAdverse) {
    Sons.poser(3 - etat.moi);
    vibrer(15);
  }
  // Le tour a changé sans nouveau coup → le temps était écoulé
  if (p.statut === "en_cours" && p.tour !== avant.tour && p.dernier_coup === avant.dernier_coup) {
    if (avant.tour === etat.moi) toast("Temps écoulé ! Ton tour est passé.", "erreur");
    else toast("Temps écoulé pour ton adversaire : à toi !", "info");
  }
  // Nouveau tour → on relance le chronomètre
  if (p.tour !== avant.tour || p.dernier_coup !== avant.dernier_coup) {
    etat.debutTour = Date.now();
    etat.dernierTic = 0;
  }
  etat.tour = p.tour;
  if (p.statut === "terminee") {
    if (!etat.finAffichee) finEnLigne(p);
    majRevanche(p);
  }
  majInterface();
}

/** Je pose mon symbole en ligne. */
async function jouerEnLigne(i) {
  const p = etat.partie;
  // On l'affiche tout de suite (plus fluide), la base confirmera
  etat.verrou = true;
  etat.coupEnAttente = i;
  etat.grille[i] = etat.moi;
  dessinerCase(i);
  Sons.poser(etat.moi);
  vibrer(10);
  majInterface();
  try {
    const r = await EnLigne.rpc("jouer_coup", { p_id: p.id, p_case: i });
    etat.coupEnAttente = -1;
    etat.verrou = false;
    surMajPartie(r);
  } catch (err) {
    // Refusé : on retire le symbole et on se resynchronise
    etat.coupEnAttente = -1;
    etat.verrou = false;
    etat.grille[i] = 0;
    dessinerCase(i);
    Sons.erreur();
    toast(err.message, "erreur");
    try {
      const frais = await EnLigne.chargerPartie(p.id);
      if (etat.partie) {
        etat.partie.version = -1;
        surMajPartie(frais);
      }
    } catch { /* tant pis */ }
  }
  majInterface();
}

/** Appelée 4 fois par seconde pendant une partie en ligne (chronomètre, absence). */
function tickEnLigne() {
  const p = etat.partie;
  if (!p || etat.mode !== "enligne" || p.statut !== "en_cours") return;
  const reste = tempsRestant();

  // Tic-tac pendant mes 5 dernières secondes
  if (etat.tour === etat.moi && reste > 0 && reste <= 5) {
    const s = Math.ceil(reste);
    if (s !== etat.dernierTic) { etat.dernierTic = s; Sons.tic(); }
  }
  // Temps écoulé → on demande à la base de passer le tour (elle vérifie l'heure elle-même)
  if (reste <= 0 && Date.now() - etat.dernierAppelTemps > 2000) {
    etat.dernierAppelTemps = Date.now();
    EnLigne.rpc("passer_tour_temps", { p_id: p.id }).then(surMajPartie).catch(() => {});
  }
  // Adversaire absent depuis 60 s → on réclame la victoire (la base vérifie)
  if (absenceAdversaire() >= DELAI_ABANDON && Date.now() - etat.dernierAppelAbandon > 5000) {
    etat.dernierAppelAbandon = Date.now();
    EnLigne.rpc("reclamer_abandon", { p_id: p.id }).then(surMajPartie).catch(() => {});
  }
  majInterface();
}

/** La partie en ligne est terminée. */
function finEnLigne(p) {
  etat.finAffichee = true;
  let gagnantes = null;
  if (p.fin_raison === "alignement" && p.dernier_coup != null) gagnantes = chercherVictoire(etat.grille, p.dernier_coup);
  const elo = etat.moi === 1 ? p.elo_j1 : p.elo_j2;
  terminer(p.gagnant, gagnantes, { raison: p.fin_raison, elo });
  // Mes points ont changé : on recharge le profil
  EnLigne.chargerProfil().then(majCompte);
}

/** Met à jour le bouton « Revanche » selon qui l'a demandée. */
function majRevanche(p) {
  if (p.revanche_id) {
    if (!etat.revancheLancee) {
      etat.revancheLancee = true;
      ouvrirRevanche(p.revanche_id);
    }
    return;
  }
  const moiVeut = etat.moi === 1 ? p.revanche_j1 : p.revanche_j2;
  const luiVeut = etat.moi === 1 ? p.revanche_j2 : p.revanche_j1;
  const btn = $("#btn-fin-rejouer");
  const info = $("#fin-info");
  btn.classList.toggle("pulse", luiVeut && !moiVeut);
  btn.disabled = moiVeut;
  texteBouton(btn, moiVeut ? "En attente de ton adversaire…" : luiVeut ? "Accepter la revanche" : "Revanche");
  info.hidden = !(luiVeut && !moiVeut);
  info.textContent = `${etat.adversaire?.pseudo || "Ton adversaire"} veut une revanche !`;
  if (luiVeut && !moiVeut && !etat.revancheAnnoncee) {
    etat.revancheAnnoncee = true;
    Sons.match();
    if (!$("#voile-fin").classList.contains("ouvert") && etat.derniereFin) {
      afficherFin(etat.derniereFin.gagnant, etat.derniereFin.infos);
    }
  }
}

async function demanderRevanche() {
  const p = etat.partie;
  if (!p) return;
  const btn = $("#btn-fin-rejouer");
  btn.disabled = true;
  try {
    const r = await EnLigne.rpc("demander_revanche", { p_id: p.id });
    surMajPartie(r);
  } catch (err) {
    btn.disabled = false;
    toast(err.message, "erreur");
  }
}

async function ouvrirRevanche(id) {
  try {
    const nouvelle = await EnLigne.chargerPartie(id);
    suivrePartie(nouvelle);
    etat.revancheEnCours = true;
    await lancerPartieEnLigne(nouvelle);
    toast("Revanche ! Les couleurs sont inversées.", "succes");
  } catch (err) {
    toast(err.message, "erreur");
  }
}

/** Partie rapide : file d'attente automatique. */
async function partieRapide() {
  if (!exigerConnexion("rapide")) return;
  afficherEcran("recherche");
  const debut = Date.now();
  $("#temps-recherche").textContent = "0:00";
  clearInterval(etat.minuteurRecherche);
  etat.minuteurRecherche = setInterval(() => {
    const s = Math.floor((Date.now() - debut) / 1000);
    $("#temps-recherche").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 500);
  try {
    const p = await EnLigne.rpc("partie_rapide");
    if (etat.ecran !== "recherche") {
      // Annulé pendant la recherche
      EnLigne.rpc(p.statut === "attente" ? "annuler_partie" : "abandonner", { p_id: p.id }).catch(() => {});
      return;
    }
    suivrePartie(p);
    if (p.statut === "en_cours") {
      Sons.match();
      lancerPartieEnLigne(p);
    }
  } catch (err) {
    clearInterval(etat.minuteurRecherche);
    toast(err.message, "erreur", 4000);
    afficherEcran("accueil");
  }
}

/** Créer une salle privée avec un code. */
async function creerSalle() {
  if (!exigerConnexion("creer")) return;
  try {
    const p = await EnLigne.rpc("creer_partie");
    $("#code-salle").innerHTML = p.code.split("").map((c) => `<span>${echapper(c)}</span>`).join("");
    afficherEcran("salle");
    suivrePartie(p);
    Sons.debut();
  } catch (err) {
    toast(err.message, "erreur", 4000);
  }
}

/** Annuler la recherche ou la salle. */
async function annulerAttente() {
  const p = etat.partie;
  clearInterval(etat.minuteurRecherche);
  if (p && p.statut === "attente") {
    try {
      const annulee = await EnLigne.rpc("annuler_partie", { p_id: p.id });
      if (!annulee) {
        // Trop tard : quelqu'un vient de nous rejoindre → on joue !
        const frais = await EnLigne.chargerPartie(p.id);
        if (frais.statut === "en_cours") {
          etat.partie = frais;
          lancerPartieEnLigne(frais);
          return;
        }
      }
    } catch { /* on quitte quand même */ }
  }
  quitterEnLigne();
  afficherEcran("accueil");
}

/** Retour au menu depuis une partie. */
async function quitterPartie() {
  if (etat.mode === "enligne" && etat.partie?.statut === "en_cours") {
    const ok = await confirmer("Abandonner la partie ?", "Si tu pars maintenant, ton adversaire gagne et tu perds des points.", "Abandonner");
    if (!ok) return;
    try { await EnLigne.rpc("abandonner", { p_id: etat.partie.id }); } catch { /* l'adversaire gagnera par absence */ }
  } else if (etat.mode !== "enligne" && etat.historique.length && !etat.fini) {
    const ok = await confirmer("Retour au menu ?", "La partie en cours sera perdue.", "Quitter");
    if (!ok) return;
  }
  clearTimeout(etat.minuteurIA);
  clearTimeout(etat.minuteurFin);
  quitterEnLigne();
  fermerFin();
  etat.mode = null;
  afficherEcran("accueil");
}

/* =========================================================
   8. COMPTE, PROFIL ET CLASSEMENT
   ========================================================= */

/** Les rangs portent des noms du ciel étoilé selon les points. */
function rangDe(points) {
  if (points >= 1700) return { nom: "Supernova", couleur: "#FFD27A" };
  if (points >= 1500) return { nom: "Galaxie", couleur: "#FF8FD1" };
  if (points >= 1300) return { nom: "Nébuleuse", couleur: "#B98BFF" };
  if (points >= 1100) return { nom: "Étoile", couleur: "#7DF9FF" };
  if (points >= 900) return { nom: "Comète", couleur: "#8FB8FF" };
  return { nom: "Étincelle", couleur: "#D9D2EE" };
}

/** Met à jour la pastille du compte en haut à droite. */
function majCompte() {
  const p = EnLigne.profil;
  if (EnLigne.user && p) {
    $("#chip-nom").textContent = p.pseudo;
    $("#chip-points").textContent = `${p.points} pts`;
    $("#chip-initiale").textContent = p.pseudo.charAt(0).toUpperCase();
  } else {
    $("#chip-nom").textContent = "Se connecter";
    $("#chip-points").textContent = "";
    $("#chip-initiale").innerHTML = '<svg><use href="#i-profil"/></svg>';
  }
  majConnexion();
  if (etat.ecran === "jeu") majInterface();
}

/* --- Formulaire de connexion / inscription --- */
let ongletAuth = "connexion";

function choisirOnglet(nom) {
  ongletAuth = nom;
  $$(".onglet").forEach((b) => b.classList.toggle("actif", b.dataset.onglet === nom));
  $("#champ-pseudo").hidden = nom !== "inscription";
  $("#btn-auth").textContent = nom === "inscription" ? "Créer mon compte" : "Se connecter";
  $("#auth-mdp").setAttribute("autocomplete", nom === "inscription" ? "new-password" : "current-password");
}

async function envoyerAuth(e) {
  e.preventDefault();
  if (!enLigneDispo()) return toastHorsLigne();
  const email = $("#auth-email").value.trim();
  const mdp = $("#auth-mdp").value;
  const pseudo = $("#auth-pseudo").value.trim();
  const inscription = ongletAuth === "inscription";

  // Vérifications avant d'envoyer
  if (inscription && !/^[\p{L}0-9_-]{3,16}$/u.test(pseudo)) return toast("Pseudo : 3 à 16 lettres, chiffres, - ou _", "erreur");
  if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Adresse email invalide.", "erreur");
  if (mdp.length < 6) return toast("Le mot de passe doit faire au moins 6 caractères.", "erreur");

  const btn = $("#btn-auth");
  const texte = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Un instant…";
  try {
    if (inscription) await EnLigne.inscription(email, mdp, pseudo);
    else await EnLigne.connexion(email, mdp);
    $("#auth-mdp").value = "";
    Sons.match();
    toast(`Bienvenue ${EnLigne.profil?.pseudo || ""} !`, "succes");
    majCompte();
    afficherEcran("accueil");
    // On reprend ce que le joueur voulait faire avant de se connecter
    const suite = etat.apresConnexion;
    etat.apresConnexion = null;
    if (suite && ACTIONS[suite]) ACTIONS[suite]();
  } catch (err) {
    Sons.erreur();
    toast(err.message, "erreur", 4500);
  } finally {
    btn.disabled = false;
    btn.textContent = texte;
  }
}

/* --- Profil --- */
async function ouvrirProfil() {
  if (!exigerConnexion("profil")) return;
  afficherEcran("profil");
  remplirProfil(EnLigne.profil);
  const p = await EnLigne.chargerProfil();
  remplirProfil(p);
  majCompte();
  const position = await EnLigne.maPosition(p.points);
  $("#profil-position").textContent = position ? `#${position} au classement mondial` : "";
}

function remplirProfil(p) {
  if (!p) return;
  const total = p.victoires + p.defaites;
  const ratio = total ? Math.round((p.victoires / total) * 100) : 0;
  const rang = rangDe(p.points);
  $("#profil-pseudo").textContent = p.pseudo;
  $("#profil-rang").textContent = rang.nom;
  $("#profil-rang").style.setProperty("--rc", rang.couleur);
  $("#profil-points").textContent = p.points;
  $("#profil-victoires").textContent = p.victoires;
  $("#profil-defaites").textContent = p.defaites;
  $("#profil-ratio").textContent = total ? `${ratio} %` : "—";
  $("#profil-barre").style.width = (total ? ratio : 50) + "%";
}

/* --- Classement --- */
async function ouvrirClassement() {
  if (!enLigneDispo()) { Sons.erreur(); return toastHorsLigne(); }
  afficherEcran("classement");
  const podium = $("#podium");
  const liste = $("#liste-classement");
  const maPosition = $("#ma-position");
  podium.innerHTML = "";
  maPosition.innerHTML = "";
  liste.innerHTML = '<div class="chargement"><svg class="ico"><use href="#ico-o"/></svg></div>';

  try {
    const top = await EnLigne.top10();
    liste.innerHTML = "";
    if (!top.length) {
      liste.innerHTML = '<p class="vide-msg">Personne n\'a encore joué. Sois le premier !</p>';
      return;
    }
    const monId = EnLigne.user?.id;

    // Podium : 2e à gauche, 1er au milieu, 3e à droite
    const couleursPodium = ["#FFD27A", "#DCE3FF", "#F2A97E"];
    for (const rang of [1, 0, 2]) {
      const j = top[rang];
      const marche = document.createElement("div");
      marche.className = "marche";
      if (j) {
        marche.style.setProperty("--mc", couleursPodium[rang]);
        marche.innerHTML = `<svg class="etoile"><use href="#i-etoile"/></svg><span class="m-nom"></span><span class="m-pts">${j.points} pts</span><div class="socle">${rang + 1}</div>`;
        marche.querySelector(".m-nom").textContent = j.pseudo + (j.id === monId ? " (toi)" : "");
      }
      podium.appendChild(marche);
    }

    // Les places 4 à 10
    top.slice(3).forEach((j, k) => liste.appendChild(ligneClassement(j, k + 4, j.id === monId, k)));

    // Ma position si je ne suis pas dans le top 10
    if (EnLigne.user && EnLigne.profil && !top.some((j) => j.id === monId)) {
      const p = await EnLigne.chargerProfil();
      const position = await EnLigne.maPosition(p.points);
      if (position) {
        maPosition.innerHTML = '<p class="separateur">• • •</p>';
        maPosition.appendChild(ligneClassement(p, position, true, 0));
      }
    }
  } catch (err) {
    liste.innerHTML = "";
    toast(err.message, "erreur");
  }
}

function ligneClassement(j, rang, estMoi, k) {
  const div = document.createElement("div");
  div.className = "ligne-classement" + (estMoi ? " moi" : "");
  div.style.setProperty("--i", k);
  div.innerHTML = `<span class="rang">${rang}</span><span class="l-nom"><b></b><small>${j.victoires} V · ${j.defaites} D · ${rangDe(j.points).nom}</small></span><span class="l-pts">${j.points}<small>points</small></span>`;
  div.querySelector("b").textContent = j.pseudo + (estMoi ? " (toi)" : "");
  return div;
}

/* =========================================================
   9. BOUTONS ET ÉVÉNEMENTS
   ========================================================= */

// Actions des cartes de l'accueil (attribut data-action)
const ACTIONS = {
  local: () => lancerPartieLocale("local"),
  ia: () => afficherEcran("niveau"),
  rapide: () => partieRapide(),
  creer: () => creerSalle(),
  rejoindre: () => {
    if (!exigerConnexion("rejoindre")) return;
    afficherEcran("rejoindre");
    setTimeout(() => $("#input-code").focus(), 350);
  },
  classement: () => ouvrirClassement(),
  profil: () => ouvrirProfil(),
};

document.addEventListener("click", (e) => {
  const action = e.target.closest("[data-action]");
  if (action) {
    Sons.debloquer();
    Sons.clic();
    ACTIONS[action.dataset.action]?.();
    return;
  }
  const niveau = e.target.closest("[data-niveau]");
  if (niveau) {
    Sons.clic();
    lancerPartieLocale("ia", niveau.dataset.niveau);
  }
});

$("#btn-retour").addEventListener("click", () => { Sons.clic(); retour(); });
window.addEventListener("popstate", () => { if (etat.ecran !== "accueil") retour(); });

// Barre du bas de l'écran de jeu
$("#btn-menu").addEventListener("click", () => { Sons.clic(); quitterPartie(); });
$("#btn-annuler-coup").addEventListener("click", annulerCoup);
$("#btn-rejouer").addEventListener("click", () => {
  if (etat.mode === "enligne") {
    if (etat.fini && etat.derniereFin) afficherFin(etat.derniereFin.gagnant, etat.derniereFin.infos);
  } else {
    nouvellePartie();
  }
});

// Fenêtre de fin
$("#btn-fin-rejouer").addEventListener("click", () => {
  Sons.clic();
  if (etat.mode === "enligne") demanderRevanche();
  else nouvellePartie();
});
$("#btn-fin-menu").addEventListener("click", () => { Sons.clic(); quitterPartie(); });
$("#btn-fin-voir").addEventListener("click", fermerFin);
$("#voile-fin").addEventListener("click", (e) => { if (e.target.id === "voile-fin") fermerFin(); });

// Son
function majBoutonSon() {
  const actif = Sons.estActif();
  $("#btn-son use").setAttribute("href", actif ? "#i-son" : "#i-muet");
  $("#btn-son").classList.toggle("coupe", !actif);
  $("#btn-son").setAttribute("aria-label", actif ? "Couper le son" : "Remettre le son");
}
$("#btn-son").addEventListener("click", () => {
  Sons.basculer();
  majBoutonSon();
  toast(Sons.estActif() ? "Son activé" : "Son coupé", "info", 1200);
});

// Compte
$("#chip-compte").addEventListener("click", () => {
  Sons.clic();
  // Pendant une partie en ligne (ou une recherche), on ne quitte pas l'écran par ici
  if (etat.partie) return toast("Termine ta partie d'abord 😉", "info", 1800);
  if (EnLigne.user) return ouvrirProfil();
  if (!enLigneDispo()) return toastHorsLigne();
  afficherEcran("auth");
});
$$(".onglet").forEach((b) => b.addEventListener("click", () => { Sons.clic(); choisirOnglet(b.dataset.onglet); }));
$("#form-auth").addEventListener("submit", envoyerAuth);
$("#btn-deconnexion").addEventListener("click", async () => {
  await EnLigne.deconnexion();
  majCompte();
  toast("À bientôt !", "info");
  afficherEcran("accueil");
});

// Salle
$("#btn-copier").addEventListener("click", async () => {
  const code = etat.partie?.code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    toast("Code copié !", "succes");
  } catch {
    toast("Le code est : " + code);
  }
});
$("#btn-partager").addEventListener("click", async () => {
  const code = etat.partie?.code;
  if (!code) return;
  const texte = `Viens m'affronter sur Morpion 2.0 ! Code de la salle : ${code}`;
  if (navigator.share) {
    try { await navigator.share({ title: "Morpion 2.0", text: texte }); } catch { /* partage annulé */ }
  } else {
    try { await navigator.clipboard.writeText(texte); toast("Invitation copiée !", "succes"); } catch { toast(texte); }
  }
});
$("#btn-annuler-salle").addEventListener("click", () => { Sons.clic(); annulerAttente(); });
$("#btn-annuler-recherche").addEventListener("click", () => { Sons.clic(); annulerAttente(); });

// Rejoindre : le code est mis en majuscules automatiquement
$("#input-code").addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
});
$("#form-rejoindre").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("#input-code").value.trim().toUpperCase();
  if (code.length !== 4) {
    Sons.erreur();
    return toast("Le code fait 4 caractères.", "erreur");
  }
  try {
    const p = await EnLigne.rpc("rejoindre_partie", { p_code: code });
    $("#input-code").value = "";
    suivrePartie(p);
    Sons.match();
    lancerPartieEnLigne(p);
  } catch (err) {
    Sons.erreur();
    toast(err.message, "erreur", 3500);
  }
});

// Le plateau change de taille → on redessine le trait gagnant
window.addEventListener("resize", () => {
  if (etat.fini && etat.gagnantes && etat.ecran === "jeu") dessinerLigne(etat.gagnantes);
});

// Retour sur l'appli (téléphone sorti de veille) → on se resynchronise
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && etat.partie) resynchroniser(true);
});

// Internet coupé / revenu
window.addEventListener("online", async () => {
  await EnLigne.init(majCompte);
  majCompte();
  toast("De retour en ligne ✨", "succes");
  if (etat.partie) resynchroniser(true);
});
window.addEventListener("offline", () => {
  majConnexion();
  toast("Hors ligne : les modes en ligne sont en pause", "erreur", 3500);
});

/* =========================================================
   10. APPLI INSTALLABLE (PWA)
   ========================================================= */

let invitationInstall = null;
const estIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const estInstallee = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

// Chrome / Edge / Android : le navigateur nous propose l'installation
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();          // on garde l'invitation pour notre propre bouton
  invitationInstall = e;
  $("#btn-installer").hidden = false;
});
// iPhone : pas d'invitation automatique, on explique la marche à suivre
if (estIOS && !estInstallee) $("#btn-installer").hidden = false;

$("#btn-installer").addEventListener("click", async () => {
  if (invitationInstall) {
    invitationInstall.prompt();
    const choix = await invitationInstall.userChoice;
    if (choix.outcome === "accepted") toast("Installation en cours…", "succes");
    invitationInstall = null;
    $("#btn-installer").hidden = true;
  } else if (estIOS) {
    toast("Sur iPhone : touche « Partager » puis « Sur l'écran d'accueil »", "info", 5500);
  }
});
window.addEventListener("appinstalled", () => {
  $("#btn-installer").hidden = true;
  toast("Morpion 2.0 est installé ! ✨", "succes");
});

// Le service worker met les fichiers en cache pour jouer sans internet
// (il ne marche qu'avec une adresse http(s), pas en ouvrant le fichier directement)
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

/* =========================================================
   11. DÉMARRAGE
   ========================================================= */

async function demarrer() {
  construirePlateau();
  majBoutonSon();
  choisirOnglet("connexion");
  majCompte();
  if (navigator.onLine) await EnLigne.init(majCompte);
  majCompte();
}

demarrer();
