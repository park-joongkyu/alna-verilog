import crypto from "node:crypto";
import { readJson, writeJson } from "./jsonStore.js";

const FILE = "reset-tokens.json";
const TTL_MS = 60 * 60 * 1000; // 1 hour

async function loadAll() {
  return readJson(FILE, {});
}

async function pruneExpired(map) {
  const now = Date.now();
  let changed = false;
  for (const [token, entry] of Object.entries(map)) {
    if (entry.expiresAt < now) {
      delete map[token];
      changed = true;
    }
  }
  return changed;
}

export async function createResetToken(username) {
  const map = await loadAll();
  await pruneExpired(map);
  const token = crypto.randomBytes(32).toString("hex");
  map[token] = { username, expiresAt: Date.now() + TTL_MS };
  await writeJson(FILE, map);
  return token;
}

export async function consumeResetToken(token) {
  const map = await loadAll();
  const entry = map[token];
  if (!entry) return null;
  delete map[token];
  await writeJson(FILE, map);
  if (entry.expiresAt < Date.now()) return null;
  return entry.username;
}
