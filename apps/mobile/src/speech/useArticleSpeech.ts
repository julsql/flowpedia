import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Speech from "expo-speech";
import type { Article, ArticleSection } from "@flowpedia/shared";

// expo-speech is backed by a native module. In a dev build produced before the
// dependency was added (or any binary missing the ExpoSpeech module) its methods
// throw *synchronously* — which would crash the article screen the instant it
// mounts (the reset effect calls Speech.stop()). Guard every call so the screen
// still opens and read-aloud simply no-ops until the app is rebuilt with the
// module. Web uses the JS Web Speech API, so it stays fully functional there.
let speechModuleOk = true;
function safeSpeech(run: () => void): void {
  if (!speechModuleOk) {
    return;
  }
  try {
    run();
  } catch {
    speechModuleOk = false;
  }
}

/** One spoken unit: a heading (title/section) or a prose sentence. */
interface SpeechChunk {
  text: string;
  heading: boolean;
  /** Section this chunk belongs to — lets reading start at a given section. */
  sectionId: string;
}

// Wikipedia content language → a TTS BCP-47 hint. The native engine picks the
// closest installed voice; a bare language code also works, this just nudges it
// to a regional voice. Only fr/en for now (the feature's initial scope).
const SPEECH_LANG: Partial<Record<string, string>> = {
  en: "en-US",
  fr: "fr-FR",
};

// Short breath inserted after a heading before its body starts reading.
const HEADING_GAP_MS = 320;

/** A paragraph that is essentially a list of links — skipped when reading. */
function isLinkList(paragraph: ArticleSection["paragraphs"][number]): boolean {
  const meaningful = paragraph.runs.filter((r) => r.text.trim().length > 0);
  return meaningful.length >= 3 && meaningful.every((r) => Boolean(r.linkTargetId));
}

// IPA / phonetic symbols: the IPA Extensions block, spacing modifiers (ˈ ˌ ː)
// and combining diacritics (the nasal/length marks in e.g. /fʁɑ̃s/). These never
// occur in normal precomposed French/English prose, so they reliably flag a
// phonetic transcription without false-positiving on "km/h" or "and/or".
const IPA_SYMBOL = /[ɐ-ʯʰ-˿̀-ͯ]/;

/**
 * Strip phonetic transcriptions before reading. Wikipedia leads are littered
 * with API/IPA notation like "France (/fʁɑ̃s/ ⓘ)" which a TTS engine spells out
 * as gibberish. We drop the /…/ and […] groups that contain IPA symbols, plus
 * the now-empty "(prononciation : )" wrappers and listen icons left behind.
 */
export function stripPhonetics(text: string): string {
  let out = text.replace(/\/[^/]{1,40}\//g, (m) => (IPA_SYMBOL.test(m) ? "" : m));
  out = out.replace(/\[[^\]]{1,40}\]/g, (m) => (IPA_SYMBOL.test(m) ? "" : m));
  out = out.replace(/[ⓘ🔊]/g, "");
  // Drop pronunciation-label parentheses and any empties the removals leave.
  out = out.replace(/\(\s*(?:[ÉéEe]couter|[Pp]rononc[^)]*)?\s*\)/g, "");
  out = out.replace(/\(\s*[;:,·\s]*\)/g, "");
  // Tidy the dangling whitespace/punctuation around the cuts.
  out = out
    .replace(/\s+([;:,.)!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s{2,}/g, " ");
  return out.trim();
}

/**
 * Split prose into sentences. Reading one sentence per utterance is what gives
 * the TTS engine its intonation: it resets prosody and inserts a natural pause
 * at each boundary, instead of droning a whole paragraph in one flat breath.
 * The lookbehind keeps the terminator with its sentence and only breaks before
 * an opening character (capital / quote / digit) so "J.-C." or "n°4" don't split.
 */
function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?…])\s+(?=["“«'(\[A-ZÀ-ÖØ-Þ0-9])/u);
  const out: string[] = [];
  for (const raw of parts) {
    const s = raw.trim();
    if (!s) {
      continue;
    }
    // Glue a stray short fragment (an abbreviation that fooled the split) onto
    // the previous sentence rather than speaking it on its own.
    if (out.length && s.length < 3) {
      out[out.length - 1] += " " + s;
    } else {
      out.push(s);
    }
  }
  return out;
}

/**
 * Flatten an article into a sequence of readable chunks: the title, then each
 * section's heading and prose (one chunk per sentence, phonetics stripped).
 * Everything visual or tabular (images, infobox, charts, tables, "main article"
 * pointers, link-list paragraphs) is skipped — we read the article, not chrome.
 */
export function buildSpeechChunks(article: Article): SpeechChunk[] {
  const leadId = article.sections[0]?.id ?? "lead";
  const chunks: SpeechChunk[] = [
    { text: stripPhonetics(article.title.trim()), heading: true, sectionId: leadId },
  ];
  article.sections.forEach((section, index) => {
    // Section 0 is the lead — its heading duplicates the title, so skip it.
    if (index > 0 && section.title?.trim()) {
      chunks.push({ text: section.title.trim(), heading: true, sectionId: section.id });
    }
    for (const paragraph of section.paragraphs) {
      if (isLinkList(paragraph)) {
        continue;
      }
      const text = stripPhonetics(
        paragraph.runs
          .map((r) => r.text)
          .join("")
          .replace(/\s+/g, " ")
          .trim(),
      );
      for (const sentence of splitSentences(text)) {
        chunks.push({ text: sentence, heading: false, sectionId: section.id });
      }
    }
  });
  return chunks;
}

/**
 * Probe the TTS engine: report whether it is usable and pick the most natural
 * installed voice for a language. Default system voices are the robotic ones;
 * most devices also ship an "Enhanced"/"Premium"/neural voice that sounds far
 * better — we score for those and prefer an exact region match.
 *
 * `usable` is false when the native module is missing (throws) or the engine
 * exposes no voices at all (e.g. a de-Googled ROM with no TTS) — the caller then
 * hides the read-aloud controls. A voiceId of undefined just lets the engine
 * pick a default (still usable, e.g. on web where the list loads lazily).
 */
async function probeVoices(
  lang: string,
): Promise<{ voiceId: string | undefined; usable: boolean }> {
  const base = lang.split("-")[0].toLowerCase();
  // On web the voice list can be empty on first call (loaded asynchronously);
  // retry a couple of times before giving up.
  let voices: Speech.Voice[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      voices = await Speech.getAvailableVoicesAsync();
    } catch {
      speechModuleOk = false; // native module absent — skip TTS entirely
      return { voiceId: undefined, usable: false };
    }
    if (voices.length) {
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  // No voices on any platform after retries → the engine can't speak.
  if (!voices.length) {
    return { voiceId: undefined, usable: false };
  }
  const matches = voices.filter((v) => v.language?.toLowerCase().startsWith(base));
  if (!matches.length) {
    // Engine works but lacks this language; let it fall back to a default voice.
    return { voiceId: undefined, usable: true };
  }
  const score = (v: Speech.Voice): number => {
    let s = 0;
    if (v.quality === Speech.VoiceQuality.Enhanced) {
      s += 100;
    }
    const name = (v.name ?? "").toLowerCase();
    if (/(enhanced|premium|neural|natural|siri)/.test(name)) {
      s += 40;
    }
    if (name.includes("google")) {
      s += 20; // Chrome's "Google" voices are noticeably better than eSpeak.
    }
    if (v.language?.toLowerCase() === lang.toLowerCase()) {
      s += 10; // exact region (fr-FR) over a cousin (fr-CA).
    }
    return s;
  };
  matches.sort((a, b) => score(b) - score(a));
  return { voiceId: matches[0].identifier, usable: true };
}

export interface ArticleSpeech {
  /** Whether the device has a usable TTS engine (hide the controls if not). */
  available: boolean;
  /** Actively reading (utterances in flight). */
  speaking: boolean;
  /** Reading was paused and can be resumed where it left off. */
  paused: boolean;
  /** Section currently being read (for highlighting), or null when idle. */
  currentSectionId: string | null;
  /** Header button: start → pause → resume. */
  toggle: () => void;
  /** Stop and reset to the top. */
  stop: () => void;
  /** Start (or restart) reading at a given section. */
  readFromSection: (sectionId: string) => void;
}

/**
 * Read-an-article-aloud controller built on the device's native TTS engine
 * (expo-speech — no model, no network). Chunks are spoken one after another by
 * chaining each utterance's `onDone`. Pause/resume is implemented by stopping
 * the engine and remembering the current chunk (sentence-level granularity),
 * which works the same on iOS/Android/web — unlike the native pause API.
 */
export function useArticleSpeech(article: Article | null, locale: string): ArticleSpeech {
  const [available, setAvailable] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const chunksRef = useRef<SpeechChunk[]>([]);
  // Index of the chunk currently being (or about to be) read — the resume point.
  const indexRef = useRef(0);
  // True while a reading session is in progress; cleared on stop/pause so any
  // pending onDone/timeout callback halts instead of advancing the queue.
  const activeRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Chosen voice id for the current language (undefined → engine default).
  const voiceRef = useRef<string | undefined>(undefined);

  // Resolve the best voice whenever the language changes — and use the same
  // probe to decide whether TTS is usable at all (native module present and at
  // least one voice installed). A device with no engine (e.g. a de-Googled ROM)
  // simply hides the read-aloud controls; opening the article is never blocked.
  useEffect(() => {
    voiceRef.current = undefined;
    // Native: never probe the TTS engine at mount. getAvailableVoicesAsync can
    // crash the app on init with some engines (a native NullPointerException in
    // LanguageUtils — see patches/expo-speech), which a JS try/catch cannot
    // intercept. Opening an article must never touch native TTS, so we keep the
    // controls available and let the engine pick a default voice; the optional
    // "enhanced voice" selection is web-only (where the probe is harmless).
    if (Platform.OS !== "web") {
      setAvailable(true);
      return;
    }
    let cancelled = false;
    void probeVoices(SPEECH_LANG[locale] ?? locale).then(({ voiceId, usable }) => {
      if (cancelled) {
        return;
      }
      voiceRef.current = voiceId;
      setAvailable(usable);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const speakFrom = useCallback(
    (i: number) => {
      const chunks = chunksRef.current;
      if (!activeRef.current || i >= chunks.length) {
        activeRef.current = false;
        setSpeaking(false);
        setPaused(false);
        setCurrentSectionId(null);
        indexRef.current = 0;
        return;
      }
      indexRef.current = i;
      const chunk = chunks[i];
      setCurrentSectionId((prev) => (prev === chunk.sectionId ? prev : chunk.sectionId));
      safeSpeech(() =>
        Speech.speak(chunk.text, {
          language: SPEECH_LANG[locale] ?? locale,
          voice: voiceRef.current,
          // Headings stand out from prose: a touch higher and slower. Prose reads
          // just under natural speed — clearer without sounding sluggish.
          pitch: chunk.heading ? 1.12 : 1,
          rate: chunk.heading ? 0.9 : 0.96,
          onDone: () => {
            if (!activeRef.current) {
              return;
            }
            if (chunk.heading) {
              timerRef.current = setTimeout(() => speakFrom(i + 1), HEADING_GAP_MS);
            } else {
              speakFrom(i + 1);
            }
          },
          onError: () => {
            activeRef.current = false;
            setSpeaking(false);
          },
        }),
      );
    },
    [locale],
  );

  // Build the queue (once per article) and begin reading at `fromIndex`.
  const startAt = useCallback(
    (fromIndex: number) => {
      if (!article || !speechModuleOk) {
        return;
      }
      if (!chunksRef.current.length) {
        chunksRef.current = buildSpeechChunks(article);
      }
      if (!chunksRef.current.length) {
        return;
      }
      clearTimer();
      safeSpeech(() => Speech.stop()); // drop any leftover queue before starting fresh
      activeRef.current = true;
      setSpeaking(true);
      setPaused(false);
      speakFrom(Math.max(0, Math.min(fromIndex, chunksRef.current.length - 1)));
    },
    [article, speakFrom, clearTimer],
  );

  const stop = useCallback(() => {
    activeRef.current = false;
    clearTimer();
    safeSpeech(() => Speech.stop());
    indexRef.current = 0;
    setSpeaking(false);
    setPaused(false);
    setCurrentSectionId(null);
  }, [clearTimer]);

  // Pause: stop the engine but keep the resume index (the in-progress sentence).
  const pause = useCallback(() => {
    activeRef.current = false;
    clearTimer();
    safeSpeech(() => Speech.stop());
    setSpeaking(false);
    setPaused(true);
  }, [clearTimer]);

  const resume = useCallback(() => {
    startAt(indexRef.current);
  }, [startAt]);

  const toggle = useCallback(() => {
    if (speaking) {
      pause();
    } else if (paused) {
      resume();
    } else {
      startAt(0);
    }
  }, [speaking, paused, pause, resume, startAt]);

  const readFromSection = useCallback(
    (sectionId: string) => {
      if (!article) {
        return;
      }
      if (!chunksRef.current.length) {
        chunksRef.current = buildSpeechChunks(article);
      }
      const idx = chunksRef.current.findIndex((c) => c.sectionId === sectionId);
      startAt(idx === -1 ? 0 : idx);
    },
    [article, startAt],
  );

  // Reset everything when navigating to another article.
  useEffect(() => {
    activeRef.current = false;
    clearTimer();
    safeSpeech(() => Speech.stop());
    chunksRef.current = [];
    indexRef.current = 0;
    setSpeaking(false);
    setPaused(false);
    setCurrentSectionId(null);
  }, [article?.id, clearTimer]);

  // Stop the engine on unmount.
  useEffect(
    () => () => {
      activeRef.current = false;
      clearTimer();
      safeSpeech(() => Speech.stop());
    },
    [clearTimer],
  );

  return { available, speaking, paused, currentSectionId, toggle, stop, readFromSection };
}
