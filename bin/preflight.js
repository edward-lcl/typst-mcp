#!/usr/bin/env node
import { execSync } from "node:child_process";

let ok = true;
try {
  const v = execSync("typst --version", { encoding: "utf-8" }).trim();
  console.log("✓ typst:", v);
} catch {
  console.error("✗ typst not found — install with: brew install typst  |  cargo install typst-cli  |  snap install typst");
  ok = false;
}

if (!ok) process.exit(1);
console.log("\ntypst-mcp preflight passed. Run with: typst-mcp");
