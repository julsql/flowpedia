import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  type ImageProps,
  type ImageURISource,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { proxiedImageUrl } from "../api/client";
import { useTheme } from "../theme";

// Subtle diagonal gradient painted *behind* every image. Photos cover it fully,
// so it never shows. But transparent or single-color logos (e.g. a black logo on
// a transparent PNG) would vanish on a flat surface — the gradient spans two
// tones so any solid color contrasts against part of it. Darker in dark mode so
// the backdrop isn't a jarring light rectangle.
const BACKDROP_DARK = ["#2c2c2c", "#5a5a5a"] as const;
const BACKDROP_LIGHT = ["#737373", "#ededed"] as const;
const BACKDROP_START = { x: 0, y: 0 };
const BACKDROP_END = { x: 1, y: 1 };

interface RemoteImageProps extends ImageProps {
  /** Skip the gradient backdrop (e.g. the full-screen lightbox over a dark scrim). */
  noBackdrop?: boolean;
}

/**
 * <Image> for remote (Wikimedia) URIs. Routes them through the API image proxy,
 * which loads them with a compliant User-Agent — devices otherwise get 403s or
 * can't reach the image host directly (images would load on web but not mobile).
 * The image sits on a faint gradient so transparent/unicolor logos stay visible,
 * and a pulsing skeleton overlay shows while the image is still loading.
 */
export function RemoteImage({
  source,
  style,
  onLoadEnd,
  onError,
  noBackdrop,
  ...rest
}: RemoteImageProps) {
  const { scheme } = useTheme();
  const [loaded, setLoaded] = useState(false);
  // Skeleton shimmer (0.35 ↔ 1 opacity) shown only while loading.
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (loaded) {
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [loaded, pulse]);

  let resolved = source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const uriSource = source as ImageURISource;
    if (uriSource.uri) {
      resolved = { ...uriSource, uri: proxiedImageUrl(uriSource.uri) };
    }
  }

  const image = (
    <Image
      source={resolved}
      style={noBackdrop ? style : StyleSheet.absoluteFill}
      onLoadEnd={() => {
        setLoaded(true);
        onLoadEnd?.();
      }}
      onError={(e) => {
        // Stop the shimmer even on failure (broken image, not an endless pulse).
        setLoaded(true);
        onError?.(e);
      }}
      {...rest}
    />
  );

  // Lightbox / transparent contexts: just the image, no gradient rectangle.
  if (noBackdrop) {
    return image;
  }

  const skeletonColor = scheme === "light" ? "#cfcfcf" : "#3a3a3a";
  return (
    <LinearGradient
      colors={scheme === "light" ? BACKDROP_LIGHT : BACKDROP_DARK}
      start={BACKDROP_START}
      end={BACKDROP_END}
      style={[style, styles.clip]}
    >
      {image}
      {!loaded ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.skeleton, { opacity: pulse, backgroundColor: skeletonColor }]}
        />
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  skeleton: { ...StyleSheet.absoluteFillObject },
});
