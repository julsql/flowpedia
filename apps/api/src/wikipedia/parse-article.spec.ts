import {
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
    const dates = table?.rows.map((row) => row[0].map((r) => r.text).join(""));
    expect(dates).toEqual(["31 janvier", "31 janvier"]);
  });

  it("keeps internal links inside cells tappable", () => {
    const nameCell = table?.rows[0][1];
    expect(nameCell?.[0]).toEqual({ text: "Nataša Bokal", linkTargetId: "Nataša_Bokal" });
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
