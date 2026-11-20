import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isPureAcknowledgement,
  isTapbackOrReaction,
  normalizeSmsForReaction,
  shouldSuppressReactionReply,
} from "./smsReaction.ts";

/** Exact inbound body from the Nov 18, 2026 crew thumbs-up (hex-verified). */
const CREW_THUMBS_UP =
  "\u200A\u200B👍\u200B to “\u200ATomorrow 11/19/2026 new hours winter hours in effect 7am to 3:30pm back to 5 day's a week eight hour day's\u200A”\u200A";

Deno.test("normalizes hair spaces, zero-width spaces, and curly quotes", () => {
  assertEquals(
    normalizeSmsForReaction(CREW_THUMBS_UP),
    "👍 to \" Tomorrow 11/19/2026 new hours winter hours in effect 7am to 3:30pm back to 5 day's a week eight hour day's \"",
  );
});

Deno.test("detects the production thumbs-up tapback format", () => {
  assertEquals(isTapbackOrReaction(CREW_THUMBS_UP), true);
  assertEquals(shouldSuppressReactionReply(CREW_THUMBS_UP, false), true);
  assertEquals(shouldSuppressReactionReply(CREW_THUMBS_UP, true), true);
});

Deno.test("detects common iMessage / Android tapback phrases", () => {
  const samples = [
    'Liked "Tomorrow 11/19/2026 new hours"',
    'Loved “new winter hours”',
    'Laughed at "eight hour day\'s"',
    'Emphasized "7am to 3:30pm"',
    'Disliked "the new hours"',
    'Questioned "back to 5 days"',
    'Reacted 👍 to "Tomorrow 11/19/2026 new hours"',
    'Reacted ❤️ to "the schedule"',
    "Removed a like",
    'Removed a like from "Tomorrow 11/19/2026 new hours"',
  ];
  for (const s of samples) {
    assertEquals(isTapbackOrReaction(s), true, `expected tapback: ${s}`);
    assertEquals(shouldSuppressReactionReply(s, false), true, s);
  }
});

Deno.test("does not treat a real sentence that starts with Liked as a tapback", () => {
  const real = "Liked the new hours, can we start at 6 instead?";
  assertEquals(isTapbackOrReaction(real), false);
  assertEquals(shouldSuppressReactionReply(real, true), false);
});

Deno.test("crew short acknowledgements and emoji-only are suppressed", () => {
  const acks = ["ok", "OK.", "okay!", "thanks", "Thank you", "got it", "got it 👍", "👍", "👍👍", "noted", "copy that", "sounds good", "10-4"];
  for (const s of acks) {
    assertEquals(isPureAcknowledgement(s), true, `expected ack: ${s}`);
    assertEquals(shouldSuppressReactionReply(s, true), true, s);
  }
});

Deno.test("customer short acknowledgements still reach the AI (not tapbacks)", () => {
  for (const s of ["ok", "thanks", "got it", "👍"]) {
    assertEquals(isTapbackOrReaction(s), false, s);
    assertEquals(shouldSuppressReactionReply(s, false), false, s);
  }
});

Deno.test("real crew questions are not suppressed", () => {
  const questions = [
    "What time do we start tomorrow?",
    "Need a toilet at lot 12 Stone Canyon",
    "thanks, can we start at 6?",
    "on my way to Kachina",
  ];
  for (const s of questions) {
    assertEquals(shouldSuppressReactionReply(s, true), false, s);
    assertEquals(shouldSuppressReactionReply(s, false), false, s);
  }
});

Deno.test("empty or whitespace is not a tapback or ack", () => {
  assertEquals(isTapbackOrReaction("   "), false);
  assertEquals(isPureAcknowledgement(""), false);
  assertEquals(shouldSuppressReactionReply("  ", true), false);
});
