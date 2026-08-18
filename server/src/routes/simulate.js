import { Router } from "express";
import fs from "node:fs/promises";
import { isValidFileName, resolveBranch, MAIN_BRANCH, isTestbenchName, isSourceFileName } from "../lib/workspace.js";
import { runSimulation } from "../lib/iverilog.js";
import { attachNoteToHead } from "../lib/git.js";
import { isOwner } from "../lib/branchOwners.js";
import { isAdmin } from "../lib/users.js";
import { canAccessProject } from "../lib/projects.js";
import { listSimRuns, logSimRun, getLatestStatusPerTestbench } from "../lib/simRunLog.js";

const router = Router();

router.get("/history", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await canAccessProject(resolved.project, req.user.username))) {
    return res.status(403).json({ error: "이 프로젝트의 멤버만 접근할 수 있습니다" });
  }
  const limit = Number(req.query.limit) || 20;
  const runs = await listSimRuns(resolved.project, resolved.branch, limit);
  res.json({ runs });
});

router.get("/failing", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await canAccessProject(resolved.project, req.user.username))) {
    return res.status(403).json({ error: "이 프로젝트의 멤버만 접근할 수 있습니다" });
  }
  const latest = await getLatestStatusPerTestbench(resolved.project, resolved.branch);
  const testbenches = Object.entries(latest)
    .filter(([, status]) => status !== "pass")
    .map(([testbench]) => testbench);
  res.json({ testbenches });
});

router.post("/suite", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await canAccessProject(resolved.project, req.user.username))) {
    return res.status(403).json({ error: "이 프로젝트의 멤버만 접근할 수 있습니다" });
  }
  if (
    resolved.branch !== MAIN_BRANCH &&
    !(await isOwner(resolved.project, resolved.branch, req.user.username)) &&
    !(await isAdmin(req.user.username))
  ) {
    return res.status(403).json({ error: "이 브랜치는 소유자만 시뮬레이션을 실행할 수 있습니다." });
  }

  const entries = await fs.readdir(resolved.dir, { withFileTypes: true });
  const allFiles = entries.filter((e) => e.isFile() && isSourceFileName(e.name)).map((e) => e.name);
  const allTestbenches = allFiles.filter(isTestbenchName);
  const rtlNames = allFiles.filter((n) => !isTestbenchName(n));

  let { testbenches } = req.body || {};
  if (!Array.isArray(testbenches) || testbenches.length === 0) {
    testbenches = allTestbenches; // no explicit list -> run every testbench in the branch
  }
  testbenches = testbenches.filter((t) => isValidFileName(t) && allTestbenches.includes(t));
  if (testbenches.length === 0) {
    return res.status(400).json({ error: "실행할 테스트벤치가 없습니다" });
  }

  const results = [];
  for (const testbench of testbenches) {
    const result = await runSimulation(resolved.dir, [testbench, ...rtlNames]);
    results.push({ testbench, ...result });
    logSimRun({
      username: req.user.username,
      project: resolved.project,
      branch: resolved.branch,
      testbench,
      status: result.status,
    }).catch(() => {});
  }
  res.json({ results });
});

router.post("/", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await canAccessProject(resolved.project, req.user.username))) {
    return res.status(403).json({ error: "이 프로젝트의 멤버만 접근할 수 있습니다" });
  }

  if (
    resolved.branch !== MAIN_BRANCH &&
    !(await isOwner(resolved.project, resolved.branch, req.user.username)) &&
    !(await isAdmin(req.user.username))
  ) {
    return res.status(403).json({ error: "이 브랜치는 소유자만 시뮬레이션을 실행할 수 있습니다." });
  }

  let { files, compileOnly } = req.body || {};

  if (!files) {
    const entries = await fs.readdir(resolved.dir, { withFileTypes: true });
    files = entries.filter((e) => e.isFile() && isSourceFileName(e.name)).map((e) => e.name);
  }

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "no .v files to simulate" });
  }
  if (!files.every(isValidFileName)) {
    return res.status(400).json({ error: "invalid file name in list" });
  }

  const result = await runSimulation(resolved.dir, files, { compileOnly: Boolean(compileOnly) });

  // A compile-only check is a quick "does this parse" probe, not a real
  // testbench run - skip the commit note and the simulation run log so it
  // doesn't clutter either history.
  if (compileOnly) {
    return res.json({ ...result, files });
  }

  const ranAt = new Date().toISOString();
  const commit = await attachNoteToHead(resolved.dir, { ...result, files, ranAt });
  logSimRun({
    username: req.user.username,
    project: resolved.project,
    branch: resolved.branch,
    testbench: files.find(isTestbenchName) || null,
    status: result.status,
  }).catch(() => {});
  res.json({ ...result, files, ranAt, commit });
});

export default router;
