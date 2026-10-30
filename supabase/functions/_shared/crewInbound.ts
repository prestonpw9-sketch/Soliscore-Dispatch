/**
 * The dispatch Twilio number is shared:
 *   - superintendent inbound → job-booking AI (this function)
 *   - in-app Copilot contact_crew / emergency page → notifyCrew (send-outbound-sms / gemini-chat)
 *
 * Do NOT run the superintendent job logger on plumber replies to those outbound texts.
 * Do NOT skip when the last outbound was a booking confirmation or HELP/STOP — the
 * dispatcher (who is also in the plumber directory) texts jobs in on the same line.
 */

export const CREW_REPLY_WINDOW_MS = 12 * 60 * 60 * 1000;

export function isCrewDispatchPage(message: string | null | undefined): boolean {
  if (!message) return false;
  const t = message.toLowerCase();
  return (
    (t.includes("urgent") && t.includes("solidcore emergency")) ||
    t.includes("reply to dispatch when en route")
  );
}

export function isSuperintendentAiOrComplianceOutbound(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  const t = message.toLowerCase();
  return (
    t.includes("solidcore plumbing, llc") ||
    t.includes("you are unsubscribed") ||
    t.includes("you are opted back in") ||
    t.includes("msg&data rates may apply") ||
    (t.includes("i've put ") && t.includes("on the schedule")) ||
    t.includes("i've locked in") ||
    t.includes("on the schedule board") ||
    t.includes("urgent: emergency flagged") ||
    t.includes("preston will follow up") ||
    t.includes("preston will review") ||
    t.startsWith("system offline:")
  );
}

export function shouldSkipSuperintendentAi(opts: {
  isDirectoryCrew: boolean;
  isOnCall: boolean;
  lastOutboundAt: string | null | undefined;
  lastOutboundMessage?: string | null;
  nowMs?: number;
  windowMs?: number;
}): boolean {
  if (!opts.isDirectoryCrew) return false;
  if (opts.isOnCall) return true;
  if (!opts.lastOutboundAt) return false;
  const sent = Date.parse(opts.lastOutboundAt);
  if (Number.isNaN(sent)) return false;
  const now = opts.nowMs ?? Date.now();
  const windowMs = opts.windowMs ?? CREW_REPLY_WINDOW_MS;
  if (!(now - sent >= 0 && now - sent < windowMs)) return false;

  // Only suppress job AI for replies to an actual crew/emergency page.
  // Booking confirmations, HELP/STOP, and clarifying questions must keep
  // running — the dispatcher is in the plumber directory and texts jobs in
  // on this same number.
  return isCrewDispatchPage(opts.lastOutboundMessage);
}
