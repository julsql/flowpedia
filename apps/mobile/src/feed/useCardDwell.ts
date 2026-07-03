import { useRef } from "react";
import type { ViewToken } from "react-native";
import type { Article } from "@flowpedia/shared";
import { sendEvents } from "../api/client";

// Ignore sub-flicker visibility (fast scroll-through isn't real attention).
const MIN_CARD_DWELL_MS = 300;

/**
 * Tracks how long each feed card stays on screen and emits a `cardDwell` signal
 * when it leaves the viewport — the "time spent on the card in the flow" the
 * ranking treats as an important interest signal. Stable handlers (useRef) so
 * FlashList never warns about changing viewability callbacks on the fly.
 */
export function useCardDwell() {
  const startedAt = useRef(new Map<string, number>()).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ changed }: { changed: ViewToken[] }) => {
    const now = Date.now();
    for (const token of changed) {
      const id = (token.item as Article | undefined)?.id;
      if (!id) {
        continue;
      }
      if (token.isViewable) {
        startedAt.set(id, now);
      } else {
        const start = startedAt.get(id);
        if (start != null) {
          startedAt.delete(id);
          const dwell = now - start;
          if (dwell >= MIN_CARD_DWELL_MS) {
            sendEvents([{ articleId: id, type: "cardDwell", value: dwell, ts: now }]);
          }
        }
      }
    }
  }).current;

  return { onViewableItemsChanged, viewabilityConfig };
}
