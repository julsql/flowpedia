import { Image, StyleSheet, type ImageProps, type ImageURISource } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { proxiedImageUrl } from "../api/client";

// Subtle diagonal grey gradient painted *behind* every image. Photos cover it
// fully, so it never shows. But transparent or single-color logos (e.g. a black
// logo on a transparent PNG) would vanish on a flat dark surface — here the
// gradient spans mid-grey → light-grey, so any solid color contrasts against
// part of it, in light and dark mode alike.
const BACKDROP_COLORS = ["#737373", "#ededed"] as const;
const BACKDROP_START = { x: 0, y: 0 };
const BACKDROP_END = { x: 1, y: 1 };

/**
 * <Image> for remote (Wikimedia) URIs. Routes them through the API image proxy,
 * which loads them with a compliant User-Agent — devices otherwise get 403s or
 * can't reach the image host directly (images would load on web but not mobile).
 * The image sits on a faint gradient so transparent/unicolor logos stay visible.
 */
export function RemoteImage({ source, style, ...rest }: ImageProps) {
  let resolved = source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const uriSource = source as ImageURISource;
    if (uriSource.uri) {
      resolved = { ...uriSource, uri: proxiedImageUrl(uriSource.uri) };
    }
  }
  return (
    <LinearGradient
      colors={BACKDROP_COLORS}
      start={BACKDROP_START}
      end={BACKDROP_END}
      style={[style, styles.clip]}
    >
      <Image source={resolved} style={StyleSheet.absoluteFill} {...rest} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});
