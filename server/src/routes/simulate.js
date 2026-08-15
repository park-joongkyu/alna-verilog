import { Router } from "express";
import fs from "node:fs/promises";
import { isValidFileName, resolveBranch, MAIN_BRANCH } from "../lib/workspace.js";
import { runSimulation } from "../lib/iverilog.js";
import { attachNoteToHead } from "../lib/git.js";
import { isOwner } from "../lib/branchOwners.js";
import { isAdmin } from "../lib/users.js";
import { canAccessProject } from "../lib/projects.js";

const router = Router();

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

  let { files } = req.body || {};

  if (!files) {
    const entries = await fs.readdir(resolved.dir, { withFileTypes: true });
    files = entries.filter((e) => e.isFile() && e.name.endsWith(".v")).map((e) => e.name);
  }

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "no .v files to simulate" });
  }
  if (!files.every(isValidFileName)) {
    return res.status(400).json({ error: "invalid file name in list" });
  }

  const result = await runSimulation(resolved.dir, files);
  const ranAt = new Date().toISOString();
  const commit = await attachNoteToHead(resolved.dir, { ...result, files, ranAt });
  res.json({ ...result, files, ranAt, commit });
});

export default router;
