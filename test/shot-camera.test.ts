// THE CAMERA OF A GENERATED SHOT (SPEC-shot-camera.md): the film camera and
// the shot move, two closed lists of tested words, read by the start frame,
// Seedance, Veo, the director, the board and the vocabulary.
import { describe, it, expect } from "vitest";
import { FILM_CAMERAS, FILM_CAMERA_IDS, SHOT_MOVES, getMove, resolveMove, setShotMove, inferFilmCamera, filmCameraOf, moveLine } from "../src/core/shot-camera.js";

describe("the lists", () => {
  it("hold what the Oct 13 tests kept, and nothing they dropped", () => {
    expect(FILM_CAMERA_IDS).toEqual(["cinema", "phone-front", "phone-back", "documentary", "film-16mm", "disposable"]);
    expect(FILM_CAMERAS.find((c) => c.id === "drone")).toMatchObject({ film: false });   // a clip's camera, never a film's
    expect(SHOT_MOVES.filter((m) => m.speaking).map((m) => m.id)).toEqual(["static", "push-in", "pull-out", "handheld", "tracking"]);
    expect(SHOT_MOVES.filter((m) => m.noSheet).map((m) => m.id)).toEqual(["orbit", "crane", "fpv"]);
    expect(getMove("dolly-zoom")).toBeUndefined();               // failed with and without the sheet
  });

  it("the default camera is the sentence every start frame had before the list", async () => {
    const { framePrompt } = await import("../src/core/scene-performance.js");
    expect(framePrompt("A seated medium shot", true, true)).toMatch(/Shot on a cinema camera with a 35-50mm lens: true-to-life skin with pores.*subtle film grain\. No text, no logos\.$/);
    expect(filmCameraOf({ treatment: {} }).id).toBe("cinema");
    expect(filmCameraOf({ treatment: { filmCamera: "drone" } }).id).toBe("cinema");     // not a film camera
    expect(filmCameraOf({ treatment: { filmCamera: "phone-front" } }).id).toBe("phone-front");
  });
});

describe("the prompts", () => {
  it("the start frame is drawn in the film's camera, framed for the move", async () => {
    const { framePrompt } = await import("../src/core/scene-performance.js");
    const cam = { camera: FILM_CAMERAS.find((c) => c.id === "phone-front"), move: getMove("push-in") };
    const p = framePrompt("A seated medium shot", true, true, false, cam);
    expect(p).toMatch(/A seated medium shot\. Framed a little wider than described, so the camera can push in\. A vertical photograph/);
    expect(p).toMatch(/A real iPhone front-camera photo.*True-to-life skin with pores/);
    expect(p).not.toMatch(/cinema camera/);
  });

  it("Seedance hears the move first and the camera last; a no-sheet shot names no sheet", async () => {
    const { speakingPrompt, silentPrompt } = await import("../src/core/seedance.js");
    const camera = FILM_CAMERAS.find((c) => c.id === "documentary");
    const sp = speakingPrompt("Seated on a couch", { camera, move: getMove("handheld") });
    expect(sp).toMatch(/talks directly to the camera\. CAMERA MOVE: subtle handheld camera.*the move is the camera's, not the person's\. Seated on a couch\./);
    expect(sp).toMatch(/Documentary footage on a Sony FX3/);
    expect(speakingPrompt("Seated", { move: getMove("static") })).toMatch(/CAMERA: locked-off static camera on a tripod/);
    expect(speakingPrompt("Seated")).not.toMatch(/CAMERA/);    // no move: the shot alone
    const si = silentPrompt("In a loft", { move: getMove("orbit"), sheet: false });
    expect(si).toMatch(/^The person from the first frame \(the same face/);
    expect(si).toMatch(/Cinematic, natural motivated light\./); // the film's camera when none is given
  });

  it("the Veo presenter's camera words come from the list", async () => {
    const src = await import("node:fs/promises").then((fs) => fs.readFile("src/media/video-gen.ts", "utf8"));
    expect(src).toMatch(/const cameraNote = moveLine\(getMove\(multiTake \? "static" : "push-in"\)\);/);
    expect(moveLine(getMove("static"))).toMatch(/no camera movement, constant framing/);
  });
});

describe("the move a shot is made with", () => {
  it("a speaking shot takes only the gentle moves; the setting decides when none is named", () => {
    expect(resolveMove("orbit", "static", false).move?.id).toBe("orbit");
    const r = resolveMove("orbit", "static", true);
    expect(r.move?.id).toBe("static");
    expect(r.note).toMatch(/Orbit is not made on a speaking shot.*static instead/);
    expect(resolveMove(undefined, "handheld", true).move?.id).toBe("handheld");
    expect(resolveMove(undefined, undefined, true).move).toBeUndefined();
  });

  it("a scene's move is set, refused or cleared -- never quietly swapped", () => {
    const sc: any = {};
    expect(setShotMove(sc, "push-in", true)).toBe(true);
    expect(sc.shot_move).toBe("push-in");
    expect(() => setShotMove(sc, "orbit", true)).toThrow(/cannot be made on a speaking shot/);
    expect(() => setShotMove(sc, "spin", false)).toThrow(/Unknown camera move/);
    expect(setShotMove(sc, undefined, true)).toBe(false);
    expect(setShotMove(sc, "", true)).toBe(true);
    expect(sc.shot_move).toBeUndefined();
  });

  it("every setting names a move a speaking shot can take", async () => {
    const { PERFORMER_SETTINGS } = await import("../src/core/performer-settings.js");
    for (const s of PERFORMER_SETTINGS) expect(getMove(s.move)?.speaking, s.id).toBe(true);
  });
});

describe("the film's camera", () => {
  it("is inferred from grammar and frame, a pick or a pin winning", async () => {
    expect(inferFilmCamera("creator-cut", "9x16")).toBe("phone-front");
    expect(inferFilmCamera("speaker", "16x9")).toBe("documentary");
    expect(inferFilmCamera("hype-cut", "9x16")).toBe("phone-back");
    expect(inferFilmCamera("launch-film", "9x16")).toBe("cinema");
    const { resolveFilmCamera } = await import("../src/llm/creative-director.js");
    const base: any = { format: "video" };
    expect(resolveFilmCamera({ ...base, filmCamera: "film-16mm" }, "cinema", "speaker", "9x16")).toBe("film-16mm");
    expect(resolveFilmCamera(base, "disposable", "speaker", "9x16")).toBe("disposable");
    expect(resolveFilmCamera(base, "drone", "speaker", "9x16")).toBe("phone-front");   // not a film camera
    expect(resolveFilmCamera({ format: "image" } as any, "cinema", undefined, undefined)).toBeUndefined();
  });

  it("is pinned on a hand-built film, checked, and cleared with ''", async () => {
    const { pinFilmAxes } = await import("../src/core/film-axes.js");
    const project: any = { storyboard: { scenes: [] } };
    expect(pinFilmAxes(project, { film_camera: "phone-back" })).toBeNull();
    expect(project.treatment.filmCamera).toBe("phone-back");
    expect(pinFilmAxes(project, { film_camera: "drone" })).toMatch(/Unknown film camera 'drone'/);
    expect(pinFilmAxes(project, { film_camera: "" })).toBeNull();
    expect(project.treatment.filmCamera).toBeUndefined();
  });
});

describe("the board and the vocabulary", () => {
  it("the board keeps one known move a scene, and only a gentle one on a film a person carries", async () => {
    const { enforceBoard } = await import("../src/llm/board-enforce.js");
    const scenes: any[] = [{ shot_move: "Push-In" }, { shot_move: "orbit" }, { shot_move: "dolly-zoom" }, {}];
    const { log } = enforceBoard(scenes, { personCarries: true });
    expect(scenes.map((s) => s.shot_move)).toEqual(["push-in", undefined, undefined, undefined]);
    expect(log.join(" ")).toMatch(/camera move dropped on scene\(s\) 2, 3/);
    const broll: any[] = [{ shot_move: "orbit" }];
    enforceBoard(broll, {});
    expect(broll[0].shot_move).toBe("orbit");                    // b-roll may orbit
  });

  it("list target='vocabulary' prints both lists, the code's own", async () => {
    const { vocabulary } = await import("../src/core/vocabulary.js");
    const v = vocabulary();
    expect(v.film_cameras.map((c) => c.id)).toEqual(FILM_CAMERAS.map((c) => c.id));
    expect(v.shot_moves.map((m) => m.id)).toEqual(SHOT_MOVES.map((m) => m.id));
    expect(v.settings.every((s) => !!s.move)).toBe(true);
  });
});
