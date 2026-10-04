import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// SIGN OUT, THEN SIGN IN AS SOMEONE ELSE (Marc, Oct 4: logged in on his
// phone with the wrong Gmail; Sign out "doesn't clear it" -- every way back
// in landed on the same account). Sign-out did drop the session cookie; the
// next sign-in went to Google with no prompt, and Google silently handed back
// the account the browser was signed into. Now Google always shows its
// account chooser, and sign-out clears the cookie as it was set.

process.env.GOOGLE_CLIENT_ID = "cid";

describe("signing in shows Google's account chooser", () => {
  it("the Google redirect asks prompt=select_account", async () => {
    const { handleGoogleLogin } = await import("../src/auth/google-oauth.js");
    let location = "";
    const res: any = { writeHead: (_s: number, h: any) => { location = h.Location || h.location || ""; return res; }, setHeader: (k: string, v: string) => { if (/^location$/i.test(k)) location = v; }, end: () => {}, statusCode: 0 };
    const req: any = { url: "/auth/google/login?return_to=/studio", headers: { host: "mm.example", "x-forwarded-proto": "https" }, method: "GET" };
    await handleGoogleLogin(req, res);
    expect(location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    expect(new URL(location).searchParams.get("prompt")).toBe("select_account");
  });
});

describe("signing out clears the session as it was set", () => {
  it("expires mp_session with the same attributes (Secure on https) and drops the site's cookies", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src/index.ts"), "utf8");
    const at = src.indexOf('if (urlPath === "/auth/logout") {');
    const block = src.slice(at, at + 1200);
    expect(block).toContain("mp_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${lgHttps ? \"; Secure\" : \"\"}");
    expect(block).toContain(`"Clear-Site-Data": '"cookies"'`);
  });
});
