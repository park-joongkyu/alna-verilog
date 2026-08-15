import { readJson, writeJson } from "./jsonStore.js";

const FILE = "access-log.json";
const MAX_ENTRIES = 1000;

export async function listAccessLog() {
  return readJson(FILE, []);
}

export async function logAccess({ username, ip, userAgent }) {
  const all = await readJson(FILE, []);
  all.unshift({
    username,
    ip: ip || null,
    userAgent: userAgent || null,
    at: new Date().toISOString(),
  });
  if (all.length > MAX_ENTRIES) all.length = MAX_ENTRIES;
  await writeJson(FILE, all);
}
