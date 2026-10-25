/* =========================================================
   effets.js — L'explosion de gemmes (dessinée sur un <canvas>)
   ---------------------------------------------------------
   Chaque éclat est une « particule » : une position (x, y),
   une vitesse (vx, vy), une rotation et une durée de vie.
   À chaque image (60 fois par seconde), on fait tomber les
   éclats (gravité), on les fait tourner et s'effacer.
   ========================================================= */

const Effets = (() => {
  const canvas = document.getElementById("fx");
  const ctx = canvas.getContext("2d");
  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let particules = [];
  let enCours = false;

  /** Adapte la toile à la taille de l'écran (et aux écrans haute définition). */
  function redimensionner() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", redimensionner);
  redimensionner();

  /** Dessine un éclat de gemme taillée (5 côtés + une facette claire). */
  function dessinerEclat(p) {
    const s = p.taille;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, p.vie);
    ctx.fillStyle = p.couleur;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.6, -s * 0.25);
    ctx.lineTo(s * 0.35, s * 0.75);
    ctx.lineTo(-s * 0.4, s * 0.55);
    ctx.lineTo(-s * 0.55, -s * 0.3);
    ctx.closePath();
    ctx.fill();
    // Facette éclairée
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.6, -s * 0.25);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Dessine une étincelle (petite étoile à 4 branches). */
  function dessinerEtincelle(p) {
    const s = p.taille * 0.9;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, p.vie);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(0, 0, s, 0);
    ctx.quadraticCurveTo(0, 0, 0, s);
    ctx.quadraticCurveTo(0, 0, -s, 0);
    ctx.quadraticCurveTo(0, 0, 0, -s);
    ctx.fill();
    ctx.restore();
  }

  /** La boucle d'animation. */
  function boucle() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particules = particules.filter((p) => p.vie > 0);

    for (const p of particules) {
      if (p.type === "onde") {
        // Onde de choc : un cercle qui grandit et s'efface
        p.r += p.vitesse;
        p.vie -= 0.035;
        ctx.globalAlpha = Math.max(0, p.vie);
        ctx.strokeStyle = p.couleur;
        ctx.lineWidth = 3 * p.vie + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      p.vy += p.gravite;     // la gravité tire vers le bas
      p.vx *= 0.985;         // la résistance de l'air ralentit
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      p.vie -= p.declin;
      if (p.type === "etincelle") dessinerEtincelle(p);
      else dessinerEclat(p);
    }
    ctx.globalAlpha = 1;

    if (particules.length) requestAnimationFrame(boucle);
    else { enCours = false; ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); }
  }

  function demarrer() {
    if (!enCours) { enCours = true; requestAnimationFrame(boucle); }
  }

  return {
    /**
     * Explosion de gemmes au point (x, y) de l'écran.
     * @param {string[]} couleurs - couleurs possibles des éclats
     */
    explosion(x, y, couleurs, nombre = 34) {
      const n = reduit ? Math.ceil(nombre / 4) : nombre;
      for (let i = 0; i < n; i++) {
        const angle = Math.random() * Math.PI * 2;
        const vitesse = 2 + Math.random() * 7.5;
        particules.push({
          type: Math.random() < 0.78 ? "eclat" : "etincelle",
          x, y,
          vx: Math.cos(angle) * vitesse,
          vy: Math.sin(angle) * vitesse - 2.5,
          gravite: 0.17,
          taille: 4 + Math.random() * 9,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.35,
          vie: 1,
          declin: 0.011 + Math.random() * 0.014,
          couleur: couleurs[Math.floor(Math.random() * couleurs.length)],
        });
      }
      particules.push({ type: "onde", x, y, r: 6, vitesse: 5, vie: 1, couleur: couleurs[0] });
      demarrer();
    },

    /** Pluie de gemmes depuis le haut de l'écran (célébration). */
    pluie(couleurs, nombre = 70) {
      const n = reduit ? 10 : nombre;
      for (let i = 0; i < n; i++) {
        particules.push({
          type: Math.random() < 0.85 ? "eclat" : "etincelle",
          x: Math.random() * window.innerWidth,
          y: -20 - Math.random() * window.innerHeight * 0.6,
          vx: (Math.random() - 0.5) * 2,
          vy: 2 + Math.random() * 3,
          gravite: 0.06,
          taille: 5 + Math.random() * 8,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.2,
          vie: 1.4,
          declin: 0.006 + Math.random() * 0.005,
          couleur: couleurs[Math.floor(Math.random() * couleurs.length)],
        });
      }
      demarrer();
    },
  };
})();
