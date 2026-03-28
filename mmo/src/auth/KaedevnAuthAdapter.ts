import jwt from "jsonwebtoken";

export interface KaedevnTokenPayload {
  userId: string;
  role: "user" | "admin" | "guest";
  status: "active" | "suspended";
}

export class KaedevnAuthAdapter {
  constructor(private secret: string) {}

  verify(token: string): KaedevnTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret) as KaedevnTokenPayload;
      if (!decoded.userId) return null;
      if (decoded.status === "suspended") return null;
      return decoded;
    } catch {
      return null;
    }
  }

  generateToken(payload: Partial<KaedevnTokenPayload> = {}, expiresIn = "24h"): string {
    return jwt.sign({
      userId: payload.userId || "user-001",
      role: payload.role || "user",
      status: payload.status || "active",
    }, this.secret, { expiresIn });
  }
}
