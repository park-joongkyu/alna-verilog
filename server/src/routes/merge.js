import { Router } from "express";
import fs from "node:fs/promises";
import {
  isValidFileName,
  isValidBranchName,
  isValidProjectId,
  projectExists,
  branchExists,
  branchWorktreeDir,
  MAIN_BRANCH,
} from "../lib/workspace.js";
import {
  isMergeInProgress,
  getConflictedFiles,
  getConflictSides,
  mergeBranch,
  resolveConflictFile,
  completeMerge,
  abortMerge,
} from "../lib/git.js";
import { isOwner } from "../lib/branchOwners.js";
import { isAdmin, getDisplayName } from "../lib/users.js";
import { canAccessProject } from "../lib/projects.js";
import { logAudit } from "../lib/auditLog.js";

const router = Router();

async function buildConflictList(dir) {
  const files = await getConflictedFiles(dir);
  return Promise.all(
    files.map(async (name) => {
      const [raw, sides] = await Promise.all([
        fs.readFile(`${dir}/${name}`, "utf-8").catch(() => ""),
        getConflictSides(dir, name),
      ]);
      return { name, raw, ...sides };
    })
  );
}

// Resolves the ?project=&branch= / body.project&body.branch params to the
// worktree the merge should run in, branch defaulting to main. Responds with
// an error and returns null on failure.
async function resolveTarget(req, res) {
  const project = req.query.project || req.body?.project;
  if (!isValidProjectId(project)) {
    res.status(400).json({ error: "invalid or missing project" });
    return null;
  }
  if (!(await projectExists(project))) {
    res.status(404).json({ error: `project '${project}' not found` });
    return null;
  }
  if (!(await canAccessProject(project, req.user.username))) {
    res.status(403).json({ error: "이 프로젝트의 멤버만 접근할 수 있습니다" });
    return null;
  }
  const target = req.query.branch || req.body?.branch || MAIN_BRANCH;
  if (!isValidBranchName(target) && target !== MAIN_BRANCH) {
    res.status(400).json({ error: "invalid branch name" });
    return null;
  }
  if (!(await branchExists(project, target))) {
    res.status(404).json({ error: `branch '${target}' not found` });
    return null;
  }
  return { project, target, dir: branchWorktreeDir(project, target) };
}

// Only two directions are supported: pushing an owned branch into main, or
// pulling main's latest into an owned branch. Arbitrary branch-to-branch
// merges aren't exposed in the UI, so we don't support them here either.
async function canMergeInto(project, target, source, username) {
  if (await isAdmin(username)) return true;
  if (target === MAIN_BRANCH) return isOwner(project, source, username);
  return source === MAIN_BRANCH && isOwner(project, target, username);
}

router.get("/status", async (req, res) => {
  const resolved = await resolveTarget(req, res);
  if (!resolved) return;
  const inProgress = await isMergeInProgress(resolved.dir);
  if (!inProgress) return res.json({ inProgress: false });
  const files = await buildConflictList(resolved.dir);
  res.json({ inProgress: true, files });
});

router.post("/start", async (req, res) => {
  const resolved = await resolveTarget(req, res);
  if (!resolved) return;
  const { project, target, dir } = resolved;
  const { source } = req.body || {};
  if (!isValidBranchName(source) && source !== MAIN_BRANCH) {
    return res.status(400).json({ error: "invalid source branch" });
  }
  if (source === target) {
    return res.status(400).json({ error: "같은 브랜치끼리는 merge할 수 없습니다" });
  }
  if (!(await branchExists(project, source))) {
    return res.status(404).json({ error: `branch '${source}' not found` });
  }
  if (!(await canMergeInto(project, target, source, req.user.username))) {
    return res.status(403).json({ error: "이 방향으로 merge할 권한이 없습니다." });
  }
  if (await isMergeInProgress(dir)) {
    const files = await buildConflictList(dir);
    return res.status(409).json({ error: "이미 진행 중인 merge가 있습니다", inProgress: true, files });
  }

  try {
    const actorName = await getDisplayName(req.user.username);
    const result = await mergeBranch(dir, source, target, actorName);
    if (result.status === "conflict") {
      const files = await buildConflictList(dir);
      return res.json({ status: "conflict", files });
    }
    logAudit({
      username: req.user.username,
      action: "merge",
      project,
      branch: target,
      detail: `${source} -> ${target} (${result.commit})`,
    }).catch(() => {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "merge failed" });
  }
});

router.post("/resolve", async (req, res) => {
  const resolved = await resolveTarget(req, res);
  if (!resolved) return;
  const { dir } = resolved;
  const { file, content } = req.body || {};
  if (!isValidFileName(file)) return res.status(400).json({ error: "invalid file name" });
  if (typeof content !== "string") return res.status(400).json({ error: "content must be a string" });
  if (!(await isMergeInProgress(dir))) {
    return res.status(400).json({ error: "진행 중인 merge가 없습니다" });
  }
  await resolveConflictFile(dir, file, content);
  const files = await buildConflictList(dir);
  res.json({ ok: true, remaining: files });
});

router.post("/complete", async (req, res) => {
  const resolved = await resolveTarget(req, res);
  if (!resolved) return;
  const { project, target, dir } = resolved;
  try {
    const commit = await completeMerge(dir);
    logAudit({ username: req.user.username, action: "merge", project, branch: target, detail: commit }).catch(() => {});
    res.json({ status: "merged", commit });
  } catch (err) {
    if (err.code === "UNRESOLVED_CONFLICTS") {
      const files = await buildConflictList(dir);
      return res.status(409).json({ error: err.message, files });
    }
    res.status(500).json({ error: err.message || "merge complete failed" });
  }
});

router.post("/abort", async (req, res) => {
  const resolved = await resolveTarget(req, res);
  if (!resolved) return;
  const { dir } = resolved;
  if (!(await isMergeInProgress(dir))) {
    return res.status(400).json({ error: "진행 중인 merge가 없습니다" });
  }
  await abortMerge(dir);
  res.json({ ok: true });
});

export default router;
