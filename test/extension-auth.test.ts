/**
 * Recorder-extension sign-in regression suite (source guards).
 *
 * The product bar, verbatim: "in the extension there will be nothing the
 * user has to enter besides logging in. I don't want to even show the
 * tenant id or url of the droplet or anything." These guards keep the
 * zero-field contract and the OAuth wiring from silently regressing --
 * the extension is plain JS with no build step, so source-level checks
 * are the test seam.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(__dirname, "../recorder-extension");

let popupHtml = "", popupJs = "", backgroundJs = "", manifest: any = {};
beforeAll(async () => {
  popupHtml = await fs.readFile(path.join(EXT, "popup.html"), "utf-8");
  popupJs = await fs.readFile(path.join(EXT, "popup.js"), "utf-8");
  backgroundJs = await fs.readFile(path.join(EXT, "background.js"), "utf-8");
  manifest = JSON.parse(await fs.readFile(path.join(EXT, "manifest.json"), "utf-8"));
});

describe("zero-field popup", () => {
  it("shows NO server / tenant / token / project inputs", () => {
    for (const id of ["server", "tenant", "token", "project"]) {
      expect(popupHtml, `popup must not expose an "${id}" field`)
        .not.toMatch(new RegExp(`<input[^>]*id="${id}"`));
    }
  });
  it("offers Sign in with Google and a signed-in card", () => {
    expect(popupHtml).toContain('id="signin"');
    expect(popupHtml).toContain("Sign in with Google");
    expect(popupHtml).toContain('id="auth-in"');
    expect(popupHtml).toContain('id="signout"');
  });
  it("gates recording on auth, and upload states cannot re-enable it", () => {
    expect(popupJs).toContain('{ type: "qr-auth-status" }');
    expect(popupJs).toMatch(/needsAuth/);
    expect(popupJs).toMatch(/disabled = st\.state === "uploading" \|\| \$\("record"\)\.dataset\.needsAuth === "1"/);
  });
});

describe("background OAuth client", () => {
  it("registers via RFC 7591 and runs the PKCE code flow", () => {
    expect(backgroundJs).toContain('"/register"');
    expect(backgroundJs).toContain("code_challenge_method: \"S256\"");
    expect(backgroundJs).toContain("chrome.identity.launchWebAuthFlow");
    expect(backgroundJs).toContain("grant_type: \"authorization_code\"");
    expect(backgroundJs).toContain("grant_type: \"refresh_token\"");
  });
  it("verifies the OAuth state before exchanging the code", () => {
    expect(backgroundJs).toMatch(/state.*mismatch/i);
  });
  it("mirrors the account into the settings the pipeline reads (server/tenant/token)", () => {
    expect(backgroundJs).toContain("chrome.storage.sync.set({ server, tenant: me.tenant_id, token: tok.access_token })");
  });
  it("refreshes before every recording start", () => {
    const startIdx = backgroundJs.indexOf('msg.type === "qr-start"');
    expect(startIdx).toBeGreaterThan(-1);
    expect(backgroundJs.slice(startIdx, startIdx + 300)).toContain("refreshIfNeeded()");
  });
  it("bakes the server URL in -- users never enter it", () => {
    expect(backgroundJs).toMatch(/const SERVER = "https:\/\//);
  });
});

describe("manifest", () => {
  it("declares the identity permission for launchWebAuthFlow", () => {
    expect(manifest.permissions).toContain("identity");
  });
  it("pins the extension id (stable chromiumapp.org redirect URI)", () => {
    expect(typeof manifest.key).toBe("string");
    expect(manifest.key.length).toBeGreaterThan(100);
  });
});
