import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// "OpenAI's voice sucks ... we should be using one of the many 11 labs
// voices ... remove any of that OpenAI voice code" (Marc, 2026-10-08):
// every narration is an ElevenLabs voice -- a stock one by default, a cast
// actor's clone when named. Old saved OpenAI names still read.
const run = promisify(execFile);

describe("narration is ElevenLabs", () => {
  it("resolves a stock name, the default, a legacy OpenAI name, a cast actor and a raw id", async () => {
    const { resolveVoice, STOCK_VOICES, DEFAULT_VOICE } = await import("../src/audio/tts.js");
    const getActor = async (_t: string, id: string) => (id === "marc" ? { name: "Marc", voice_id: "1mNWLHEu66dKCyoFJlWF" } : id === "mute" ? { name: "Mute" } : null);
    expect(await resolveVoice("brian")).toBe(STOCK_VOICES.brian.id);
    expect(await resolveVoice(undefined)).toBe(STOCK_VOICES[DEFAULT_VOICE].id);
    expect(await resolveVoice("Sarah")).toBe(STOCK_VOICES.sarah.id);
    expect(await resolveVoice("nova")).toBe(STOCK_VOICES.sarah.id);   // a saved OpenAI name
    expect(await resolveVoice("marc", { tenant: "t", getActor })).toBe("1mNWLHEu66dKCyoFJlWF");
    await expect(resolveVoice("mute", { tenant: "t", getActor })).rejects.toThrow(/has no voice/);
    expect(await resolveVoice("abcdefghijklmnopqrst")).toBe("abcdefghijklmnopqrst");
    await expect(resolveVoice("who?")).rejects.toThrow(/Unknown voice/);
  });

  it("speak reads in the resolved voice, at the speed, levelled; scenes read one file each", async () => {
    const { speak } = await import("../src/audio/tts.js");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vo-"));
    const calls: string[][] = [];
    const read = async (text: string, voiceId: string, out: string) => {
      calls.push([text, voiceId]);
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=200:duration=2", "-c:a", "libmp3lame", out]);
    };
    const out = path.join(dir, "a", "vo.mp3");
    await speak({ text: "Max DAA-vish builds it", out, voice: "george", speed: 1.25, read });
    expect(calls[0]).toEqual(["Max DAA-vish builds it", "JBFqnCBsd6RMkjVDRZzb"]);
    const probe = await run("ffmpeg", ["-hide_banner", "-i", out], { encoding: "utf8" }).catch((e) => e);
    expect(Number(/Duration: 00:00:(\d+\.\d+)/.exec(String(probe.stderr))![1])).toBeLessThan(1.8);
    await expect(fs.access(`${out}.raw.mp3`)).rejects.toThrow();
    await expect(speak({ text: "  ", out, read })).rejects.toThrow(/Nothing to read/);
  }, 30000);

  it("no OpenAI voice is left anywhere: schemas, brand page, defaults", async () => {
    const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");
    for (const p of ["src/server.ts", "src/llm/creative-director.ts", "src/core/types.ts", "src/audio/scene-voiceover.ts", "src/persistence/project.ts", "src/preview-app/brand-page.ts"]) {
      const src = await read(p);
      expect(src, p).not.toMatch(/"alloy" \| "echo"|'alloy', 'echo'|z\.enum\(\["alloy"/);
      expect(src, p).not.toMatch(/generateTTS|api\.openai\.com\/v1\/audio/);
    }
    expect(await read("src/llm/pipeline.ts")).not.toMatch(/voice: voice \|\| "nova"|brand_kit\?\.voice \|\| "nova"|tts-1-hd/);
    const { getBrandPageHtml } = await import("../src/preview-app/brand-page.js");
    const html = getBrandPageHtml();
    expect(html).toContain('var VOICE_NAMES = ["brian"');
    expect(html).toContain("Narrator voice");
  });
});
