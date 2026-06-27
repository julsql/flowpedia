import { Image, type ImageProps, type ImageURISource } from "react-native";

// Wikimedia's User-Agent policy rejects generic/library agents (e.g. the native
// okhttp loader) with 403 — which is why images load on web (real browser UA)
// but not on a device. Sending a descriptive UA fixes it.
const USER_AGENT = "Flowpedia/1.0 (https://github.com/julsql/flowpedia)";

/** <Image> that attaches a Wikimedia-friendly User-Agent to remote URIs. */
export function RemoteImage({ source, ...rest }: ImageProps) {
  let withAgent = source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const uriSource = source as ImageURISource;
    if (uriSource.uri) {
      withAgent = {
        ...uriSource,
        headers: { "User-Agent": USER_AGENT, ...(uriSource.headers ?? {}) },
      };
    }
  }
  return <Image source={withAgent} {...rest} />;
}
