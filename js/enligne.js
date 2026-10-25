/* =========================================================
   enligne.js — Tout ce qui parle à Supabase
   ---------------------------------------------------------
   Supabase nous donne 3 choses :
   - l'AUTHENTIFICATION (comptes email + mot de passe),
   - une BASE DE DONNÉES (tables players et games),
   - le TEMPS RÉEL (Realtime) : dès qu'une partie change dans
     la base, les deux joueurs sont prévenus instantanément.

   Les coups ne sont jamais écrits directement dans la table :
   on appelle des fonctions SQL sécurisées (rpc) qui vérifient
   que c'est bien ton tour, que la case est libre, etc.
   ========================================================= */

const EnLigne = (() => {
  const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const cfg = window.MORPION_CONFIG || {};
  let client = null;
  let quandChange = null; // fonction appelée quand on se connecte / déconnecte

  const api = {
    pret: false,      // vrai quand Supabase est utilisable
    user: null,       // l'utilisateur connecté (ou null)
    profil: null,     // sa ligne dans la table players
    canal: null,      // le canal temps réel de la partie en cours

    /** Les clés ont-elles été remplies dans config.js ? */
    configure() {
      return Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
        !cfg.SUPABASE_URL.includes("XXXX") && !cfg.SUPABASE_ANON_KEY.includes("XXXX"));
    },

    /** Charge la bibliothèque Supabase si elle n'est pas là (ex : on était hors ligne au démarrage). */
    chargerSDK() {
      return new Promise((resoudre) => {
        if (window.supabase) return resoudre(true);
        const script = document.createElement("script");
        script.src = CDN;
        script.onload = () => resoudre(true);
        script.onerror = () => resoudre(false);
        document.head.appendChild(script);
      });
    },

    /** Démarre Supabase et récupère la session enregistrée. */
    async init(surChangement) {
      quandChange = surChangement || quandChange;
      if (api.pret) return true;
      if (!api.configure()) return false;
      if (!window.supabase && !(await api.chargerSDK())) return false;

      client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      api.pret = true;

      // Prévenu à chaque connexion / déconnexion
      client.auth.onAuthStateChange((_evenement, session) => {
        api.user = session?.user || null;
        // setTimeout : Supabase déconseille d'appeler la base directement ici
        setTimeout(async () => {
          if (api.user) await api.chargerProfil();
          else api.profil = null;
          quandChange?.();
        }, 0);
      });

      const { data } = await client.auth.getSession();
      api.user = data.session?.user || null;
      if (api.user) await api.chargerProfil();
      return true;
    },

    /* ---------------- Comptes ---------------- */

    async inscription(email, motDePasse, pseudo) {
      // 1) Le pseudo est-il libre ? (on échappe _ et % qui sont des jokers en SQL)
      const motif = pseudo.replace(/[\\%_]/g, (c) => "\\" + c);
      const { data: existe, error: e1 } = await client.from("players").select("id").ilike("pseudo", motif).maybeSingle();
      if (e1) throw new Error(traduire(e1));
      if (existe) throw new Error("Ce pseudo est déjà pris, choisis-en un autre.");
      // 2) Création du compte (le pseudo est transmis, un « trigger » SQL crée la ligne players)
      const { data, error } = await client.auth.signUp({
        email, password: motDePasse, options: { data: { pseudo } },
      });
      if (error) throw new Error(traduire(error));
      if (!data.session) throw new Error("Compte créé ! Confirme ton email, ou désactive « Confirm email » dans Supabase.");
      api.user = data.user;
      await api.chargerProfil();
    },

    async connexion(email, motDePasse) {
      const { data, error } = await client.auth.signInWithPassword({ email, password: motDePasse });
      if (error) throw new Error(traduire(error));
      api.user = data.user;
      await api.chargerProfil();
    },

    async deconnexion() {
      await client.auth.signOut();
      api.user = null;
      api.profil = null;
    },

    /** Recharge mes points, victoires et défaites. */
    async chargerProfil() {
      if (!api.user) return null;
      const { data } = await client.from("players").select("*").eq("id", api.user.id).maybeSingle();
      api.profil = data || { id: api.user.id, pseudo: api.user.user_metadata?.pseudo || "Joueur", points: 1000, victoires: 0, defaites: 0 };
      return api.profil;
    },

    async profilDe(id) {
      if (!id) return null;
      const { data } = await client.from("players").select("id,pseudo,points,victoires,defaites").eq("id", id).maybeSingle();
      return data;
    },

    /* ---------------- Parties ---------------- */

    /** Appelle une fonction SQL sécurisée (voir supabase.sql). */
    async rpc(nom, parametres = {}) {
      const { data, error } = await client.rpc(nom, parametres);
      if (error) throw new Error(traduire(error));
      return data;
    },

    async chargerPartie(id) {
      const { data, error } = await client.from("games").select("*").eq("id", id).single();
      if (error) throw new Error(traduire(error));
      return data;
    },

    /** « Je suis toujours là » (sert à détecter les déconnexions). */
    ping(id) {
      client.rpc("ping", { p_id: id }).then(() => {}, () => {});
    },

    /**
     * Écoute une partie en temps réel.
     * - surMaj(partie) : appelée à chaque changement de la ligne dans la base
     * - surPresence(etat) : appelée quand quelqu'un arrive / part (indicateur « En ligne »)
     */
    abonner(idPartie, salon, surMaj, surPresence, surMessage) {
      api.desabonner();
      const canal = client.channel("partie-" + idPartie, {
        config: { presence: { key: api.user.id } },
      });
      canal.on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: "id=eq." + idPartie },
        (message) => surMaj(message.new));
      // Les nouveaux messages du salon (texte et vocaux)
      canal.on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: "salon=eq." + salon },
        (message) => surMessage(message.new));
      canal.on("presence", { event: "sync" }, () => surPresence(canal.presenceState()));
      canal.subscribe(async (statut) => {
        if (statut === "SUBSCRIBED") await canal.track({ en_ligne: true });
      });
      api.canal = canal;
    },

    desabonner() {
      if (api.canal) {
        client.removeChannel(api.canal);
        api.canal = null;
      }
    },

    /* ---------------- Salon de messages ---------------- */

    /** Les 100 derniers messages du salon. */
    async chargerMessages(salon) {
      const { data, error } = await client.from("messages")
        .select("*").eq("salon", salon)
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error(traduire(error));
      return data.reverse(); // du plus ancien au plus récent
    },

    async envoyerTexte(salon, contenu) {
      const { data, error } = await client.from("messages")
        .insert({ salon, type: "texte", contenu }).select().single();
      if (error) throw new Error(traduire(error));
      return data;
    },

    /** Range le fichier audio dans le placard « vocaux », puis crée le message. */
    async envoyerVocal(salon, fichier, duree) {
      const type = (fichier.type || "audio/webm").split(";")[0];
      const extension = { "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/wav": "wav" }[type] || "webm";
      const chemin = `${salon}/${crypto.randomUUID()}.${extension}`;
      const envoi = await client.storage.from("vocaux").upload(chemin, fichier, { contentType: type });
      if (envoi.error) throw new Error(traduire(envoi.error));
      const { data, error } = await client.from("messages")
        .insert({ salon, type: "vocal", audio: chemin, duree: Math.round(duree * 10) / 10 }).select().single();
      if (error) throw new Error(traduire(error));
      return data;
    },

    /** Une adresse temporaire (1 heure) pour écouter un vocal privé. */
    async urlVocal(chemin) {
      const { data, error } = await client.storage.from("vocaux").createSignedUrl(chemin, 3600);
      if (error) throw new Error(traduire(error));
      return data.signedUrl;
    },

    /* ---------------- Classement ---------------- */

    async top10() {
      const { data, error } = await client.from("players")
        .select("id,pseudo,points,victoires,defaites")
        .order("points", { ascending: false })
        .order("victoires", { ascending: false })
        .limit(10);
      if (error) throw new Error(traduire(error));
      return data;
    },

    /** Ma position = nombre de joueurs qui ont plus de points que moi + 1. */
    async maPosition(points) {
      const { count, error } = await client.from("players").select("id", { count: "exact", head: true }).gt("points", points);
      if (error) return null;
      return (count || 0) + 1;
    },
  };

  /** Transforme les messages d'erreur (en anglais) en français compréhensible. */
  function traduire(erreur) {
    const m = erreur?.message || String(erreur);
    if (/Invalid login credentials/i.test(m)) return "Email ou mot de passe incorrect.";
    if (/already registered|already been registered/i.test(m)) return "Un compte existe déjà avec cet email.";
    if (/Password should be at least/i.test(m)) return "Le mot de passe doit faire au moins 6 caractères.";
    if (/invalid format|valid email|Email address .* is invalid/i.test(m)) return "Adresse email invalide.";
    if (/Email not confirmed/i.test(m)) return "Confirme ton email, ou désactive « Confirm email » dans Supabase.";
    if (/Database error saving new user/i.test(m)) return "Ce pseudo est déjà pris (ou invalide).";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Connexion impossible. Vérifie ton internet.";
    if (/rate limit|too many/i.test(m)) return "Trop de tentatives, réessaie dans un moment.";
    if (/Could not find the function|schema cache|Bucket not found/i.test(m)) return "La base n'est pas prête : as-tu exécuté supabase.sql ?";
    if (/row-level security|violates row-level/i.test(m)) return "Action refusée par la sécurité de la base.";
    return m;
  }

  return api;
})();
