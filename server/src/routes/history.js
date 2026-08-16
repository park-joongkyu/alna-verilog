import { Router } from "express";
import { getHistory, getFileAtCommit, revertToCommit, revertFileToCommit } from "../lib/git.js";
import { isValidFileName, resolveBranch, MAIN_BRANCH } from "../lib/workspace.js";
import { isOwner } from "../lib/branchOwners.js";
import { isAdmin, getDisplayName } from "../lib/users.js";
import { canAccessProject } from "../lib/projects.js";
import { logAudit } from "../lib/auditLog.js";

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function assertProjectAccess(resolved, req, res) {
  if (!(await canAccessProject(resolved.project, req.user.username))) {
    res.status(403).json({ error: "이 프로젝트의 멤버만 접근할 수 있습니다" });
    return false;
  }
  return true;
}

router.get("/", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  const limit = Number(req.query.limit) || 100;
  const { since, until, file } = req.query;
  if (since && !DATE_RE.test(since)) return res.status(400).json({ error: "invalid since date" });
  if (until && !DATE_RE.test(until)) return res.status(400).json({ error: "invalid until date" });
  if (file && !isValidFileName(file)) return res.status(400).json({ error: "invalid file name" });
  const entries = await getHistory(resolved.dir, limit, since, until, file || undefined);
  res.json({ entries });
});

router.get("/:hash/file/:name", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  const { hash, name } = req.params;
  if (!isValidFileName(name)) return res.status(400).json({ error: "invalid file name" });
  try {
    const content = await getFileAtCommit(resolved.dir, hash, name);
    res.json({ name, content });
  } catch {
    res.status(404).json({ error: "file not found at that commit" });
  }
});

router.post("/:hash/revert", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  const userIsAdmin = await isAdmin(req.user.username);
  if (resolved.branch === MAIN_BRANCH) {
    if (!userIsAdmin) {
      return res.status(403).json({ error: "main 브랜치는 관리자만 되돌릴 수 있습니다." });
    }
  } else if (!(await isOwner(resolved.project, resolved.branch, req.user.username)) && !userIsAdmin) {
    return res.status(403).json({ error: "이 브랜치의 소유자만 되돌릴 수 있습니다." });
  }
  const { file } = req.body || {};
  if (file && !isValidFileName(file)) return res.status(400).json({ error: "invalid file name" });
  try {
    const actorName = await getDisplayName(req.user.username);
    const commit = file
      ? await revertFileToCommit(resolved.dir, req.params.hash, file, actorName)
      : await revertToCommit(resolved.dir, req.params.hash, actorName);
    logAudit({
      username: req.user.username,
      action: "revert",
      project: resolved.project,
      branch: resolved.branch,
      file: file || null,
      detail: req.params.hash,
    }).catch(() => {});
    res.json({ ok: true, commit });
  } catch (err) {
    res.status(400).json({ error: err.message || "revert failed" });
  }
});

export default router;
