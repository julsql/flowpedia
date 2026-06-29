/** Public, safe-to-expose shape of an account (never carries the password hash). */
export interface AuthUser {
  id: string;
  email: string;
  /** Unique handle (lowercased), e.g. "julsql". */
  username: string;
  /** Display name shown in the UI; defaults to the username. */
  displayName: string;
  /** Private accounts hide their profile/stories from non-followers. */
  isPrivate: boolean;
  /** ISO timestamp. */
  createdAt: string;
}

/** Returned by register/login — a bearer token plus the account. */
export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}

export interface LoginRequest {
  /** Email or username. */
  identifier: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  /** Base64url-encoded user id from the reset link. */
  uid: string;
  token: string;
  newPassword: string;
}
