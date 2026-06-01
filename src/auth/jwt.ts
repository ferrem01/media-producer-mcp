import jwt from "jsonwebtoken";

const SESSION_SECRET = process.env.SESSION_SECRET || "";

export interface JwtPayload {
  email: string;
  tenant_id: string;
  name?: string;
  picture?: string;
  iat?: number;
  exp?: number;
}

/**
 * Sign a JWT token with the session secret
 */
export function signToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, SESSION_SECRET, {
    issuer: "media-producer-mcp",
  });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, SESSION_SECRET, {
      issuer: "media-producer-mcp",
    }) as JwtPayload;
    return decoded;
  } catch (error) {
    console.warn("JWT verification failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
