import { Image, type ImageProps, type ImageURISource } from "react-native";
import { proxiedImageUrl } from "../api/client";

/**
 * <Image> for remote (Wikimedia) URIs. Routes them through the API image proxy,
 * which loads them with a compliant User-Agent — devices otherwise get 403s or
 * can't reach the image host directly (images would load on web but not mobile).
 */
export function RemoteImage({ source, ...rest }: ImageProps) {
  let resolved = source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const uriSource = source as ImageURISource;
    if (uriSource.uri) {
      resolved = { ...uriSource, uri: proxiedImageUrl(uriSource.uri) };
    }
  }
  return <Image source={resolved} {...rest} />;
}
