import fs from "node:fs";
import path from "node:path";
import { getDocumentStructure, SectionNode } from "./tools/structure.js";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function flattenSections(nodes: SectionNode[]): Array<{ id: string; title: string; level: number }> {
  return nodes.flatMap((n) => [
    { id: n.id, title: n.title, level: n.level },
    ...flattenSections(n.subsections),
  ]);
}

export async function writeOntologyNode(input: {
  doc_path: string;
  ontology_dir: string;
  lab_context: string;
  title?: string;
}): Promise<string> {
  const structure = await getDocumentStructure({ doc_path: input.doc_path });
  const docName = path.basename(input.doc_path, ".typ");
  const date = new Date().toISOString().slice(0, 10);
  const nodeId = `doc-${slugify(docName)}-${date}`;
  const sections = flattenSections(structure.sections);

  const outDir = path.join(input.ontology_dir, "entities", "documents");
  fs.mkdirSync(outDir, { recursive: true });

  const filePath = path.join(outDir, `${nodeId}.yaml`);

  const sectionLines = sections.map((s) =>
    `  - id: ${s.id}\n    title: "${s.title}"\n    level: ${s.level}`
  ).join("\n");

  const edgeLines = sections.map((s) =>
    `  - type: contains_section\n    target: ${s.id}`
  ).join("\n");

  const yaml = [
    `id: ${nodeId}`,
    `type: ResearchDocument`,
    `source_path: "${input.doc_path}"`,
    `title: "${input.title ?? structure.title ?? docName}"`,
    `lab_context: ${input.lab_context}`,
    `registered_at: "${new Date().toISOString()}"`,
    `section_count: ${sections.length}`,
    `sections:`,
    sectionLines,
    `edges:`,
    edgeLines,
  ].join("\n");

  fs.writeFileSync(filePath, yaml + "\n");
  return filePath;
}

export function defaultOntologyDir(): string {
  const base = process.env.OCPLATFORM_WORKSPACE
    ?? `${process.env.HOME}/.ocplatform/workspace`;
  return path.join(base, "ontology");
}
