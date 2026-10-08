import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// "Voice six tabs with my clone" (Marc, 2026-10-08): a film's narration
// read in an ElevenLabs voice -- a cast actor's clone -- not the stock TTS.
const run = promisify(execFile);

describe("a voiceover in a cloned voice", () => {
  it("reads the text in the actor's voice, at the asked speed, levelled to an mp3", async () => {
    const { speakInVoice, resolveCloneVoice, cloneVoiceSpeed } = await import("../src/audio/clone-voice.js");
    const getActor = async (_t: string, id: string) => (id === "marc" ? { name: "Marc", voice_id: "v_marc" } : id === "mute" ? { name: "Mute" } : null);
    expect(await resolveCloneVoice("t", { actor: "marc" }, getActor)).toBe("v_marc");
    expect(await resolveCloneVoice("t", { voice_id: "v_x", actor: "marc" }, getActor)).toBe("v_x");
    await expect(resolveCloneVoice("t", { actor: "mute" }, getActor)).rejects.toThrow(/has no voice/);
    await expect(resolveCloneVoice("t", { actor: "nobody" }, getActor)).rejects.toThrow(/No cast actor/);
    expect(cloneVoiceSpeed(2)).toBe(1.25);
    expect(cloneVoiceSpeed(undefined)).toBe(1);

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clone-vo-"));
    const calls: string[][] = [];
    const speak = async (text: string, voiceId: string, out: string) => {
      calls.push([text, voiceId]);
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=200:duration=2", "-c:a", "libmp3lame", out]);
    };
    const out = path.join(dir, "vo.mp3");
    await speakInVoice({ text: "Max DAA-vish builds it", voiceId: "v_marc", out, speed: 1.25, speak });
    expect(calls).toEqual([["Max DAA-vish builds it", "v_marc"]]);
    const probe = await run("ffmpeg", ["-hide_banner", "-i", out], { encoding: "utf8" }).catch((e) => e);
    const m = /Duration: 00:00:(\d+\.\d+)/.exec(String(probe.stderr));
    expect(Number(m![1])).toBeLessThan(1.8);          // 2 s read at 1.25x
    await expect(fs.access(`${out}.raw.mp3`)).rejects.toThrow();
  }, 30000);

  it("the audio tool reads a voiceover in voice_id or actor", async () => {
    const server = await fs.readFile(path.join(process.cwd(), "src/server.ts"), "utf8");
    expect(server).toMatch(/if \(params\.track\.voice_id \|\| params\.track\.actor\) \{[\s\S]*?resolveCloneVoice\(params\.tenant_id, params\.track, getActor\)[\s\S]*?speakInVoice\(/);
  });
});
