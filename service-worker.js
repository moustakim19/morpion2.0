/* =========================================================
   service-worker.js — Le jeu marche sans internet
   ---------------------------------------------------------
   Un service worker est un petit programme qui se place entre
   le jeu et internet. Au premier lancement, il range tous les
   fichiers du jeu dans un « cache » (une réserve). Ensuite,
   même sans internet, il ressert les fichiers depuis la réserve.

   ⚠️ Change VERSION à chaque mise à jour du jeu pour que les
   joueurs reçoivent les nouveaux fichiers.
   ========================================================= */

const VERSION = "morpion-v5";

// Les fichiers indispensables, mis en cache dès l'installation
const FICHIERS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./css/chat.css",
  "./js/config.js",
  "./js/jeu.js",
  "./js/ia.js",
  "./js/sons.js",
  "./js/effets.js",
  "./js/enligne.js",
  "./js/chat.js",
  "./js/app.js",
  "./logo-morpion2.svg",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

// 1) Installation : on remplit la réserve
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FICHIERS)));
  self.skipWaiting(); // la nouvelle version prend la main tout de suite
});

// 2) Activation : on supprime les anciennes réserves
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((cle) => cle !== VERSION).map((cle) => caches.delete(cle))))
      .then(() => self.clients.claim())
  );
});

// 3) Chaque fois que le jeu demande un fichier
self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);

  // Supabase (comptes, parties, classement) : toujours en direct, jamais en cache
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) return;
  if (!url.protocol.startsWith("http")) return;

  // Stratégie « réserve d'abord, puis mise à jour en arrière-plan » :
  // on répond tout de suite avec la réserve (rapide, marche hors ligne)
  // et on télécharge la nouvelle version pour la prochaine fois.
  const depuisInternet = fetch(requete)
    .then(async (reponse) => {
      if (reponse && (reponse.ok || reponse.type === "opaque")) {
        const copie = reponse.clone();
        const cache = await caches.open(VERSION);
        await cache.put(requete, copie);
      }
      return reponse;
    })
    .catch(() => null);

  event.waitUntil(depuisInternet);
  event.respondWith(
    caches.match(requete, { ignoreSearch: url.origin === location.origin }).then(async (enReserve) => {
      if (enReserve) return enReserve;
      const reponse = await depuisInternet;
      if (reponse) return reponse;
      // Hors ligne et page inconnue : on renvoie l'accueil
      if (requete.mode === "navigate") return caches.match("./index.html");
      return new Response("", { status: 504, statusText: "Hors ligne" });
    })
  );
});
