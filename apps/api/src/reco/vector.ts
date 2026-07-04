/**
 * Vector primitives for the embedding-based ranking (Phase 2, §5). Pure and
 * unit-tested: cosine similarity, unit-normalization, a weighted mean (the taste
 * vector) and an MMR re-rank (relevance vs diversity).
 */

export type Vec = number[];

/** Dot product (assumes equal length). */
export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) {
    s += a[i] * b[i];
  }
  return s;
}

export function norm(a: Vec): number {
  return Math.sqrt(dot(a, a));
}

/** Cosine similarity in [-1,1]; 0 when either vector is zero or mismatched. */
export function cosine(a: Vec, b: Vec): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }
  const denom = norm(a) * norm(b);
  return denom === 0 ? 0 : dot(a, b) / denom;
}

/** Unit vector (unchanged direction); returns the input when it's the zero vector. */
export function normalize(a: Vec): Vec {
  const n = norm(a);
  return n === 0 ? a : a.map((x) => x / n);
}

/**
 * Weighted mean of vectors (the taste vector = weighted average of engaged
 * articles' embeddings). Ignores non-positive weights; returns [] when nothing
 * contributes. The result is normalized so cosine comparisons are stable.
 */
export function weightedMean(vectors: Vec[], weights: number[]): Vec {
  const dim = vectors.find((v) => v.length)?.length ?? 0;
  if (!dim) {
    return [];
  }
  const acc = new Array(dim).fill(0);
  let total = 0;
  for (let i = 0; i < vectors.length; i += 1) {
    const w = weights[i];
    if (!(w > 0) || vectors[i].length !== dim) {
      continue;
    }
    for (let d = 0; d < dim; d += 1) {
      acc[d] += w * vectors[i][d];
    }
    total += w;
  }
  if (total === 0) {
    return [];
  }
  return normalize(acc.map((x) => x / total));
}

/**
 * Maximal Marginal Relevance re-rank: greedily pick the item maximizing
 * `lambda·cos(query,item) − (1−lambda)·max cos(item, alreadyPicked)`, balancing
 * relevance to the taste vector against diversity. Returns the reordered items.
 */
export function mmrRerank<T extends { vec: Vec }>(items: T[], query: Vec, lambda = 0.7): T[] {
  if (items.length <= 2 || query.length === 0) {
    return items;
  }
  const remaining = [...items];
  const picked: T[] = [];
  while (remaining.length) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const relevance = cosine(query, remaining[i].vec);
      let redundancy = 0;
      for (const p of picked) {
        redundancy = Math.max(redundancy, cosine(remaining[i].vec, p.vec));
      }
      const score = lambda * relevance - (1 - lambda) * redundancy;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    picked.push(remaining.splice(bestIdx, 1)[0]);
  }
  return picked;
}
