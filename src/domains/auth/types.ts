// Pure domain contracts for the auth bounded context. Deliberately
// standalone TypeScript -- no z.infer, no import from auth.schema.ts --
// kept structurally in sync with auth.schema.ts by hand, same
// convention as booking/scheduling.

export interface LoginInput {
  email: string;
  password: string;
}

// sessionId doubles as the opaque session-cookie value -- Session rows
// are keyed by an unguessable cuid, so no separate token field is
// needed (CLAUDE.md 5.1.2).
export type LoginResult =
  | { success: true; sessionId: string; expiresAt: Date; artistId: string }
  | { success: false; error: string };

// loginClient's result (CLAUDE.md 5.2) -- ends in an authenticated
// session for a specific ClientProfile.
export type ClientAuthResult =
  | { success: true; sessionId: string; expiresAt: Date; clientProfileId: string }
  | { success: false; error: string };

// loginClient (CLAUDE.md 27.3.2.7) -- an unverified account with the
// correct password gets no session, only a pointer to the verify step.
export type ClientLoginResult =
  | ClientAuthResult
  | { success: true; pendingVerification: true; clientProfileId: string };

// signupClient (CLAUDE.md 27.3.2.4) -- deliberately no session fields:
// a fresh signup only ever gets a session via verifyEmailCode, after
// proving ownership of the email.
export type SignupClientResult =
  | { success: true; pendingVerification: true; clientProfileId: string }
  | { success: false; error: string };

// verifyEmailCode (CLAUDE.md 27.3.2.5) -- resolves to ClientAuthResult:
// a correct code *and* password end in an authenticated session
// (27.3.2.8 -- the password closes the pre-verification squatting path).
export interface VerifyEmailCodeInput {
  email: string;
  code: string;
  password: string;
}

// sendVerificationEmail (CLAUDE.md 27.3.2.3) -- no user-facing `error`
// field: the caller (signupClient/resendVerificationCode) always
// proceeds to the same pending-verification/generic result either way,
// so a failed send is only ever surfaced as "use the resend button".
export type SendVerificationEmailResult = { success: true } | { success: false };


export interface ResendVerificationCodeInput {
  email: string;
}

export type ResendVerificationCodeResult = { success: true } | { success: false; error: string };

// issueEmailOtp (54.3.2.4) -- literal union kept structurally in sync by
// hand with the EmailOtpPurpose enum in schema.prisma.
export type EmailOtpPurposeValue = "CLIENT_SIGN_IN" | "BOOKING_SUBMISSION";

export interface IssueEmailOtpInput {
  email: string;
  purpose: EmailOtpPurposeValue;
}

// The plaintext code is returned only so the caller can email it; no
// `error` field -- a blocked send (cooldown, cap, lost race) is a normal
// outcome the caller answers with the same generic "code sent" copy.
export type IssueEmailOtpResult = { issued: true; code: string } | { issued: false };

// checkEmailOtpCode (54.3.2.5)
export interface CheckEmailOtpCodeInput {
  email: string;
  purpose: EmailOtpPurposeValue;
  code: string;
}

// A match is not a consume: the caller consumes inside its own
// transaction with an updateMany guarded on `challengeId` + `codeHash`,
// so a concurrent consume or a re-issue in between makes it a no-op.
// Every rejection is the same `{ valid: false }` so callers can't branch
// on (or leak) why a code failed.
export type CheckEmailOtpCodeResult =
  | { valid: true; challengeId: string; codeHash: string }
  | { valid: false };

// requestClientSignInCode (54.3.2.6)
export interface RequestClientSignInCodeInput {
  email: string;
}

// One result for every outcome -- eligible, ineligible, cooldown, cap,
// failed or timed-out send -- so the response can't enumerate client
// accounts. Only a DB failure differs, with a retryable message.
export type RequestClientSignInCodeResult = { success: true } | { success: false; error: string };

// signInClientWithEmailOtp (54.3.2.7) -- resolves to ClientAuthResult, the
// same shape verifyEmailCode returns, so the action sets the cookie the
// same way.
export interface SignInClientWithEmailOtpInput {
  email: string;
  code: string;
}


// recordAuditEvent (CLAUDE.md 27.5.2.1) -- literal unions kept structurally
// in sync by hand with the AuditEvent* enums in schema.prisma.
export type AuditEventTypeValue =
  | "LOGIN_FAILED"
  | "ROLE_SWITCH"
  | "CLIENT_PROFILE_LINK"
  | "EMAIL_OTP_SIGN_IN";

export type AuditEventOutcomeValue = "SUCCESS" | "REJECTED";

export type AuditReasonCodeValue =
  | "ACCOUNT_NOT_FOUND"
  | "ROLE_MISMATCH"
  | "INVALID_PASSWORD"
  | "NOT_LINKED_TO_ARTIST"
  | "NOT_LINKED_TO_CLIENT"
  | "ROLE_SWITCHED"
  | "ALREADY_HAS_CLIENT_PROFILE"
  | "CLIENT_PROFILE_ALREADY_LINKED"
  | "CLIENT_PROFILE_CREATED"
  | "CLIENT_PROFILE_MATCHED_EXISTING"
  | "INVALID_EMAIL_OTP"
  | "SIGNED_IN_WITH_EMAIL_OTP";

export interface RecordAuditEventInput {
  eventType: AuditEventTypeValue;
  outcome: AuditEventOutcomeValue;
  reasonCode: AuditReasonCodeValue;
  accountId?: string;
  attemptedEmail?: string;
  targetRole?: "ARTIST" | "CLIENT";
}

export interface SessionWithAccount {
  sessionId: string;
  expiresAt: Date;
  accountId: string;
  role: "ARTIST" | "CLIENT";
  activeRole: "ARTIST" | "CLIENT";
  artistId: string | null;
  clientProfileId: string | null;
}

// switchActiveRole (CLAUDE.md 26.1.2.5) -- a session may only switch into
// a role its account is actually linked to, so the caller (the future
// switchActiveRoleAction, 26.1.3.2) needs both ids back to know which
// route to redirect into.
export type SwitchActiveRoleResult =
  | {
      success: true;
      activeRole: "ARTIST" | "CLIENT";
      artistId: string | null;
      clientProfileId: string | null;
    }
  | { success: false; error: string };
  
// "Become a client" input (CLAUDE.md 26.1.2.4) -- instagramHandle is
// required (CLAUDE.md's visual-screening mandate applies to any
// ClientProfile), the rest is optional onboarding detail the account
// may already have supplied via a prior guest booking.
export interface LinkOrCreateClientProfileInput {
  instagramHandle: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: Date;
}

export type LinkOrCreateClientProfileResult =
  | { success: true; clientProfileId: string }
  | { success: false; error: string };


export interface SetUpClientProfileFormValues {
  instagramHandle: string;
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // "" when unset
}

export type SetUpClientProfileFormField = keyof SetUpClientProfileFormValues;

export interface SetUpClientProfileFormProps {
  values: SetUpClientProfileFormValues;
  onFieldChange: (field: SetUpClientProfileFormField, value: string) => void;
  errors?: Partial<Record<SetUpClientProfileFormField, { message?: string } | undefined>>;
  serverError?: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isPending?: boolean;
}

export interface VerifyEmailCodeFormProps {
  code: string;
  onCodeChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onResend: () => void;
  resendCooldownSeconds: number; // 0 = resend available
  isPending?: boolean;
  isResending?: boolean;
  error?: string;
  resendMessage?: string;
}

// OtpCodeInput (54.3.4.1) -- a field fragment, not a form: ClientSignInForm
// (54.3.4.2) and the booking wizard's verify step (54.5.4.3) own the <form>
// and its submit. `code` arrives already sanitized; onCodeChange gets the raw
// input value.
export interface OtpCodeInputProps {
  code: string;
  onCodeChange: (value: string) => void;
  onResend: () => void;
  resendCooldownSeconds: number; // 0 = resend available
  isResending?: boolean;
  error?: string;
  resendMessage?: string;
}

export interface RoleSwitcherProps {
  activeRole: "ARTIST" | "CLIENT";
  isVisible: boolean;
  onSwitch: (targetRole: "ARTIST" | "CLIENT") => void;
  isPending?: boolean;
}
