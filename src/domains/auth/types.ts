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

// signupClient/loginClient share this shape (CLAUDE.md 5.2) -- both
// end in an authenticated session for a specific ClientProfile.
export type ClientAuthResult =
  | { success: true; sessionId: string; expiresAt: Date; clientProfileId: string }
  | { success: false; error: string };

// sendVerificationEmail (CLAUDE.md 27.3.2.3) -- no user-facing `error`
// field: the caller (signupClient/resendVerificationCode) always
// proceeds to the same pending-verification/generic result either way,
// so a failed send is only ever surfaced as "use the resend button".
export type SendVerificationEmailResult = { success: true } | { success: false };

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

export interface RoleSwitcherProps {
  activeRole: "ARTIST" | "CLIENT";
  isVisible: boolean;
  onSwitch: (targetRole: "ARTIST" | "CLIENT") => void;
  isPending?: boolean;
}