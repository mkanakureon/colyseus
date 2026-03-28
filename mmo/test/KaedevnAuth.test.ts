import assert from "assert";
import { KaedevnAuthAdapter } from "../src/auth/KaedevnAuthAdapter.ts";
import { createTestToken, createExpiredToken, createGuestToken, createSuspendedToken, TEST_JWT_SECRET } from "./mocks/kaedevn-auth.ts";

describe("KaedevnAuth", () => {
  const adapter = new KaedevnAuthAdapter(TEST_JWT_SECRET);

  // === A-VERIFY: Token verification ===

  it("A-VERIFY-01: should verify valid token", () => {
    const token = createTestToken({ userId: "auth-01" });
    const payload = adapter.verify(token);
    assert.ok(payload);
    assert.strictEqual(payload!.userId, "auth-01");
    assert.strictEqual(payload!.role, "user");
    assert.strictEqual(payload!.status, "active");
  });

  it("A-VERIFY-02: should reject expired token", () => {
    const token = createExpiredToken();
    const payload = adapter.verify(token);
    assert.strictEqual(payload, null);
  });

  it("A-VERIFY-03: should reject suspended user token", () => {
    const token = createSuspendedToken();
    const payload = adapter.verify(token);
    assert.strictEqual(payload, null);
  });

  it("A-VERIFY-04: should reject token with wrong secret", () => {
    const wrongAdapter = new KaedevnAuthAdapter("wrong-secret");
    const token = createTestToken({ userId: "auth-04" });
    const payload = wrongAdapter.verify(token);
    assert.strictEqual(payload, null);
  });

  it("A-VERIFY-05: should reject malformed token", () => {
    const payload = adapter.verify("not-a-jwt-token");
    assert.strictEqual(payload, null);
  });

  // === A-ROLE: Role handling ===

  it("A-ROLE-01: should verify guest token", () => {
    const token = createGuestToken();
    const payload = adapter.verify(token);
    assert.ok(payload);
    assert.strictEqual(payload!.role, "guest");
  });

  it("A-ROLE-02: should verify admin token", () => {
    const token = createTestToken({ userId: "admin-01", role: "admin" });
    const payload = adapter.verify(token);
    assert.ok(payload);
    assert.strictEqual(payload!.role, "admin");
    assert.strictEqual(payload!.userId, "admin-01");
  });
});
