import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { isValidFileName, safeFilePath, resolveBranch, MAIN_BRANCH, isTestbenchName } from "../lib/workspace.js";
import { commitIfChanged, renameFile } from "../lib/git.js";
import { isOwner } from "../lib/branchOwners.js";
import { isAdmin, getDisplayName } from "../lib/users.js";
import { canAccessProject } from "../lib/projects.js";
import { logAudit } from "../lib/auditLog.js";

async function assertProjectAccess(resolved, req, res) {
  if (!(await canAccessProject(resolved.project, req.user.username))) {
    res.status(403).json({ error: "이 프로젝트의 멤버만 접근할 수 있습니다" });
    return false;
  }
  return true;
}

const router = Router();
const BRAM_STUB_RE = /_\d+x\d+\.v$/i;

function classify(name) {
  if (isTestbenchName(name)) return "testbench";
  if (BRAM_STUB_RE.test(name)) return "bram";
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

router.get("/export", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  const entries = await fs.readdir(resolved.dir, { withFileTypes: true });
  const names = entries.filter((e) => e.isFile() && e.name.endsWith(".v")).map((e) => e.name);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${resolved.project}-${resolved.branch}.zip"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  });
  archive.pipe(res);
  for (const name of names) {
    archive.file(path.join(resolved.dir, name), { name });
  }
  await archive.finalize();
});

router.get("/archived", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  let entries;
  try {
    entries = await fs.readdir(path.join(resolved.dir, "archived"), { withFileTypes: true });
  } catch {
    entries = [];
  }
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".v"))
    .map((e) => ({ name: e.name, kind: classify(e.name) }))
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
  logAudit({
    username: req.user.username,
    action: "file_save",
    project: resolved.project,
    branch: resolved.branch,
    file: req.params.name,
  }).catch(() => {});
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
  logAudit({
    username: req.user.username,
    action: "file_create",
    project: resolved.project,
    branch: resolved.branch,
    file: name,
  }).catch(() => {});
  res.status(201).json({ ok: true, commit });
});

router.post("/:name/rename", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  if (!(await assertCanWrite(resolved.project, resolved.branch, req, res))) return;
  const oldName = req.params.name;
  const { newName } = req.body || {};
  if (!isValidFileName(newName)) {
    return res.status(400).json({ error: "file name must match [A-Za-z0-9_-]+.v" });
  }
  if (newName === oldName) {
    return res.status(400).json({ error: "새 이름이 기존 이름과 같습니다" });
  }
  const oldPath = safeFilePath(resolved.dir, oldName);
  const newPath = safeFilePath(resolved.dir, newName);
  if (!oldPath || !newPath) return res.status(400).json({ error: "invalid file name" });
  try {
    await fs.access(oldPath);
  } catch {
    return res.status(404).json({ error: "file not found" });
  }
  try {
    await fs.access(newPath);
    return res.status(409).json({ error: "같은 이름의 파일이 이미 있습니다" });
  } catch {
    // newPath doesn't exist yet, continue
  }
  const actorName = await getDisplayName(req.user.username);
  const commit = await renameFile(
    resolved.dir,
    oldName,
    newName,
    `이름 변경: ${oldName} → ${newName} (by ${actorName})`
  );
  logAudit({
    username: req.user.username,
    action: "file_rename",
    project: resolved.project,
    branch: resolved.branch,
    file: newName,
    detail: oldName,
  }).catch(() => {});
  res.json({ ok: true, commit, name: newName });
});

router.post("/:name/archive", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  if (!(await assertCanWrite(resolved.project, resolved.branch, req, res))) return;
  const name = req.params.name;
  const srcPath = safeFilePath(resolved.dir, name);
  if (!srcPath) return res.status(400).json({ error: "invalid file name" });
  try {
    await fs.access(srcPath);
  } catch {
    return res.status(404).json({ error: "file not found" });
  }
  await fs.mkdir(path.join(resolved.dir, "archived"), { recursive: true });
  const actorName = await getDisplayName(req.user.username);
  const commit = await renameFile(resolved.dir, name, `archived/${name}`, `보관: ${name} (by ${actorName})`);
  logAudit({
    username: req.user.username,
    action: "file_archive",
    project: resolved.project,
    branch: resolved.branch,
    file: name,
  }).catch(() => {});
  res.json({ ok: true, commit });
});

router.post("/:name/unarchive", async (req, res) => {
  const resolved = await resolveBranch(req, res);
  if (!resolved) return;
  if (!(await assertProjectAccess(resolved, req, res))) return;
  if (!(await assertCanWrite(resolved.project, resolved.branch, req, res))) return;
  const name = req.params.name;
  if (!isValidFileName(name)) return res.status(400).json({ error: "invalid file name" });
  const archivedPath = path.join(resolved.dir, "archived", name);
  try {
    await fs.access(archivedPath);
  } catch {
    return res.status(404).json({ error: "archived file not found" });
  }
  const destPath = safeFilePath(resolved.dir, name);
  if (!destPath) return res.status(400).json({ error: "invalid file name" });
  try {
    await fs.access(destPath);
    return res.status(409).json({ error: "같은 이름의 파일이 이미 있습니다" });
  } catch {
    // destPath doesn't exist yet, continue
  }
  const actorName = await getDisplayName(req.user.username);
  const commit = await renameFile(resolved.dir, `archived/${name}`, name, `보관 해제: ${name} (by ${actorName})`);
  logAudit({
    username: req.user.username,
    action: "file_unarchive",
    project: resolved.project,
    branch: resolved.branch,
    file: name,
  }).catch(() => {});
  res.json({ ok: true, commit });
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
    logAudit({
      username: req.user.username,
      action: "file_delete",
      project: resolved.project,
      branch: resolved.branch,
      file: req.params.name,
    }).catch(() => {});
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "file not found" });
  }
});

export default router;
