import { describe, it, expect } from "vitest";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

// A board scene's components are EITHER a bare type name or a full object
// ({type, data, ...}). Studio's scene editor showed them with .join(', '),
// which renders every object as "[object Object]" -- and then SAVED that string
// back, destroying the type and its data. Found in the wild on three films (one
// original and the two copies made from it), all on the same scene.

function helpers() {
  const html = getPreviewHtml();
  const names = html.match(/function boardCompNames[\s\S]*?\n {2}}/)?.[0];
  const from = html.match(/function boardCompsFromNames[\s\S]*?\n {2}}/)?.[0];
  expect(names, "boardCompNames must exist in Studio").toBeTruthy();
  expect(from, "boardCompsFromNames must exist in Studio").toBeTruthy();
  return new Function(`${names}\n${from}\nreturn { boardCompNames, boardCompsFromNames };`)() as {
    boardCompNames: (l: unknown) => string[];
    boardCompsFromNames: (n: string[], o: unknown) => unknown[];
  };
}

describe("the board's component list", () => {
  it("shows the component NAMES, never [object Object]", () => {
    const { boardCompNames } = helpers();
    const board = [{ type: "quotient-home", data: { greeting: "Afternoon, Marc" } }, "mesh-gradient"];
    expect(boardCompNames(board).join(", ")).toBe("quotient-home, mesh-gradient");
    expect(boardCompNames(board).join(", ")).not.toContain("[object");
    // Junk in the list is dropped rather than rendered.
    expect(boardCompNames([null, "", { data: {} }, "cta-card"])).toEqual(["cta-card"]);
    expect(boardCompNames(undefined)).toEqual([]);
  });

  it("keeps each component's data when the editor saves the names back", () => {
    const { boardCompNames, boardCompsFromNames } = helpers();
    const board = [{ type: "quotient-home", data: { greeting: "Afternoon, Marc" } }, "mesh-gradient"];
    // The exact round trip the modal performs: render to text, save it back.
    const typed = boardCompNames(board).join(", ").split(",").map((t) => t.trim());
    expect(boardCompsFromNames(typed, board)).toEqual(board);
    // A name the person adds is a plain string; the ones already there keep theirs.
    expect(boardCompsFromNames(["quotient-home", "cta-card"], board))
      .toEqual([{ type: "quotient-home", data: { greeting: "Afternoon, Marc" } }, "cta-card"]);
    // Removing a name removes it, and nothing else changes.
    expect(boardCompsFromNames(["mesh-gradient"], board)).toEqual(["mesh-gradient"]);
  });

  it("no longer stringifies the list anywhere in the editor", () => {
    const html = getPreviewHtml();
    expect(html).not.toMatch(/\(b\.components \|\| \[\]\)\.join\(/);
  });
});
