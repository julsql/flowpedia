import {
  EVENT_WEIGHTS,
  RECENCY_HALF_LIFE_MS,
  baseWeight,
  recency,
  saturateTime,
  signalScore,
} from "./scoring";

describe("recency", () => {
  it("is 1 at age 0 and 0.5 at one half-life", () => {
    expect(recency(0)).toBe(1);
    expect(recency(RECENCY_HALF_LIFE_MS)).toBeCloseTo(0.5, 5);
    expect(recency(2 * RECENCY_HALF_LIFE_MS)).toBeCloseTo(0.25, 5);
  });

  it("never goes negative for a future timestamp", () => {
    expect(recency(-1000)).toBe(1);
  });
});

describe("saturateTime", () => {
  it("maps 0 to 0 and grows toward 1", () => {
    expect(saturateTime(0, 3000)).toBe(0);
    expect(saturateTime(3000, 3000)).toBeCloseTo(1 - Math.exp(-1), 5);
    expect(saturateTime(1e9, 3000)).toBeCloseTo(1, 5);
  });
});

describe("baseWeight", () => {
  it("ranks story = share > save > like > read (the plan's ordering)", () => {
    const story = baseWeight("story");
    const share = baseWeight("share");
    const save = baseWeight("save");
    const like = baseWeight("like");
    const read = baseWeight("read");
    expect(story).toBe(share);
    expect(share).toBeGreaterThan(save);
    expect(save).toBeGreaterThan(like);
    expect(like).toBeGreaterThan(read);
  });

  it("scales dwell by a saturating factor of the elapsed time", () => {
    const short = baseWeight("dwell", 1_000);
    const long = baseWeight("dwell", 60_000);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThanOrEqual(EVENT_WEIGHTS.dwell!);
  });

  it("scales scrollDepth linearly and clamps to [0,1]", () => {
    expect(baseWeight("scrollDepth", 0.5)).toBeCloseTo(EVENT_WEIGHTS.scrollDepth! * 0.5, 5);
    expect(baseWeight("scrollDepth", 2)).toBeCloseTo(EVENT_WEIGHTS.scrollDepth!, 5);
  });

  it("treats a fast cardDwell as a negative skip signal", () => {
    expect(baseWeight("cardDwell", 500)).toBeLessThan(0);
    expect(baseWeight("cardDwell", 8_000)).toBeGreaterThan(0);
  });

  it("makes mute strongly negative", () => {
    expect(baseWeight("mute")).toBeLessThan(0);
    expect(Math.abs(baseWeight("mute"))).toBeGreaterThan(baseWeight("like"));
  });

  it("returns 0 for revocation/non-taste events", () => {
    expect(baseWeight("remove")).toBe(0);
    expect(baseWeight("clearHistory")).toBe(0);
  });
});

describe("signalScore", () => {
  const now = 1_000_000_000_000;

  it("decays an old like below a fresh one of the same type", () => {
    const fresh = signalScore({ type: "like", ts: now }, now);
    const old = signalScore({ type: "like", ts: now - RECENCY_HALF_LIFE_MS }, now);
    expect(old).toBeCloseTo(fresh / 2, 5);
  });

  it("is 0 for events that don't feed the profile", () => {
    expect(signalScore({ type: "remove", ts: now }, now)).toBe(0);
  });
});
