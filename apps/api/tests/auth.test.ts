import request from "supertest";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountStatus, ErrorCode, HttpStatus, Role } from "@lofticore/shared";
import { createApp } from "../src/app";
import { connectDb, disconnectDb } from "../src/db/connect";
import { outbox } from "../src/lib/mailer";
import { hashPassword } from "../src/lib/password";
import { Session } from "../src/modules/auth/session.model";
import { User } from "../src/modules/users/user.model";

vi.mock("../src/modules/auth/google", () => ({
  verifyGoogleIdToken: vi.fn(async (token: string) => {
    if (token !== "good-google-token-0000000") {
      // same error the real verifier throws for a token Google rejects
      const { AppError } = await import("../src/lib/app-error");
      throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_TOKEN_INVALID, "bad token");
    }
    return { googleId: "g-123", email: "gina@example.com", name: "Gina Google" };
  }),
}));

const app = createApp();
const csrf = { "X-Requested-By": "lofticore" };
const PASSWORD = "Sofa12345";

beforeAll(connectDb);
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
});
beforeEach(async () => {
  outbox.length = 0;
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

const lastCode = () => /\b(\d{6})\b/.exec(outbox.at(-1)?.text ?? "")?.[1] ?? "";

async function signUp(email = "asha@example.com", role: string = Role.CUSTOMER) {
  await request(app)
    .post("/api/auth/register")
    .send({ name: "Asha Nair", email, password: PASSWORD, role })
    .expect(HttpStatus.CREATED);
  return request(app).post("/api/auth/verify-email").send({ email, code: lastCode() });
}

const refreshCookie = (res: request.Response) =>
  (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("lofticore_rt="))!;

describe("registration and email verification", () => {
  it("signs a customer up, verifies the OTP and logs them in", async () => {
    const res = await signUp();
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({
      role: Role.CUSTOMER,
      status: AccountStatus.ACTIVE,
      emailVerified: true,
    });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(refreshCookie(res)).toMatch(/HttpOnly/i);
  });

  it("puts sellers in pending approval", async () => {
    const res = await signUp("shop@example.com", Role.SELLER);
    expect(res.body.user.status).toBe(AccountStatus.PENDING_APPROVAL);
  });

  it("refuses self-signup as admin", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Mallory", email: "m@example.com", password: PASSWORD, role: "super_admin" });
    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it("rejects weak passwords with a field message", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Asha", email: "a@example.com", password: "short" });
    expect(res.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.fields.password).toBeTruthy();
  });

  it("rejects a wrong code, and locks the code after too many tries", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Asha Nair", email: "a@example.com", password: PASSWORD });
    const real = lastCode();
    const wrong = real === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/auth/verify-email")
        .send({ email: "a@example.com", code: wrong });
      expect(res.body.code).toBe(ErrorCode.AUTH_OTP_INVALID);
    }
    // the right code no longer works once attempts are used up
    const res = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "a@example.com", code: real });
    expect(res.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it("won't register an email that is already verified", async () => {
    await signUp();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Someone", email: "asha@example.com", password: PASSWORD });
    expect(res.status).toBe(HttpStatus.CONFLICT);
    expect(res.body.code).toBe(ErrorCode.USER_EMAIL_TAKEN);
  });
});

describe("login", () => {
  it("logs in with the right password", async () => {
    await signUp();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "asha@example.com", password: PASSWORD });
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    await signUp();
    const wrong = await request(app)
      .post("/api/auth/login")
      .send({ email: "asha@example.com", password: "Nope12345" });
    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ email: "who@example.com", password: "Nope12345" });
    expect(wrong.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(unknown.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it("locks the account after repeated wrong passwords", async () => {
    await signUp();
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/auth/login")
        .send({ email: "asha@example.com", password: "Nope12345" });
    }
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "asha@example.com", password: PASSWORD });
    expect(res.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });

  it("asks unverified users to verify first", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ name: "Asha Nair", email: "a@example.com", password: PASSWORD });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@example.com", password: PASSWORD });
    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.code).toBe(ErrorCode.AUTH_EMAIL_NOT_VERIFIED);
  });

  it("refuses blocked accounts", async () => {
    await signUp();
    await User.updateOne({ email: "asha@example.com" }, { status: AccountStatus.BLOCKED });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "asha@example.com", password: PASSWORD });
    expect(res.body.code).toBe(ErrorCode.AUTH_ACCOUNT_BLOCKED);
  });
});

describe("google sign-in", () => {
  it("creates a verified customer from a valid Google token", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({ idToken: "good-google-token-0000000" });
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.user).toMatchObject({
      email: "gina@example.com",
      emailVerified: true,
      role: Role.CUSTOMER,
    });
  });

  it("links to an existing email account instead of duplicating it", async () => {
    await signUp("gina@example.com");
    await request(app)
      .post("/api/auth/google")
      .send({ idToken: "good-google-token-0000000" })
      .expect(HttpStatus.OK);
    expect(await User.countDocuments({ email: "gina@example.com" })).toBe(1);
  });

  it("won't let team accounts skip two-factor by signing in with Google", async () => {
    await User.create({
      name: "Gina",
      email: "gina@example.com",
      role: Role.ADMIN,
      emailVerified: true,
      totpEnabled: true,
      totpSecret: "JBSWY3DPEHPK3PXP",
    });
    const res = await request(app)
      .post("/api/auth/google")
      .send({ idToken: "good-google-token-0000000" });
    expect(res.status).toBe(HttpStatus.FORBIDDEN);
    expect(res.body.accessToken).toBeUndefined();
  });

  it("rejects a bad Google token", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({ idToken: "bad-token-bad-token-bad-token" });
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
  });
});

describe("access and refresh tokens", () => {
  it("protects routes without a token", async () => {
    const res = await request(app).get("/api/users/me");
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.code).toBe(ErrorCode.AUTH_UNAUTHENTICATED);
  });

  it("returns the profile for a valid token", async () => {
    const { body } = await signUp();
    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${body.accessToken}`);
    expect(res.body.user.email).toBe("asha@example.com");
  });

  it("needs the CSRF header on refresh", async () => {
    const signed = await signUp();
    const res = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie(signed));
    expect(res.status).toBe(HttpStatus.FORBIDDEN);
  });

  it("rotates the refresh token on every refresh", async () => {
    const signed = await signUp();
    const res = await request(app)
      .post("/api/auth/refresh")
      .set(csrf)
      .set("Cookie", refreshCookie(signed));
    expect(res.status).toBe(HttpStatus.OK);
    expect(refreshCookie(res)).not.toBe(refreshCookie(signed));
  });

  it("lets two tabs refresh at the same moment", async () => {
    const signed = await signUp();
    const cookie = refreshCookie(signed);
    await request(app)
      .post("/api/auth/refresh")
      .set(csrf)
      .set("Cookie", cookie)
      .expect(HttpStatus.OK);
    // second tab still holds the previous token
    const second = await request(app).post("/api/auth/refresh").set(csrf).set("Cookie", cookie);
    expect(second.status).toBe(HttpStatus.OK);
    expect(second.body.accessToken).toBeTruthy();
  });

  it("kills the session when an old refresh token is replayed later", async () => {
    const signed = await signUp();
    const oldCookie = refreshCookie(signed);
    const rotated = await request(app).post("/api/auth/refresh").set(csrf).set("Cookie", oldCookie);
    // let the grace window pass
    await Session.updateMany({}, { prevValidUntil: new Date(Date.now() - 1000) });

    const replay = await request(app).post("/api/auth/refresh").set(csrf).set("Cookie", oldCookie);
    expect(replay.status).toBe(HttpStatus.UNAUTHORIZED);
    // the legitimate newer token is dead too - the whole session was revoked
    const after = await request(app)
      .post("/api/auth/refresh")
      .set(csrf)
      .set("Cookie", refreshCookie(rotated));
    expect(after.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it("logout ends the session", async () => {
    const signed = await signUp();
    const cookie = refreshCookie(signed);
    await request(app)
      .post("/api/auth/logout")
      .set(csrf)
      .set("Cookie", cookie)
      .expect(HttpStatus.NO_CONTENT);
    const res = await request(app).post("/api/auth/refresh").set(csrf).set("Cookie", cookie);
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
  });
});

describe("devices", () => {
  it("lists sessions and revokes one without touching the others", async () => {
    const first = await signUp();
    const second = await request(app)
      .post("/api/auth/login")
      .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36")
      .send({ email: "asha@example.com", password: PASSWORD });

    const list = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${first.body.accessToken}`);
    expect(list.body.sessions).toHaveLength(2);
    expect(
      list.body.sessions.find((s: { device: string }) => s.device === "Chrome on Windows"),
    ).toBeTruthy();

    const other = list.body.sessions.find((s: { current: boolean }) => !s.current);
    await request(app)
      .delete(`/api/auth/sessions/${other.id}`)
      .set("Authorization", `Bearer ${first.body.accessToken}`)
      .expect(HttpStatus.NO_CONTENT);

    const dead = await request(app)
      .post("/api/auth/refresh")
      .set(csrf)
      .set("Cookie", refreshCookie(second));
    expect(dead.status).toBe(HttpStatus.UNAUTHORIZED);
    const alive = await request(app)
      .post("/api/auth/refresh")
      .set(csrf)
      .set("Cookie", refreshCookie(first));
    expect(alive.status).toBe(HttpStatus.OK);
  });

  it("won't let you revoke someone else's session", async () => {
    const mine = await signUp("me@example.com");
    const theirs = await signUp("them@example.com");
    const theirSession = await Session.findOne({ userId: theirs.body.user.id });
    const res = await request(app)
      .delete(`/api/auth/sessions/${theirSession!._id}`)
      .set("Authorization", `Bearer ${mine.body.accessToken}`);
    expect(res.status).toBe(HttpStatus.NOT_FOUND);
  });
});

describe("password reset and change", () => {
  const tokenFromMail = () => /token=([\w-]+)/.exec(outbox.at(-1)?.text ?? "")?.[1] ?? "";

  it("resets the password, signs out every device, and the link works once", async () => {
    const signed = await signUp();
    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "asha@example.com" })
      .expect(HttpStatus.OK);
    const token = tokenFromMail();
    expect(token).toBeTruthy();

    await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "NewSofa987" })
      .expect(HttpStatus.OK);

    const old = await request(app)
      .post("/api/auth/login")
      .send({ email: "asha@example.com", password: PASSWORD });
    expect(old.status).toBe(HttpStatus.UNAUTHORIZED);
    await request(app)
      .post("/api/auth/login")
      .send({ email: "asha@example.com", password: "NewSofa987" })
      .expect(HttpStatus.OK);

    const dead = await request(app)
      .post("/api/auth/refresh")
      .set(csrf)
      .set("Cookie", refreshCookie(signed));
    expect(dead.status).toBe(HttpStatus.UNAUTHORIZED);

    const reuse = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "Another1234" });
    expect(reuse.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it("answers the same for an unknown email and sends nothing", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "ghost@example.com" });
    expect(res.status).toBe(HttpStatus.OK);
    expect(outbox).toHaveLength(0);
  });

  it("changing the password signs out the other devices but not this one", async () => {
    const first = await signUp();
    const second = await request(app)
      .post("/api/auth/login")
      .send({ email: "asha@example.com", password: PASSWORD });

    await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${first.body.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: "BrandNew456" })
      .expect(HttpStatus.OK);

    const stillIn = await request(app)
      .post("/api/auth/refresh")
      .set(csrf)
      .set("Cookie", refreshCookie(first));
    const signedOut = await request(app)
      .post("/api/auth/refresh")
      .set(csrf)
      .set("Cookie", refreshCookie(second));
    expect(stillIn.status).toBe(HttpStatus.OK);
    expect(signedOut.status).toBe(HttpStatus.UNAUTHORIZED);
  });
});

describe("roles and staff invites", () => {
  async function superAdminToken() {
    await User.create({
      name: "Owner",
      email: "owner@example.com",
      passwordHash: await hashPassword(PASSWORD),
      role: Role.SUPER_ADMIN,
      emailVerified: true,
    });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "owner@example.com", password: PASSWORD });
    return res.body.accessToken as string;
  }

  it("only a super admin can invite staff", async () => {
    const customer = await signUp();
    const res = await request(app)
      .post("/api/auth/invite-staff")
      .set("Authorization", `Bearer ${customer.body.accessToken}`)
      .send({ email: "new@example.com", name: "New Admin" });
    expect(res.status).toBe(HttpStatus.FORBIDDEN);
  });

  it("invites an admin who accepts and gets the admin role", async () => {
    const token = await superAdminToken();
    await request(app)
      .post("/api/auth/invite-staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "new@example.com", name: "New Admin" })
      .expect(HttpStatus.CREATED);

    const invite = /token=([\w-]+)/.exec(outbox.at(-1)!.text)![1];
    const res = await request(app)
      .post("/api/auth/accept-invite")
      .send({ token: invite, name: "New Admin", password: PASSWORD });
    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.user.role).toBe(Role.ADMIN);

    // the invite is single-use
    const again = await request(app)
      .post("/api/auth/accept-invite")
      .send({ token: invite, name: "New Admin", password: PASSWORD });
    expect(again.status).toBe(HttpStatus.BAD_REQUEST);
  });
});
