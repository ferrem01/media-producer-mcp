import { describe, it, expect } from "vitest";
import { enforceFilmDirection } from "../src/llm/storyboard-builder.js";

// "THE CLOSE is a template: the final CTA scene is the st-logo-close scene
// template -- never a freeform CTA composition. A hand-built close is how the
// one thing the film asks the viewer to do ends up cut off by the canvas edge."
//
// Six live storyboards across tempo-cut, hype-cut and editorial broke that law
// in a row. The per-scene template mapper runs on exactly these scenes and
// returned null every time -- including on closes whose own visual_notes said
// "st-logo-close template scene". So every film shipped a codegen-invented CTA:
// the one frame that has a job.
//
// The fixtures below are the real shapes those runs produced.

const scene = (s: Partial<any>): any => ({
  label: "Scene 1", duration_seconds: 3.35, purpose: "", visual_notes: "", components: [], ...s,
});

/** A film with enough body scenes that the close is unambiguously the close. */
const body = () => [
  scene({ label: "Scene 1 - The Ask", components: [{ type: "quotient-chat", data: { script: [] } }] }),
  scene({ label: "Scene 2 - The Agent Works", components: [{ type: "ui-terminal-agent", data: { lines: [] } }] }),
];

describe("the close is a template, enforced", () => {
  it("casts st-logo-close over an unauthored CTA close, taking copy from the film's cta-card", () => {
    // hype-cut run A: the click beat staged a cta-card, then scene 13 -- the
    // actual close -- shipped with components: [] and template: "".
    const scenes = [
      ...body(),
      scene({
        label: "Scene 12 - Book The Demo",
        purpose: "CTA click beat -- the cursor clicks the CTA stamp",
        components: [
          { type: "cta-card", data: { headline: "Book a demo", description: "See your next campaign built live.", button_text: "Book a demo" } },
          { type: "cursor-performer", data: { path: [] } },
        ],
      }),
      scene({
        label: "Scene 13 - Close",
        purpose: "Final CTA / brand close -- template close, ends on action not a logo card",
        visual_notes: "st-logo-close template scene: the logo blooms out of the dark.",
      }),
    ];
    enforceFilmDirection(scenes, { narrative: "One Brief, One Campaign" });

    const close = scenes[scenes.length - 1];
    expect(close.scene_template?.type).toBe("st-logo-close");
    // The film already wrote this copy; the close must not invent its own.
    expect(close.scene_template?.data).toMatchObject({
      tagline: "See your next campaign built live.",
      cta: "Book a demo",
    });
    expect(close.components).toEqual([]);
    // The click beat is authored work and stays exactly as it was.
    expect(scenes[2].components).toHaveLength(2);
  });

  it("falls back to the film's narrative and an action-shaped label", () => {
    // tempo-cut run A: no cta-card anywhere in the film. The narrative IS the
    // film's thesis line, which is what a tagline wants to be.
    const scenes = [
      ...body(),
      scene({
        label: "Scene 8 - Book a Demo",
        purpose: "The final stamp lands as the CTA itself",
        visual_notes: "the calendar dissolves into the film's closing wordmark and CTA pill.",
      }),
    ];
    enforceFilmDirection(scenes, { narrative: "One Brief, One Campaign" });

    expect(scenes[2].scene_template).toEqual({
      type: "st-logo-close",
      // "Scene 8 - " is a storyboard label artifact, never on-screen copy.
      data: { tagline: "One Brief, One Campaign", cta: "Book a Demo" },
    });
  });

  it("never fills the required tagline slot with nothing", () => {
    // A template with holes ships a visibly broken scene -- worse than the
    // codegen it replaced. With no cta-card and no narrative, the label is the
    // last resort; with nothing at all, the scene is left to codegen.
    const bare = [...body(), scene({ label: "Scene 9 - Get Started", visual_notes: "the wordmark blooms" })];
    enforceFilmDirection(bare);
    expect(bare[2].scene_template?.data.tagline).toBe("Get Started");

    const nameless = [...body(), scene({ label: "", visual_notes: "the wordmark blooms" })];
    enforceFilmDirection(nameless);
    expect(nameless[2].scene_template, "no copy to fill the slot -- leave it").toBeUndefined();
  });

  it("leaves an authored product close alone", () => {
    // tempo-cut run B closed on the product itself -- a booking widget on the
    // filled calendar, five components deep, deliberately "never a card of its
    // own". Overwriting that would discard real authored work, which is the
    // same reason assignSceneTemplates skips data-bearing scenes.
    const authored = scene({
      label: "Scene 7 - Book the Demo",
      purpose: "Close on the product itself -- no logo card, the booking flow IS the ending",
      visual_notes: "a booking widget builds center-frame; the cursor clicks Book a demo.",
      components: [
        { type: "quotient-campaign", data: { title: "Q3 Product Launch" } },
        { type: "cta-card", data: { headline: "Book a demo" } },
        { type: "cursor-performer", data: { path: [] } },
      ],
    });
    const scenes = [...body(), authored];
    enforceFilmDirection(scenes, { narrative: "One Brief, A Whole Campaign" });

    expect(scenes[2].scene_template).toBeUndefined();
    expect(scenes[2].components).toHaveLength(3);
  });

  it("leaves a close that already picked its own template alone", () => {
    const scenes = [...body(), scene({
      label: "Scene 6 - Book a Demo",
      visual_notes: "the wordmark blooms",
      scene_template: { type: "st-statement", data: { text: "Start today." } },
    })];
    enforceFilmDirection(scenes, { narrative: "Whatever" });
    expect(scenes[2].scene_template?.type).toBe("st-statement");
  });

  it("does not bolt a logo card onto a film that ends on something else", () => {
    // A bare component string is still "unauthored" by the data test, so the
    // CTA read is what keeps this from firing on every codegen final scene.
    const scenes = [...body(), scene({
      label: "Scene 5 - The Numbers Land",
      purpose: "Payoff stat beat -- the money number resolves the arc",
      visual_notes: "One hero numeral counts up center-frame with a violet sunburst.",
      components: ["hero-stat"],
    })];
    enforceFilmDirection(scenes, { narrative: "One Brief, One Campaign" });
    expect(scenes[2].scene_template).toBeUndefined();
  });

  it("does not spend the film's one world flip on the close", () => {
    // st-logo-close is always dark, so a forced close on an all-light film
    // would read as a flip and suppress the real mid-film pivot. The close is
    // cast after flip detection precisely so this stays true.
    const scenes = [
      scene({ label: "Scene 1", scene_template: { type: "st-hero-stat", data: { theme: "light" } } }),
      scene({ label: "Scene 2", scene_template: { type: "st-kinetic-list", data: { theme: "light" } } }),
      scene({ label: "Scene 3", scene_template: { type: "st-hero-stat", data: { theme: "light" } } }),
      scene({ label: "Scene 4 - Book a Demo", visual_notes: "the closing wordmark and CTA pill" }),
    ];
    enforceFilmDirection(scenes, { narrative: "One Brief, One Campaign" });

    expect(scenes[3].scene_template?.type).toBe("st-logo-close");
    const pivots = scenes.slice(0, 3).filter((s) => s.scene_template?.data.theme === "dark");
    expect(pivots, "the mid-film pivot still has to happen").toHaveLength(1);
  });
});
