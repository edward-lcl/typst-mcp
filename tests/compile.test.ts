import { describe, it, expect } from "vitest";
import { compileDocument } from "../src/tools/compile.js";
import path from "node:path";
import fs from "node:fs";

const FIXTURE = path.resolve("fixtures/sample.typ");

describe("doc_compile", () => {
  it("compiles a valid .typ file and returns a pdf_path", async () => {
    const result = await compileDocument({ doc_path: FIXTURE });
    expect(result.success).toBe(true);
    expect(result.pdf_path).toBeTruthy();
    expect(result.errors).toHaveLength(0);
    expect(fs.existsSync(result.pdf_path)).toBe(true);
  });

  it("returns structured errors for a broken .typ file", async () => {
    const broken = path.resolve("fixtures/broken.typ");
    fs.writeFileSync(broken, "= Heading\n#invalid-command-that-does-not-exist(\n");
    try {
      const result = await compileDocument({ doc_path: broken });
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatchObject({
        message: expect.any(String),
        line: expect.any(Number),
      });
    } finally {
      fs.unlinkSync(broken);
    }
  });

  it("rejects non-.typ files with a clear error", async () => {
    await expect(
      compileDocument({ doc_path: "/tmp/fake.pdf" })
    ).rejects.toThrow(/unsupported/i);
  });
});
