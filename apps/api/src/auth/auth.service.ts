import { randomBytes } from "crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import type { Repository } from "typeorm";
import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from "@flowpedia/shared";
import { DatabaseService } from "../database/database.service";
import { MailService } from "../mail/mail.service";
import { User } from "./user.entity";
import {
  assertValidEmail,
  assertValidPassword,
  assertValidUsername,
  normalizeEmail,
  normalizeUsername,
  toAuthUser,
} from "./auth.util";

const BCRYPT_ROUNDS = 10;
const RESET_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days, like speciarium.

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /** Accounts require a database; surface a clear error when none is connected. */
  private users(): Repository<User> {
    const repo = this.db.repo(User);
    if (!repo) {
      throw new ServiceUnavailableException(
        "Accounts require a database. Set DATABASE_URL (pnpm infra:up).",
      );
    }
    return repo;
  }

  async register(body: RegisterRequest): Promise<AuthResponse> {
    const email = normalizeEmail(body.email);
    const username = normalizeUsername(body.username);
    assertValidEmail(email);
    assertValidUsername(username);
    assertValidPassword(body.password);

    const repo = this.users();
    if (await repo.findOne({ where: { email } })) {
      throw new ConflictException("Email already in use.");
    }
    if (await repo.findOne({ where: { username } })) {
      throw new ConflictException("Username is already taken.");
    }

    const user = repo.create({
      email,
      username,
      displayName: body.displayName?.trim() || username,
      passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
      isPrivate: false,
      passwordResetTokenHash: null,
      passwordResetExpires: null,
    });
    await repo.save(user);
    return this.authResponse(user);
  }

  async login(body: LoginRequest): Promise<AuthResponse> {
    const repo = this.users();
    const identifier = normalizeEmail(body.identifier); // email or username, both lowercased
    const user = await repo.findOne({
      where: [{ email: identifier }, { username: identifier }],
    });
    if (!user || !(await bcrypt.compare(body.password ?? "", user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials.");
    }
    return this.authResponse(user);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.users().findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("Account not found.");
    }
    return toAuthUser(user);
  }

  /**
   * Best-effort and non-revealing: always resolves the same way whether or not
   * the email exists, so it can't be used to enumerate accounts.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const message = "If an account exists for that email, a reset link has been sent.";
    const repo = this.db.repo(User);
    if (!repo) {
      return { message };
    }
    const user = await repo.findOne({ where: { email: normalizeEmail(email) } });
    if (!user) {
      return { message };
    }

    const token = randomBytes(32).toString("hex");
    user.passwordResetTokenHash = await bcrypt.hash(token, BCRYPT_ROUNDS);
    user.passwordResetExpires = new Date(Date.now() + RESET_TTL_MS);
    await repo.save(user);

    const uid = Buffer.from(user.id).toString("base64url");
    const base = this.config.get<string>("APP_URL", "http://localhost:3000");
    await this.mail.sendPasswordReset(user.email, user.displayName, `${base}/reset/${uid}/${token}`);
    return { message };
  }

  async resetPassword(body: ResetPasswordRequest): Promise<{ message: string }> {
    assertValidPassword(body.newPassword);
    const repo = this.users();

    let userId: string;
    try {
      userId = Buffer.from(body.uid ?? "", "base64url").toString("utf8");
    } catch {
      throw new BadRequestException("Invalid or expired reset link.");
    }

    const user = userId ? await repo.findOne({ where: { id: userId } }) : null;
    const expires = user?.passwordResetExpires?.getTime() ?? 0;
    if (!user || !user.passwordResetTokenHash || expires < Date.now()) {
      throw new BadRequestException("Invalid or expired reset link.");
    }
    if (!(await bcrypt.compare(body.token ?? "", user.passwordResetTokenHash))) {
      throw new BadRequestException("Invalid or expired reset link.");
    }

    user.passwordHash = await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS);
    user.passwordResetTokenHash = null;
    user.passwordResetExpires = null;
    await repo.save(user);
    return { message: "Password updated. You can now sign in." };
  }

  private authResponse(user: User): AuthResponse {
    const token = this.jwt.sign({ sub: user.id });
    return { token, user: toAuthUser(user) };
  }
}
