import { readJson, writeJson } from "./jsonStore.js";

const FILE = "feedback.json";

export async function listFeedback() {
  return readJson(FILE, []);
}

export async function createFeedback({ username, category, message, project }) {
  const all = await listFeedback();
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    username,
    category,
    message,
    project: project || null,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  all.unshift(entry);
  await writeJson(FILE, all);
  return entry;
}

export async function setFeedbackStatus(id, status) {
  const all = await listFeedback();
  const entry = all.find((f) => f.id === id);
  if (!entry) return null;
  entry.status = status;
  await writeJson(FILE, all);
  return entry;
}
