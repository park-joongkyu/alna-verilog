import { Router } from "express";
import fs from "node:fs/promises";
import { isValidFileName, safeFilePath, resolveBranch, MAIN_BRANCH } from "../lib/workspace.js";
import { commitIfChanged } from "../lib/git.js";
import { isOwner } from "../lib/branchOwners.js";
import { isAdmin, getDisplayName } from "../lib/users.js";
import { canAccessProject } from "../lib/projects.js";

async function assertProjectAccess(resolved, req, res) {
  if (!(await canAccessProject(resolved.project, req.user.username))) {
    res.status(403).json({ error: "이 프로젝트의 멤버만 접근할 수 있습니다" });
    return false;
  }
  return true;
}

const router = Router();
const TESTBENCH_RE = /(^|_)tb(_|\.|$)/i;
const BRAM_STUB_FILES = new Set(["state_bram_432x171.v"]);

function classify(name) {
  if (TESTBENCH_RE.test(name)) return "testbench";
  if (BRAM_STUB_FILES.has(name)) return "bram";
  return "rtl";
}

async function assertCanWrite(project, branch, req, res) {
  if (branch === MAIN_BRANCH) {
    res.status(403).json({ error: "main 브랜치는 직접 수정할 수 없습니다. merge로만 반영됩니다." });
    return false;
  }
  if (!(await isOwner(project, branch, req.user.username)) && !(await isAdmin(req.user.username))) {
    res.status(403).json({ error: "이 브랜치의 소유자만 수정할 수 있습니다." });
    return false;
  }
  return true;
}

router.get("/", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  const entries = await fs.readdir(resolved.dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".v"))
    .map((e) => ({
      name: e.name,
      kind: classify(e.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ files });
});

router.get("/:name", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  const filePath = safeFilePath(resolved.dir, req.params.name);
  if (!filePath) return res.status(400).json({ error: "invalid file name" });
  try {
    const content = await fs.readFile(filePath, "utf-8");
    res.json({ name: req.params.name, content });
  } catch {
    res.status(404).json({ error: "file not found" });
  }
});

router.put("/:name", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  if (!(await assertCanWrite(resolved.project, resolved.branch, req, res))) return;
  const filePath = safeFilePath(resolved.dir, req.params.name);
  if (!filePath) return res.status(400).json({ error: "invalid file name" });
  const { content, commitMessage } = req.body;
  if (typeof content !== "string") return res.status(400).json({ error: "content must be a string" });
  await fs.writeFile(filePath, content, "utf-8");
  const actorName = await getDisplayName(req.user.username);
  const message = `${commitMessage || `편집: ${req.params.name}`} (by ${actorName})`;
  const commit = await commitIfChanged(resolved.dir, [req.params.name], message);
  res.json({ ok: true, commit });
});

router.post("/", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  if (!(await assertCanWrite(resolved.project, resolved.branch, req, res))) return;
  const { name, content, commitMessage } = req.body;
  if (!isValidFileName(name)) {
    return res.status(400).json({ error: "file name must match [A-Za-z0-9_-]+.v" });
  }
  const filePath = safeFilePath(resolved.dir, name);
  try {
    await fs.access(filePath);
    return res.status(409).json({ error: "file already exists" });
  } catch {
    // does not exist yet, continue
  }
  await fs.writeFile(filePath, content ?? "", "utf-8");
  const actorName = await getDisplayName(req.user.username);
  const commit = await commitIfChanged(resolved.dir, [name], `${commitMessage || `새 파일: ${name}`} (by ${actorName})`);
  res.status(201).json({ ok: true, commit });
});

router.delete("/:name", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  if (!(await assertCanWrite(resolved.project, resolved.branch, req, res))) return;
  const filePath = safeFilePath(resolved.dir, req.params.name);
  if (!filePath) return res.status(400).json({ error: "invalid file name" });
  try {
    await fs.unlink(filePath);
    const actorName = await getDisplayName(req.user.username);
    await commitIfChanged(resolved.dir, [req.params.name], `삭제: ${req.params.name} (by ${actorName})`);
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "file not found" });
  }
});

export default router;
