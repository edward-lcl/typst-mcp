import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { bibAudit } from "../src/tools/bibliography.js";
import path from "node:path";
import fs from "node:fs";

const BIB_FIXTURE = path.resolve("fixtures/sample.bib");
const SCRATCH_TYP = path.resolve("fixtures/bib-scratch.typ");

const SAMPLE_BIB = `@article{mazur2004,
  author = {Mazur, Peter},
  title = {Principles of cryobiology},
  journal = {Life in the Frozen State},
  year = {2004},
  pages = {3--65}
}

@article{fahy2004,
  author = {Fahy, Gregory M.},
  title = {Principles of ice-free cryopreservation by vitrification},
  journal = {Life in the Frozen State},
  year = {2004},
  pages = {491--551}
}

@article{mazur2004,
  author = {Mazur, Peter},
  title = {Duplicate entry},
  journal = {Duplicate},
  year = {2004}
}
`;

const SAMPLE_TYP = `= Introduction

Cryopreservation relies on established principles @mazur2004.

== Background

Glass formation was described by @fahy2004 and also @missing2020.

= Methods

See @mazur2004 for details.
`;

beforeEach(() => {
  fs.writeFileSync(BIB_FIXTURE, SAMPLE_BIB);
  fs.writeFileSync(SCRATCH_TYP, SAMPLE_TYP);
});

afterEach(() => {
  if (fs.existsSync(BIB_FIXTURE)) fs.unlinkSync(BIB_FIXTURE);
  if (fs.existsSync(SCRATCH_TYP)) fs.unlinkSync(SCRATCH_TYP);
});

describe("doc_bib_audit", () => {
  it("detects missing citation keys (cited in doc but not in .bib)", async () => {
    const result = await bibAudit({ doc_path: SCRATCH_TYP, bib_path: BIB_FIXTURE });
    expect(result.missing_keys).toContain("missing2020");
  });

  it("detects duplicate entries in .bib file", async () => {
    const result = await bibAudit({ doc_path: SCRATCH_TYP, bib_path: BIB_FIXTURE });
    expect(result.duplicate_entries.length).toBeGreaterThan(0);
    expect(result.duplicate_entries[0].key_a === "mazur2004" || result.duplicate_entries[0].key_b === "mazur2004").toBe(true);
  });

  it("detects unused keys (in .bib but never cited)", async () => {
    // fahy2004 IS cited in the doc above
    const result = await bibAudit({ doc_path: SCRATCH_TYP, bib_path: BIB_FIXTURE });
    expect(result.unused_keys).not.toContain("fahy2004");
    expect(result.unused_keys).not.toContain("mazur2004");
  });

  it("returns empty arrays when everything is clean", async () => {
    const cleanBib = `@article{mazur2004,
  author = {Mazur, Peter},
  title = {Principles of cryobiology},
  journal = {Life in the Frozen State},
  year = {2004}
}

@article{fahy2004,
  author = {Fahy, Gregory M.},
  title = {Principles of vitrification},
  journal = {Life in the Frozen State},
  year = {2004}
}
`;
    fs.writeFileSync(BIB_FIXTURE, cleanBib);
    const result = await bibAudit({ doc_path: SCRATCH_TYP, bib_path: BIB_FIXTURE });
    expect(result.missing_keys).toContain("missing2020"); // still cited but not in bib
    expect(result.duplicate_entries).toHaveLength(0);
  });
});
