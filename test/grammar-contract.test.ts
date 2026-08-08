import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORLD_MATERIALS } from "../src/llm/world.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = () => fs.readFile(path.resolve(__dirname, "../src/llm/storyboard-builder.ts"), "utf-8");

// Every grammar's section used to ship in every storyboard call; film_grammar
// only relabelled the headers. Gating that to the active grammar saved ~4,500
// tokens a call -- and immediately broke editorial, because a law it needs was
// never in ITS section.
//
// `OBJECTS, NOT STRINGS` (a components[] entry must be an object with data, not
// a bare type string -- one bare string drops the whole scene to codegen and
// DISCARDS the authored components) lived in four OTHER grammars' contracts.
// An editorial film obeyed it only because those four happened to be in
// context. With them gone, the very next editorial storyboard emitted
// "mesh-gradient" and "kinetic-text" as bare strings.
//
// The lesson generalises past this one law: a rule that every grammar needs
// must live in the UNIVERSAL block, never be inherited by accident from a
// dialect that happens to be loaded.

const GRAMMARS = ["tempo-cut","hype-cut","editorial","social-reel","data-story","canvas-tour","speaker-screencast"];

/** Split the prompt into the universal preamble and each gated section. */
async function sections(): Promise<{ universal: string; byGrammar: Record<string,string> }> {
  const src = await read();
  const marks = GRAMMARS
    .map((g) => ({ g, at: src.indexOf(`__g("${g}")`) }))
    .filter((m) => m.at > 0)
    .sort((a, b) => a.at - b.at);
  expect(marks.length, "every grammar should be gated").toBe(GRAMMARS.length);
  const byGrammar: Record<string,string> = {};
  marks.forEach((m, i) => {
    // Each section is `${__g("x") ? `### ...` : ""}` -- bound it at its OWN
    // terminator, not at the next section. Slicing the last one to end-of-file
    // swept the universal tail into it, which inflated its law count and made
    // the material guard blame it for text it does not contain.
    const term = src.indexOf('` : ""}', m.at);
    const next = i + 1 < marks.length ? marks[i + 1].at : src.length;
    byGrammar[m.g] = src.slice(m.at, term > 0 && term < next ? term : next);
  });
  return { universal: src.slice(0, marks[0].at), byGrammar };
}

describe("grammar contracts: only the active one ships", () => {
  it("gates every grammar, and lets hype-cut inherit tempo-cut", async () => {
    const src = await read();
    expect(src).toMatch(/const __g = \(g: string\) =>/);
    // Unresolved grammar must still ship everything -- the safety net.
    expect(src).toMatch(/!opts\.filmGrammar \|\|/);
    expect(src).toMatch(/opts\.filmGrammar === "hype-cut" && g === "tempo-cut"/);
  });

  it("keeps the data-format contract UNIVERSAL, not borrowed from a dialect", async () => {
    const { universal, byGrammar } = await sections();
    // The regression: editorial has no OBJECTS-NOT-STRINGS of its own and, once
    // the other grammars stopped shipping, emitted bare component strings.
    expect(universal, "OBJECTS, NOT STRINGS must live in the universal block")
      .toMatch(/OBJECTS, NOT STRINGS \(every grammar\)/);
    // And it must actually reach the grammars that never carried it themselves.
    for (const g of ["editorial", "speaker-screencast"]) {
      expect(byGrammar[g], `${g} still has no copy of its own -- the universal one is load-bearing`)
        .not.toMatch(/OBJECTS, NOT STRINGS/);
    }
  });

  it("no grammar depends on a law that only exists in another grammar's section", async () => {
    // Generalised guard. A law stated in 3+ dialect sections is almost certainly
    // universal in intent; if one is, it belongs in the universal block, because
    // no film sees another dialect's contract any more.
    const { universal, byGrammar } = await sections();
    const label = /^- ([A-Z][A-Z /,'-]{4,40}):/gm;
    const seen: Record<string, string[]> = {};
    for (const [g, body] of Object.entries(byGrammar)) {
      for (const m of body.matchAll(label)) (seen[m[1].trim()] ??= []).push(g);
    }
    // Same LABEL, genuinely different CONTENT per dialect -- these are not
    // universal laws wearing a shared name, so promoting them would be wrong.
    // Each entry states what actually differs, so the exemption is auditable
    // rather than a way to silence the guard.
    const PER_DIALECT: Record<string, string> = {
      "THE EDIT": "each states its own scene count and duration band (6-9 in 30-45s vs 6-10 in 20-40s vs 5-8 in 25-45s)",
      "THE SHAPE": "each states its own runtime and beat structure",
      "NO VOICEOVER": "means opposite things -- editorial's type IS the voice, speaker-screencast's human narrates",
      "TEXT IS THE VOICEOVER": "tempo-cut docks it beside evidence, data-story states claims above figures",
    };
    // Laws repeated across 4+ dialects with no universal home are the smell.
    const suspects = Object.entries(seen)
      .filter(([law, gs]) => gs.length >= 4 && !universal.includes(law) && !PER_DIALECT[law]);
    expect(
      suspects.map(([l, gs]) => `${l} (in ${gs.join(", ")})`),
      "these laws are stated by 4+ dialects but live in no universal block -- " +
      "either they are genuinely universal (promote them) or the wording is " +
      "coincidental (rename so this guard stays meaningful)",
    ).toEqual([]);
  });
});

// A film grammar answers ONE question -- what carries the argument -- and states
// the editing logic that follows: the protagonist, the cut logic, the beat
// structure, and the refusals that protect the protagonist. It does not decide
// what things are MADE of. film_grammar and visual_system are independent axes,
// so a grammar that names a world's components is wrong every time it runs on a
// different world.
//
// That was not theoretical. canvas-tour's TYPE IS PERFORMED law demanded
// pen-script, typewriter and para-edit -- paper materials -- so running it on a
// dark world asked for cursive ink on a WebGL backdrop. The principle (type
// arrives by being MADE, never slammed) is real grammar; the performers were
// the world's. They are split now, and this guard is what keeps them split.

describe("grammars do not name a world's materials", () => {
  it("states the definition the grammars have to answer to", async () => {
    const src = await read();
    expect(src).toMatch(/### WHAT A FILM GRAMMAR IS/);
    expect(src).toMatch(/WHAT CARRIES THE ARGUMENT/);
    // The swap test is the operative part -- it is how the next law gets placed.
    expect(src).toMatch(/still be true after swapping the world/);
    expect(src, "the sound-drives-the-cut exception has to survive, or tempo-cut's music grid and speaker-screencast's voice clock read as misplaced")
      .toMatch(/sound drives the cut/);
  });

  it("keeps every world-owned component type out of every grammar section", async () => {
    const { byGrammar } = await sections();
    const owned = Object.entries(WORLD_MATERIALS).flatMap(([world, m]) =>
      m.types.map((t) => ({ world, type: t })));
    expect(owned.length, "no world declares materials -- this guard would be vacuous").toBeGreaterThan(0);

    // Debt, not permission. These predate the split and are listed one by one
    // so the size of the problem stays visible; the guard's job is to stop the
    // list GROWING. Clearing it means moving each component name into
    // WORLD_MATERIALS and leaving the grammar stating the principle -- but that
    // is a four-grammar rewrite of load-bearing casting guidance, and removing
    // casting guidance is exactly what regressed editorial when the grammar
    // sections were first gated. It gets done deliberately, with generations to
    // check it, not as a drive-by. Tracked as its own task.
    const KNOWN_LEAKS = new Set([
      "tempo-cut:composer", "tempo-cut:kinetic-text", "tempo-cut:annotation",
      "social-reel:composer", "social-reel:kinetic-text",
      "data-story:kinetic-text", "data-story:annotation",
      "speaker-screencast:annotation",
    ]);

    const found = new Set<string>();
    for (const [g, body] of Object.entries(byGrammar)) {
      for (const { type } of owned) {
        if (new RegExp(`\\b${type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(body)) {
          found.add(`${g}:${type}`);
        }
      }
    }

    const fresh = [...found].filter((k) => !KNOWN_LEAKS.has(k));
    expect(
      fresh,
      "a grammar is naming components that belong to one world -- it will be wrong " +
      "the moment that grammar runs somewhere else. Move the component names into " +
      "WORLD_MATERIALS and leave the grammar stating the PRINCIPLE (what must " +
      "happen), not the parts (what to use). If the law is genuinely about the " +
      "edit, reword it so it survives a change of world.",
    ).toEqual([]);

    // ...and the debt list may not rot: an entry that no longer leaks has been
    // fixed, and leaving it here would quietly re-open the hole it covered.
    const stale = [...KNOWN_LEAKS].filter((k) => !found.has(k));
    expect(stale, "these leaks are fixed -- delete them from KNOWN_LEAKS").toEqual([]);
  });
});
