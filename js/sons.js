/* =========================================================
   sons.js — Les sons, fabriqués avec la Web Audio API
   ---------------------------------------------------------
   Aucun fichier audio : on fabrique les sons en direct avec
   des « oscillateurs » (des générateurs d'ondes) et un « gain »
   (le volume) qui monte vite puis redescend doucement.
   Mélanger une note avec des notes plus aiguës « décalées »
   donne un son de cristal, parfait pour des gemmes.
   ========================================================= */

const Sons = (() => {
  let ctx = null;      // le « studio » audio (créé au premier clic : les navigateurs l'exigent)
  let maitre = null;   // volume général
  let actif = localStorage.getItem("morpion-son") !== "off";

  /** Crée (ou réveille) le contexte audio. */
  function contexte() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null; // très vieux navigateur : pas de son
      ctx = new AudioCtx();
      maitre = ctx.createGain();
      maitre.gain.value = 0.55;
      maitre.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /**
   * Joue une note.
   * @param {number} freq - hauteur en hertz (440 = la)
   * @param {number} debut - dans combien de secondes
   * @param {number} duree - durée en secondes
   */
  function note(freq, debut, duree, { type = "sine", volume = 0.3, attaque = 0.005, glisse = null } = {}) {
    if (!actif) return;
    const c = contexte();
    if (!c) return;
    const t = c.currentTime + debut;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glisse) osc.frequency.exponentialRampToValueAtTime(glisse, t + duree);
    // Enveloppe : le volume monte d'un coup puis s'éteint progressivement
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + attaque);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    osc.connect(gain);
    gain.connect(maitre);
    osc.start(t);
    osc.stop(t + duree + 0.05);
  }

  /** Son « cristal » : une note + deux harmoniques aiguës inhabituelles. */
  function cristal(freq, debut = 0, volume = 0.22) {
    note(freq, debut, 0.6, { volume });
    note(freq * 2.76, debut, 0.3, { volume: volume * 0.35 });
    note(freq * 5.4, debut, 0.14, { volume: volume * 0.15 });
  }

  return {
    /** Une gemme est posée (son différent pour chaque joueur). */
    poser(joueur) {
      cristal(joueur === 1 ? 880 : 1174.7, 0, 0.2);
      note(joueur === 1 ? 220 : 293.7, 0, 0.09, { type: "triangle", volume: 0.14 });
    },
    /** Victoire : arpège qui monte + basse. */
    victoire() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => cristal(f, i * 0.085, 0.19));
      note(130.8, 0, 1.4, { type: "triangle", volume: 0.14 });
      note(196, 0.34, 1.2, { type: "triangle", volume: 0.1 });
    },
    /** Défaite : notes qui descendent. */
    defaite() {
      [392, 329.6, 261.6, 196].forEach((f, i) => note(f, i * 0.17, 0.5, { type: "triangle", volume: 0.18 }));
    },
    /** Match nul. */
    nul() {
      cristal(659.25, 0, 0.16);
      cristal(587.3, 0.18, 0.16);
    },
    /** Tic du chronomètre (5 dernières secondes). */
    tic() { note(1500, 0, 0.05, { type: "square", volume: 0.045 }); },
    /** Petit clic des boutons. */
    clic() { note(620, 0, 0.07, { volume: 0.08, glisse: 940 }); },
    /** Début de partie. */
    debut() { cristal(659.25, 0, 0.15); cristal(987.8, 0.11, 0.15); },
    /** Adversaire trouvé ! */
    match() { [440, 554.4, 659.25, 880].forEach((f, i) => cristal(f, i * 0.07, 0.17)); },
    /** Action interdite. */
    erreur() { note(180, 0, 0.16, { type: "sawtooth", volume: 0.05, glisse: 110 }); },

    /** Débloque l'audio (à appeler lors d'un clic). */
    debloquer() { if (actif) contexte(); },
    estActif() { return actif; },
    /** Coupe / remet le son et s'en souvient. */
    basculer() {
      actif = !actif;
      localStorage.setItem("morpion-son", actif ? "on" : "off");
      if (actif) this.clic();
      return actif;
    },
  };
})();
