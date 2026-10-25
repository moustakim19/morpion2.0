# Morpion 2.0 — Comment ça marche ?

## 📁 Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La structure de toutes les pages (accueil, partie, classement…) |
| `css/style.css` | Tout le style « Aurore » : ciel de nuit, aurores, verre, néons |
| `js/jeu.js` | Les **règles** : la grille 4 × 4 et la détection des 4 alignés |
| `js/ia.js` | **L'ordinateur** (3 niveaux, sans internet) |
| `js/sons.js` | Les sons, fabriqués avec la Web Audio API |
| `js/effets.js` | L'explosion de mini X / O à la victoire (canvas) |
| `js/enligne.js` | Tout ce qui parle à **Supabase** |
| `js/app.js` | Le chef d'orchestre : écrans, clics, modes de jeu |
| `js/config.js` | Tes clés Supabase |
| `supabase.sql` | Le code à coller dans Supabase |
| `logo-morpion2.svg` | Le logo (aussi favicon) |
| `manifest.json` + `service-worker.js` + `icons/` | L'appli installable (PWA) |

---

## 1. L'algorithme qui détecte les 4 symboles alignés

La grille est **une liste de 16 cases**, numérotées ainsi :

```
  0 |  1 |  2 |  3
----+----+----+----
  4 |  5 |  6 |  7
----+----+----+----
  8 |  9 | 10 | 11
----+----+----+----
 12 | 13 | 14 | 15
```

La case `i` est à la ligne `i ÷ 4` et à la colonne `i % 4` (le reste de la division).

**L'astuce :** une nouvelle ligne passe **forcément** par le symbole qu'on vient
de poser. On part donc de cette case et, pour chacune des **4 directions**
(→ horizontale, ↓ verticale, ↘ et ↙ diagonales) :

1. on **avance** case par case tant que c'est le même symbole ;
2. on **recule** dans le sens opposé tant que c'est le même symbole ;
3. on additionne : **au moins 4 → victoire !**

```
On vient de poser X en case 5 :
  X | . | . | .     diagonale ↘ : on recule → case 0 = X        (1)
  . |[X]| . | .                   on avance → cases 10 et 15 = X (2)
  . | . | X | .     total = 1 + 1 + 2 = 4 → gagné !
  . | . | . | X
```

On garde la liste des cases gagnantes pour les faire briller et tracer le trait.
Le même algorithme existe en SQL (`_ligne_gagnante`) : c'est le serveur qui
vérifie les victoires en ligne, donc impossible de tricher.

---

## 2. Comment l'ordinateur choisit son coup

- 🟢 **Facile** : il joue presque au hasard (il rate parfois une victoire ou un blocage).
- 🟣 **Moyen** : il gagne s'il peut, **bloque tes alignements de 3**, aime les 4 cases
  du centre… sinon il joue au hasard.
- 🔴 **Difficile** : l'algorithme **minimax**, 6 coups à l'avance :
  1. il essaie chaque case libre ;
  2. il imagine que **tu** joues ton meilleur coup, puis lui le sien, etc. ;
  3. lui cherche le **max**imum, toi (dans sa tête) le **min**imum → « minimax » ;
  4. au bout de 6 coups, il **note** la position : chaque ligne encore possible
     rapporte 1 point avec 1 symbole, 10 avec 2, 100 avec 3 (en positif pour lui,
     en négatif pour toi). Une victoire vaut 100 000.

  Sur 4 × 4, il y a trop de parties possibles pour toutes les imaginer jusqu'au bout :
  c'est pour ça qu'il s'arrête à 6 coups. Dans nos tests, **il n'a jamais perdu**.

  L'**élagage alpha-bêta** est un raccourci : dès qu'une branche est forcément
  moins bonne qu'une autre déjà trouvée, il arrête de l'explorer. Même résultat,
  des centaines de fois plus rapide.

---

## 3. Le système Elo (classement)

Chaque joueur commence à **1000 points**. Après une partie en ligne :

1. **Chance de gagner attendue** du joueur A :
   `attendu = 1 / (1 + 10^((points_B − points_A) / 400))`
   - Égalité de points → 0,5 (50 %).
   - A a 200 points de plus → environ 0,76 (76 %).
2. On compare au **résultat réel** : 1 (victoire), 0 (défaite), 0,5 (nul).
3. **Points gagnés = 32 × (résultat − attendu)**. Le perdant perd la même quantité.

| Situation | Résultat |
|---|---|
| Égalité, A gagne | A : **+16**, B : −16 |
| A (1200) bat B (1000), le favori gagne | A : **+8** seulement |
| B (1000) bat A (1200), l'exploit ! | B : **+24** |
| Match nul entre égaux | 0 |

Le calcul se fait **sur le serveur** (fonction `_terminer_partie`).

Rangs : Étincelle < 900 ≤ Comète < 1100 ≤ Étoile < 1300 ≤ Nébuleuse < 1500 ≤ Galaxie < 1700 ≤ Supernova.

---

## 4. Le mode en ligne (Supabase)

- **Comptes** : email + mot de passe. Un *trigger* SQL crée ta ligne dans `players`.
- **Les coups** passent par la fonction `jouer_coup()` qui vérifie que c'est ton tour
  et que la case est libre, puis détecte la victoire et applique l'Elo.
- **Temps réel** : chaque changement est envoyé instantanément aux deux joueurs.
- **Chronomètre (30 s)** : à 0, le serveur passe le tour à l'adversaire.
- **Déconnexion** : « je suis là » toutes les 10 s ; absent 60 s → l'autre gagne.
- **Revanche** : quand les deux la demandent, une nouvelle partie démarre
  et les symboles sont inversés (l'autre commence). Le score de la série est gardé.

---

## 5. L'appli installable (PWA)

- **`manifest.json`** : la carte d'identité de l'appli (nom, couleurs, icônes, plein écran).
- **`service-worker.js`** : range les fichiers dans une réserve (*cache*) pour que
  l'appli s'ouvre sans internet. 👉 Change `VERSION` à chaque mise à jour.
- **Bouton ⬇ « Installer l'appli »** en haut (sur iPhone : Partager → « Sur l'écran d'accueil »).

⚠️ Le service worker ne marche pas avec `file://` (double-clic sur `index.html`).
Il faut une adresse `http(s)://` : **GitHub Pages** ou l'extension VS Code **Live Server**.
