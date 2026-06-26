# Handoff : Pépite — Fil d'articles Wikipédia (Direction A)

## Overview
**Pépite** est une application mobile (web app) de lecture façon réseau social, alimentée par des articles Wikipédia. L'utilisateur fait défiler un fil d'articles (résumé + image), peut liker / partager / garder, ouvrir l'article complet, rebondir d'un sujet à l'autre via les liens internes, explorer par thème et consulter son profil. L'objectif produit : reproduire les codes d'interaction familiers d'Instagram/TikTok pour que l'utilisateur entre immédiatement dans le concept, tout en proposant un contenu encyclopédique personnalisé par un algorithme de recommandation (signaux : temps de lecture, clics sur liens, likes, partages — invisibles dans l'UI).

Ce package documente **uniquement la Direction A — « Clair & épuré »**, la direction retenue.

## About the Design Files
Les fichiers de ce bundle (`direction_A_reference.html`) sont des **références design réalisées en HTML** : des maquettes haute-fidélité montrant l'apparence et le comportement visés. **Ce n'est pas du code de production à copier tel quel.** La tâche est de **recréer ces écrans dans l'environnement de l'app cible** (React Native, React/Next, Vue, SwiftUI, Flutter…), en suivant les patterns, composants et conventions déjà en place dans ce codebase. Si aucun environnement n'existe encore, choisir le framework le plus adapté (pour une app mobile sociale de ce type, **React Native / Expo** est un bon défaut) et y implémenter les écrans.

> Les maquettes ont été produites sur un canvas « pannable » regroupant 3 directions ; seule la **Direction A** est concernée ici. Les vignettes hachurées grises sont des **placeholders d'images** — à remplacer par les visuels (thumbnail/lead image) renvoyés par l'API Wikipédia.

## Fidelity
**Haute-fidélité (hifi).** Couleurs, typographie, espacements et états sont définitifs. Recréer l'UI au pixel près avec les bibliothèques existantes du codebase. Le contenu textuel est du contenu d'exemple (lorem ipsum thématique) — à remplacer par les données réelles Wikipédia.

---

## Design Tokens

### Couleurs
| Rôle | Valeur | Usage |
|---|---|---|
| Fond app | `#ffffff` | Fond des écrans |
| Texte principal | `#16140f` | Titres, libellés actifs |
| Texte secondaire | `#5c574e` | Paragraphes / résumés |
| Texte tertiaire | `#6b665d` | Compteurs, sous-titres |
| Gris atténué | `#9a948a` / `#a8a299` | Labels de section, onglets inactifs |
| Gris très clair | `#bdb8af` / `#bdb8af` | Méta (« · lecture 3 min »), icônes nav inactives |
| Séparateur fin | `#f1eee9` | Bordures 1px |
| Séparateur épais | `#f4f2ee` | Séparateur 8px entre cartes du feed |
| Fond champ / chip | `#f4f2ee` | Barre de recherche, chips, boutons de partage |
| **Accent (primary)** | `oklch(0.62 0.17 55)` ≈ `#C56A1E` (ambre) | Onglet actif, liens, boutons « Lire la suite », icône nav active, chip sélectionnée |
| Accent foncé (labels) | `oklch(0.5 0.15 55)` ≈ `#9A4F12` | Labels de catégorie (ANIMAUX, ASTRONOMIE…) |
| Accent texte sur teinte | `oklch(0.45 0.13 55)` | Texte des chips d'intérêt |
| Lien souligné | texte `oklch(0.55 0.16 55)`, bordure-bas `oklch(0.78 0.1 60)` | Liens internes dans l'article |
| Teinte chip d'intérêt (fond) | `oklch(0.7 0.18 60 / .14)` | Fond des chips « centres d'intérêt » du profil |
| Avatar — exemples | `oklch(0.7 0.18 60)`, `oklch(0.6 0.13 200)`, `oklch(0.58 0.14 330)`, `oklch(0.6 0.12 150)` | Pastilles initiales |
| Cœur (like) | `oklch(0.62 0.18 28)` ≈ rouge | Icône like **remplie** — volontairement PAS l'accent (convention familière) |
| Fond immersif (flux continu) | `#0c0b0a` | Écran « flux continu » plein écran sombre |

> **Note couleur :** l'accent est **ambre** (hue ~55–60 en oklch). Une variante violette a été testée puis abandonnée — rester sur l'ambre.

### Typographie
- **Titre de marque « Pépite »** : `Newsreader` (serif), 600, 24px, letter-spacing −0.01em.
- **Tout le reste de l'UI** : `Helvetica Neue` / Arial / sans-serif système.
  - Titre d'article (carte) : 600, 21px, line-height 1.2
  - Titre d'article (page détail) : 600, 25–26px, line-height 1.18
  - Corps / résumé : 15–16px, line-height 1.5–1.62
  - Label de catégorie : 700, 11px, letter-spacing 0.07em, **UPPERCASE**
  - Onglets : 600 (actif) / 500 (inactif), 15px
  - Méta : 12–13px
- **Icônes** : `Material Symbols Outlined` (poids 400, optical size 24). Like rempli = `font-variation-settings:'FILL' 1`.

### Espacements & formes
- Padding horizontal des écrans : **16–18px**.
- Rayon images/cartes : **14px** ; rayon vignettes profil : 10px.
- Chips / boutons pilule : `border-radius: 999px`, padding `6–7px 12–14px`.
- Avatars contacts : 56px (partage) / 50px boutons d'action ; avatar profil : 68px.
- Bottom sheet (partage) : `border-radius: 26px 26px 0 0`, ombre `0 -10px 40px rgba(0,0,0,.18)`, poignée 42×5px `#e2ddd4`.
- Ombre des « téléphones » dans la maquette : décor de présentation uniquement — **à ignorer** dans l'app.
- Barre d'onglets basse : hauteur 60px, bordure-haut 1px `#f1eee9`, 5 icônes : `home`, `search`, `bolt` (flux continu), `forum`, `person`.

---

## Screens / Views

### 1. Feed — cartes (`home`)
- **Purpose** : fil principal, défilement vertical de cartes-articles.
- **Layout** : header (logo « Pépite » + icônes `search`, `send`) → barre d'onglets texte (**Pour toi** actif / Populaire / Actualité) avec soulignement ambre 2px sous l'actif → liste de cartes séparées par un bandeau 8px `#f4f2ee` → tab bar.
- **Carte article** : label catégorie UPPERCASE ambre + méta (« · lecture 3 min ») → image 186px (rayon 14px) → titre 21px → résumé 2–3 lignes `#5c574e` → bouton texte **« Lire la suite ▾ »** (ambre) → rangée d'actions : à gauche like (cœur rouge rempli + compteur), `send` (+ compteur) ; à droite `bookmark`.
- **Comportement** : « Pour toi » = fil personnalisé ; « Populaire » / « Actualité » = contenus populaires / actualité (utilisés par défaut tant qu'aucun signal utilisateur n'existe).

### 2. Flux continu (`bolt`)
- **Purpose** : variante immersive plein écran (façon Reels) — un article = un plein écran, swipe vertical.
- **Layout** : image plein cadre, dégradé sombre bas (`linear-gradient(to top, rgba(0,0,0,.82), transparent)`), onglets centrés en haut (Pour toi / Populaire, texte blanc). Colonne d'actions verticale à droite (like, send, bookmark, more_horiz) en blanc. Bloc texte en bas : label catégorie (teinte claire `oklch(0.82 0.13 70)`), titre 26px blanc, résumé, et incitation **« ⌃ Glisser pour lire l'article »**.
- **Comportement** : swipe vertical = article suivant ; swipe up / tap sur l'incitation = ouvre l'article (écran 3).

### 3. Article — déplié + sections
- **Purpose** : lecture de l'article complet.
- **Layout** : header de navigation (`arrow_back` à gauche ; `bookmark` + `send` à droite) → image lead 150px → label catégorie + titre 25px → **barre de sections en chips horizontales scrollables** (Résumé actif = chip pleine ambre ; Habitat / Intelligence / Régime = chips `#f4f2ee`) → corps de texte, paragraphes 16px line-height 1.62, avec **liens internes** stylés (couleur `oklch(0.55 0.16 55)` + soulignement fin ambre clair, 600).
- **Mécanique « lire la suite »** (propre à la Direction A) : le résumé **se déplie sur place** (pas de nouvelle page depuis le feed) ; sur la page détail, les **chips de section** permettent de sauter directement à une section. Cliquer un lien interne ouvre l'article correspondant (rebond de page en page — cœur du concept).

### 4. Partager à un contact (bottom sheet)
- **Purpose** : partage de l'article courant.
- **Layout** : écran sous-jacent assombri (overlay `rgba(20,16,8,.42)`) ; feuille blanche remontant du bas. Contenu : poignée → aperçu article (vignette 44px + titre + « Catégorie · Pépite ») → libellé « Envoyer à » → **rangée d'avatars de contacts** (initiales sur pastilles colorées : Léa, Théo, Sara, Noé…) → rangée de 3 actions secondaires (Copier le lien, Messages, Plus) en boutons `#f4f2ee` arrondis 14px.

### 5. Explorer (`search`)
- **Purpose** : recherche + découverte par thème.
- **Layout** : barre de recherche `#f4f2ee` (placeholder « Rechercher un sujet… ») → rangée de chips de thèmes (Sciences, Histoire, Art, Nature, Espace) → titre **« Tendances aujourd'hui »** (icône `trending_up` ambre) → **grille 2 colonnes** de cartes 120px avec titre en surimpression sur dégradé bas (L'Empire romain, Frida Kahlo, Mars (planète), La Renaissance).
- **Comportement** : reflète les sujets populaires + l'actualité.

### 6. Profil (`person`)
- **Purpose** : identité + activité + intérêts déduits.
- **Layout** : header « Profil » + `settings` → avatar 68px + nom (« Camille D. ») + bio → **rangée de stats** (Lus / Aimés / Gardés) entre deux séparateurs → section **« Centres d'intérêt »** : chips en teinte ambre claire (`oklch(0.7 0.18 60 / .14)`, texte `oklch(0.45 0.13 55)`) — **déduits automatiquement, pas de sélection manuelle** → section **« Gardés »** : grille 3 colonnes de vignettes.

---

## Interactions & Behavior
- **Like** : tap → bascule cœur rouge rempli/vide, incrémente le compteur (optimistic update).
- **« Lire la suite ▾ »** : déplie le résumé in-place dans la carte (transition de hauteur douce, ~200ms ease-out) ; la flèche pivote.
- **Chips de section** (page article) : sélection → scroll/jump vers la section ; chip active = fond ambre plein, texte blanc.
- **Liens internes** : tap → ouvre l'article cible (navigation push). C'est le mécanisme de « rebond » central du produit.
- **Partage** : tap `send` → ouvre la bottom sheet (slide-up ~250ms ease-out, overlay en fondu). Tap avatar = envoi direct.
- **Flux continu** : swipe vertical paginé (snap plein écran), comme des stories/reels.
- **Onglets feed** (Pour toi / Populaire / Actualité) : changement de source, soulignement ambre animé.
- **Tab bar** : navigation entre les 5 sections ; icône active en ambre.

## State Management
- `feedTab` : `'pourToi' | 'populaire' | 'actualite'`.
- `articles` : liste paginée (infinite scroll) ; chaque item `{ id, categorie, titre, resume, image, sections[], liens[], likes, liked, saved }`.
- `expandedCardId` : carte dont le résumé est déplié.
- `activeSection` : section courante dans la page article.
- `shareSheetOpen` + `shareTarget` (article).
- `profile` : `{ nom, bio, stats:{lus,aimes,gardes}, interets[], gardes[] }`.
- **Signaux algo (backend, invisibles UI)** : temps passé par article, scroll depth, clics sur liens internes, like/partage/garder, articles ouverts en entier → à logger pour la reco. Tant qu'aucun signal n'existe → servir « Populaire » / « Actualité ».
- **Données** : intégration API Wikipédia (résumé : endpoint REST `page/summary`, image `thumbnail`/`originalimage`, liens internes via le HTML/`links`). Mettre en cache.

## Design Tokens — récapitulatif rapide
- Accent : `oklch(0.62 0.17 55)` (ambre). Like : rouge `oklch(0.62 0.18 28)`.
- Rayons : 14px (médias/cartes), 999px (pilules), 26px (sheet top).
- Police titre de marque : Newsreader ; UI : Helvetica Neue ; icônes : Material Symbols Outlined.

## Assets
- **Polices** (Google Fonts) : `Newsreader` (opsz 6..72, poids 400/500/600/700) et `Material Symbols Outlined` (opsz 24, poids 400). Dans le codebase cible, utiliser les équivalents locaux/bundlés et la bibliothèque d'icônes maison si elle existe.
- **Images** : aucune image fournie — les zones hachurées sont des placeholders. Source réelle = images Wikipédia (thumbnail + lead image).
- **Avatars** : générés (initiales sur fond coloré), pas d'assets.

## Files
- `direction_A_reference.html` — les 6 écrans de la Direction A, isolés et autonomes (ouvrir dans un navigateur). Source de vérité visuelle.
- (Pour information : la maquette d'origine multi-directions vit dans `Pepite.dc.html` à la racine du projet ; seule la Direction A fait foi ici.)
