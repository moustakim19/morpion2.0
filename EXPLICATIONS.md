# Morpion 2.0 — Comment ça marche ?

## 📁 Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La structure de toutes les pages (accueil, partie, classement…) |
| `css/style.css` | Tout le style : obsidienne, gemmes, animations |
| `js/jeu.js` | Les **règles** : la grille et la détection des 5 alignées |
| `js/ia.js` | **L'ordinateur** (3 niveaux, sans internet) |
| `js/sons.js` | Les sons, fabriqués avec la Web Audio API |
| `js/effets.js` | L'explosion de gemmes (canvas) |
| `js/enligne.js` | Tout ce qui parle à **Supabase** |
| `js/app.js` | Le chef d'orchestre : écrans, clics, modes de jeu |
| `js/config.js` | **Tes clés Supabase** (à remplir) |
| `supabase.sql` | Le code à coller dans Supabase |
| `manifest.json` + `service-worker.js` + `icons/` | L'appli installable (PWA) |

---

## 1. L'algorithme qui détecte les 5 gemmes alignées

La grille est **une liste de 225 cases** (15 × 15). La case numéro `i` est à la
ligne `i ÷ 15` et à la colonne `i % 15` (le reste de la division).

**L'astuce :** pas besoin de vérifier toute la grille après chaque coup.
Une nouvelle ligne de 5 passe **forcément** par la gemme qu'on vient de poser.
On part donc de cette gemme et, pour chacune des **4 directions**
(→ horizontale, ↓ verticale, ↘ et ↙ diagonales) :

1. on **avance** case par case tant que c'est la même couleur ;
2. on **recule** dans le sens opposé tant que c'est la même couleur ;
3. on additionne : **au moins 5 → victoire !**

```
On vient de poser [X] :   . O X X [X] X X . .
                     ← recule : 2      avance : 2 →
                     total = 2 + 1 + 2 = 5  → gagné !
```

On regarde au maximum 32 cases au lieu de 225 : c'est instantané.
On mémorise aussi **quelles** cases forment la ligne pour les surligner.
Le même algorithme existe en SQL (`_ligne_gagnante`) pour que le serveur
vérifie les victoires en ligne : impossible de tricher.

---

## 2. Comment l'ordinateur choisit son coup

1. **Il liste les cases intéressantes** : les cases vides proches des gemmes
   déjà posées (jouer dans un coin vide ne sert à rien).
2. **Il donne deux notes à chaque case :**
   - **Attaque** : à quel point cette case l'aide, lui, à aligner ;
   - **Défense** : à quel point elle t'aiderait, toi (s'il la prend, tu ne l'as plus !).
3. Pour noter, il regarde les 4 directions autour de la case et cherche des
   **motifs** connus (`x` = sa gemme, `_` = vide, `o` = adversaire ou bord) :

| Motif | Signification | Points |
|---|---|---|
| `xxxxx` | 5 alignées | 1 000 000 |
| `_xxxx_` | quatre ouvert (imparable) | 60 000 |
| `xxxx_`, `xx_xx`… | quatre (gagne au prochain coup) | 8 000 |
| `_xxx__` | trois ouvert | 3 500 |
| `__xx__` | deux ouvert | 300 |

   Deux grosses menaces en même temps donnent un gros bonus : l'adversaire
   ne peut pas tout bloquer.

4. **Selon le niveau :**
   - 🟢 **Facile** : beaucoup de hasard ; il rate parfois une victoire ou un blocage.
   - 🟣 **Moyen** : gagne s'il peut, **bloque toujours tes alignements de 4**,
     bloque souvent tes « trois ouverts », sinon construit ses lignes.
   - 🔴 **Difficile** : attaque + défense combinées, et il **anticipe** :
     il essaie ses 8 meilleurs coups dans sa tête et regarde la meilleure
     réponse que tu pourrais faire, puis choisit le coup qui te laisse le moins de chances.

---

## 3. Le système Elo (classement)

Chaque joueur commence à **1000 points**. Après une partie en ligne :

1. On calcule la **chance de gagner attendue** du joueur A :
   `attendu = 1 / (1 + 10^((points_B − points_A) / 400))`
   - Deux joueurs à égalité → 0,5 (50 %).
   - A a 200 points de plus → environ 0,76 (76 %).
2. On compare au **résultat réel** : 1 (victoire), 0 (défaite), 0,5 (nul).
3. **Points gagnés = 32 × (résultat − attendu)**. Le perdant perd la même quantité.

| Situation | Résultat |
|---|---|
| Égalité, A gagne | A : **+16**, B : −16 |
| A (1200) bat B (1000) — favori | A : **+8** seulement |
| B (1000) bat A (1200) — exploit ! | B : **+24** |

Battre plus fort que soi rapporte gros ; battre plus faible rapporte peu.
Le calcul se fait **sur le serveur** (fonction `_terminer_partie`), jamais
dans le navigateur, sinon on pourrait tricher.

Rangs selon les points : Quartz < 900 ≤ Améthyste < 1100 ≤ Saphir < 1300 ≤ Émeraude < 1500 ≤ Rubis < 1700 ≤ Diamant.

---

## 4. Le mode en ligne (Supabase)

- **Comptes** : email + mot de passe. À l'inscription, un *trigger* SQL crée
  automatiquement ta ligne dans `players` avec ton pseudo.
- **Les coups** ne sont jamais écrits directement dans la table : le jeu appelle
  `jouer_coup()`, une fonction SQL qui vérifie que c'est ton tour, que la case
  est libre, puis détecte la victoire et applique l'Elo.
- **Le temps réel** : chaque modification d'une partie est envoyée
  instantanément aux deux joueurs (Supabase Realtime).
- **Chronomètre (30 s)** : quand il atteint 0, le jeu demande au serveur de
  passer le tour ; le serveur vérifie lui-même l'heure.
- **Déconnexion** : chaque joueur envoie « je suis là » toutes les 10 s. Si
  l'adversaire disparaît pendant **60 s**, tu gagnes.
- **Partie rapide** : `partie_rapide()` te met dans la file ou te relie au
  joueur qui attend depuis le plus longtemps (`for update skip locked` évite
  que deux joueurs prennent la même place).

---

## 5. L'appli installable (PWA)

- **`manifest.json`** : la « carte d'identité » de l'appli (nom, couleurs,
  icônes, plein écran, portrait). Grâce à lui, le navigateur propose de l'installer.
- **`service-worker.js`** : un petit programme qui range tous les fichiers du jeu
  dans une réserve (le *cache*). Sans internet, il les ressert depuis la réserve :
  l'appli s'ouvre et les modes hors ligne marchent.
  👉 Change `VERSION` dans ce fichier à chaque mise à jour du jeu.
- **Bouton « Installer l'appli »** (icône ⬇ en haut) : il apparaît quand le
  navigateur autorise l'installation. Sur iPhone : Partager → « Sur l'écran d'accueil ».

⚠️ Le service worker ne marche **pas** en double-cliquant sur `index.html`
(`file://`). Il faut une adresse `http(s)://` : par exemple **GitHub Pages**,
ou l'extension VS Code **Live Server** (clic droit sur `index.html` → *Open with Live Server*).

---

## 🚀 Mettre en route le mode en ligne

1. Sur [supabase.com](https://supabase.com) : **New project** → nom `morpion-2`, choisis un mot de passe, la région la plus proche. Attends ~2 min.
2. **Project Settings → API** : copie la **Project URL** et la clé **anon public**.
3. Colle-les dans `js/config.js` à la place des `XXXX`.
4. **Authentication → Sign In / Providers → Email** : désactive **Confirm email**.
5. **SQL Editor → New query** : colle tout le contenu de `supabase.sql` → **Run**.
   Tu dois voir **Success**.
6. Teste : ouvre le jeu, crée un compte. Ouvre une fenêtre privée
   (Ctrl + Shift + N), crée un 2ᵉ compte, et joue contre toi-même !
