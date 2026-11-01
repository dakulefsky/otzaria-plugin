import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const SKIP = new Set(["node_modules", ".git", "dist", "build", ".dart_tool"]);
const SOURCE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".html"]);

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) await walk(full, out);
    else if (SOURCE_EXT.has(path.extname(ent.name).toLowerCase())) out.push(full);
  }
  return out;
}

export async function analyzeSource(root: string) {
  const files = await walk(root);
  const findings: Array<{ file: string; line: number; kind: string; excerpt: string }> = [];
  const patterns = [
    { kind: "Otzaria RPC call", re: /Otzaria\.call\s*\(/g },
    { kind: "Otzaria event subscription", re: /Otzaria\.on\s*\(/g },
    { kind: "Direct fetch (review network/CORS behavior)", re: /\bfetch\s*\(/g },
    { kind: "Potential dynamic code execution", re: /\beval\s*\(|new\s+Function\s*\(/g },
    { kind: "Potential unsafe HTML injection", re: /\.innerHTML\s*=/g },
  ];
  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        if (pattern.re.test(line)) {
          findings.push({ file: path.relative(root, file), line: index + 1, kind: pattern.kind, excerpt: line.trim().slice(0, 220) });
          pattern.re.lastIndex = 0;
        }
      }
    });
  }
  return { scannedFiles: files.length, findings };
}
