import { readFile } from "node:fs/promises";
import path from "node:path";

export type Manifest = {
  schemaVersion?: number; id?: string; name?: string; description?: string;
  version?: string; entrypoint?: string; permissions?: unknown;
  network?: { enabled?: boolean; allowlist?: unknown };
  [key: string]: unknown;
};

export async function readManifest(root: string): Promise<Manifest> {
  const raw = await readFile(path.join(root, "manifest.json"), "utf8");
  const parsed: unknown = JSON.parse(raw.replace(/^\uFEFF/, ""));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("manifest.json must contain a JSON object");
  return parsed as Manifest;
}

/** Lightweight preflight only. The official Otzaria validator remains authoritative. */
export function validateManifest(m: Manifest): string[] {
  const errors: string[] = [];
  for (const key of ["id", "name", "version", "entrypoint"] as const) {
    if (typeof m[key] !== "string" || !m[key]!.trim()) errors.push(`Missing or invalid required string: ${key}`);
  }
  if (m.schemaVersion !== undefined && m.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof m.id === "string" && !/^[a-z0-9_.-]+$/.test(m.id)) errors.push("id contains unsupported characters");
  if (typeof m.name === "string" && m.name.trim().length > 14) errors.push("name exceeds Otzaria's 14-character limit");
  if (typeof m.description === "string" && m.description.trim().length > 150) errors.push("description exceeds Otzaria's 150-character limit");
  if (typeof m.version === "string" && !/^\d+\.\d+\.\d+(?:\+.*)?$/.test(m.version)) errors.push("version must use Otzaria's major.minor.patch format");
  if (m.permissions !== undefined && (!Array.isArray(m.permissions) || m.permissions.some(p => typeof p !== "string"))) errors.push("permissions must be an array of strings when supplied");
  if (m.network !== undefined && (!m.network || typeof m.network !== "object" || Array.isArray(m.network))) errors.push("network must be an object");
  if (m.network?.enabled === true && !Array.isArray(m.network.allowlist)) errors.push("network.enabled is true but network.allowlist is missing or is not an array");
  return errors;
}
