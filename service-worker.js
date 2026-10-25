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

const VERSION = "morpion-v6";

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

// 1) Installation : on remplit la réserve (en forçant le téléchargement des fichiers frais)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      cache.addAll(FICHIERS.map((f) => new Request(f, { cache: "reload" }))))
  );
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

/** Range une copie de la réponse dans la réserve. */
async function ranger(requete, reponse) {
  if (reponse && (reponse.ok || reponse.type === "opaque")) {
    const cache = await caches.open(VERSION);
    await cache.put(requete, reponse.clone());
  }
  return reponse;
}

/**
 * « Internet d'abord » : on télécharge la version la plus récente.
 * Si internet ne répond pas (hors ligne, ou plus de 4 secondes), on prend la réserve.
 */
async function internetDabord(requete) {
  const delai = new Promise((resoudre) => setTimeout(resoudre, 4000, null));
  try {
    const reponse = await Promise.race([fetch(requete).then((r) => ranger(requete, r)), delai]);
    if (reponse) return reponse;
  } catch { /* hors ligne */ }
  const enReserve = await caches.match(requete, { ignoreSearch: true });
  if (enReserve) return enReserve;
  if (requete.mode === "navigate") return caches.match("./index.html");
  return new Response("", { status: 504, statusText: "Hors ligne" });
}

/** « Réserve d'abord » (polices, icônes, bibliothèque Supabase) : rapide, et mis à jour en arrière-plan. */
async function reserveDabord(requete, event) {
  const depuisInternet = fetch(requete).then((r) => ranger(requete, r)).catch(() => null);
  event.waitUntil(depuisInternet);
  const enReserve = await caches.match(requete);
  return enReserve || (await depuisInternet) || new Response("", { status: 504, statusText: "Hors ligne" });
}

// 3) Chaque fois que le jeu demande un fichier
self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);

  // Supabase (comptes, parties, messages, vocaux) : toujours en direct, jamais en cache
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) return;
  if (!url.protocol.startsWith("http")) return;

  // Les fichiers du jeu (pages, scripts, styles) : toujours la dernière version
  if (url.origin === location.origin && !url.pathname.includes("/icons/")) {
    event.respondWith(internetDabord(requete));
  } else {
    event.respondWith(reserveDabord(requete, event));
  }
});
