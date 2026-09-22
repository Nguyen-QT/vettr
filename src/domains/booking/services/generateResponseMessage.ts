// Pure business logic (CLAUDE.md): produces the copy an artist pastes back
// to a client after triaging their request. No I/O, no formatting decisions
// beyond the message text itself.
export type BookingRequestOutcome =
  | "APPROVED"
  | "DECLINED"
  | "AWAITING_SLOT_CONFIRMATION";

const RESPONSE_MESSAGES: Record<BookingRequestOutcome, string> = {
  APPROVED:
    "Hi! Great news — your request has been approved. We'll be in touch shortly to lock in your appointment time. Thanks so much!",
  DECLINED:
    "Hi! Thanks so much for your interest, but we're not able to take this project on right now. We wish you the best finding the right artist for it!",
  // 4.1f: the artist's chosen duration spills into a second slot, so
  // nothing is booked yet -- this needs off-platform confirmation first.
  AWAITING_SLOT_CONFIRMATION:
    "Hi! Your piece is likely to need a bit more time than a single slot, so we'll reach out directly to confirm the exact timing before locking anything in. Thanks for your patience!",
};

export function generateResponseMessage(
  outcome: BookingRequestOutcome
): string {
  return RESPONSE_MESSAGES[outcome];
}
