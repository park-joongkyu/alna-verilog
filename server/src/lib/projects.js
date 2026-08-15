import { ensureMainRepo } from "./git.js";
import { readJson, writeJson } from "./jsonStore.js";
import { isAdmin } from "./users.js";

const FILE = "projects.json";

function normalize(id, meta) {
  return { id, ...meta, members: meta.members ?? [] };
}

// Returns every registered project, regardless of membership - only for
// internal/boot use (e.g. ensuring each project's git repo exists at
// startup). Route handlers must filter with listProjectsFor instead.
export async function listProjects() {
  const map = await readJson(FILE, {});
  return Object.entries(map).map(([id, meta]) => normalize(id, meta));
}

export async function listProjectsFor(username, userIsAdmin) {
  const all = await listProjects();
  if (userIsAdmin) return all;
  return all.filter((p) => p.members.includes(username));
}

export async function getProject(id) {
  const map = await readJson(FILE, {});
  return map[id] ? normalize(id, map[id]) : null;
}

export async function isMember(id, username) {
  const project = await getProject(id);
  return Boolean(project?.members.includes(username));
}

// Admins can access every project regardless of membership, same as they
// bypass branch ownership checks.
export async function canAccessProject(id, username) {
  if (await isAdmin(username)) return true;
  return isMember(id, username);
}

export async function createProject(id, name, createdBy) {
  const map = await readJson(FILE, {});
  if (map[id]) {
    const err = new Error("이미 존재하는 프로젝트입니다");
    err.code = "PROJECT_EXISTS";
    throw err;
  }
  await ensureMainRepo(id);
  map[id] = { name, createdBy, createdAt: new Date().toISOString(), members: [createdBy] };
  await writeJson(FILE, map);
  return normalize(id, map[id]);
}

export async function addMember(id, username) {
  const map = await readJson(FILE, {});
  if (!map[id]) return null;
  const meta = map[id];
  meta.members = meta.members ?? [];
  if (!meta.members.includes(username)) meta.members.push(username);
  map[id] = meta;
  await writeJson(FILE, map);
  return normalize(id, meta);
}

export async function removeMember(id, username) {
  const map = await readJson(FILE, {});
  if (!map[id]) return null;
  const meta = map[id];
  meta.members = (meta.members ?? []).filter((u) => u !== username);
  map[id] = meta;
  await writeJson(FILE, map);
  return normalize(id, meta);
}
