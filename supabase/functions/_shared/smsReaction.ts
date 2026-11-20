/**
 * Detect SMS tapbacks / reactions and short acknowledgements so the
 * superintendent job AI does not auto-reply to them.
 *
 * iMessage and Android tapbacks often arrive over SMS as text like:
 *   Liked "..."
 *   Reacted 👍 to "..."
 *   👍 to "..."   (with hair spaces / zero-width spaces; this is what
 *                  a 2026-11-18 crew thumbs-up actually looked like)
 *
 * Tapback-shaped messages are suppressed for every sender.
 * Emoji-only and short acks ("ok", "thanks", "got it", ...) are
 * suppressed only for known crew (technicians.phone), so a customer
 * answering a clarifying question is unchanged.
 */

const FORMAT_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const EXOTIC_SPACE = /[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g;
const DOUBLE_QUOTES = /[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g;
const SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B]/g;
const EMOJI_SRC =
  "(?:\\p{Extended_Pictographic}|\\p{Emoji_Presentation}|\\p{Emoji}\\uFE0F)";

function emojiRe(): RegExp {
  return new RegExp(EMOJI_SRC, "gu");
}

const TAPBACK_VERBS =
  /^(liked|loved|disliked|laughed at|emphasized|questioned)\s+"/i;
const REACTED_TO = /^reacted\s+\S.+\s+to\s+"/i;
const REMOVED_REACTION =
  /^removed a (like|love|laugh|laughter|emphasis|question|reaction)\b/i;
const EMOJI_TO_QUOTE = new RegExp(`^(?:${EMOJI_SRC})+(?:\\s+to\\s+")`, "u");

const ACK_PHRASES = new Set([
  "ok",
  "okay",
  "k",
  "kk",
  "thanks",
  "thank you",
  "thx",
  "ty",
  "got it",
  "noted",
  "copy",
  "copy that",
  "roger",
  "roger that",
  "sounds good",
  "10-4",
  "cool",
  "yep",
  "yup",
]);

export function normalizeSmsForReaction(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKC")
    .replace(FORMAT_CHARS, "")
    .replace(EXOTIC_SPACE, " ")
    .replace(DOUBLE_QUOTES, '"')
    .replace(SINGLE_QUOTES, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** iMessage / Android tapback text, regardless of who sent it. */
export function isTapbackOrReaction(message: string | null | undefined): boolean {
  const t = normalizeSmsForReaction(message);
  if (!t) return false;
  return (
    TAPBACK_VERBS.test(t) ||
    REACTED_TO.test(t) ||
    REMOVED_REACTION.test(t) ||
    EMOJI_TO_QUOTE.test(t)
  );
}

function isEmojiOnly(normalized: string): boolean {
  const withoutEmoji = normalized.replace(emojiRe(), "").replace(/[\s.!?,-]+/g, "");
  const compacted = normalized.replace(/[\s.!?,-]+/g, "");
  return compacted.length > 0 && withoutEmoji.length === 0;
}

/**
 * Emoji-only body, or a short acknowledgement with optional punctuation / emoji.
 * "thanks, can we start at 6?" is not an acknowledgement.
 */
export function isPureAcknowledgement(message: string | null | undefined): boolean {
  const t = normalizeSmsForReaction(message);
  if (!t) return false;
  if (isTapbackOrReaction(message)) return true;
  if (isEmojiOnly(t)) return true;
  const stripped = t
    .replace(emojiRe(), "")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!stripped) return true;
  return ACK_PHRASES.has(stripped);
}

/** Whether the inbound SMS should be logged but not sent to the job AI. */
export function shouldSuppressReactionReply(
  message: string | null | undefined,
  isDirectoryCrew: boolean,
): boolean {
  if (isTapbackOrReaction(message)) return true;
  if (isDirectoryCrew && isPureAcknowledgement(message)) return true;
  return false;
}
