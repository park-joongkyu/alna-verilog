import { readJson, writeJson } from "./jsonStore.js";

const FILE = "branch-owners.json";

// Legacy entries were a bare username string (sole owner, no collaborators).
function normalize(entry) {
  if (!entry) return { owner: null, collaborators: [] };
  if (typeof entry === "string") return { owner: entry, collaborators: [] };
  return { owner: entry.owner ?? null, collaborators: entry.collaborators ?? [] };
}

function key(project, branch) {
  return `${project}::${branch}`;
}

async function loadAll() {
  return readJson(FILE, {});
}

export async function getOwner(project, branch) {
  const map = await loadAll();
  return normalize(map[key(project, branch)]).owner;
}

export async function getCollaborators(project, branch) {
  const map = await loadAll();
  return normalize(map[key(project, branch)]).collaborators;
}

export async function setOwner(project, branch, username) {
  const map = await loadAll();
  const k = key(project, branch);
  const entry = normalize(map[k]);
  entry.owner = username;
  entry.collaborators = entry.collaborators.filter((u) => u !== username);
  map[k] = entry;
  await writeJson(FILE, map);
}

export async function addCollaborator(project, branch, username) {
  const map = await loadAll();
  const k = key(project, branch);
  const entry = normalize(map[k]);
  if (entry.owner !== username && !entry.collaborators.includes(username)) {
    entry.collaborators.push(username);
  }
  map[k] = entry;
  await writeJson(FILE, map);
}

export async function removeCollaborator(project, branch, username) {
  const map = await loadAll();
  const k = key(project, branch);
  const entry = normalize(map[k]);
  entry.collaborators = entry.collaborators.filter((u) => u !== username);
  map[k] = entry;
  await writeJson(FILE, map);
}

export async function getAllOwners(project) {
  const map = await loadAll();
  const prefix = `${project}::`;
  const out = {};
  for (const k of Object.keys(map)) {
    if (!k.startsWith(prefix)) continue;
    out[k.slice(prefix.length)] = normalize(map[k]);
  }
  return out;
}

export async function removeOwner(project, branch) {
  const map = await loadAll();
  delete map[key(project, branch)];
  await writeJson(FILE, map);
}

// True for the primary owner AND any collaborator - i.e. "can this user edit this branch".
export async function isOwner(project, branch, username) {
  if (!username) return false;
  const entry = normalize((await loadAll())[key(project, branch)]);
  return entry.owner === username || entry.collaborators.includes(username);
}
