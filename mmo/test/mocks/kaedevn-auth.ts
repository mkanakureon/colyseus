import { KaedevnAuthAdapter } from "../../src/auth/KaedevnAuthAdapter.ts";

export const TEST_JWT_SECRET = "test-secret-for-colyseus-mmo";
export const authAdapter = new KaedevnAuthAdapter(TEST_JWT_SECRET);

export function createTestToken(overrides: { userId?: string; role?: "user" | "admin" | "guest"; status?: "active" | "suspended" } = {}) {
  return authAdapter.generateToken(overrides);
}

export function createExpiredToken() {
  return authAdapter.generateToken({ userId: "expired-user" }, "0s");
}

export function createGuestToken() {
  return authAdapter.generateToken({ userId: "guest-001", role: "guest" });
}

export function createSuspendedToken() {
  return authAdapter.generateToken({ userId: "banned-user", status: "suspended" });
}
