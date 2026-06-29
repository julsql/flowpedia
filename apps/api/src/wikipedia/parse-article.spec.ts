import {
  parseAncestry,
  collectLinks,
  isScaffoldImage,
  parseArticleSections,
  parseCharts,
  parseInfobox,
  parseRelatedLinks,
} from "./parse-article";

describe("parseCharts", () => {
  // The legend list lives *inside* the caption on real pages — its text must not
  // leak into the chart title.
  const html = `
    <html><body>
      <div class="thumb"><div class="thumbinner">
        <img src="//upload.wikimedia.org/wikipedia/commons/thumb/1/18/Circle_frame.svg/250px-Circle_frame.svg.png" width="200"/>
        <div class="thumbcaption">Religions en Norvège (2019)<style>.x{color:red}</style>
          <ul>
            <li><span class="legende" style="background:DodgerBlue"></span><a rel="mw:WikiLink" href="./Luthéranisme">Luthéranisme</a> (68,7 %)</li>
            <li><span class="legende" style="background:#7D007D"></span><a rel="mw:WikiLink" href="./Catholicisme">Catholicisme</a> (3,08 %)</li>
          </ul>
        </div>
      </div></div>
    </body></html>
  `;
  const charts = parseCharts(html);

  it("reconstructs the pie slices (label, value, color)", () => {
    expect(charts).toHaveLength(1);
    expect(charts[0].slices).toEqual([
      { label: "Luthéranisme", value: 68.7, color: "DodgerBlue" },
      { label: "Catholicisme", value: 3.08, color: "#7D007D" },
    ]);
  });

  it("keeps the title clean (no legend dump)", () => {
    expect(charts[0].title).toBe("Religions en Norvège (2019)");
  });
});

describe("parseRelatedLinks", () => {
  const html = `
    <html><body>
      <section data-mw-section-id="0"><p>Intro.</p></section>
      <section><h2>Articles connexes</h2>
        <ul>
          <li><a rel="mw:WikiLink" href="./Christianisme_en_Norvège">Christianisme en Norvège</a></li>
          <li><a rel="mw:WikiLink" href="./Islam_en_Norvège">Islam en Norvège</a></li>
        </ul>
      </section>
      <section><h2>Histoire</h2>
        <ul><li><a rel="mw:WikiLink" href="./Autre">Autre</a></li></ul>
      </section>
    </body></html>
  `;

  it("collects only the related-section links", () => {
    expect(parseRelatedLinks(html).map((l) => l.targetId)).toEqual([
      "Christianisme_en_Norvège",
      "Islam_en_Norvège",
    ]);
  });

  it("hides the 'Articles connexes' section from the body", () => {
    const titles = parseArticleSections(html, "Résumé").map((s) => s.title);
    expect(titles).not.toContain("Articles connexes");
    expect(titles).toContain("Histoire");
  });
});

describe("isScaffoldImage", () => {
  it("flags the empty pie-chart frame but keeps real images", () => {
    expect(
      isScaffoldImage(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Circle_frame.svg/250px-Circle_frame.svg.png",
      ),
    ).toBe(true);
    expect(isScaffoldImage("https://upload.wikimedia.org/.../60px-Flag_of_Norway.svg.png")).toBe(
      false,
    );
    expect(isScaffoldImage(undefined)).toBe(false);
  });
});

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

describe("parseArticleSections — long content tables", () => {
  // A month-of-deaths page is a single wikitable with ~200 rows; keep them all
  // (the old 60-row cap stopped halfway through the month).
  const rows = Array.from(
    { length: 200 },
    (_, i) => `<tr><td>${i + 1} juin</td><td>Person ${i + 1}</td></tr>`,
  ).join("");
  const html = `<html><body><section data-mw-section-id="0"><table class="wikitable"><tr><th>Date</th><th>Nom</th></tr>${rows}</table></section></body></html>`;
  const sections = parseArticleSections(html, "Décès en juin 2026");

  it("keeps the whole month, not just the first rows", () => {
    const table = sections.flatMap((s) => s.tables ?? [])[0];
    expect(table).toBeDefined();
    expect(table!.headers).toEqual(["Date", "Nom"]);
    expect(table!.rows.length).toBe(200);
    const lastCell = table!.rows[199][1].runs.map((run) => run.text).join("");
    expect(lastCell).toBe("Person 200");
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

  it("keeps a Category: link in prose clickable (opened on Wikipedia)", () => {
    const html = `<html><body><section data-mw-section-id="0"><p>Voir <a rel="mw:WikiLink" href="./Catégorie:Décès_en_2026">Catégorie:Décès en 2026</a> et <a rel="mw:WikiLink" href="./File:X.jpg">une image</a>.</p></section></body></html>`;
    const runs = parseArticleSections(html, "Résumé")[0].paragraphs[0].runs;
    const cat = runs.find((r) => r.linkTargetId === "Catégorie:Décès_en_2026");
    expect(cat?.text).toBe("Catégorie:Décès en 2026");
    // The File: (media) link stays plain text.
    expect(runs.some((r) => r.linkTargetId?.startsWith("File:"))).toBe(false);
  });

  it("captures link lists inside <pre> (sigles index pages) as link runs", () => {
    const html = `<html><body><section data-mw-section-id="1"><h2>A</h2><pre><span class="page_h"><a rel="mw:WikiLink" href="./A10">A10</a></span> <a rel="mw:WikiLink" href="./A11">A11</a> <a rel="mw:WikiLink" href="./A12">A12</a></pre></section></body></html>`;
    const sections = parseArticleSections(html, "Résumé");
    const a = sections.find((s) => s.title === "A");
    const links = a?.paragraphs.flatMap((p) => p.runs.filter((r) => r.linkTargetId)) ?? [];
    expect(links.map((l) => l.linkTargetId)).toEqual(["A10", "A11", "A12"]);
  });

  it("keeps a {{Catégorie détaillée}} link (namespaced) so the section shows", () => {
    const html = `<html><body><section data-mw-section-id="1"><h2>Fondations</h2><div class="loupe">Voir la catégorie : <a rel="mw:WikiLink" href="./Catégorie:Fondation_en_1950">Fondation en 1950</a>.</div></section></body></html>`;
    const sections = parseArticleSections(html, "Résumé");
    const f = sections.find((s) => s.title === "Fondations");
    expect(f?.mainLinks).toEqual([
      { label: "Fondation en 1950", targetId: "Catégorie:Fondation_en_1950" },
    ]);
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

describe("parseInfobox — detection across flavours", () => {
  it("detects a taxobox (species classification)", () => {
    const html = `<html><body><table class="taxobox_classification"><tr><th>Règne</th><td>Animalia</td></tr><tr><th>Classe</th><td>Mammalia</td></tr></table></body></html>`;
    expect(parseInfobox(html)?.rows).toEqual([
      { label: "Règne", value: "Animalia" },
      { label: "Classe", value: "Mammalia" },
    ]);
  });

  it("detects a bare 'Données clés' table (film infobox)", () => {
    const html = `<html><body><table><caption class="hidden">Données clés</caption><tr><th>Réalisation</th><td>Christopher Nolan</td></tr><tr><th>Durée</th><td>148 minutes</td></tr></table></body></html>`;
    expect(parseInfobox(html)?.rows).toEqual([
      { label: "Réalisation", value: "Christopher Nolan" },
      { label: "Durée", value: "148 minutes" },
    ]);
  });

  it("ignores large content wikitables", () => {
    const html = `<html><body><table class="wikitable"><tr><th>Paris</th><td>13000000</td></tr><tr><th>Lyon</th><td>2000000</td></tr><tr><th>Nice</th><td>1000000</td></tr></table></body></html>`;
    expect(parseInfobox(html)).toBeUndefined();
  });
});

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

// Modern French "Infobox V3": a <div> whose data lives in nested sub-tables,
// one per theme (symbols, a history timeline, geography/demographics).
const V3_HTML = `
<html><body>
  <div class="infobox_v3 infobox infobox--frwiki">
    <table><tr><td><img src="//upload.wikimedia.org/flag.png" width="110" height="73"/></td></tr></table>
    <table>
      <tr><th>Devise</th><td>Liberté, Égalité, Fraternité</td></tr>
      <tr><th>Hymne</th><td>La Marseillaise</td></tr>
    </table>
    <table>
      <tr><th>Royaume des Francs</th><td>481-843</td></tr>
      <tr><th>Royaume de France</th><td>987-1792</td></tr>
      <tr><th>Première République</th><td>1792-1804</td></tr>
      <tr><th>Cinquième République</th><td>1958-</td></tr>
    </table>
    <table>
      <tr><th>Capitale</th><td>Paris</td></tr>
      <tr><th>Superficie totale</th><td>672 051 km2</td></tr>
      <tr><th>Population totale</th><td>69 082 000 hab.</td></tr>
      <tr><th>Densité</th><td>107 hab./km2</td></tr>
    </table>
  </div>
</body></html>
`;

describe("parseInfobox — multi-theme (Infobox V3 div with sub-tables)", () => {
  const box = parseInfobox(V3_HTML);
  const labels = (box?.rows ?? []).filter((r) => !r.heading).map((r) => r.label);

  it("uses the lead div infobox image", () => {
    expect(box?.image).toBe("https://upload.wikimedia.org/flag.png");
    expect(box?.imageWidth).toBe(110);
  });

  it("samples facts from every theme so geography/demographics surface", () => {
    expect(labels).toContain("Capitale");
    expect(labels).toContain("Superficie totale");
    expect(labels).toContain("Population totale");
  });

  it("drops the regime/history chronology block (year ranges)", () => {
    expect(labels).not.toContain("Royaume des Francs");
    expect(labels).not.toContain("Cinquième République");
  });

  it("caps facts per theme (the demographics block keeps 3 of 4)", () => {
    const demo = ["Capitale", "Superficie totale", "Population totale", "Densité"].filter((l) =>
      labels.includes(l),
    );
    expect(demo.length).toBe(3);
  });
});

const TABLE_HTML = `
<html><body>
  <section data-mw-section-id="1">
    <h2>Janvier</h2>
    <table class="wikitable sortable">
      <tr><th>Date</th><th>Nom</th><th>Activités</th><th>Âge</th><th>Source</th></tr>
      <tr>
        <td rowspan="2">31 janvier</td>
        <td><a rel="mw:WikiLink" href="./Nataša_Bokal">Nataša Bokal</a></td>
        <td>Skieuse slovène.</td>
        <td>58</td>
        <td><a rel="mw:ExtLink" href="https://x">(en)</a></td>
      </tr>
      <tr>
        <td><a rel="mw:WikiLink" href="./Michel_Cartaud">Michel Cartaud</a></td>
        <td>Homme politique.</td>
        <td>78</td>
        <td></td>
      </tr>
    </table>
  </section>
</body></html>
`;

describe("parseArticleSections — top-level headings with only sub-sections", () => {
  const html = `
    <html><body>
      <section data-mw-section-id="0"><p>Intro.</p></section>
      <section><h2>Biographie</h2>
        <section><h3>Origines</h3><p>Né à Roubaix.</p></section>
        <section><h3>Formation</h3><p>Polytechnique.</p></section>
      </section>
      <section><h2>Carrière</h2>
        <section><h3>Débuts</h3><p>Promoteur.</p></section>
      </section>
    </body></html>
  `;
  const sections = parseArticleSections(html, "Résumé");

  it("keeps an empty parent h2 (whose text is all in sub-sections) navigable", () => {
    const tops = sections.filter((s) => s.level <= 2).map((s) => s.title);
    expect(tops).toEqual(["Résumé", "Biographie", "Carrière"]);
  });

  it("still emits the sub-sections with their content", () => {
    expect(sections.find((s) => s.title === "Origines")?.paragraphs[0].runs[0].text).toContain(
      "Roubaix",
    );
  });
});

describe("parseArticleSections — content tables", () => {
  const sections = parseArticleSections(TABLE_HTML, "Résumé");
  const table = sections.find((s) => s.title === "Janvier")?.tables?.[0];

  it("parses the wikitable and drops the Source (references) column", () => {
    expect(table?.headers).toEqual(["Date", "Nom", "Activités", "Âge"]);
  });

  it("resolves rowspans so the date carries to the next row", () => {
    const dates = table?.rows.map((row) => row[0].runs.map((r) => r.text).join(""));
    expect(dates).toEqual(["31 janvier", "31 janvier"]);
  });

  it("keeps internal links inside cells tappable", () => {
    const nameCell = table?.rows[0][1];
    expect(nameCell?.runs[0]).toEqual({ text: "Nataša Bokal", linkTargetId: "Nataša_Bokal" });
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

describe("parseArticleSections — bibliography section", () => {
  it("drops a Bibliographie section (sources, not prose)", () => {
    const html = `<html><body>
      <section data-mw-section-id="0"><p>Contenu de l'article.</p></section>
      <section data-mw-section-id="1"><h2>Bibliographie</h2><ul><li>Un livre, 1999.</li></ul></section>
    </body></html>`;
    const titles = parseArticleSections(html, "Résumé").map((s) => s.title);
    expect(titles).not.toContain("Bibliographie");
  });

  it("drops 'Further reading' / 'Literatur' too", () => {
    const html = `<html><body>
      <section data-mw-section-id="0"><p>Body.</p></section>
      <section data-mw-section-id="1"><h2>Further reading</h2><p>A book.</p></section>
      <section data-mw-section-id="2"><h2>Literatur</h2><p>Ein Buch.</p></section>
    </body></html>`;
    const titles = parseArticleSections(html, "Summary").map((s) => s.title);
    expect(titles).not.toContain("Further reading");
    expect(titles).not.toContain("Literatur");
  });
});

describe("parseArticleSections — editorial markers", () => {
  it("strips [réf. souhaitée] / [citation needed] / [Quand ?] from prose", () => {
    const html = `<html><body><section data-mw-section-id="0"><p>Le site est ancien[réf. souhaitée] et daté[citation needed] de l'époque[Quand ?].</p></section></body></html>`;
    const text = parseArticleSections(html, "Résumé")[0]
      .paragraphs.flatMap((p) => p.runs.map((r) => r.text))
      .join("");
    expect(text).not.toContain("réf. souhaitée");
    expect(text).not.toContain("citation needed");
    expect(text).not.toContain("Quand");
    expect(text).toContain("Le site est ancien");
    expect(text).toContain("de l'époque");
  });
});

describe("parseArticleSections — legend colour swatches", () => {
  it("keeps an inline colour key as a swatch run", () => {
    const html = `<html><body><section data-mw-section-id="0"><p><span style="display:inline-block;width:1.3em;height:1.3em;background:#80FF00;border:1px solid gray"> </span> Gagnant <span style="display:inline-block;width:1.3em;height:1.3em;background:gold;border:1px solid gray"> </span> Finaliste</p></section></body></html>`;
    const runs = parseArticleSections(html, "Résumé")[0].paragraphs[0].runs;
    const swatches = runs.filter((r) => r.swatch).map((r) => r.swatch);
    expect(swatches).toEqual(["#80FF00", "gold"]);
    // A swatch run carries no text — its label is a separate, visible run.
    expect(runs.every((r) => !(r.swatch && r.text.trim()))).toBe(true);
    expect(runs.some((r) => !r.swatch && r.text.includes("Gagnant"))).toBe(true);
    expect(runs.some((r) => !r.swatch && r.text.includes("Finaliste"))).toBe(true);
  });

  it("ignores a normal span (not a swatch)", () => {
    const html = `<html><body><section data-mw-section-id="0"><p><span style="color:red">Important</span> texte</p></section></body></html>`;
    const runs = parseArticleSections(html, "Résumé")[0].paragraphs[0].runs;
    expect(runs.some((r) => r.swatch)).toBe(false);
    expect(runs.map((r) => r.text).join("")).toContain("Important");
  });
});

describe("parseArticleSections — line breaks in cells", () => {
  it("keeps a <br> in a table cell as a newline (name + dates)", () => {
    const html = `<html><body><section data-mw-section-id="0"><table class="wikitable"><tr><th>Nom</th><th>Règne</th></tr><tr><td>Louis XIV<br/>1643-1715</td><td>72 ans</td></tr></table></section></body></html>`;
    const table = parseArticleSections(html, "Résumé").flatMap((s) => s.tables ?? [])[0];
    const cellText = table!.rows[0][0].runs.map((r) => r.text).join("");
    expect(cellText).toBe("Louis XIV\n1643-1715");
  });
});

describe("parseInfobox — multi-value entries", () => {
  it("separates <br>-stacked values with newlines", () => {
    const html = `<html><body><table class="infobox">
      <tr><th>Films notables</th><td><i>Les Parapluies de Cherbourg</i><br/><i>Belle de jour</i><br/><i>Indochine</i></td></tr>
      <tr><th>Profession</th><td>Actrice</td></tr>
    </table></body></html>`;
    const box = parseInfobox(html);
    const films = box?.rows.find((r) => r.label === "Films notables")?.value;
    expect(films).toBe("Les Parapluies de Cherbourg\nBelle de jour\nIndochine");
  });
});

describe("parseArticleSections — wide tables", () => {
  it("keeps more than 6 columns (electoral results / year grids)", () => {
    const cols = Array.from({ length: 10 }, (_, i) => `<th>C${i + 1}</th>`).join("");
    const cells = Array.from({ length: 10 }, (_, i) => `<td>v${i + 1}</td>`).join("");
    const html = `<html><body><section data-mw-section-id="0"><table class="wikitable"><tr>${cols}</tr><tr>${cells}</tr></table></section></body></html>`;
    const table = parseArticleSections(html, "Résumé").flatMap((s) => s.tables ?? [])[0];
    expect(table).toBeDefined();
    expect(table!.headers.length).toBe(10);
  });
});

describe("parseInfobox — locator map", () => {
  it("extracts a position map as a separate image from the lead image", () => {
    const html = `<html><body><table class="infobox">
      <tr><td><img resource="./Fichier:Logo.svg" src="//upload.wikimedia.org/logo.png" width="120" height="120"/></td></tr>
      <tr><td><img resource="./Fichier:Yvelines-Position.svg" src="//upload.wikimedia.org/position.png" width="250" height="200"/></td></tr>
      <tr><th>Région</th><td>Île-de-France</td></tr>
      <tr><th>Préfecture</th><td>Versailles</td></tr>
    </table></body></html>`;
    const box = parseInfobox(html);
    expect(box?.image).toBe("https://upload.wikimedia.org/logo.png");
    expect(box?.mapImage).toBe("https://upload.wikimedia.org/position.png");
  });

  it("does not treat 'objectpositions' diagram as a locator map", () => {
    // "Outersolarsystem_objectpositions_…" tripped the bare `position` pattern.
    const html = `<html><body><table class="infobox">
      <tr><td><img resource="./Fichier:Outersolarsystem_objectpositions_labels_comp-fr.png" src="//upload.wikimedia.org/objectpositions.png" width="280" height="275"/></td></tr>
      <tr><th>Région</th><td>Système solaire externe</td></tr>
      <tr><th>Distance</th><td>30–50 ua</td></tr>
    </table></body></html>`;
    const box = parseInfobox(html);
    expect(box?.image).toBe("https://upload.wikimedia.org/objectpositions.png");
    expect(box?.mapImage).toBeUndefined();
  });

  it("drops a locator map that is the very same file as the lead image", () => {
    const html = `<html><body><table class="infobox">
      <tr><td><img resource="./Fichier:Yvelines-Position.svg" src="//upload.wikimedia.org/position.png" width="250" height="200"/></td></tr>
      <tr><td><img resource="./Fichier:Yvelines-Position.svg" src="//upload.wikimedia.org/position.png" width="250" height="200"/></td></tr>
      <tr><th>Région</th><td>Île-de-France</td></tr>
      <tr><th>Préfecture</th><td>Versailles</td></tr>
    </table></body></html>`;
    const box = parseInfobox(html);
    expect(box?.image).toBe("https://upload.wikimedia.org/position.png");
    expect(box?.mapImage).toBeUndefined();
  });

  it("does not treat a flag as a locator map", () => {
    const html = `<html><body><table class="infobox">
      <tr><td><img resource="./Fichier:Flag_of_France.svg" src="//upload.wikimedia.org/flag.png" width="120" height="80"/></td></tr>
      <tr><th>Capitale</th><td>Paris</td></tr>
      <tr><th>Langue</th><td>Français</td></tr>
    </table></body></html>`;
    const box = parseInfobox(html);
    expect(box?.image).toBe("https://upload.wikimedia.org/flag.png");
    expect(box?.mapImage).toBeUndefined();
  });

  it("keeps the pushpin marker position from a Géolocalisation box", () => {
    // Mirrors fr.wikipedia commune infoboxes: a base map + a CSS-positioned pin.
    const html = `<html><body><table class="infobox">
      <tr><td><img resource="./Fichier:Photo.jpg" src="//upload.wikimedia.org/photo.png" width="200" height="140"/></td></tr>
      <tr><td><div class="geobox">
        <div><small>Géolocalisation sur la carte : France</small></div>
        <table class="DebutCarte"><tbody><tr><td><div style="position:relative;">
          <span typeof="mw:File"><a><img resource="./Fichier:France_relief_location_map.jpg" src="//upload.wikimedia.org/france.png" width="280" height="269"/></a></span>
          <div style="position:absolute;top:calc(45.949735449526% - 8px);left:calc(71.863572433157% - 8px);line-height:0;"><span typeof="mw:File"><a><img resource="./Fichier:City_locator_14.svg" src="//upload.wikimedia.org/pin.png" width="20" height="20"/></a></span></div>
        </div></td></tr></tbody></table>
      </div></td></tr>
      <tr><th>Région</th><td>Bourgogne-Franche-Comté</td></tr>
      <tr><th>Département</th><td>Jura</td></tr>
    </table></body></html>`;
    const box = parseInfobox(html);
    expect(box?.image).toBe("https://upload.wikimedia.org/photo.png");
    expect(box?.mapImage).toBe("https://upload.wikimedia.org/france.png");
    expect(box?.mapMarkerTop).toBeCloseTo(45.9497, 2);
    expect(box?.mapMarkerLeft).toBeCloseTo(71.8636, 2);
  });

  it("collects several framings (France/département) with labels, deduped", () => {
    const geobox = (area: string, file: string, top: string, left: string) => `
      <div class="geobox">
        <div><small>Géolocalisation sur la carte : <a rel="mw:WikiLink" href="./${area}">${area}</a></small></div>
        <table class="DebutCarte"><tbody><tr><td><div style="position:relative;">
          <span typeof="mw:File"><a><img resource="./Fichier:${file}" src="//upload.wikimedia.org/${file}.png" width="280" height="269"/></a></span>
          <div style="position:absolute;top:calc(${top}% - 8px);left:calc(${left}% - 8px);"><span typeof="mw:File"><a><img resource="./Fichier:City_locator_14.svg" src="//upload.wikimedia.org/pin.png" width="20" height="20"/></a></span></div>
        </div></td></tr></tbody></table>
      </div>`;
    const html = `<html><body><table class="infobox">
      <tr><td>${geobox("France", "France_relief", "45.94", "71.86")}</td></tr>
      <tr><td>${geobox("France", "France_admin", "45.94", "71.86")}</td></tr>
      <tr><td>${geobox("Jura", "Jura_relief", "58.37", "35.00")}</td></tr>
      <tr><th>Région</th><td>Bourgogne-Franche-Comté</td></tr>
      <tr><th>Préfecture</th><td>Lons-le-Saunier</td></tr>
    </table></body></html>`;
    const box = parseInfobox(html);
    // The two "France" framings dedupe by label → France + Jura.
    expect(box?.maps?.map((m) => m.label)).toEqual(["France", "Jura"]);
    expect(box?.maps?.[1].markerTop).toBeCloseTo(58.37, 2);
    expect(box?.maps?.[1].markerLeft).toBeCloseTo(35.0, 2);
    // Singletons mirror the first map.
    expect(box?.mapImage).toBe("https://upload.wikimedia.org/France_relief.png");
  });
});

describe("parseArticleSections — multi-row table headers (electoral results)", () => {
  // "Année" + "Rang" span both header rows (rowspan); "1er tour" spans two
  // sub-columns "Voix"/"%" (colspan). The sub-headers must attach to the right
  // columns, not bleed into Année/Rang or shift the data.
  const html = `<html><body><section data-mw-section-id="0"><table class="wikitable">
    <tr>
      <th rowspan="2">Année</th>
      <th colspan="2">1er tour</th>
      <th rowspan="2">Rang</th>
    </tr>
    <tr>
      <th>Voix</th>
      <th>%</th>
    </tr>
    <tr>
      <td>2022</td>
      <td>12 345</td>
      <td>41,2</td>
      <td>1er</td>
    </tr>
  </table></section></body></html>`;
  const table = parseArticleSections(html, "Résumé").flatMap((s) => s.tables ?? [])[0];

  it("flattens the two header rows column by column", () => {
    expect(table?.headers).toEqual(["Année", "1er tour · Voix", "1er tour · %", "Rang"]);
  });

  it("aligns the data row under the right columns", () => {
    const row = table?.rows[0].map((cell) => cell.runs.map((r) => r.text).join(""));
    expect(row).toEqual(["2022", "12 345", "41,2", "1er"]);
  });
});

describe("parseArticleSections — table cell images & colours", () => {
  it("keeps a participant photo as the cell image", () => {
    const html = `<html><body><section data-mw-section-id="0"><table class="wikitable">
      <tr><th>Photo</th><th>Personnalité</th></tr>
      <tr>
        <td><span typeof="mw:File"><a class="mw-file-description" href="./Fichier:Billy.jpg"><img src="//upload.wikimedia.org/billy/120px-Billy.jpg" width="85" height="118"/></a></span></td>
        <td><a rel="mw:WikiLink" href="./Billy_Crawford">Billy Crawford</a></td>
      </tr>
    </table></section></body></html>`;
    const table = parseArticleSections(html, "Résumé").flatMap((s) => s.tables ?? [])[0];
    expect(table?.rows[0][0].image).toBe("https://upload.wikimedia.org/billy/120px-Billy.jpg");
    expect(table?.rows[0][1].runs[0]).toEqual({
      text: "Billy Crawford",
      linkTargetId: "Billy_Crawford",
    });
  });

  it("keeps a coloured (code-couleur) cell even when it has no text", () => {
    const html = `<html><body><section data-mw-section-id="0"><table class="wikitable">
      <tr><th>Candidat</th><th>Ép. 1</th><th>Ép. 2</th></tr>
      <tr>
        <td>Âne</td>
        <td bgcolor="#80FF00"></td>
        <td style="background:#FF8080"></td>
      </tr>
    </table></section></body></html>`;
    const table = parseArticleSections(html, "Résumé").flatMap((s) => s.tables ?? [])[0];
    expect(table?.headers).toEqual(["Candidat", "Ép. 1", "Ép. 2"]);
    expect(table?.rows[0][1].background).toBe("#80FF00");
    expect(table?.rows[0][2].background).toBe("#FF8080");
  });

  it("ignores tiny icons but keeps real images", () => {
    const html = `<html><body><section data-mw-section-id="0"><table class="wikitable">
      <tr><th>A</th><th>B</th></tr>
      <tr>
        <td><img src="//upload.wikimedia.org/check/16px-Yes.svg.png" width="16" height="16"/>Oui</td>
        <td><img src="//upload.wikimedia.org/photo/120px-Photo.jpg" width="80" height="100"/></td>
      </tr>
    </table></section></body></html>`;
    const table = parseArticleSections(html, "Résumé").flatMap((s) => s.tables ?? [])[0];
    expect(table?.rows[0][0].image).toBeUndefined();
    expect(table?.rows[0][0].runs.map((r) => r.text).join("")).toContain("Oui");
    expect(table?.rows[0][1].image).toBe("https://upload.wikimedia.org/photo/120px-Photo.jpg");
  });
});

describe("parseAncestry — ahnentafel chart", () => {
  // A compact-ancestors table: cells are "N. Name" with the ancestor's link.
  const cell = (n: number, name: string, link = true) =>
    `<td style="background:#fcc">${n}. ${
      link ? `<a rel="mw:WikiLink" href="./${name.replace(/ /g, "_")}">${name}</a>` : name
    }</td>`;
  const html = `<html><body><section data-mw-section-id="0">
    <h3>Ascendance</h3>
    <table style="border-spacing:0">
      <tr>${cell(1, "Louis XIV")}${cell(2, "Louis XIII")}${cell(4, "Henri IV")}${cell(8, "Antoine de Bourbon")}</tr>
      <tr>${cell(3, "Anne d'Autriche")}${cell(5, "Marie de Médicis")}${cell(9, "Jeanne d'Albret")}</tr>
      <tr>${cell(6, "Philippe III")}${cell(7, "Marguerite d'Autriche")}</tr>
    </table>
  </section></body></html>`;
  const ancestry = parseAncestry(html);

  it("extracts numbered ancestors (skipping the subject at position 1)", () => {
    const positions = ancestry.map((a) => a.position);
    expect(positions).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ancestry.find((a) => a.position === 2)).toEqual({
      position: 2,
      label: "Louis XIII",
      targetId: "Louis_XIII",
    });
  });

  it("keeps the link target so each ancestor is tappable", () => {
    const anne = ancestry.find((a) => a.position === 3);
    expect(anne?.targetId).toBe("Anne_d'Autriche");
  });

  it("returns [] when there is no ahnentafel table", () => {
    const plain = `<html><body><section data-mw-section-id="0"><p>No chart here.</p></section></body></html>`;
    expect(parseAncestry(plain)).toEqual([]);
  });
});
