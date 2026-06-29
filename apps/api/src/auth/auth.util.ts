import { BadRequestException } from "@nestjs/common";
import type { AuthUser } from "@flowpedia/shared";
import { User } from "./user.entity";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

export function normalizeEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

export function normalizeUsername(username: string): string {
  return (username ?? "").trim().toLowerCase();
}

export function assertValidEmail(email: string): void {
  if (!EMAIL_RE.test(email)) {
    throw new BadRequestException("Invalid email address.");
  }
}

export function assertValidUsername(username: string): void {
  if (!USERNAME_RE.test(username)) {
    throw new BadRequestException(
      "Username must be 3–30 characters: lowercase letters, digits, '.' or '_'.",
    );
  }
}

export function assertValidPassword(password: string): void {
  if (typeof password !== "string" || password.length < 8) {
    throw new BadRequestException("Password must be at least 8 characters.");
  }
}

/** Strip an entity to its public, safe-to-expose shape (never the hash). */
export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    isPrivate: user.isPrivate,
    createdAt: user.createdAt.toISOString(),
  };
}
