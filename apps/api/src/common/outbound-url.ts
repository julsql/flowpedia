import { BadRequestException } from "@nestjs/common";

/**
 * Exact hosts Flowpedia is allowed to reach for outbound requests built from
 * user-influenced input. Kept as an explicit allowlist (equality check) so it is
 * an unambiguous SSRF barrier: a language code or article title coming from the
 * client can never redirect a request to an arbitrary host.
 *
 * Wikimedia language editions are `<lang>.wikipedia.org`; the pageviews/featured
 * feeds live on `wikimedia.org` / `api.wikimedia.org`; media/thumbnails on
 * `upload.wikimedia.org` (and `maps.wikimedia.org`).
 */
const WIKIMEDIA_HOSTS = new Set<string>([
  "wikimedia.org",
  "api.wikimedia.org",
  "upload.wikimedia.org",
  "maps.wikimedia.org",
]);

/** Suffixes whose subdomains are all trusted Wikimedia properties. */
const WIKIMEDIA_SUFFIXES = [".wikipedia.org", ".wikimedia.org"] as const;

/** A trusted Wikimedia host — exact match or a known Wikimedia subdomain. */
function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (WIKIMEDIA_HOSTS.has(host)) {
    return true;
  }
  return WIKIMEDIA_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * Validate an outbound URL that is (partly) built from user-provided input,
 * before it is passed to `fetch`. Guards against request forgery (SSRF) /
 * open-proxy abuse by rejecting any non-https scheme and any host that is not a
 * trusted Wikimedia property. Returns the parsed `URL` so callers pass the
 * validated value to `fetch` (breaking the taint flow), never the raw string.
 *
 * @throws BadRequestException when the URL is malformed, not https, or off-list.
 */
export function assertWikimediaUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException("Invalid outbound URL.");
  }
  if (url.protocol !== "https:") {
    throw new BadRequestException("Only https outbound requests are allowed.");
  }
  if (!isAllowedHost(url.hostname)) {
    throw new BadRequestException(`Outbound host not allowed: ${url.hostname}`);
  }
  return url;
}
