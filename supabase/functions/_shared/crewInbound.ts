/**
 * The dispatch Twilio number is shared:
 *   - superintendent inbound → job-booking AI (this function)
 *   - in-app Copilot contact_crew / emergency page → notifyCrew (send-outbound-sms / gemini-chat)
 *
 * Do NOT run the superintendent job logger on plumber replies to those outbound texts.
 */

export const CREW_REPLY_WINDOW_MS = 12 * 60 * 60 * 1000;

export function shouldSkipSuperintendentAi(opts: {
  isDirectoryCrew: boolean;
  isOnCall: boolean;
  lastOutboundAt: string | null | undefined;
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
  return now - sent >= 0 && now - sent < windowMs;
}
