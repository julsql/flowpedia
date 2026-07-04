import { cosine, mmrRerank, normalize, weightedMean } from "./vector";

describe("cosine", () => {
  it("is 1 for identical direction, 0 for orthogonal, -1 for opposite", () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1, 6);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it("is 0 for a zero or mismatched vector", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(cosine([1, 2, 3], [1, 2])).toBe(0);
  });
});

describe("normalize", () => {
  it("returns a unit vector, leaving zero vectors untouched", () => {
    const u = normalize([3, 4]);
    expect(Math.hypot(u[0], u[1])).toBeCloseTo(1, 6);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
});

describe("weightedMean", () => {
  it("leans toward the heavier-weighted vector", () => {
    const m = weightedMean([[1, 0], [0, 1]], [3, 1]);
    // Heavier weight on the x-axis → closer to [1,0].
    expect(cosine(m, [1, 0])).toBeGreaterThan(cosine(m, [0, 1]));
  });

  it("ignores non-positive weights and returns [] when nothing contributes", () => {
    expect(weightedMean([[1, 0]], [0])).toEqual([]);
    expect(weightedMean([], [])).toEqual([]);
  });
});

describe("mmrRerank", () => {
  it("promotes a diverse item over a near-duplicate of an already-picked one", () => {
    const query = [1, 0];
    const items = [
      { id: "a", vec: [1, 0] }, // most relevant
      { id: "b", vec: [0.99, 0.01] }, // near-duplicate of a
      { id: "c", vec: [0.7, 0.7] }, // relevant but diverse
    ];
    const order = mmrRerank(items, query, 0.3).map((x) => x.id);
    expect(order[0]).toBe("a");
    expect(order[1]).toBe("c"); // diversity beats the near-duplicate b
  });

  it("returns short lists or an empty query unchanged", () => {
    const items = [{ id: "a", vec: [1] }, { id: "b", vec: [0] }];
    expect(mmrRerank(items, [1], 0.7)).toBe(items);
    const three = [{ id: "a", vec: [1] }, { id: "b", vec: [1] }, { id: "c", vec: [1] }];
    expect(mmrRerank(three, [], 0.7)).toBe(three);
  });
});
