import { readJson, writeJson } from "./jsonStore.js";

const FILE = "audit-log.json";
const MAX_ENTRIES = 2000;

export async function listAuditLog() {
  return readJson(FILE, []);
}

export async function logAudit({ username, action, project, branch, file, detail }) {
  const all = await readJson(FILE, []);
  all.unshift({
    username,
    action,
    project: project || null,
    branch: branch || null,
    file: file || null,
    detail: detail || null,
    at: new Date().toISOString(),
  });
  if (all.length > MAX_ENTRIES) all.length = MAX_ENTRIES;
  await writeJson(FILE, all);
}
