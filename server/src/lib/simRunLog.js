import { readJson, writeJson } from "./jsonStore.js";

const FILE = "sim-run-log.json";
const MAX_ENTRIES = 5000;
const PER_BRANCH_LIMIT = 200;

export async function listSimRuns(project, branch, limit = 20) {
  const all = await readJson(FILE, []);
  return all.filter((e) => e.project === project && e.branch === branch).slice(0, limit);
}

// Entries are stored newest-first (unshift), so the first entry seen per
// testbench while scanning in order is its most recent recorded result.
export async function getLatestStatusPerTestbench(project, branch) {
  const all = await readJson(FILE, []);
  const latest = {};
  for (const e of all) {
    if (e.project !== project || e.branch !== branch || !e.testbench) continue;
    if (!(e.testbench in latest)) latest[e.testbench] = e.status;
  }
  return latest;
}

export async function logSimRun({ username, project, branch, testbench, status }) {
  const all = await readJson(FILE, []);
  all.unshift({
    username,
    project,
    branch,
    testbench: testbench || null,
    status,
    at: new Date().toISOString(),
  });

  // Cap both the global list and how many of this branch's own entries survive,
  // so one noisy branch can't starve every other branch's history out of the file.
  let kept = 0;
  const trimmed = all.filter((e) => {
    if (e.project !== project || e.branch !== branch) return true;
    kept += 1;
    return kept <= PER_BRANCH_LIMIT;
  });
  if (trimmed.length > MAX_ENTRIES) trimmed.length = MAX_ENTRIES;
  await writeJson(FILE, trimmed);
}
