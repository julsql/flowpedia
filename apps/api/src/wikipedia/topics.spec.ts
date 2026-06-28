import { classifyTopics, TOPIC_IDS } from "./topics";

describe("classifyTopics", () => {
  it("returns [] when nothing matches", () => {
    expect(classifyTopics("")).toEqual([]);
    expect(classifyTopics("Lorem ipsum dolor sit amet")).toEqual([]);
  });

  it("classifies a footballer as sport", () => {
    expect(classifyTopics("Zinédine Zidane, footballeur français")).toContain("sport");
  });

  it("classifies a film as cinema", () => {
    expect(classifyTopics("Inception, film de science-fiction")).toContain("cinema");
  });

  it("is case- and accent-insensitive", () => {
    expect(classifyTopics("HISTOIRE de France")).toContain("history");
    expect(classifyTopics("Geographie du Bresil")).toContain("geography");
  });

  it("prefers the more specific videogames over technology", () => {
    expect(classifyTopics("The Legend of Zelda, jeu vidéo Nintendo")).toContain("videogames");
  });

  it("returns at most two topics", () => {
    const result = classifyTopics(
      "film politique sur la guerre, musique et science, footballeur",
    );
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("only ever returns known topic ids", () => {
    const result = classifyTopics("peintre et écrivain, roman et peinture");
    for (const id of result) {
      expect(TOPIC_IDS).toContain(id);
    }
  });

  it("does not match short keywords inside unrelated words", () => {
    // "roi" (king) should not fire on "miroir" / "introduction"
    expect(classifyTopics("introduction au miroir")).not.toContain("history");
  });
});
