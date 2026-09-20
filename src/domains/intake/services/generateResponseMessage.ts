// Pure business logic (CLAUDE.md): produces the copy an artist pastes back
// to a client after triaging their request. No I/O, no formatting decisions
// beyond the message text itself.
export type IntakeRequestOutcome = "APPROVED" | "DECLINED";

const RESPONSE_MESSAGES: Record<IntakeRequestOutcome, string> = {
  APPROVED:
    "Hi! Great news — your request has been approved. We'll be in touch shortly to lock in your appointment time. Thanks so much!",
  DECLINED:
    "Hi! Thanks so much for your interest, but we're not able to take this project on right now. We wish you the best finding the right artist for it!",
};

export function generateResponseMessage(
  outcome: IntakeRequestOutcome
): string {
  return RESPONSE_MESSAGES[outcome];
}
