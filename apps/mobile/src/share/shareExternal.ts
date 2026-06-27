import { Platform, Share } from "react-native";
import type { Article } from "@flowpedia/shared";
import { sendEvents } from "../api/client";

/**
 * Open the OS share sheet (or the Web Share API) so the article can be sent to
 * any installed messaging app — outside Flowpedia. Falls back to copying the
 * link on web browsers without the Share API. Returns true if it shared/copied.
 */
export async function shareExternal(article: Article): Promise<boolean> {
  const url = article.sourceUrl;
  const title = article.title;
  try {
    if (Platform.OS === "web") {
      const nav = typeof navigator !== "undefined" ? (navigator as Navigator) : undefined;
      if (nav?.share) {
        await nav.share({ title, text: title, url });
      } else if (nav?.clipboard) {
        await nav.clipboard.writeText(url);
      } else {
        return false;
      }
    } else {
      const result = await Share.share({ message: `${title} — ${url}`, url, title });
      if (result.action === Share.dismissedAction) {
        return false;
      }
    }
    sendEvents([{ articleId: article.id, type: "share", ts: Date.now() }]);
    return true;
  } catch {
    return false;
  }
}
