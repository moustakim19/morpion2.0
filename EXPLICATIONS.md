# Morpion 2.0 — Comment ça marche ?

## 📁 Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La structure de toutes les pages (accueil, partie, classement…) |
| `css/style.css` | Tout le style « Aurore » : ciel de nuit, aurores, verre, néons |
| `js/jeu.js` | Les **règles** : la grille 3 × 3 et la détection des 3 alignés |
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

## 1. L'algorithme qui détecte les 3 symboles alignés

La grille est **une liste de 9 cases**, numérotées ainsi :

```
 0 | 1 | 2
---+---+---
 3 | 4 | 5
---+---+---
 6 | 7 | 8
```

La case `i` est à la ligne `i ÷ 3` et à la colonne `i % 3` (le reste de la division).

**L'astuce :** une nouvelle ligne passe **forcément** par le symbole qu'on vient
de poser. On part donc de cette case et, pour chacune des **4 directions**
(→ horizontale, ↓ verticale, ↘ et ↙ diagonales) :

1. on **avance** case par case tant que c'est le même symbole ;
2. on **recule** dans le sens opposé tant que c'est le même symbole ;
3. on additionne : **au moins 3 → victoire !**

```
On vient de poser X au centre (case 4) :
  X | . | .      diagonale ↘ : on recule → case 0 = X
  . |[X]| .                    on avance → case 8 = X
  . | . | X      total = 1 + 1 + 1 = 3 → gagné !
```

On garde la liste des cases gagnantes pour les faire briller et tracer le trait.
Le même algorithme existe en SQL (`_ligne_gagnante`) : c'est le serveur qui
vérifie les victoires en ligne, donc impossible de tricher.

---

## 2. Comment l'ordinateur choisit son coup

- 🟢 **Facile** : il joue presque au hasard (il rate parfois une victoire ou un blocage).
- 🟣 **Moyen** : il gagne s'il peut, **bloque tes alignements de 2**, aime le centre
  et les coins… mais il ne voit pas les pièges à deux menaces (les « fourchettes »).
- 🔴 **Difficile** : l'algorithme **minimax**. Comme il n'y a que 9 cases, il peut
  imaginer **toutes** les suites possibles de la partie :
  1. il essaie chaque case libre ;
  2. il imagine que **tu** joues ton meilleur coup, puis lui le sien, etc. jusqu'à la fin ;
  3. une fin où il gagne vaut **+10**, une fin où tu gagnes **−10**, un nul **0** ;
  4. lui cherche le **max**imum, toi (dans sa tête) le **min**imum → « minimax ».

  Il préfère gagner vite et perdre le plus tard possible. Résultat : **il ne perd jamais**.
  Au mieux, tu fais match nul ! (On a testé : 2 100 parties, 0 défaite.)

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
