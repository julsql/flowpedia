import { collectLinks, parseArticleSections } from "./parse-article";

const HTML = `
<html><body>
  <section data-mw-section-id="0">
    <table class="infobox"><tr><td><p>Ignored infobox text</p></td></tr></table>
    <p>The <a rel="mw:WikiLink" href="./Octopus" title="Octopus">octopus</a> is a
       <a rel="mw:WikiLink" href="./Mollusc">mollusc</a><sup class="mw-ref"><a href="#cite_note-1">[1]</a></sup>.
       See <a rel="mw:ExtLink" href="https://example.com">this site</a> and
       <a rel="mw:WikiLink" href="./File:Octopus.jpg">a picture</a>.</p>
  </section>
  <section data-mw-section-id="1">
    <h2 id="Habitat">Habitat</h2>
    <p>They live in the <a rel="mw:WikiLink" href="./Ocean">ocean</a>.</p>
  </section>
  <section data-mw-section-id="2">
    <h2 id="References">References</h2>
    <ol class="references"><li>Some citation</li></ol>
  </section>
</body></html>
`;

describe("parseArticleSections", () => {
  const sections = parseArticleSections(HTML, "Summary");

  it("uses the lead title for the intro and keeps real section headings", () => {
    expect(sections.map((s) => s.title)).toEqual(["Summary", "Habitat"]);
  });

  it("drops infobox paragraphs and reference-only sections", () => {
    const allText = sections
      .flatMap((s) => s.paragraphs)
      .flatMap((p) => p.runs.map((r) => r.text))
      .join(" ");
    expect(allText).not.toContain("Ignored infobox");
    expect(sections.find((s) => s.title === "References")).toBeUndefined();
  });

  it("keeps internal wiki links as link runs", () => {
    const runs = sections[0].paragraphs[0].runs;
    const octopus = runs.find((r) => r.text === "octopus");
    const mollusc = runs.find((r) => r.text === "mollusc");
    expect(octopus?.linkTargetId).toBe("Octopus");
    expect(mollusc?.linkTargetId).toBe("Mollusc");
  });

  it("renders external links and File: links as plain text (no target)", () => {
    const runs = sections[0].paragraphs[0].runs;
    expect(runs.every((r) => r.linkTargetId !== undefined ? !r.linkTargetId.includes(":") : true)).toBe(
      true,
    );
    const joined = runs.map((r) => r.text).join("");
    expect(joined).toContain("this site");
    expect(joined).toContain("a picture");
  });

  it("strips citation markers", () => {
    const joined = sections[0].paragraphs[0].runs.map((r) => r.text).join("");
    expect(joined).not.toContain("[1]");
  });

  it("collects distinct internal links", () => {
    const links = collectLinks(sections);
    expect(links.map((l) => l.targetId)).toEqual(["Octopus", "Mollusc", "Ocean"]);
  });
});

const LIST_HTML = `
<html><body>
  <section data-mw-section-id="0"><p>Intro.</p></section>
  <section data-mw-section-id="1">
    <h2>Filmographie</h2>
    <ul>
      <li>2019 : <a rel="mw:WikiLink" href="./Film_A">Film A</a></li>
      <li>2021 : <a rel="mw:WikiLink" href="./Film_B">Film B</a></li>
    </ul>
  </section>
  <section data-mw-section-id="2">
    <h2>Liens externes</h2>
    <ul><li><a rel="mw:ExtLink" href="https://imdb.com">IMDb</a></li></ul>
  </section>
  <section data-mw-section-id="3">
    <h2>Notes et références</h2>
    <ol class="references"><li>cite</li></ol>
  </section>
</body></html>
`;

describe("parseArticleSections — lists & excluded sections", () => {
  const sections = parseArticleSections(LIST_HTML, "Résumé");

  it("keeps list-based sections like a filmography (as bulleted paragraphs)", () => {
    const filmo = sections.find((s) => s.title === "Filmographie");
    expect(filmo).toBeDefined();
    const text = filmo!.paragraphs.flatMap((p) => p.runs.map((r) => r.text)).join("");
    expect(text).toContain("Film A");
    expect(text).toContain("Film B");
    expect(text).toContain("•");
  });

  it("drops external-links and notes/references sections", () => {
    expect(sections.find((s) => s.title === "Liens externes")).toBeUndefined();
    expect(sections.find((s) => s.title === "Notes et références")).toBeUndefined();
  });
});
