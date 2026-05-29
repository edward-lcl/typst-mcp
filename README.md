# typst-mcp

An MCP (Model Context Protocol) server that gives AI agents clean, semantic operations over Typst and LaTeX research documents. Rather than treating documents as raw text, `typst-mcp` exposes compile, navigate, edit, review, and register operations as structured tool calls.

## Why

Most AI writing tools operate on documents as walls of text. `typst-mcp` gives agents a structured interface: they can navigate sections by ID, see what's on a given PDF page, rewrite a specific section and have it automatically roll back if the edit breaks compilation, audit the bibliography, or inventory every figure and where it's referenced. This is the authoring loop agents need to do real document work.

## Prerequisites

- **Node.js** 20+
- **Typst** — install with `brew install typst`, `cargo install typst-cli`, or `snap install typst`
- LaTeX (optional) — install [Tectonic](https://tectonic-typesetting.github.io) for `.tex` support

## Quick Start

```bash
# Clone and install
git clone https://github.com/edward-lcl/typst-mcp
cd typst-mcp
pnpm install

# Start the MCP server (stdio transport)
pnpm start
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "typst-mcp": {
      "command": "node",
      "args": ["/path/to/typst-mcp/bin/typst-mcp.js"],
      "env": {
        "TYPST_MCP_CONTEXT": "research"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description |
|---|---|
| `TYPST_MCP_CONTEXT` | Label for trace events (e.g. `cryo-lab`, `ai-lab`). Default: `default` |
| `TYPST_MCP_TRACE_DIR` | Directory to write JSONL trace logs. Tracing disabled if unset. |
| `TYPST_MCP_ONTOLOGY_DIR` | Directory for ontology node YAML files. Ontology disabled if unset. |

## Tools

| Tool | Description |
|---|---|
| `doc_compile` | Compile a `.typ` or `.tex` file to PDF. Returns structured errors. |
| `doc_get_structure` | Parse section tree with IDs, levels, line ranges, and word counts. |
| `doc_get_section` | Extract raw source + plain text for a named section. |
| `doc_source_to_pdf` | Map a source line number → PDF page + section. |
| `doc_pdf_to_source` | Map a PDF page → source sections with line ranges. |
| `doc_rewrite_section` | Replace section content. Auto-backs up; rolls back on compile failure. |
| `doc_insert_paragraph` | Insert a paragraph at `start`, `end`, or paragraph-N within a section. |
| `doc_bib_audit` | Find unused keys, missing keys, and duplicates in a `.bib` file. |
| `doc_review_section` | Heuristic review: completeness, citations, clarity, consistency. |
| `doc_diff` | Section-level diff between two documents. |
| `doc_figure_inventory` | List all figures, captions, source files, and where each is referenced. |
| `doc_register` | Write a document as a YAML ontology node. Requires `TYPST_MCP_ONTOLOGY_DIR`. |

## Example Agent Session

```
Agent: doc_get_structure { doc_path: "paper.typ" }
→ { sections: [{ id: "introduction", level: 1, line_start: 1 }, ...] }

Agent: doc_get_section { doc_path: "paper.typ", section_id: "methods" }
→ { content_raw: "...", word_count: 312, citations: ["mazur2004"] }

Agent: doc_rewrite_section { doc_path: "paper.typ", section_id: "methods", new_content: "...", reason: "Tighten per reviewer 2" }
→ { applied: true, backup_path: "paper.typ.bak.1748476644", compile_errors: [] }

Agent: doc_bib_audit { doc_path: "paper.typ", bib_path: "refs.bib" }
→ { missing_keys: ["jones2023"], unused_keys: ["old2019"], duplicate_entries: [] }
```

## Format Support

| Feature | Typst | LaTeX (Tectonic) |
|---|---|---|
| Compile | ✓ | ✓ (install tectonic) |
| PDF↔source sync | ✓ via query | ✓ via SyncTeX |
| Section navigation | ✓ | ✓ |
| Edit operations | ✓ | ✓ |
| Bibliography | ✓ BibTeX / Hayagriva | ✓ BibTeX |

**Typst is recommended** for new documents — faster compilation, better error messages, cleaner AST.

## Architecture

The server uses stdio transport (standard MCP). Each tool call is independent; no shared state is held in memory between calls. Trace logging (opt-in) appends JSONL events per session. Ontology registration (opt-in) writes YAML nodes per document.

## Development

```bash
pnpm test          # run all 37 tests
pnpm test:watch    # watch mode
pnpm build         # compile to dist/
```

## License

MIT
