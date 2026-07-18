import { BadRequestException } from "@nestjs/common";
import { assertWikimediaUrl } from "./outbound-url";

describe("assertWikimediaUrl", () => {
  it.each([
    "https://en.wikipedia.org/api/rest_v1/page/summary/Cat",
    "https://fr.wikipedia.org/w/api.php?action=query",
    "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/2026/01/01",
    "https://api.wikimedia.org/feed/v1/wikipedia/en/featured/2026/01/01",
    "https://upload.wikimedia.org/wikipedia/commons/a/a0/Foo.jpg",
    "https://maps.wikimedia.org/img/osm-intl,1,2,3.png",
  ])("accepts trusted Wikimedia URL %s", (url) => {
    expect(assertWikimediaUrl(url)).toBeInstanceOf(URL);
    expect(assertWikimediaUrl(url).toString()).toBe(new URL(url).toString());
  });

  it.each([
    "https://evil.com/steal",
    "https://en.wikipedia.org.evil.com/x", // suffix-spoof
    "https://notwikipedia.org/x",
    "https://169.254.169.254/latest/meta-data", // cloud metadata / private IP
    "https://localhost:3000/internal",
  ])("rejects off-allowlist host %s", (url) => {
    expect(() => assertWikimediaUrl(url)).toThrow(BadRequestException);
  });

  it.each([
    "http://en.wikipedia.org/x", // non-https
    "file:///etc/passwd",
    "ftp://en.wikipedia.org/x",
    "not a url",
  ])("rejects non-https / malformed URL %s", (url) => {
    expect(() => assertWikimediaUrl(url)).toThrow(BadRequestException);
  });
});
