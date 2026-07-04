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
  /** Notify me when someone follows / requests to follow me. */
  notifyFollows: boolean;
  /** Notify me when I receive a message / shared page. */
  notifyMessages: boolean;
  /** Notify me about stories from people I follow. */
  notifyStories: boolean;
  /** Show the "listen" (text-to-speech) button on articles. */
  ttsEnabled: boolean;
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

/** Partial account update (any subset). Username must stay unique. */
export interface UpdateProfileRequest {
  displayName?: string;
  username?: string;
  isPrivate?: boolean;
  notifyFollows?: boolean;
  notifyMessages?: boolean;
  notifyStories?: boolean;
  ttsEnabled?: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Request a change of email — a confirmation link is sent to the new address. */
export interface ChangeEmailRequest {
  newEmail: string;
}

/** Confirm a pending email change from the emailed link. */
export interface ConfirmEmailRequest {
  /** Base64url-encoded user id from the confirmation link. */
  uid: string;
  token: string;
}

/** Kinds of saved library entry, persisted per account. */
export type LibraryKind = "like" | "save" | "share" | "read";

export interface LibraryItemRequest {
  articleId: string;
  kind: LibraryKind;
  /** Optional folder for a bookmark (kind "save"); empty/undefined = unfiled. */
  folder?: string;
}

/** Bulk add (used to reconcile a device's local library on sign-in). */
export interface BulkLibraryRequest {
  items: LibraryItemRequest[];
}

/** Clear a whole kind at once (e.g. "clear reading history"). */
export interface ClearLibraryRequest {
  kind: LibraryKind;
}

/** The account's library as article-id lists, most recent first. */
export interface LibrarySnapshot {
  liked: string[];
  saved: string[];
  shared: string[];
  read: string[];
  /** Distinct bookmark folder names the account has. */
  folders: string[];
  /** Bookmark → folder, for saves that are filed under one. */
  savedFolders: Record<string, string>;
}

/** Minimal, safe-to-expose user shape for social lists/cards. */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  isPrivate: boolean;
}

/** Relationship of the viewer to a profile. */
export type FollowState = "none" | "pending" | "active";

export interface FollowResult {
  /** The viewer's resulting state toward the target. */
  state: FollowState;
}

/** A reshared article, visible to followers for 24h ("story"). */
export interface CreateStoryRequest {
  articleId: string;
  title?: string;
  image?: string;
}

export interface StoryItem {
  id: string;
  articleId: string;
  title?: string;
  image?: string;
  /** ISO timestamp. */
  createdAt: string;
}

/** One author's active stories (the unit behind a home-screen bubble). */
export interface StoryGroup {
  user: PublicUser;
  items: StoryItem[];
}

/** A profile as seen by a viewer (privacy-aware). */
export interface ProfileView {
  user: PublicUser;
  followers: number;
  following: number;
  /** Viewer → target follow state. */
  state: FollowState;
  /** Target → viewer (lets the UI show "Follows you"). */
  followsYou: boolean;
  isSelf: boolean;
  /** Whether the viewer may see this account's content (public, self, or follower). */
  canViewContent: boolean;
}
