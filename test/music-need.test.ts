import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");

describe("the music choice: the film's bed is a need, chosen in the board", () => {
  it("maps a data-dir file to its /assets URL and back; auto and none resolve to no track; a chosen file is read", async () => {
    const { musicAssetUrl, musicLocalPath, resolveMusicChoice } = await import("../src/audio/music.js");
    const { config } = await import("../src/config.js");
    expect(musicAssetUrl(path.join(config.dataDir, "t", "projects", "p", "assets", "bed 1.mp3"))).toBe("/assets/t/projects/p/assets/bed%201.mp3");
    expect(musicAssetUrl("/assets/x/y.mp3")).toBe("/assets/x/y.mp3");
    expect(musicAssetUrl("https://cdn/z.mp3")).toBe("https://cdn/z.mp3");
    expect(musicLocalPath("/assets/t/projects/p/assets/bed%201.mp3")).toBe(path.join(config.dataDir, "t/projects/p/assets/bed 1.mp3"));
    expect(await resolveMusicChoice({ source: "auto" }, "/tmp")).toBeNull();
    expect(await resolveMusicChoice({ source: "none" }, "/tmp")).toBeNull();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "music-"));
    const file = path.join(dir, "bed.mp3"); await fs.writeFile(file, "x");
    const t = await resolveMusicChoice({ source: "upload", path: file, title: "Bed", duration: 90 }, dir);
    expect(t).toMatchObject({ path: file, title: "Bed", duration: 90, source: "stock" });
    await expect(resolveMusicChoice({ source: "upload", path: path.join(dir, "missing.mp3") }, dir)).rejects.toThrow();
  });

  it("the build cuts against the chosen bed and ships none when the board says so", async () => {
    const prep = await read("src/llm/grammar-prep.ts");
    expect(prep).toMatch(/chosenMusic\?: MusicTrack \| null;/);
    expect(prep).toMatch(/if \(ctx\.chosenMusic\) \{\s*music = ctx\.chosenMusic;/);
    const pipeline = await read("src/llm/pipeline.ts");
    expect(pipeline).toMatch(/if \(choice\?\.source === "none"\) \{ chosenMusic = null; opts\.backgroundMusic = false;/);
    expect(pipeline).toMatch(/chosenMusic = await resolveMusicChoice\(choice, /);
    expect(pipeline).toMatch(/chosenMusic: opts\.chosenMusic \|\| undefined,/);
    const server = await read("src/server.ts");
    expect(server).toMatch(/if \(origProject\.music\?\.source === "none"\) \{[\s\S]*?filter\(\(t: any\) => t\.type !== "music"\)/);
  });

  it("the server lists the options and writes the pick as the bed; the library previews are served", async () => {
    const index = await read("src/index.ts");
    expect(index).toMatch(/\|need-source\|stock-search\|music\|music-options\|traces\|/);
    expect(index).toMatch(/\/api\\\/music-options\\\/\(\[\^\/\]\+\)\\\/\(\[\^\/\]\+\)\$\//);
    expect(index).toMatch(/\/api\\\/music\\\/\(\[\^\/\]\+\)\\\/\(\[\^\/\]\+\)\$\//);
    expect(index).toMatch(/\["auto", "none", "brand-kit", "stock", "jamendo", "upload"\]\.includes\(source\)/);
    expect(index).toMatch(/id: "music_bed", type: "music", source: musicLocalPath\(track\.path\)/);
    expect(index).toMatch(/mpProj\.music = choice;/);
    expect(index).toMatch(/\/assets\\\/_system\\\/stock-music\\\/\(\[\^\/\]\+\)\$\//);
    expect(index).toMatch(/\.\(mp3\|m4a\|wav\|ogg\|aac\)\$\/i\.test\(f\)/);
  });

  it("Studio: a Music button opens the card in the dialog; the phone shows it in the needs area", async () => {
    const desktop = await read("src/preview-app/preview-app.ts");
    expect(desktop).toMatch(/id="music-btn"/);
    expect(desktop).toMatch(/function openMusicCard\(project\)/);
    expect(desktop).toMatch(/'\/music-options\/' \+ encodeURIComponent\(state\.tenantId\)/);
    expect(desktop).toMatch(/'\/music\/' \+ encodeURIComponent\(state\.tenantId\)/);
    expect(desktop).toMatch(/npPick = \{ scene: -1, asset: -1, type: 'music', project: project\.project_id \};/);
    // loadProject returns nothing -- a pick must not chain on it (measured live: "reading 'then'").
    expect(desktop).not.toMatch(/loadProject\([^)]*\)\.then/);
    const music = await read("src/audio/music.ts");
    expect(music).toMatch(/replace\(\/&amp;\/g, "&"\)/);
    const phone = await read("src/studio-phone.ts");
    expect(phone).toMatch(/nd\.appendChild\(musicBox\(\)\);/);
    expect(phone).toMatch(/'\/music-options\/' \+ encodeURIComponent\(tenant\)/);
    expect(phone).toMatch(/<input type="file" id="musicPicker" accept="audio\/\*">/);
  });
});
