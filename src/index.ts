import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { compileDocument } from "./tools/compile.js";
import { getDocumentStructure } from "./tools/structure.js";
import { getSectionContent } from "./tools/section.js";
import { sourceToPdf, pdfToSource } from "./tools/sync.js";
import { rewriteSection, insertParagraph } from "./tools/edit.js";
import { bibAudit } from "./tools/bibliography.js";
import { reviewSection, diffDocuments } from "./tools/review.js";
import { figureInventory } from "./tools/figures.js";

// Trace + ontology are opt-in via environment variables.
// Set TYPST_MCP_TRACE_DIR to enable trace logging.
// Set TYPST_MCP_ONTOLOGY_DIR to enable ontology node registration.
import { createTracer, Tracer } from "./trace.js";
import { writeOntologyNode } from "./ontology.js";

const TRACE_DIR = process.env.TYPST_MCP_TRACE_DIR;
const ONTOLOGY_DIR = process.env.TYPST_MCP_ONTOLOGY_DIR;
const CONTEXT = process.env.TYPST_MCP_CONTEXT ?? "default";

let tracer: Tracer | null = null;
if (TRACE_DIR) {
  const date = new Date().toISOString().slice(0, 10);
  tracer = createTracer({
    tracePath: `${TRACE_DIR}/typst-mcp-${date}.jsonl`,
    context: CONTEXT,
  });
}

async function traced<T>(tool: string, doc_path: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await tracer?.emit({ tool, doc_path, success: true, duration_ms: Date.now() - start, summary: "ok" });
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await tracer?.emit({ tool, doc_path, success: false, duration_ms: Date.now() - start, summary: msg, error: msg });
    throw err;
  }
}

const server = new McpServer({ name: "typst-mcp", version: "0.1.0" });

// ── Core tools ─────────────────────────────────────────────────────────────

server.tool("doc_compile",
  "Compile a .typ (Typst) or .tex (LaTeX) document to PDF. Returns structured errors on failure.",
  { doc_path: z.string(), engine: z.enum(["typst", "tectonic", "pdflatex"]).optional(), draft: z.boolean().optional() },
  async ({ doc_path, engine, draft }) => {
    const r = await traced("doc_compile", doc_path, () => compileDocument({ doc_path, engine, draft }));
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
);

server.tool("doc_get_structure",
  "Parse a document and return its full section tree with IDs, levels, line ranges, and word counts.",
  { doc_path: z.string() },
  async ({ doc_path }) => {
    const r = await traced("doc_get_structure", doc_path, () => getDocumentStructure({ doc_path }));
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
);

server.tool("doc_get_section",
  "Extract the raw source and plain text for a named section. Returns word count, citations, and figure references.",
  { doc_path: z.string(), section_id: z.string().describe("Slug of the section title, e.g. 'methods' or 'background'") },
  async ({ doc_path, section_id }) => {
    const r = await traced("doc_get_section", doc_path, () => getSectionContent({ doc_path, section_id }));
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
);

server.tool("doc_source_to_pdf",
  "Map a source line number to its PDF page and containing section.",
  { doc_path: z.string(), line: z.number().int().positive().describe("1-based line number") },
  async ({ doc_path, line }) => {
    const r = await traced("doc_source_to_pdf", doc_path, () => sourceToPdf({ doc_path, line }));
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
);

server.tool("doc_pdf_to_source",
  "Map a PDF page number to the source sections it contains, with line ranges.",
  { doc_path: z.string(), page: z.number().int().positive().describe("PDF page number (1-indexed)") },
  async ({ doc_path, page }) => {
    const r = await traced("doc_pdf_to_source", doc_path, () => pdfToSource({ doc_path, page }));
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
);

server.tool("doc_rewrite_section",
  "Replace a section's content (heading is preserved). Auto-backs up the file and rolls back if the new content causes compile errors.",
  { doc_path: z.string(), section_id: z.string(), new_content: z.string(), reason: z.string().describe("Why this section is being rewritten") },
  async (input) => {
    const r = await traced("doc_rewrite_section", input.doc_path, () => rewriteSection(input));
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
);

server.tool("doc_insert_paragraph",
  "Insert a paragraph into a section. Position: 'start', 'end', or a 1-based paragraph index.",
  { doc_path: z.string(), section_id: z.string(), paragraph_text: z.string(), position: z.union([z.enum(["start", "end"]), z.number().int().positive()]) },
  async (input) => {
    const r = await traced("doc_insert_paragraph", input.doc_path, () => insertParagraph(input));
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
);

server.tool("doc_bib_audit",
  "Audit a .bib file against a document. Finds unused keys, missing keys (cited but not defined), and duplicate entries.",
  { doc_path: z.string(), bib_path: z.string() },
  async (input) => {
    const r = await traced("doc_bib_audit", input.doc_path, () => bibAudit(input));
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
);

server.tool("doc_review_section",
  "Run heuristic checks on a section: completeness, citations, clarity, structural consistency.",
  { doc_path: z.string(), section_id: z.string(), review_types: z.array(z.enum(["clarity", "completeness", "citations", "consistency"])), context: z.string().optional() },
  async (input) => {
    const r = await traced("doc_review_section", input.doc_path, () => reviewSection(input));
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
);

server.tool("doc_diff",
  "Compare two documents at section level. Returns additions, deletions, rewrites, and unchanged sections.",
  { doc_path_a: z.string(), doc_path_b: z.string(), mode: z.enum(["source", "semantic"]) },
  async (input) => {
    const r = await traced("doc_diff", input.doc_path_a, () => diffDocuments(input));
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
);

server.tool("doc_figure_inventory",
  "List all figures in a document with their labels, captions, source files, and which sections reference them.",
  { doc_path: z.string() },
  async ({ doc_path }) => {
    const r = await traced("doc_figure_inventory", doc_path, () => figureInventory({ doc_path }));
    return { content: [{ type: "text", text: JSON.stringify(r, null, 2) }] };
  }
);

// ── Ontology integration (opt-in via TYPST_MCP_ONTOLOGY_DIR) ───────────────

server.tool("doc_register",
  "Register a compiled document as a structured node (YAML) in a local ontology directory. Requires TYPST_MCP_ONTOLOGY_DIR or an explicit ontology_dir argument.",
  {
    doc_path: z.string(),
    lab_context: z.string().default("default").describe("Context label: e.g. cryo-lab, ai-lab, production"),
    title: z.string().optional(),
    ontology_dir: z.string().optional().describe("Directory to write the node YAML. Falls back to TYPST_MCP_ONTOLOGY_DIR env var."),
  },
  async ({ doc_path, lab_context, title, ontology_dir }) => {
    const dir = ontology_dir ?? ONTOLOGY_DIR;
    if (!dir) throw new Error("No ontology directory configured. Set TYPST_MCP_ONTOLOGY_DIR or pass ontology_dir.");
    const filePath = await traced("doc_register", doc_path, () =>
      writeOntologyNode({ doc_path, ontology_dir: dir, lab_context, title })
    );
    return { content: [{ type: "text", text: JSON.stringify({ registered: true, node_path: filePath, lab_context }, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
