import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTracer, TraceEvent } from "../src/trace.js";
import { writeOntologyNode } from "../src/ontology.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const TMP_DIR = path.join(os.tmpdir(), `doc-mcp-trace-test-${Date.now()}`);

beforeEach(() => fs.mkdirSync(TMP_DIR, { recursive: true }));
afterEach(() => fs.rmSync(TMP_DIR, { recursive: true, force: true }));

describe("trace emitter", () => {
  it("writes a JSONL trace event to the configured file", async () => {
    const tracePath = path.join(TMP_DIR, "trace.jsonl");
    const tracer = createTracer({ tracePath, context: "test-lab" });

    await tracer.emit({
      tool: "doc_compile",
      doc_path: "/tmp/test.typ",
      success: true,
      duration_ms: 120,
      summary: "Compiled OK",
    });

    const lines = fs.readFileSync(tracePath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const event: TraceEvent = JSON.parse(lines[0]);
    expect(event.tool).toBe("doc_compile");
    expect(event.context).toBe("test-lab");
    expect(event.success).toBe(true);
    expect(event.ts).toBeTruthy();
  });

  it("appends multiple events to the same file", async () => {
    const tracePath = path.join(TMP_DIR, "trace.jsonl");
    const tracer = createTracer({ tracePath, context: "test-lab" });

    await tracer.emit({ tool: "doc_compile", doc_path: "/tmp/a.typ", success: true, duration_ms: 100, summary: "OK" });
    await tracer.emit({ tool: "doc_get_structure", doc_path: "/tmp/a.typ", success: true, duration_ms: 5, summary: "3 sections" });

    const lines = fs.readFileSync(tracePath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).tool).toBe("doc_get_structure");
  });
});

describe("ontology node writer", () => {
  it("writes a YAML node file for a compiled document", async () => {
    const ontologyDir = path.join(TMP_DIR, "ontology");
    await writeOntologyNode({
      doc_path: path.resolve("fixtures/sample.typ"),
      ontology_dir: ontologyDir,
      lab_context: "cryo-lab",
    });

    const files = fs.readdirSync(path.join(ontologyDir, "entities", "documents"));
    expect(files.length).toBe(1);
    const content = fs.readFileSync(path.join(ontologyDir, "entities", "documents", files[0]), "utf-8");
    expect(content).toContain("type: ResearchDocument");
    expect(content).toContain("lab_context: cryo-lab");
    expect(content).toContain("introduction");
  });
});
