/* =========================================================
   chat.js — Le salon de messages (texte + vocaux)
   ---------------------------------------------------------
   Chaque partie en ligne a son « salon ». On peut écrire avant
   (dans la salle d'attente), pendant et après la partie, et la
   conversation continue pendant les revanches.

   Les vocaux :
   1. MediaRecorder enregistre le micro (navigator.mediaDevices),
   2. le fichier audio est rangé dans Supabase Storage (privé),
   3. un message de type « vocal » est créé avec le chemin du fichier,
   4. pour l'écouter, on demande une adresse temporaire au serveur.
   ⚠️ Le micro ne marche que sur un site en https (Netlify) ou en localhost.
   ========================================================= */

const Chat = (() => {
  const el = (id) => document.getElementById(id);
  const DUREE_MAX_VOCAL = 60; // secondes

  const etatChat = {
    salon: null,
    messages: [],
    ids: new Set(),        // pour ne pas afficher deux fois le même message
    ouvert: false,
    nonLus: 0,
    // enregistrement
    enregistreur: null,
    flux: null,
    morceaux: [],
    debutEnreg: 0,
    minuteurEnreg: null,
    envoyerApres: false,
    // lecture
    lecteur: null,
    lecteurId: null,
    urls: {},              // adresses déjà obtenues pour les vocaux
  };

  /* ---------------- Outils ---------------- */

  function echapperTexte(texte) {
    return String(texte).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function formaterDuree(secondes) {
    const s = Math.max(0, Math.round(secondes));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function heure(date) {
    return new Date(date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  /** Le pseudo de l'auteur d'un message. */
  function nomAuteur(id) {
    if (id === EnLigne.user?.id) return "Toi";
    return etat.adversaire?.pseudo || "Adversaire";
  }

  /** Des hauteurs de barres « au hasard », mais toujours les mêmes pour un même vocal. */
  function barresVocal(graine, nombre = 26) {
    let x = 0;
    for (const c of String(graine)) x = (x * 31 + c.charCodeAt(0)) % 9973;
    const barres = [];
    for (let i = 0; i < nombre; i++) {
      x = (x * 7919 + 13) % 9973;
      const h = 25 + (x % 75);
      barres.push(`<i style="height:${h}%"></i>`);
    }
    return barres.join("");
  }

  /* ---------------- Affichage ---------------- */

  function majBouton() {
    const actif = Boolean(etatChat.salon);
    el("btn-chat").hidden = !actif;
    document.body.classList.toggle("chat-actif", actif);
    const badge = el("badge-chat");
    badge.hidden = etatChat.nonLus === 0;
    badge.textContent = etatChat.nonLus > 9 ? "9+" : etatChat.nonLus;
  }

  function majEntete() {
    const adv = etat.adversaire?.pseudo;
    el("chat-sous").textContent = adv ? `avec ${adv}` : "En attente de ton adversaire…";
  }

  /** Crée la bulle HTML d'un message. */
  function creerBulle(msg, precedent) {
    const moi = msg.auteur === EnLigne.user?.id;
    const div = document.createElement("div");
    // Les messages qui se suivent du même auteur sont regroupés
    const suite = precedent && precedent.auteur === msg.auteur &&
      new Date(msg.created_at) - new Date(precedent.created_at) < 120000;
    div.className = `msg ${moi ? "moi" : "lui"}${suite ? " suite" : ""}`;
    div.dataset.id = msg.id;

    if (msg.type === "vocal") {
      div.innerHTML = `
        <div class="bulle vocal">
          <button class="lecture" aria-label="Écouter le vocal"><svg><use href="#i-lecture"/></svg></button>
          <span class="barres">${barresVocal(msg.id)}</span>
          <span class="duree">${formaterDuree(msg.duree || 0)}</span>
        </div>
        <small class="meta">${echapperTexte(nomAuteur(msg.auteur))} · ${heure(msg.created_at)}</small>`;
      div.querySelector(".lecture").addEventListener("click", () => jouerVocal(msg, div.querySelector(".bulle")));
    } else {
      const seulementEmoji = /^\p{Extended_Pictographic}{1,3}$/u.test(msg.contenu.replace(/\s/g, ""));
      div.innerHTML = `
        <div class="bulle${seulementEmoji ? " emoji" : ""}">${echapperTexte(msg.contenu)}</div>
        <small class="meta">${echapperTexte(nomAuteur(msg.auteur))} · ${heure(msg.created_at)}</small>`;
    }
    return div;
  }

  function dessinerTout() {
    const liste = el("chat-liste");
    liste.innerHTML = "";
    if (!etatChat.messages.length) {
      liste.innerHTML = '<p class="chat-vide">Aucun message pour l\'instant.<br>Dis bonjour 👋</p>';
      return;
    }
    etatChat.messages.forEach((m, k) => liste.appendChild(creerBulle(m, etatChat.messages[k - 1])));
    defilerEnBas();
  }

  function defilerEnBas() {
    const liste = el("chat-liste");
    requestAnimationFrame(() => { liste.scrollTop = liste.scrollHeight; });
  }

  /* ---------------- Messages ---------------- */

  /** Ajoute un message (venant de la base ou du temps réel) s'il est nouveau. */
  function ajouter(msg) {
    if (!msg || msg.salon !== etatChat.salon || etatChat.ids.has(msg.id)) return false;
    etatChat.ids.add(msg.id);
    const precedent = etatChat.messages[etatChat.messages.length - 1];
    etatChat.messages.push(msg);
    const liste = el("chat-liste");
    liste.querySelector(".chat-vide")?.remove();
    const bulle = creerBulle(msg, precedent);
    bulle.classList.add("nouveau");
    liste.appendChild(bulle);
    defilerEnBas();
    return true;
  }

  /** Un message est arrivé en temps réel. */
  function recevoir(msg) {
    if (!ajouter(msg)) return;
    if (msg.auteur === EnLigne.user?.id) return;
    Sons.message();
    if (!etatChat.ouvert) {
      etatChat.nonLus++;
      majBouton();
      const btn = el("btn-chat");
      btn.classList.remove("secoue");
      void btn.offsetWidth;
      btn.classList.add("secoue");
      const apercu = msg.type === "vocal" ? "🎤 Message vocal" : msg.contenu;
      toast(`💬 ${nomAuteur(msg.auteur)} : ${apercu.length > 40 ? apercu.slice(0, 40) + "…" : apercu}`, "info", 3200);
    }
  }

  async function envoyerTexte(texte) {
    texte = texte.trim().slice(0, 300);
    if (!texte || !etatChat.salon) return;
    try {
      const msg = await EnLigne.envoyerTexte(etatChat.salon, texte);
      ajouter(msg);
      Sons.clic();
    } catch (err) {
      toast(err.message, "erreur");
      el("chat-input").value = texte; // on rend le texte pour pouvoir réessayer
    }
  }

  /* ---------------- Vocaux : enregistrer ---------------- */

  async function demarrerEnregistrement() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast("Les vocaux marchent sur le site en ligne (https), pas en ouvrant le fichier.", "erreur", 4500);
      return;
    }
    try {
      etatChat.flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast("Micro refusé. Autorise le micro dans ton navigateur pour envoyer des vocaux.", "erreur", 4500);
      return;
    }
    // Chaque navigateur a son format préféré (Safari : mp4, Chrome/Firefox : webm)
    const format = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
      .find((f) => MediaRecorder.isTypeSupported(f));
    etatChat.enregistreur = new MediaRecorder(etatChat.flux, format ? { mimeType: format, audioBitsPerSecond: 32000 } : undefined);
    etatChat.morceaux = [];
    etatChat.envoyerApres = false;
    etatChat.enregistreur.ondataavailable = (e) => { if (e.data.size) etatChat.morceaux.push(e.data); };
    etatChat.enregistreur.onstop = terminerEnregistrement;
    etatChat.enregistreur.start(250);
    etatChat.debutEnreg = Date.now();

    el("chat-form").hidden = true;
    el("chat-enreg").hidden = false;
    el("chat-temps-rec").textContent = "0:00";
    vibrer(20);
    etatChat.minuteurEnreg = setInterval(() => {
      const s = (Date.now() - etatChat.debutEnreg) / 1000;
      el("chat-temps-rec").textContent = formaterDuree(s);
      if (s >= DUREE_MAX_VOCAL) arreterEnregistrement(true); // 60 s maximum
    }, 200);
  }

  /** Arrête l'enregistrement (envoyer = true pour l'envoyer, false pour l'annuler). */
  function arreterEnregistrement(envoyer) {
    if (!etatChat.enregistreur) return;
    etatChat.envoyerApres = envoyer;
    clearInterval(etatChat.minuteurEnreg);
    if (etatChat.enregistreur.state !== "inactive") etatChat.enregistreur.stop();
    else terminerEnregistrement();
  }

  async function terminerEnregistrement() {
    const enregistreur = etatChat.enregistreur;
    if (!enregistreur) return;
    etatChat.enregistreur = null;
    etatChat.flux?.getTracks().forEach((piste) => piste.stop()); // on éteint le micro
    etatChat.flux = null;
    el("chat-enreg").hidden = true;
    el("chat-form").hidden = false;

    const duree = (Date.now() - etatChat.debutEnreg) / 1000;
    if (!etatChat.envoyerApres) return;
    if (duree < 0.8) { toast("Vocal trop court : appuie sur le micro, parle, puis envoie.", "info"); return; }

    const fichier = new Blob(etatChat.morceaux, { type: enregistreur.mimeType || "audio/webm" });
    const salon = etatChat.salon;
    el("chat-envoi").hidden = false;
    try {
      const msg = await EnLigne.envoyerVocal(salon, fichier, Math.min(duree, DUREE_MAX_VOCAL));
      ajouter(msg);
      Sons.clic();
    } catch (err) {
      toast("Vocal non envoyé : " + err.message, "erreur", 4000);
    } finally {
      el("chat-envoi").hidden = true;
    }
  }

  /* ---------------- Vocaux : écouter ---------------- */

  function arreterLecture() {
    if (etatChat.lecteur) {
      etatChat.lecteur.pause();
      etatChat.lecteur = null;
    }
    document.querySelectorAll(".bulle.vocal.joue").forEach((b) => {
      b.classList.remove("joue");
      b.querySelectorAll(".barres i.lu").forEach((barre) => barre.classList.remove("lu"));
      b.querySelector(".lecture use").setAttribute("href", "#i-lecture");
    });
    etatChat.lecteurId = null;
  }

  async function jouerVocal(msg, bulle) {
    // Re-clic sur le vocal en cours → pause / reprise
    if (etatChat.lecteurId === msg.id && etatChat.lecteur) {
      const icone = bulle.querySelector(".lecture use");
      if (etatChat.lecteur.paused) { etatChat.lecteur.play(); icone.setAttribute("href", "#i-pause"); }
      else { etatChat.lecteur.pause(); icone.setAttribute("href", "#i-lecture"); }
      return;
    }
    arreterLecture();
    etatChat.lecteurId = msg.id;
    bulle.classList.add("charge");
    try {
      const url = etatChat.urls[msg.audio] || (etatChat.urls[msg.audio] = await EnLigne.urlVocal(msg.audio));
      if (etatChat.lecteurId !== msg.id) return; // on a cliqué ailleurs entre-temps
      const lecteur = new Audio(url);
      etatChat.lecteur = lecteur;
      const duree = msg.duree || 1;
      // Les barres se colorent au fur et à mesure de la lecture
      const barres = bulle.querySelectorAll(".barres i");
      lecteur.ontimeupdate = () => {
        const lues = Math.round(Math.min(1, lecteur.currentTime / duree) * barres.length);
        barres.forEach((barre, k) => barre.classList.toggle("lu", k < lues));
      };
      lecteur.onended = arreterLecture;
      await lecteur.play();
      bulle.classList.add("joue");
      bulle.querySelector(".lecture use").setAttribute("href", "#i-pause");
    } catch (err) {
      toast("Impossible de lire ce vocal.", "erreur");
      arreterLecture();
    } finally {
      bulle.classList.remove("charge");
    }
  }

  /* ---------------- Ouvrir / fermer ---------------- */

  function ouvrir() {
    if (!etatChat.salon) return;
    etatChat.ouvert = true;
    etatChat.nonLus = 0;
    majBouton();
    majEntete();
    el("tiroir-chat").classList.add("ouvert");
    el("tiroir-chat").setAttribute("aria-hidden", "false");
    defilerEnBas();
    // Sur ordinateur, on place le curseur dans la zone de texte
    if (window.matchMedia("(hover: hover)").matches) setTimeout(() => el("chat-input").focus(), 300);
  }

  function fermer() {
    etatChat.ouvert = false;
    el("tiroir-chat").classList.remove("ouvert");
    el("tiroir-chat").setAttribute("aria-hidden", "true");
    if (etatChat.enregistreur) arreterEnregistrement(false);
    el("chat-input").blur();
  }

  /** On entre dans le salon d'une partie (même salon = on garde la conversation). */
  async function ouvrirSalon(salon) {
    if (etatChat.salon === salon) { majBouton(); majEntete(); return; }
    etatChat.salon = salon;
    etatChat.messages = [];
    etatChat.ids = new Set();
    etatChat.nonLus = 0;
    majBouton();
    majEntete();
    dessinerTout();
    try {
      const anciens = await EnLigne.chargerMessages(salon);
      if (etatChat.salon !== salon) return;
      for (const m of anciens) if (!etatChat.ids.has(m.id)) { etatChat.ids.add(m.id); etatChat.messages.push(m); }
      etatChat.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      dessinerTout();
    } catch { /* pas grave : les nouveaux messages arriveront quand même */ }
  }

  /** On quitte le mode en ligne : on ferme tout. */
  function fermerSalon() {
    fermer();
    arreterLecture();
    etatChat.salon = null;
    etatChat.messages = [];
    etatChat.ids = new Set();
    etatChat.nonLus = 0;
    majBouton();
  }

  /* ---------------- Boutons ---------------- */

  el("btn-chat").addEventListener("click", () => { Sons.clic(); etatChat.ouvert ? fermer() : ouvrir(); });
  el("chat-fermer").addEventListener("click", fermer);
  el("tiroir-chat").addEventListener("click", (e) => { if (e.target.id === "tiroir-chat") fermer(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && etatChat.ouvert) fermer(); });

  el("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = el("chat-input");
    const texte = input.value;
    input.value = "";
    majBoutonsSaisie();
    envoyerTexte(texte);
  });
  // Messages rapides en un toucher
  el("chat-rapides").addEventListener("click", (e) => {
    const bouton = e.target.closest("button");
    if (bouton) envoyerTexte(bouton.textContent);
  });
  // Le micro apparaît quand la zone de texte est vide, la flèche « envoyer » sinon
  function majBoutonsSaisie() {
    const vide = !el("chat-input").value.trim();
    el("chat-micro").hidden = !vide;
    el("chat-envoyer").hidden = vide;
  }
  el("chat-input").addEventListener("input", majBoutonsSaisie);
  majBoutonsSaisie();

  el("chat-micro").addEventListener("click", demarrerEnregistrement);
  el("chat-annuler-vocal").addEventListener("click", () => arreterEnregistrement(false));
  el("chat-envoyer-vocal").addEventListener("click", () => arreterEnregistrement(true));

  return { ouvrirSalon, fermerSalon, recevoir, ouvrir, fermer, majEntete };
})();
