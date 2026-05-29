import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { figureInventory } from "../src/tools/figures.js";
import path from "node:path";
import fs from "node:fs";

const SCRATCH = path.resolve("fixtures/fig-scratch.typ");

const SAMPLE = `
#figure(
  image("diagram.png"),
  caption: [Architecture overview],
) <fig:architecture>

= Introduction

See @fig:architecture for the system layout.
Also note @fig:results below.

= Methods

== Experimental Setup

All runs used the configuration in @fig:architecture.

#figure(
  image("results.png"),
  caption: [Experiment results summary],
) <fig:results>

= Results

As shown in @fig:results, performance improved by 30%.
`;

beforeEach(() => fs.writeFileSync(SCRATCH, SAMPLE));
afterEach(() => { if (fs.existsSync(SCRATCH)) fs.unlinkSync(SCRATCH); });

describe("doc_figure_inventory", () => {
  it("finds all figures with their labels and captions", async () => {
    const result = await figureInventory({ doc_path: SCRATCH });
    expect(result.figures.length).toBe(2);
    const labels = result.figures.map((f) => f.label);
    expect(labels).toContain("fig:architecture");
    expect(labels).toContain("fig:results");
  });

  it("extracts captions correctly", async () => {
    const result = await figureInventory({ doc_path: SCRATCH });
    const arch = result.figures.find((f) => f.label === "fig:architecture");
    expect(arch?.caption).toContain("Architecture overview");
  });

  it("finds which sections reference each figure", async () => {
    const result = await figureInventory({ doc_path: SCRATCH });
    const arch = result.figures.find((f) => f.label === "fig:architecture");
    expect(arch?.referenced_in).toContain("introduction");
    expect(arch?.referenced_in).toContain("experimental-setup");
  });

  it("returns empty array when no figures exist", async () => {
    fs.writeFileSync(SCRATCH, "= Simple doc\n\nNo figures here.\n");
    const result = await figureInventory({ doc_path: SCRATCH });
    expect(result.figures).toHaveLength(0);
  });
});
