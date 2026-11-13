/**
 * Reply guard for the superintendent SMS dispatcher (super-processor).
 *
 * The AI may only *say* a job was scheduled, booked, moved or rescheduled when
 * one of our tools actually wrote to the database during this text. Those
 * confirmations are written by code, never by the model. When no tool wrote
 * anything, any free-text reply from the model that claims a schedule change is
 * replaced with an honest one.
 *
 * Background: Nov 11, 2026 12:03 PM MST, "Kachina plumb trim schedule to start
 * on 12/7/26" got the free-text reply "I've scheduled the plumbing trim work for
 * Kachina to start on Monday, December 7, 2026." No tool ran and nothing changed.
 *
 * Pure module: no network, no Deno globals. Tested by scripts/sms-schedule-checks.ts.
 */

export const HONEST_NO_CHANGE_REPLY =
  "I haven't changed the schedule yet. Preston will review your text and confirm with you.";

// Verbs that by themselves mean "this is on the schedule now".
const SCHEDULE_VERBS =
  String.raw`(?:re-?)?schedul(?:ed|ing|e)|book(?:ed|ing)?|lock(?:ed|ing)?(?:\s+(?:it|that|this|them|you|the\s+\w+))?\s+in|slott?(?:ed|ing)?(?:\s+(?:it|that|this|them|you))?\s+in|pencil+(?:ed|ing)?(?:\s+(?:it|that|this|them|you))?\s+in|calendared`;
// Generic verbs that only count as a schedule claim when the sentence has schedule context.
const GENERIC_VERBS =
  String.raw`put|putting|add(?:ed|ing)?|log(?:ged|ging)?|mov(?:ed|ing|e)|updat(?:ed|ing|e)|chang(?:ed|ing|e)|shift(?:ed|ing)?|push(?:ed|ing)?|bump(?:ed|ing)?|set(?:\s+(?:it|that|this|them|you))?\s+up|set|entered|placed|noted|got\s+(?:it|that|this|them|you)\s+(?:down|on)|have\s+(?:it|that|this|them|you)\s+(?:down|on)`;
// "I've", "I have", "we've", "I just", "I'm", "I went ahead and" ... (no future tense: "I'll" is a promise, not a claim).
const FIRST_PERSON_DONE =
  String.raw`\b(?:i|we)(?:\s*'\s*ve|\s+have|\s*'\s*m|\s+am|\s*'\s*re|\s+are)?(?:\s+(?:just|now|already|also|successfully|gone\s+ahead\s+and|went\s+ahead\s+and|went\s+and))*\s+`;
// "it's", "it is", "that has been", "the trim is now", "job was" ...
const PASSIVE_DONE =
  String.raw`(?:\b(?:is|was|were|are|has\s+been|have\s+been|had\s+been|got|gets|now)|'s|’s)(?:\s+(?:now|all|been|officially|already|successfully))*\s+`;
const PASSIVE_TARGET =
  String.raw`(?:(?:re-?)?scheduled|booked|locked\s+in|slotted\s+in|penciled\s+in|pencilled\s+in|calendared|confirmed|moved|rescheduled|pushed|bumped|shifted|logged|added|set\s+for|set\s+to|updated|changed|(?:on|onto)\s+(?:the|our|your)\s+(?:schedule|board|calendar|books?))`;

const SCHEDULE_CONTEXT =
  /\b(schedul\w*|board|calendar|books?|dates?|today|tomorrow|tonight|next\s+week|(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}\s*[/\-.]\s*\d{1,2}|\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th))\b/i;

const RE_FIRST_PERSON_SCHEDULE = new RegExp(FIRST_PERSON_DONE + String.raw`(?:${SCHEDULE_VERBS})\b`, "i");
const RE_FIRST_PERSON_GENERIC = new RegExp(FIRST_PERSON_DONE + String.raw`(?:${GENERIC_VERBS})\b`, "i");
const RE_PASSIVE = new RegExp(PASSIVE_DONE + PASSIVE_TARGET + String.raw`\b`, "i");
const RE_ON_THE_BOARD =
  /\b(?:you'?re|you\s+are|it'?s|it\s+is|that'?s|that\s+is|they'?re|they\s+are|job'?s|now|all|already|is|are)\s+(?:now\s+|all\s+|already\s+|officially\s+)*(?:on|onto|in)\s+(?:the|our|your)\s+(?:schedule|board|calendar|books?)\b/i;
const RE_STANDALONE =
  /^(?:\W*)(?:(?:re-?)?scheduled|booked|locked\s+in|moved|rescheduled|confirmed|done|all\s+set|you'?re\s+all\s+set|consider\s+it\s+done|perfect[,!.]?\s+(?:it'?s|that'?s)\s+(?:set|in|booked|scheduled|on))\b/i;
const RE_GOT_YOU_DOWN = /\b(?:got|have|put)\s+(?:you|it|that|this|them|the\s+\w+(?:\s+\w+)?)\s+down\s+for\b/i;
const RE_ALL_SET_FOR = /\ball\s+set\s+for\b/i;

/** Split text into sentences, keeping whether each one is a question. */
function sentences(text: string): Array<{ s: string; question: boolean }> {
  const out: Array<{ s: string; question: boolean }> = [];
  const re = /[^.!?\n]+[.!?]*/g;
  for (const m of text.matchAll(re)) {
    // Don't split on the dot in "12.7" or "a.m." badly enough to matter; good enough for SMS.
    const raw = m[0].trim();
    if (!raw) continue;
    out.push({ s: raw, question: raw.endsWith("?") });
  }
  return out;
}

function normalizeQuotes(text: string): string {
  return text.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

/**
 * True when `text` tells the texter that something was scheduled, booked, locked
 * in, put on the board/schedule/calendar, moved or rescheduled (any tense that
 * reports it as done or in progress). Questions ("Should I schedule it?") and
 * negations ("I haven't scheduled it") are not claims.
 */
export function claimsScheduleChange(text: string | null | undefined): boolean {
  if (!text) return false;
  const clean = normalizeQuotes(text);
  for (const { s: whole, question } of sentences(clean)) {
    if (question) continue;
    // "Once you send the address, I'll ..." / "When it's scheduled, Preston will text you."
    // Only the main clause after a leading conditional counts.
    const s = whole.replace(/^\W*(?:when|once|after|if|as\s+soon\s+as|until|before)\b[^,]*,\s*/i, "");
    if (RE_STANDALONE.test(s)) return true;
    if (RE_FIRST_PERSON_SCHEDULE.test(s)) return true;
    if (RE_PASSIVE.test(s) && (SCHEDULE_CONTEXT.test(s) || /\b(?:re-?)?scheduled|booked|locked\s+in|on\s+the\s+(?:schedule|board|calendar)/i.test(s))) return true;
    if (RE_ON_THE_BOARD.test(s)) return true;
    if (RE_GOT_YOU_DOWN.test(s) || RE_ALL_SET_FOR.test(s)) return true;
    if (RE_FIRST_PERSON_GENERIC.test(s) && SCHEDULE_CONTEXT.test(s)) return true;
  }
  return false;
}

export type GuardResult = { reply: string; replaced: boolean };

/**
 * Decide the outbound text when no tool wrote to the database this turn.
 * `aiText` is the model's own free text. If it claims a schedule change it is
 * replaced with HONEST_NO_CHANGE_REPLY.
 */
export function guardFreeTextReply(aiText: string | null | undefined, fallback = "I am processing your request."): GuardResult {
  const text = (aiText ?? "").trim();
  if (!text) return { reply: fallback, replaced: false };
  if (claimsScheduleChange(text)) return { reply: HONEST_NO_CHANGE_REPLY, replaced: true };
  return { reply: text, replaced: false };
}
