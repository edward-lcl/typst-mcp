import fs from "node:fs";

export interface DuplicateEntry {
  key_a: string;
  key_b: string;
}

export interface BibAuditResult {
  unused_keys: string[];
  missing_keys: string[];
  duplicate_entries: DuplicateEntry[];
  format_errors: Array<{ key: string; issue: string }>;
}

function parseBibKeys(bibContent: string): string[] {
  const keys: string[] = [];
  const re = /^@\w+\s*\{\s*([^,\s]+)\s*,/gm;
  let match;
  while ((match = re.exec(bibContent)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

function extractCitationKeys(typContent: string): string[] {
  const keys = new Set<string>();
  // Typst citation syntax: @key or @key[text]
  const re = /@([a-zA-Z0-9_:-]+)/g;
  let match;
  while ((match = re.exec(typContent)) !== null) {
    keys.add(match[1]);
  }
  return [...keys];
}

function findDuplicates(keys: string[]): DuplicateEntry[] {
  const seen = new Map<string, number>();
  const dupes: DuplicateEntry[] = [];
  for (const key of keys) {
    if (seen.has(key)) {
      // Only report first duplicate per key
      if (seen.get(key) === 1) {
        dupes.push({ key_a: key, key_b: key });
      }
      seen.set(key, (seen.get(key) ?? 0) + 1);
    } else {
      seen.set(key, 1);
    }
  }
  return dupes;
}

export async function bibAudit(input: {
  doc_path: string;
  bib_path: string;
}): Promise<BibAuditResult> {
  const docContent = fs.readFileSync(input.doc_path, "utf-8");
  const bibContent = fs.readFileSync(input.bib_path, "utf-8");

  const bibKeys = parseBibKeys(bibContent);
  const citedKeys = extractCitationKeys(docContent);

  const bibSet = new Set(bibKeys);
  const citedSet = new Set(citedKeys);

  const unused_keys = bibKeys.filter((k) => !citedSet.has(k));
  const missing_keys = citedKeys.filter((k) => !bibSet.has(k));
  const duplicate_entries = findDuplicates(bibKeys);

  return {
    unused_keys,
    missing_keys,
    duplicate_entries,
    format_errors: [],
  };
}
