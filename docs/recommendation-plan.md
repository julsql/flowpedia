# Plan — Moteur de recommandation Flowpedia

> Fichier d'instructions destiné à être exécuté dans une **nouvelle session**.
> Objectif : passer d'un feed « morelike + popular » à un **moteur de reco
> content-based, personnalisé, multi-capteurs, en apprentissage continu**, avec
> **dé-duplication façon Instagram** (ne jamais re-proposer la même page).
>
> Lis d'abord ce fichier en entier, puis attaque **Phase 1** (quick wins) avant
> **Phase 2** (embeddings). Ne casse aucun invariant listé en fin de document.

---

## 0. Contexte & état actuel (ne pas re-explorer, c'est déjà fait)

### Ce qui existe

**API (`apps/api/src`)**
- `feed/feed.service.ts` — `buildPool(tab, lang, seeds, seed)` : construit un pool
  ordonné de titres par onglet, `shuffleSeeded` (mulberry32) + `blendDiverse`
  (injection d'une source secondaire tous les N slots) + fallback random infini.
  `getFeed` retire les `exclude` (ids déjà vus) puis hydrate 5 summaries.
- `wikipedia/wikipedia.service.ts` — sources de titres :
  - `getRelatedTitles(seeds)` → CirrusSearch `morelike:` (plafonné `RELATED_SEED_LIMIT = 6` seeds).
  - `getPopularTitles` → pageviews top. `getNewsTitles` → featured news/mostread.
  - `getRelatedByCategory(title)` / `getTopicalCategories(title)` → catégories
    Wikipedia topicales (bruit maintenance filtré via `SKIP_CATEGORY`).
  - `getRandomTitles`. Cache via `CacheService` (Redis ou mémoire).
- `interests/interests.service.ts` — **déjà** un dérivateur de « grandes catégories »
  (`deriveInterests(titles)`) : set-cover glouton sur le graphe de catégories
  Wikipedia, remonte aux ancêtres quand le cluster est dispersé. **À réutiliser**
  comme signal d'affinité catégorielle (le user y tient explicitement).
- `events/` — ingestion des signaux :
  - `interaction.entity.ts` : `Interaction { userId, articleId, type, value, ts, createdAt }`.
  - `events.service.ts` : `insert` en batch si DB dispo, sinon log (dégradation gracieuse).
  - Aucune lecture des events par le feed aujourd'hui → **boucle ouverte, c'est LE gap**.
- `database/database.service.ts` — 1 connexion Postgres partagée, `synchronize: true`
  (MVP, pas de migrations). `repo(Entity)` renvoie `undefined` si pas de DB.
- `packages/shared/src/types/interaction.ts` — contrat `InteractionType` /
  `InteractionEvent` (source de vérité API↔app).

**Mobile (`apps/mobile/src`)**
- `library/LibraryProvider.tsx` — liked/saved/shared/read + mutedInterests
  (AsyncStorage). `seedsRef` (home) = `[...liked, ...saved]` moins mutés, **cap 6**.
- `seen/SeenProvider.tsx` — ids récemment vus, **TTL 3 j, max 400**, envoyés en
  `exclude` (query string CSV). C'est la dé-dup actuelle (fragile, cf. §3).
- `api/client.ts` — `fetchFeed(...seeds, seed, exclude)`, `sendEvents` (fire-and-forget,
  attache `userId`).

### Capteurs réellement émis aujourd'hui (vérifié)

| Type | Émis ? | Où |
|---|---|---|
| `like` / `save` | ✅ | `LibraryProvider` |
| `share` | ⚠️ **externe seulement** | `share/shareExternal.ts` |
| `dwell` (ms sur la page article) | ✅ | `app/article/[id].tsx` |
| `linkClick` | ✅ | `app/article/[id].tsx` |
| `openFull` | ✅ | `flow.tsx`, `article/[id].tsx` |
| `openWikipedia` | ✅ | `article/[id].tsx` |
| `scrollDepth` | ❌ **déclaré mais jamais émis** | — |
| share **in-app** (story / send-page) | ❌ | `ShareSheetProvider.tsx` (`recordShare` ne fait que `syncAdd`) |
| `read` (markRead) | ❌ (local only, pas d'event) | `LibraryProvider.markRead` |
| **`cardDwell`** (temps sur la carte / le titre dans le flux) | ❌ **n'existe pas** | — |
| **`impression`** (carte affichée) | ❌ **n'existe pas** | — |

---

## 1. Objectifs (demande utilisateur)

1. **Multi-capteurs** : exploiter un maximum de signaux, historique plus fourni.
2. **Pondération** : `read` compte ; `like`/`bookmark(save)` comptent **plus** ;
   `share` (in-app **et** externe) compte **encore plus** (fort signal d'intérêt).
3. **Temps sur le titre/carte dans le flux** (`cardDwell`) = signal **important**.
4. **Embeddings d'articles** (Phase 2).
5. **Récence** : l'historique récent pèse plus (décroissance temporelle).
6. **Grandes catégories calculées** prises en compte (réutiliser `interests.service`).
7. **Ne jamais re-recommander la même page** (façon Instagram) — cf. §3.
8. **Apprentissage continu** de l'activité (profil qui se met à jour en ligne).
9. **Signal social** : recommander des pages **likées par les comptes suivis**, mais
   en **petite dose** (terrain commun avec les autres, sans envahir le feed) — cf. §2.6.
10. **Mise en story** = signal fort, compte **autant que `share`** (poids 5.0).
11. **Standard « apps modernes »** (Instagram/TikTok/Facebook/Snapchat) mais
    **stockage borné** (un seul serveur pour l'instant) — cf. §7 scalabilité.
12. **Sérendipité anti-rabbit-hole** : de temps en temps, injecter **volontairement**
    du hors-profil (actualité / populaire) pour casser la bulle — cf. §2.7.
13. **Signal révocable** : supprimer une page (historique / like / bookmark) **retire
    sa contribution** au profil, qui **recalcule sans elle** (journal append-only
    conservé, via event compensateur `remove`) — cf. §2.8.

---

## 2. Modèle de scoring (le cœur)

### 2.1 Poids par capteur (`EVENT_WEIGHTS`)

À placer côté API (une seule source de vérité, réutilisée par profil + ranking).
Valeurs de départ à tuner :

```
story        : 5.0   // mise en story (reshare 24h) — intérêt le plus fort, = share
share        : 5.0   // in-app + externe — intérêt le plus fort
save         : 4.0
like         : 3.0
openFull     : 2.0   // a ouvert l'article complet
dwell        : 0..2.5 proportionnel au temps (sature, cf. ci-dessous)
scrollDepth  : 0..1.5 proportionnel à la profondeur (0..1)
linkClick    : 1.5   // a rebondi vers un lien interne
read         : 1.0   // marqué lu
cardDwell    : 0..1.0 proportionnel au temps sur la carte (sature ~8 s)
impression   : 0.05  // vu mais pas engagé (quasi neutre, sert surtout à la dé-dup)
openWikipedia: 0.3   // faible + signale un trou de parsing
mute (négatif): -4.0 // intérêt muté / skip rapide
```

- **Saturation** des signaux temporels : `min(cap, ln(1 + ms/1000))`-style, pour
  qu'un dwell de 10 min ne fasse pas exploser le score. Définir `saturate(value, halfLife)`.
- **Skip rapide** = `cardDwell < ~1.5 s` sur une carte affichée → petit signal négatif
  (l'utilisateur a fui le sujet).

### 2.2 Décroissance temporelle (récence)

`recency(ageMs) = 0.5 ** (ageMs / HALF_LIFE_MS)` avec `HALF_LIFE ≈ 14 jours`
(à tuner). Poids effectif d'un event = `EVENT_WEIGHTS[type] * saturate(value) * recency(now - ts)`.

### 2.3 Profil utilisateur

Deux vecteurs par user, dérivés des events (lecture serveur, **enfin** la boucle fermée) :

- **`categoryAffinity: Map<category, weight>`** (Phase 1, sans embeddings) :
  pour chaque article engagé, récupérer ses `getTopicalCategories` + remonter via
  `interests.service` logic, cumuler `poids_effectif`. Sert de recall (categorymembers
  des top catégories) **et** de feature de ranking. Les mutés = poids négatif.
- **`tasteVector: float[]`** (Phase 2, embeddings) : moyenne pondérée-décroissante
  des embeddings des articles engagés. **Mise à jour en ligne O(1)** (cf. §2.5).

### 2.4 Pipeline en 2 étages (recsys classique)

1. **Candidate generation (recall)** — union dédupliquée de :
   - ANN top-K voisins de `tasteVector` (pgvector, Phase 2) ;
   - `morelike` sur les top-K articles pondérés (Phase 1, remplace le cap brut de 6) ;
   - `categorymembers` des top catégories de `categoryAffinity` ;
   - **`social`** : pages likées/mises en story par les comptes suivis, **quota strict** (§2.6) ;
   - `popular` + `news` (fraîcheur + porte de sortie) ;
   - `random` (sérendipité).
2. **Filtrage** : retirer les pages déjà vues (cf. §3 cooldown), les catégories mutées,
   éventuellement ce qui est déjà en librairie.
3. **Ranking (precision)** : score =
   `w1·cos(taste, art) + w2·categoryAffinity(art) + w3·popularityPrior + w4·freshness
    − w5·seenPenalty − w6·topicOverexposure + explorationNoise`.
4. **Diversité (MMR)** : re-rank Maximal Marginal Relevance sur les embeddings
   (ou sur les catégories en Phase 1) → remplace le `blendDiverse` heuristique,
   garantit une vraie « porte de sortie » sémantiquement distincte.
5. **Exploration** : réserver ≥1 slot/page à un item hors-profil délibéré selon
   `EXPLORE_RATE` (§2.7) — anti-rabbit-hole.
6. **Pagination** : garder le `seed`/curseur déterministe pour la stabilité.

### 2.5 Apprentissage continu

`tasteVector` maintenu en **moyenne exponentielle décroissante**, mis à jour à
chaque arrivée d'events sans recompute complet :

```
elapsed = now - profile.lastUpdateTs
profile.vec = profile.vec * (0.5 ** (elapsed / HALF_LIFE))      // décroît le passé
profile.vec += weight_effectif * articleEmbedding               // ajoute le nouveau
profile.lastUpdateTs = now
```

O(1) par event, borné, pas de job batch obligatoire. Un recompute périodique
(cron) reste possible pour corriger la dérive.

### 2.6 Signal social (pages likées par les comptes suivis) — *petite dose*

Terrain commun avec les gens qu'on suit, **sans** transformer le feed en feed social.
Data déjà en base : `follows (followerId, followingId, status="active")` +
`library_items (userId, articleId, kind="like")` + `stories (userId, articleId)`.

- **Recall `social`** : `SELECT articleId FROM library_items li JOIN follows f
  ON f.followingId = li.userId WHERE f.followerId = :me AND f.status='active'
  AND li.kind IN ('like','save','share')` ∪ pages mises en story par les suivis.
  Compter combien de comptes suivis distincts ont engagé chaque page (**social proof**).
- **Quota strict** : au plus **~1 item / page de 5** (≈10–20 %), et jamais le slot
  principal. Paramètre `SOCIAL_MAX_PER_PAGE = 1`. Objectif explicite du user :
  « proposer des choses en commun, mais **pas beaucoup de pages** ».
- **Filtrage** : exclure ce que le user a déjà vu/engagé (cf. §3), respecter les
  comptes **privés** (déjà géré par `status`/visibilité — ne pas divulguer une
  activité de compte privé au-delà de ses abonnés autorisés).
- **Ranking** : petite feature `socialProof = f(nb d'abonnés distincts ayant liké)`,
  saturée et **plafonnée** pour ne pas dominer le score content-based.
- **Vie privée** : ne **jamais** afficher *qui* a liké dans le feed reco (juste la
  page). L'attribution sociale (« aimé par X ») reste hors scope reco.
- Sans DB / user invité → source `social` vide (dégradation gracieuse).
- **Dose** : « un peu plus proposées », pas plus — le quota `SOCIAL_MAX_PER_PAGE`
  et le plafond de `socialProof` garantissent que ça reste marginal.

### 2.7 Exploration / sérendipité contrôlée (anti-rabbit-hole)

Distinct du MMR de diversité (qui varie **à l'intérieur** du profil). Ici on sort
**volontairement** du profil pour crever la bulle, comme le font TikTok/Instagram
(part d'« exploration » assumée dans le feed).

- **ε-exploration** : avec une probabilité `EXPLORE_RATE` (~15–20 %), **au moins un
  slot par page** est réservé à un item **hors-profil délibéré**, tiré de :
  `news` (actualité) / `popular` (populaire global) / `random` (sérendipité pure),
  **en ignorant** `tasteVector` et `categoryAffinity` (mais **pas** la dé-dup §3 ni les mutés).
- **Placement** : jamais le tout premier slot ; réparti pour offrir une « porte de
  sortie » régulière (reprend l'esprit de `blendDiverse`, mais piloté par un taux
  d'exploration explicite plutôt que par une période fixe).
- **Marquer la provenance** : taguer ces items `source: "explore"` en interne, pour
  (a) ne pas les laisser polluer le profil au même poids, (b) mesurer leur
  engagement → **alimenter le bandit** plus tard (si l'user accroche sur l'explore,
  augmenter son `EXPLORE_RATE` / élargir ses centres d'intérêt).
- **Fraîcheur** : privilégier `news` récent pour que « hors-scope » rime souvent avec
  « actualité », comme demandé.
- Rendre `EXPLORE_RATE` configurable (env / constante) pour tuning.

### 2.8 Signal révocable (suppression prise en compte)

**On garde le journal `interactions` append-only comme source du profil** (meilleur
pour l'entraînement futur : embeddings, bandit, éval offline, replay). La révocation
suit le pattern **event-sourcing** : on ne mute rien, on **append un event compensateur**.

- **Event compensateur `remove`** : supprimer une page (historique / unlike / unsave)
  ⇒ on ajoute au journal un `remove(articleId)`. La dérivation du profil construit un
  **`revokedSet`** (articles ayant un `remove` postérieur à leur dernier signal positif)
  et **filtre** ces articles. Un type d'event + une étape de filtrage — léger, le journal
  reste 100 % append-only.
- **Coût recompute** : toute révocation ⇒ **invalide le profil caché** (`categoryAffinity`
  + `user_taste`) ⇒ recompute **lazy** au prochain build de feed. Pas de recompute bloquant.
- **Non-répétition** : pas de set dédié. Une page supprimée reste dans `seen` (§3) —
  on ne la **purge pas** de `seen` à la suppression → elle reste exclue via le cooldown
  normal. (Effet de bord assumé : au-delà du cooldown elle *peut* re-remonter ; si un
  jour on veut un « jamais » strict, ce sera une exclusion supplémentaire, pas maintenant.)
- **Cohérence client↔serveur** : `removeRead`/`clearRead`/unlike/unsave côté mobile
  émettent l'event `remove` (+ `clearHistory` pour un wipe global) en plus de muter
  l'état local (cf. §4.1).
- **RGPD** : `wipe-data` = cas extrême → purge profil + seen + events.

### 2.9 Blocage thématique (« ne plus me suggérer ce genre »)

Distinct de la suppression d'**une** page (§2.8) : ici on bloque **un type de contenu**
— le « Not interested » d'Instagram/TikTok. Rejette **tout un thème**, pas un article.

- **Base existante** : `mutedInterests` (`LibraryProvider`) + poids `mute` (-4.0) +
  filtre dur des catégories mutées (§4.3). On **formalise** et on **étend**.
- **Action UI** : sur une carte / une page, un geste « ça ne m'intéresse pas » qui
  ouvre le choix du **grain** de blocage (comme les grosses apps) :
  - le(s) **topic(s)** global(aux) de l'article (`classifyTopics` — sport, histoire…) ;
  - et/ou une **catégorie Wikipedia** topicale (`getTopicalCategories`) ;
  - et/ou (Phase 2) le **cluster sémantique** : les pages proches en embedding de
    celle-ci sont down-rankées (« ce genre » au sens vectoriel, pas juste le label).
- **Effet** :
  - **filtre dur** au recall : aucune page portant un topic/catégorie bloqué ne passe ;
  - **contribution négative** au profil (`mute` -4.0) pour éloigner le `tasteVector` ;
  - persister la liste des blocages thématiques serveur (`user_blocked_topics`,
    lignes mutables — c'est un état, pas un signal de reco) + fallback local (invités).
- **Portée** : permanent jusqu'à ce que l'user le retire (réversible dans le profil,
  comme les interests mutés aujourd'hui). Rien à voir avec le cooldown de `seen`.
- **Distinction claire à garder en tête** :
  - `seen` → anti-répétition d'**une page** (auto, cooldown) ;
  - suppression (§2.8) → **une page** cesse d'influencer le profil ;
  - blocage thématique (§2.9) → **tout un genre** exclu + éloigné.

---

## 3. Ne jamais re-proposer la même page (façon Instagram) — SOLUTIONS

Problème avec l'existant : `SeenProvider` est **client-only** (perdu au réinstall,
non cross-device), **capé à 400**, **TTL 3 j** (les pages reviennent après), et
l'`exclude` est un **CSV en query string** (risque de dépasser la limite d'URL).

### Option A — Registre d'impressions serveur (Postgres) — *exact, simple*
Table `impressions (userId, articleId, firstSeenTs, lastSeenTs, count)` (ou dérivée
des events `impression`). Au build du feed : anti-join pour exclure ce qui est dans
la **fenêtre de cooldown**. Cross-device, survit au réinstall (lié au `userId`).
Coût : 1 lecture indexée par build (négligeable jusqu'à ~10⁵ lignes/user), à élaguer
par TTL. **Simple et exact.**

### Option B — Bloom filter / sorted-set Redis par user — *scale*
Membership O(1), empreinte minuscule. Sorted-set Redis `seen:{userId}` scoré par
timestamp → cooldown + éviction faciles. Bloom filter = encore plus compact mais
probabiliste (un faux positif = on saute rarement une page **jamais vue** — acceptable).
Idéal à grande échelle ; dépend de Redis.

### Option C — Rester client mais corriger — *le moins cher*
Passer `exclude` de la query string à un **POST body** (supprime la limite d'URL),
relever le cap, éventuellement Bloom filter client. Mais reste non cross-device et
perdu au réinstall → **insuffisant pour l'objectif « façon Instagram »**.

### ✅ Option D — Hybride (RECOMMANDÉE)
- **Source de vérité serveur** (A avec Postgres, ou B avec Redis si dispo) pour les
  users connectés → cross-device, persistant.
- **`SeenProvider` client** conservé comme **fast-path offline + invités** et pour
  couvrir le **délai de propagation** intra-session (les ids tout juste montrés).
- Impressions enregistrées via le **pipe events existant** (nouveaux types
  `impression` / `cardDwell`).
- **Cooldown + re-surfacing, JAMAIS d'exclusion éternelle** :
  - `cardDwell`/impression → cooldown **court** (ex. 14–30 j) puis ré-éligible avec
    **pénalité décroissante** (`seenPenalty` au ranking, pas exclusion dure).
  - `openFull`/`like`/`save` → cooldown **long** (ex. 90 j+), voire exclusion du
    recall (mais l'article continue de **nourrir le profil**).
  - **Raison critique** : sur un graphe d'intérêts fini, exclure **à vie** tout ce
    qui est vu **affame le feed** (un user de niche épuise son pool). Le cooldown +
    décroissance + le fallback random garantissent un feed infini sans répétition
    perçue.
- Distinguer « carte vue en scrollant » (cooldown court) de « lu/aimé » (long).

**Reco d'implémentation** : commencer **Option A (Postgres)** en Phase 1 (exact,
aucune nouvelle infra — Postgres est déjà là), migrer vers **B (Redis)** si/quand
le volume l'exige. Garder `SeenProvider` en fast-path.

---

## 4. Phase 1 — Quick wins (SANS embeddings)

Livrable : un feed déjà nettement plus personnalisé, la boucle events fermée, la
dé-dup robuste. Chaque point = un commit atomique (conventional commits, EN).

### 4.1 Combler les capteurs manquants (mobile + shared)
- Ajouter les types `impression` et `cardDwell` à `InteractionType`
  (`packages/shared/src/types/interaction.ts`) + commentaires.
- Émettre `cardDwell` depuis le flux : mesurer le temps où une carte est visible
  (viewability FlashList — `onViewableItemsChanged` / `viewabilityConfig`) dans
  `app/(tabs)/index.tsx` et `app/(tabs)/flow.tsx`. Envoyer à la sortie de viewport.
- Émettre `impression` à l'apparition d'une carte (ou dériver de `cardDwell>0`).
- Émettre `scrollDepth` depuis `article/[id].tsx` (il ne l'est jamais aujourd'hui).
- Émettre `share` pour le **partage in-app** (send-page) dans
  `ShareSheetProvider.tsx` / `recordShare` (aujourd'hui muet).
- Émettre un event `story` à la **création de story** (poids 5.0). Côté serveur,
  `StoriesService.create` peut aussi logger directement l'`Interaction` (la table
  `stories` est déjà autoritative — préférer lire la table au build du profil).
- Émettre un event `read` sur `markRead` (aujourd'hui local only).
- **Événements de révocation** (§2.8) : émettre un tombstone sur `removeRead`,
  `clearRead`, unlike, unsave (ex. type `removeSignal` + `articleId`, ou `clearHistory`).
  Ajouter les types correspondants à `InteractionType`.
- **Batcher** `sendEvents` (débounce + flush) pour ne pas spammer sur le `cardDwell`.

### 4.2 Fermer la boucle : profil serveur (catégoriel)
- Nouveau module `reco/` (ou étendre `feed/`) :
  - `ProfileService.getCategoryAffinity(userId, lang)` : lit les `Interaction` du
    user (fenêtre glissante), pondère `EVENT_WEIGHTS × saturate × recency`, agrège
    par catégorie via `WikipediaService.getTopicalCategories` +
    `InterestsService` (réutilise la logique de remontée d'ancêtres). Cache Redis court.
  - `ProfileService.getWeightedSeeds(userId)` : top-K articles pondérés-décroissants
    (remplace le cap brut de 6 seeds côté client).
  - **Sources révocables** (§2.8) : lire `library_items` / `stories` comme vérité
    courante pour like/save/share/story ; filtrer les articles tombstonés
    (`removeSignal`/`clearHistory`) pour les signaux de type journal (read/dwell/…).
    Toute révocation invalide le profil caché → recompute lazy.
- `EVENT_WEIGHTS`, `saturate`, `recency` dans un `reco/scoring.ts` **testé unitairement**.

### 4.3 Recall & ranking Phase 1 (sans vecteurs)
- `FeedService.buildPool` (onglet `forYou`/`discover`) enrichi :
  - recall = `morelike(weightedSeeds)` ∪ `categorymembers(topAffinityCats)` ∪ `popular`/`news` ∪ `random` ;
  - ranking = `categoryAffinity + popularityPrior + freshness − seenPenalty + noise` ;
  - **injection sociale** : ≤ `SOCIAL_MAX_PER_PAGE` item de la source `social` (§2.6) ;
  - **exploration** : ≥1 slot/page hors-profil selon `EXPLORE_RATE` (§2.7) ;
  - diversité = MMR-lite par catégorie (remplace/complète `blendDiverse`) ;
  - mutés = filtre **dur** + poids négatif.
- Le `userId` doit remonter jusqu'au feed : ajouter `userId` en query (ou header)
  à `fetchFeed`/`FeedController` (aujourd'hui seul `sendEvents` l'attache).

### 4.4 Dé-dup serveur (Option A)
- Entité `Impression` (ou vue sur `interactions` filtrée `type IN impression,cardDwell,openFull`).
- `SeenService.filterUnseen(userId, candidates, { cooldownByType })` appliqué au recall.
- Enregistrer les impressions renvoyées (ou laisser le client les logger via events).
- Client : passer `exclude` en POST body **ou** cesser d'envoyer la grosse liste
  (le serveur devient autoritatif ; le client n'envoie que les ids de la session courante).
- Garder `SeenProvider` comme fast-path offline/invité.

### 4.5 Tests
- `reco/scoring.spec.ts` (poids, saturation, décroissance).
- `profile.service.spec.ts` (agrégation catégorielle, mutés négatifs, récence).
- `seen.service.spec.ts` (cooldown par type, re-surfacing).
- `feed.service.spec.ts` étendu (recall multi-source, MMR, mutés exclus).
- `social` recall (quota respecté, comptes privés exclus, dé-dup vs déjà vu).
- exploration (`EXPLORE_RATE` → ≥1 slot hors-profil, jamais slot 0, dé-dup respectée).
- révocation (unlike/removeRead/clearHistory → profil recalculé sans l'élément).

---

## 5. Phase 2 — Embeddings & ranking vectoriel

### 5.1 Infra vecteurs
- Activer **pgvector** (extension Postgres) — Postgres est déjà là.
- Table `article_embeddings (articleId, lang, vec vector(384|768), model, updatedAt)`
  + index ANN (hnsw ou ivfflat). Rester compatible `synchronize: true` (ou introduire
  les **migrations** à ce moment — cf. invariant MVP).

### 5.2 Service d'embeddings (local, pas d'API payante)
- Modèle **multilingue** (14 locales) : `paraphrase-multilingual-MiniLM-L12-v2` ou
  `intfloat/multilingual-e5-small`, servi **localement** via `transformers.js` /
  `onnxruntime-node` (pas d'appel externe payant — cohérent avec l'éthos du projet
  « tourne sans infra externe »). Fallback lexical `morelike` si embedding absent.
- **Lazy** : embed un article au premier hydrate (`getSummary`/`getArticle`),
  input = `title + description + extract`, cache en base. Job de backfill optionnel.

### 5.3 tasteVector + ranking vectoriel
- Table `user_taste (userId, vec, lastUpdateTs)`, mise à jour **en ligne** (§2.5)
  à l'ingestion des events (`EventsService.ingest` → hook profil).
- Recall ANN : top-K voisins de `tasteVector` via pgvector.
- Ranking : ajouter `w1·cos(taste, art)` au score de §2.4.
- Diversité : **MMR** sur les embeddings (vraie distance sémantique).
- Cold start : si `tasteVector` vide → onboarding chips d'intérêts (seeds initiaux)
  + retomber sur popular/news.

### 5.4 Tests
- Embedding service (déterminisme, cache, fallback sans modèle).
- MMR (pertinence vs diversité). Online update (décroissance correcte).

---

## 6. Invariants à NE PAS casser

- **Dégradation gracieuse** : tout doit tourner **sans DB, sans Redis, sans modèle
  d'embedding**. Chaque nouveauté est derrière un capability-check → fallback sur le
  comportement actuel (`morelike` + `popular`). L'API ne doit jamais planter faute d'infra.
- **Contrat partagé** : tout changement de DTO passe par `packages/shared/src/types/`
  (source de vérité API↔app), consommé des deux côtés.
- **i18n** : `SUPPORTED_LOCALES` (mobile) ⇄ `SUPPORTED_LANGS` (API) restent synchro ;
  la reco est **par langue** (le contenu Wikipedia dépend de la locale).
- **A11y** (cf. CLAUDE.md, cible WCAG AAA/AA) : tout nouvel UI (ex. chips d'onboarding)
  respecte rôles, labels, états, contrastes (tokens `packages/shared/src/design/tokens.ts`),
  cibles ≥44×44. Strings a11y en `a11y.*` (au moins `en.json`).
- **CC BY-SA** : lien source Wikipedia toujours visible ; `User-Agent` valide obligatoire.
- **Vie privée** : les events sont pseudonymes (`userId` anonyme temporaire) ; respecter
  `wipe-data`. Ne pas exposer le profil brut côté client.
- **Style** : Prettier 100 colonnes ; **Conventional Commits en anglais** ; commit **et
  push** à chaque user story terminée.
- **Perf** : le feed hydrate 5 items/page — garder le recall borné et caché ; ne pas
  transformer un build de feed en dizaines d'appels Wikimedia synchrones.
- **Migrations** : `synchronize: true` est l'actuel MVP ; si Phase 2 introduit pgvector,
  décider explicitement migrations vs synchronize (ne pas casser le schéma en prod).

---

## 7. Scalabilité & stockage borné (« pro » mais 1 seul serveur)

Reprend les patterns des grosses apps (Instagram/TikTok/FB/Snapchat) **adaptés à un
stockage fini**. Principe directeur : **on ne garde pas l'historique brut à vie — on
garde des états agrégés compacts**, et on borne tout ce qui croît.

- **Ne pas accumuler les events bruts sans fin.** `interactions` est un journal
  append-only qui explose. Stratégie moderne :
  - Fenêtre glissante : ne garder le brut que **N jours** (ex. 90), pruning par cron.
  - **Agréger tôt** dans des états compacts et bornés :
    `user_taste` (1 vecteur/user) et `user_category_affinity` (top-K catégories/user).
    Le profil est la seule chose lue au ranking → le brut devient jetable.
  - Compteurs pré-agrégés (ex. `article_stats(likes, shares, views)`) plutôt que
    `COUNT(*)` sur le journal.
- **Seen / impressions = la table qui grossit le plus vite.** C'est le poste de
  stockage n°1 dans une app de feed. Options bornées :
  - **Bloom filter par user** (Redis bitfield ou colonne `bytea`) : empreinte fixe
    (~quelques Ko/user pour des dizaines de milliers de pages, faux positifs rares
    acceptables). C'est **le** standard des grands feeds.
  - Sinon `impressions` avec **cooldown TTL** + pruning (Option A du §3) — exact mais
    croît ; élaguer agressivement au-delà de la fenêtre de cooldown.
  - Ne stocker qu'un **hash** d'articleId si besoin de compacter.
- **Embeddings compacts** (Phase 2) : modèle **384-dim** (`e5-small`) plutôt que 768 ;
  stocker en `vector(384)`. Si volume d'articles élevé → **quantization**
  (int8 / product quantization) et index **HNSW** (rappel/latence) ou `ivfflat`.
  Les embeddings d'articles sont **partagés entre users** (1 vecteur / article / langue),
  pas par user → coût borné par la taille du corpus consulté, pas par le nб d'users.
- **Cache Redis à TTL** pour les profils dérivés et les pools de recall (déjà le
  pattern de `CacheService`) — recompute à la demande plutôt que tout persister.
- **Coût par requête feed borné** : recall = quelques requêtes indexées + ANN + un
  peu de Wikimedia caché ; **pas** de fan-out non borné. Plafonner chaque source.
- **Chemin de montée en charge** (quand 1 serveur ne suffira plus, à documenter mais
  pas à faire maintenant) : sortir Redis/Postgres du serveur, précalcul offline des
  candidats (batch), file d'events (Kafka-like) — mais **YAGNI** tant qu'on est mono-serveur.
- **RGPD / `wipe-data`** : profils agrégés et seen doivent être purgés avec le compte.

Objectif : une archi qui **ressemble** aux grands feeds (2-stage recall→rank, profil
vectoriel, dé-dup Bloom, social proof dosé) mais dont **l'empreinte disque est fonction
d'états agrégés bornés**, pas d'un journal infini.

---

## 8. Ordre d'attaque conseillé

1. §4.1 capteurs (shared + mobile) → commit.
2. §4.2 scoring + ProfileService (catégoriel) + tests → commit.
3. §4.4 dé-dup serveur (Option A) + cooldown → commit.
4. §4.3 recall/ranking Phase 1 + MMR-lite + `userId` au feed → commit.
5. Valider en local (`pnpm api` + `pnpm mobile`), tuner les poids.
6. Phase 2 : pgvector → embedding service → tasteVector → ANN/MMR → tests.

Commence par me confirmer le choix **Option A vs B** pour la dé-dup et les **valeurs
de poids** avant de coder le ranking, puis déroule.
```
