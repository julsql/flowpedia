import { collectLinks, parseArticleSections, parseInfobox } from "./parse-article";

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

describe("parseArticleSections — inline annotations", () => {
  const html = `
    <html><body><section data-mw-section-id="0">
      <p>Paris <span class="ext-phonos" typeof="mw:Extension/phonos"><a class="oo-ui-buttonElement-button"><small>Écouter</small></a></span><sup class="ext-phonos-attribution noexcerpt navigation-not-searchable"><a href="/x">ⓘ</a></sup> est la capitale<sup class="mw-ref"><a href="#cite">[3]</a></sup> de la France.</p>
    </section></body></html>
  `;
  const text = parseArticleSections(html, "Résumé")[0]
    .paragraphs.flatMap((p) => p.runs.map((r) => r.text))
    .join("");

  it("removes pronunciation widgets, the ⓘ marker and citations", () => {
    expect(text).not.toContain("Écouter");
    expect(text).not.toContain("ⓘ");
    expect(text).not.toContain("[3]");
    expect(text).toContain("Paris");
    expect(text).toContain("est la capitale");
    expect(text).toContain("de la France");
  });

  it("keeps ordinal superscripts (1er, 2e)", () => {
    const html = `<html><body><section data-mw-section-id="0"><p>Le 1<sup>er</sup> et le 2<sup>e</sup> jour<sup class="mw-ref"><a href="#c">[1]</a></sup>.</p></section></body></html>`;
    const t = parseArticleSections(html, "Résumé")[0]
      .paragraphs.flatMap((p) => p.runs.map((r) => r.text))
      .join("");
    expect(t).toContain("1er");
    expect(t).toContain("2e");
    expect(t).not.toContain("[1]");
  });

  it("drops the chronologie navigation box", () => {
    const html = `<html><body><section data-mw-section-id="0"><div class="chronologie boite-grise"><p>1942 — 1943 — 1944</p></div><p>Vrai contenu.</p></section></body></html>`;
    const t = parseArticleSections(html, "Résumé")[0]
      .paragraphs.flatMap((p) => p.runs.map((r) => r.text))
      .join(" ");
    expect(t).not.toContain("1942 — 1943");
    expect(t).toContain("Vrai contenu");
  });

  it("captures {{Article détaillé}} loupe links so the section stays visible", () => {
    const html = `<html><body>
      <section data-mw-section-id="0"><p>Intro.</p></section>
      <section data-mw-section-id="1"><h2>Naissances</h2>
        <div class="bandeau-cell loupe">Article détaillé : <a rel="mw:WikiLink" href="./Naissances_en_1950">Naissances en 1950</a>.</div>
      </section>
    </body></html>`;
    const sections = parseArticleSections(html, "Résumé");
    const naissances = sections.find((s) => s.title === "Naissances");
    expect(naissances).toBeDefined();
    expect(naissances?.mainLinks).toEqual([
      { label: "Naissances en 1950", targetId: "Naissances_en_1950" },
    ]);
  });
});

const INFOBOX_HTML = `
<html><body>
  <table class="infobox">
    <tr><th colspan="2">Marie Curie</th></tr>
    <tr><td colspan="2"><img src="//upload.wikimedia.org/curie.jpg" width="220" height="280"/></td></tr>
    <tr><th>Naissance</th><td>7 novembre 1867<sup class="mw-ref"><a href="#x">[1]</a></sup></td></tr>
    <tr><th>Nationalité</th><td>Polonaise</td></tr>
  </table>
  <section data-mw-section-id="0"><p>Intro.</p></section>
  <section data-mw-section-id="1">
    <h2>Carrière</h2>
    <p>Texte.</p>
    <figure typeof="mw:Image/Thumb">
      <img src="//upload.wikimedia.org/lab.jpg" width="300" height="200"/>
      <figcaption>Au laboratoire</figcaption>
    </figure>
  </section>
</body></html>
`;

describe("parseInfobox", () => {
  const box = parseInfobox(INFOBOX_HTML);

  it("extracts the lead image as https with its size", () => {
    expect(box?.image).toBe("https://upload.wikimedia.org/curie.jpg");
    expect(box?.imageWidth).toBe(220);
    expect(box?.imageHeight).toBe(280);
  });

  it("extracts label/value rows and strips citation markers", () => {
    expect(box?.rows).toEqual([
      { label: "Naissance", value: "7 novembre 1867" },
      { label: "Nationalité", value: "Polonaise" },
    ]);
  });
});

const OFFICES_HTML = `
<html><body>
  <table class="infobox">
    <tr><th colspan="2">Charles de Gaulle</th></tr>
    <tr><td colspan="2"><img src="//upload.wikimedia.org/cdg.jpg" width="200" height="250"/></td></tr>
    <tr><th colspan="2">Président de la République française</th></tr>
    <tr><th>Élection</th><td>21 décembre 1958</td></tr>
    <tr><th>Réélection</th><td>19 décembre 1965</td></tr>
    <tr><th colspan="2">Président du Conseil</th></tr>
    <tr><th>Investiture</th><td>1 juin 1958</td></tr>
  </table>
</body></html>
`;

describe("parseInfobox — office headings", () => {
  const box = parseInfobox(OFFICES_HTML);

  it("keeps office titles as heading rows (skipping the page-title heading)", () => {
    expect(box?.rows).toEqual([
      { value: "Président de la République française", heading: true },
      { label: "Élection", value: "21 décembre 1958" },
      { label: "Réélection", value: "19 décembre 1965" },
      { value: "Président du Conseil", heading: true },
      { label: "Investiture", value: "1 juin 1958" },
    ]);
  });
});

const PERSON_HTML = `
<html><body>
  <table class="infobox">
    <tr><th colspan="2">Charles de Gaulle</th></tr>
    <tr><td colspan="2"><img src="//upload.wikimedia.org/cdg.jpg" width="200" height="250"/></td></tr>
    <tr><th colspan="2">Président de la République française</th></tr>
    <tr><th>Élection</th><td>21 décembre 1958</td></tr>
    <tr><th colspan="2">Biographie</th></tr>
    <tr><th>Nom de naissance</th><td>Charles André Joseph Marie de Gaulle</td></tr>
    <tr><th>Naissance</th><td>22 novembre 1890</td></tr>
    <tr><th>Décès</th><td>9 novembre 1970</td></tr>
    <tr><th>Nationalité</th><td>Française</td></tr>
  </table>
</body></html>
`;

describe("parseInfobox — person keeps only biography facts", () => {
  const box = parseInfobox(PERSON_HTML);

  it("drops the function blocks and keeps the biography facts", () => {
    expect(box?.rows).toEqual([
      { label: "Nom de naissance", value: "Charles André Joseph Marie de Gaulle" },
      { label: "Naissance", value: "22 novembre 1890" },
      { label: "Décès", value: "9 novembre 1970" },
      { label: "Nationalité", value: "Française" },
    ]);
  });
});

describe("parseArticleSections — figures", () => {
  it("attaches section figures (https url + caption), not in the lead", () => {
    const sections = parseArticleSections(INFOBOX_HTML, "Résumé");
    const career = sections.find((s) => s.title === "Carrière");
    expect(career?.images?.[0]).toEqual({
      url: "https://upload.wikimedia.org/lab.jpg",
      caption: "Au laboratoire",
      width: 300,
      height: 200,
    });
    expect(sections[0].images).toBeUndefined();
  });
});
