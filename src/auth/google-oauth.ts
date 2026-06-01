/**
 * Google OAuth handler for media-producer-mcp.
 * Adapted from video-producer-mcp for raw node:http (no Express).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { findOrCreateTenant, getTenant } from "./tenant-store.js";
import { createRefreshToken, rotateRefreshToken } from "./refresh-tokens.js";
import { signToken, verifyToken } from "./jwt.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const OAUTH_CALLBACK_URL = process.env.OAUTH_CALLBACK_URL || "http://159.203.115.164:3200/auth/google/callback";

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface GoogleUserInfo {
  email: string;
  name: string;
  picture?: string;
  verified_email?: boolean;
}

interface PendingFlow {
  clientRedirectUri: string;
  clientState?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  createdAt: number;
}

interface AuthCode {
  email: string;
  tenantId: string;
  clientRedirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  createdAt: number;
}

const pendingFlows = new Map<string, PendingFlow>();
const authCodes = new Map<string, AuthCode>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, flow] of pendingFlows) {
    if (now - flow.createdAt > 10 * 60 * 1000) pendingFlows.delete(key);
  }
  for (const [key, code] of authCodes) {
    if (now - code.createdAt > 5 * 60 * 1000) authCodes.delete(key);
  }
}, 5 * 60 * 1000);

/** Helper: parse query params from raw request URL */
function getQueryParams(req: IncomingMessage): URLSearchParams {
  const url = new URL(req.url || "", "http://localhost");
  return url.searchParams;
}

/** Helper: parse JSON body from raw request */
function parseRequestBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => {
      try {
        // Support both JSON and form-urlencoded
        if (data.startsWith("{")) {
          resolve(JSON.parse(data));
        } else {
          const params = new URLSearchParams(data);
          const obj: Record<string, string> = {};
          for (const [k, v] of params) obj[k] = v;
          resolve(obj);
        }
      } catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

/** Helper: send JSON response */
function jsonReply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

/** Helper: redirect */
function redirect(res: ServerResponse, url: string): void {
  res.writeHead(302, { Location: url });
  res.end();
}

/**
 * GET /auth/google/login
 */
export async function handleGoogleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const query = getQueryParams(req);
  const clientRedirectUri = query.get("redirect_uri") || undefined;
  const clientState = query.get("state") || undefined;
  const codeChallenge = query.get("code_challenge") || undefined;
  const codeChallengeMethod = query.get("code_challenge_method") || undefined;

  const internalState = randomBytes(16).toString("hex");

  if (clientRedirectUri) {
    pendingFlows.set(internalState, {
      clientRedirectUri,
      clientState,
      codeChallenge,
      codeChallengeMethod,
      createdAt: Date.now(),
    });
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: OAUTH_CALLBACK_URL,
    response_type: "code",
    scope: "email profile",
    access_type: "offline",
    state: internalState,
  });

  redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

/**
 * GET /auth/google/callback
 */
export async function handleGoogleCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const query = getQueryParams(req);
  const code = query.get("code");
  const error = query.get("error");
  const state = query.get("state");

  if (error) {
    jsonReply(res, 400, { error: "oauth_error", message: String(error) });
    return;
  }
  if (!code) {
    jsonReply(res, 400, { error: "missing_code", message: "Authorization code not provided" });
    return;
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: OAUTH_CALLBACK_URL,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token exchange failed:", errorData);
      jsonReply(res, 400, { error: "token_exchange_failed" });
      return;
    }

    const tokens = await tokenResponse.json() as GoogleTokenResponse;

    // Get user info
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userResponse.ok) {
      console.error("User info request failed:", await userResponse.text());
      jsonReply(res, 400, { error: "user_info_failed" });
      return;
    }

    const userInfo = await userResponse.json() as GoogleUserInfo;
    if (!userInfo.email) {
      jsonReply(res, 400, { error: "no_email" });
      return;
    }

    const user = await findOrCreateTenant(userInfo.email, userInfo.name, userInfo.picture);

    // Check for MCP client flow
    const pendingFlow = state ? pendingFlows.get(state) : undefined;

    if (pendingFlow) {
      pendingFlows.delete(state!);
      const authCode = randomBytes(32).toString("hex");
      authCodes.set(authCode, {
        email: user.email,
        tenantId: user.tenantId,
        clientRedirectUri: pendingFlow.clientRedirectUri,
        codeChallenge: pendingFlow.codeChallenge,
        codeChallengeMethod: pendingFlow.codeChallengeMethod,
        createdAt: Date.now(),
      });

      const redirectUrl = new URL(pendingFlow.clientRedirectUri);
      redirectUrl.searchParams.set("code", authCode);
      if (pendingFlow.clientState) {
        redirectUrl.searchParams.set("state", pendingFlow.clientState);
      }
      console.log(`Redirecting to MCP client: ${redirectUrl.toString()}`);
      redirect(res, redirectUrl.toString());
      return;
    }

    // Direct browser flow: return JWT
    const token = signToken({
      email: user.email,
      tenant_id: user.tenantId,
      name: user.name,
      picture: user.picture,
    });

    jsonReply(res, 200, {
      success: true,
      token,
      user: {
        email: user.email,
        name: user.name,
        picture: user.picture,
        tenant_id: user.tenantId,
      },
    });
  } catch (err) {
    console.error("OAuth callback error:", err);
    jsonReply(res, 500, { error: "oauth_error", message: "Internal server error" });
  }
}

/**
 * POST /auth/token
 */
export async function handleTokenExchange(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await parseRequestBody(req);
    const { grant_type, code, redirect_uri, code_verifier, refresh_token: incomingRefreshToken } = body;

    if (grant_type === "refresh_token") {
      if (!incomingRefreshToken) {
        jsonReply(res, 400, { error: "invalid_request", error_description: "Missing refresh_token" });
        return;
      }
      const rotated = rotateRefreshToken(incomingRefreshToken);
      if (!rotated) {
        jsonReply(res, 400, { error: "invalid_grant", error_description: "Invalid or expired refresh token" });
        return;
      }
      const newJwt = signToken({ email: rotated.email, tenant_id: rotated.tenantId });
      jsonReply(res, 200, {
        access_token: newJwt,
        token_type: "Bearer",
        expires_in: 86400,
        refresh_token: rotated.newToken,
      });
      return;
    }

    if (grant_type !== "authorization_code") {
      jsonReply(res, 400, { error: "unsupported_grant_type" });
      return;
    }

    if (!code) {
      jsonReply(res, 400, { error: "invalid_request", error_description: "Missing code" });
      return;
    }

    const authCode = authCodes.get(code);
    if (!authCode) {
      jsonReply(res, 400, { error: "invalid_grant", error_description: "Invalid or expired authorization code" });
      return;
    }

    authCodes.delete(code);

    if (Date.now() - authCode.createdAt > 5 * 60 * 1000) {
      jsonReply(res, 400, { error: "invalid_grant", error_description: "Authorization code expired" });
      return;
    }

    if (redirect_uri && redirect_uri !== authCode.clientRedirectUri) {
      jsonReply(res, 400, { error: "invalid_grant", error_description: "redirect_uri mismatch" });
      return;
    }

    // PKCE verification
    if (authCode.codeChallenge) {
      if (!code_verifier) {
        jsonReply(res, 400, { error: "invalid_grant", error_description: "Missing code_verifier" });
        return;
      }
      const method = authCode.codeChallengeMethod || "S256";
      let computedChallenge: string;
      if (method === "S256") {
        computedChallenge = createHash("sha256").update(code_verifier).digest("base64url");
      } else {
        computedChallenge = code_verifier;
      }
      if (computedChallenge !== authCode.codeChallenge) {
        jsonReply(res, 400, { error: "invalid_grant", error_description: "Invalid code_verifier" });
        return;
      }
    }

    const user = await getTenant(authCode.email);
    if (!user) {
      jsonReply(res, 400, { error: "invalid_grant", error_description: "User not found" });
      return;
    }

    const jwtToken = signToken({
      email: user.email,
      tenant_id: user.tenantId,
      name: user.name,
      picture: user.picture,
    });

    const refreshToken = createRefreshToken(user.email, user.tenantId);

    jsonReply(res, 200, {
      access_token: jwtToken,
      token_type: "Bearer",
      expires_in: 86400,
      refresh_token: refreshToken,
    });
  } catch (err) {
    console.error("Token endpoint error:", err);
    jsonReply(res, 500, { error: "server_error" });
  }
}

/**
 * GET /auth/me (requires auth)
 */
export async function handleGetMe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    jsonReply(res, 401, { error: "missing_token" });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const payload = verifyToken(token);
  if (!payload) {
    jsonReply(res, 401, { error: "invalid_token" });
    return;
  }

  const user = await getTenant(payload.email);
  if (!user) {
    jsonReply(res, 404, { error: "user_not_found" });
    return;
  }

  jsonReply(res, 200, {
    email: user.email,
    name: user.name,
    picture: user.picture,
    tenant_id: user.tenantId,
    created_at: user.createdAt,
    last_login: user.lastLogin,
  });
}
