import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { User } from "./user.entity";

/** Minimal in-memory stand-in for the TypeORM User repository. */
function fakeUserRepo() {
  const rows: User[] = [];
  let seq = 0;
  return {
    rows,
    create: (data: Partial<User>) => ({ ...data }) as User,
    save: async (user: User) => {
      if (!user.id) {
        user.id = `id-${(seq += 1)}`;
      }
      if (!user.createdAt) {
        user.createdAt = new Date("2026-01-01T00:00:00.000Z");
      }
      const idx = rows.findIndex((r) => r.id === user.id);
      if (idx >= 0) rows[idx] = user;
      else rows.push(user);
      return user;
    },
    delete: async ({ id }: { id: string }) => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx >= 0) rows.splice(idx, 1);
      return { affected: idx >= 0 ? 1 : 0 };
    },
    findOne: async ({ where }: { where: Partial<User> | Partial<User>[] }) => {
      const conds = Array.isArray(where) ? where : [where];
      return (
        rows.find((r) =>
          conds.some((c) =>
            Object.entries(c).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v),
          ),
        ) ?? null
      );
    },
  };
}

function makeService() {
  const repo = fakeUserRepo();
  const interactions = { delete: jest.fn(async () => ({ affected: 0 })) };
  const mail = {
    sendPasswordReset: jest.fn((_to: string, _name: string, _link: string) =>
      Promise.resolve<undefined>(undefined),
    ),
  };
  // Route by entity: User → the user repo, anything else → the interactions stub.
  const db = { repo: (entity: unknown) => (entity === User ? repo : interactions), isReady: true };
  const jwt = { sign: jest.fn(() => "jwt-token") };
  const config = { get: (_key: string, def?: unknown) => def };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AuthService(db as any, jwt as any, mail as any, config as any);
  return { service, repo, mail, interactions };
}

const VALID = { email: "JulSql@Example.com", username: "JulSql", password: "s3cretpw!" };

describe("AuthService", () => {
  it("registers a user, normalizing email/username and never leaking the hash", async () => {
    const { service } = makeService();
    const res = await service.register(VALID);

    expect(res.token).toBe("jwt-token");
    expect(res.user.email).toBe("julsql@example.com");
    expect(res.user.username).toBe("julsql");
    expect(res.user.displayName).toBe("julsql");
    expect(res.user.isPrivate).toBe(false);
    expect(res.user).not.toHaveProperty("passwordHash");
  });

  it("rejects duplicate email and taken username", async () => {
    const { service } = makeService();
    await service.register(VALID);
    await expect(service.register({ ...VALID, username: "other" })).rejects.toThrow(
      ConflictException,
    );
    await expect(service.register({ ...VALID, email: "new@example.com" })).rejects.toThrow(
      ConflictException,
    );
  });

  it("rejects an invalid username and a too-short password", async () => {
    const { service } = makeService();
    await expect(service.register({ ...VALID, username: "a b" })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.register({ ...VALID, password: "short" })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("logs in by email or username, and rejects a wrong password", async () => {
    const { service } = makeService();
    await service.register(VALID);

    await expect(service.login({ identifier: "julsql", password: "s3cretpw!" })).resolves.toEqual(
      expect.objectContaining({ token: "jwt-token" }),
    );
    await expect(
      service.login({ identifier: "JulSql@Example.com", password: "s3cretpw!" }),
    ).resolves.toBeTruthy();
    await expect(service.login({ identifier: "julsql", password: "nope" })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("forgot-password is non-revealing and emails a reset link only for real accounts", async () => {
    const { service, mail } = makeService();
    await service.register(VALID);

    await service.forgotPassword("ghost@example.com");
    expect(mail.sendPasswordReset).not.toHaveBeenCalled();

    const res = await service.forgotPassword("julsql@example.com");
    expect(res.message).toMatch(/if an account exists/i);
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);
    const link = mail.sendPasswordReset.mock.calls[0][2];
    expect(link).toMatch(/\/reset\/[^/]+\/[a-f0-9]{64}$/);
  });

  it("resets the password with a valid link, then refuses the reused/invalid token", async () => {
    const { service, mail } = makeService();
    await service.register(VALID);
    await service.forgotPassword("julsql@example.com");

    const link = mail.sendPasswordReset.mock.calls[0][2];
    const [, uid, token] = link.match(/\/reset\/([^/]+)\/([a-f0-9]{64})$/)!;

    await expect(
      service.resetPassword({ uid, token, newPassword: "brandNewpw1" }),
    ).resolves.toEqual(expect.objectContaining({ message: expect.any(String) }));

    // New password works, old one no longer does.
    await expect(
      service.login({ identifier: "julsql", password: "brandNewpw1" }),
    ).resolves.toBeTruthy();
    await expect(service.login({ identifier: "julsql", password: "s3cretpw!" })).rejects.toThrow(
      UnauthorizedException,
    );

    // Token is single-use.
    await expect(
      service.resetPassword({ uid, token, newPassword: "anotherpw12" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("updates profile fields and enforces username uniqueness + privacy", async () => {
    const { service } = makeService();
    const { user } = await service.register(VALID);
    await service.register({ email: "b@example.com", username: "taken", password: "s3cretpw!" });

    const updated = await service.updateProfile(user.id, {
      displayName: "Jul",
      username: "julnew",
      isPrivate: true,
    });
    expect(updated.username).toBe("julnew");
    expect(updated.displayName).toBe("Jul");
    expect(updated.isPrivate).toBe(true);

    await expect(
      service.updateProfile(user.id, { username: "taken" }),
    ).rejects.toThrow(ConflictException);
    await expect(service.updateProfile(user.id, { username: "a b" })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("changes the password only with the correct current one", async () => {
    const { service } = makeService();
    const { user } = await service.register(VALID);

    await expect(
      service.changePassword(user.id, { currentPassword: "wrong", newPassword: "newpassword1" }),
    ).rejects.toThrow(UnauthorizedException);

    await service.changePassword(user.id, {
      currentPassword: "s3cretpw!",
      newPassword: "newpassword1",
    });
    await expect(
      service.login({ identifier: "julsql", password: "newpassword1" }),
    ).resolves.toBeTruthy();
  });

  it("wipes data without deleting the account, and deletes the account entirely", async () => {
    const { service, interactions } = makeService();
    const { user } = await service.register(VALID);

    await service.wipeData(user.id);
    expect(interactions.delete).toHaveBeenCalledWith({ userId: user.id });
    // Account still usable after a wipe.
    await expect(service.login({ identifier: "julsql", password: "s3cretpw!" })).resolves.toBeTruthy();

    await service.deleteAccount(user.id);
    await expect(service.login({ identifier: "julsql", password: "s3cretpw!" })).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.me(user.id)).rejects.toThrow(NotFoundException);
  });
});
