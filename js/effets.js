/* =========================================================
   effets.js — L'explosion de victoire (dessinée sur un <canvas>)
   ---------------------------------------------------------
   Chaque morceau est une « particule » : une position (x, y),
   une vitesse (vx, vy), une rotation et une durée de vie.
   À chaque image (60 fois par seconde), on fait tomber les
   particules (gravité), on les fait tourner et s'effacer.
   Les particules sont des mini X, des mini O et des étincelles.
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

  /** Dessine un mini X ou un mini O lumineux. */
  function dessinerSymbole(p) {
    const s = p.taille;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, Math.min(1, p.vie));
    ctx.strokeStyle = p.couleur;
    ctx.lineWidth = Math.max(2, s * 0.32);
    ctx.lineCap = "round";
    ctx.shadowColor = p.couleur;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    if (p.forme === "x") {
      ctx.moveTo(-s * 0.5, -s * 0.5); ctx.lineTo(s * 0.5, s * 0.5);
      ctx.moveTo(s * 0.5, -s * 0.5); ctx.lineTo(-s * 0.5, s * 0.5);
    } else {
      ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Dessine une étincelle (petite étoile à 4 branches). */
  function dessinerEtincelle(p) {
    const s = p.taille * 0.8;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, Math.min(1, p.vie));
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
        p.vie -= 0.03;
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
      else dessinerSymbole(p);
    }
    ctx.globalAlpha = 1;

    if (particules.length) requestAnimationFrame(boucle);
    else { enCours = false; ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); }
  }

  function demarrer() {
    if (!enCours) { enCours = true; requestAnimationFrame(boucle); }
  }

  /** Crée une particule au hasard. */
  function particule(x, y, couleurs, formes, options) {
    return {
      type: Math.random() < 0.25 ? "etincelle" : "symbole",
      forme: formes[Math.floor(Math.random() * formes.length)],
      x, y,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.3,
      vie: 1,
      couleur: couleurs[Math.floor(Math.random() * couleurs.length)],
      ...options,
    };
  }

  return {
    /**
     * Explosion au point (x, y) de l'écran.
     * @param {string[]} couleurs - couleurs possibles des particules
     * @param {string[]} formes - "x" et/ou "o"
     */
    explosion(x, y, couleurs, formes = ["x", "o"], nombre = 30) {
      const n = reduit ? Math.ceil(nombre / 4) : nombre;
      for (let i = 0; i < n; i++) {
        const angle = Math.random() * Math.PI * 2;
        const vitesse = 2.5 + Math.random() * 8;
        particules.push(particule(x, y, couleurs, formes, {
          vx: Math.cos(angle) * vitesse,
          vy: Math.sin(angle) * vitesse - 2.5,
          gravite: 0.16,
          taille: 6 + Math.random() * 9,
          declin: 0.011 + Math.random() * 0.012,
        }));
      }
      particules.push({ type: "onde", x, y, r: 10, vitesse: 6, vie: 1, couleur: couleurs[0] });
      demarrer();
    },

    /** Pluie de symboles depuis le haut de l'écran (célébration). */
    pluie(couleurs, formes = ["x", "o"], nombre = 60) {
      const n = reduit ? 10 : nombre;
      for (let i = 0; i < n; i++) {
        particules.push(particule(Math.random() * window.innerWidth, -20 - Math.random() * window.innerHeight * 0.6, couleurs, formes, {
          vx: (Math.random() - 0.5) * 2,
          vy: 2 + Math.random() * 3,
          gravite: 0.05,
          taille: 7 + Math.random() * 9,
          vie: 1.4,
          declin: 0.006 + Math.random() * 0.005,
        }));
      }
      demarrer();
    },
  };
})();
