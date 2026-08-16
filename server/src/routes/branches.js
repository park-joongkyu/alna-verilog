import { Router } from "express";
import { listBranches, createBranchWorktree, removeBranchWorktree, branchRefExists } from "../lib/git.js";
import { isValidBranchName, isValidProjectId, projectExists, branchExists, MAIN_BRANCH } from "../lib/workspace.js";
import {
  getAllOwners,
  getOwner,
  setOwner,
  removeOwner,
  addCollaborator,
  removeCollaborator,
} from "../lib/branchOwners.js";
import { getDisplayName, isAdmin, findUser } from "../lib/users.js";
import { canAccessProject } from "../lib/projects.js";
import { logAudit } from "../lib/auditLog.js";

const router = Router();

async function resolveProject(req, res, source) {
  const project = source === "query" ? req.query.project : req.body?.project;
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
  return project;
}

router.get("/", async (req, res) => {
  const project = await resolveProject(req, res, "query");
  if (!project) return;
  const [branches, owners] = await Promise.all([listBranches(project), getAllOwners(project)]);
  const withOwners = await Promise.all(
    branches.map(async (b) => {
      const entry = owners[b.name] ?? { owner: null, collaborators: [] };
      const owner = entry.owner;
      const ownerName = owner ? await getDisplayName(owner) : null;
      const collaborators = await Promise.all(
        entry.collaborators.map(async (username) => ({ username, name: await getDisplayName(username) }))
      );
      return { ...b, owner, ownerName, collaborators };
    })
  );
  res.json({ branches: withOwners });
});

router.post("/", async (req, res) => {
  const project = await resolveProject(req, res, "body");
  if (!project) return;
  const { name } = req.body || {};
  if (!isValidBranchName(name)) {
    return res.status(400).json({ error: "브랜치 이름은 영문/숫자/_/- 만 가능합니다" });
  }
  if (name === MAIN_BRANCH) {
    return res.status(409).json({ error: "main은 이미 존재하는 브랜치입니다" });
  }
  if (await branchExists(project, name)) {
    return res.status(409).json({ error: "이미 존재하는 브랜치입니다" });
  }
  try {
    await createBranchWorktree(project, name);
    await setOwner(project, name, req.user.username);
    res.status(201).json({ ok: true, name });
  } catch (err) {
    res.status(500).json({ error: err.message || "브랜치 생성 실패" });
  }
});

router.post("/:name/claim", async (req, res) => {
  const project = await resolveProject(req, res, "body");
  if (!project) return;
  const { name } = req.params;
  if (!(await branchExists(project, name)) || name === MAIN_BRANCH) {
    return res.status(404).json({ error: "브랜치를 찾을 수 없습니다" });
  }
  const existingOwner = await getOwner(project, name);
  if (existingOwner) {
    const ownerName = await getDisplayName(existingOwner);
    return res.status(409).json({ error: `이미 ${ownerName}님의 브랜치입니다` });
  }
  await setOwner(project, name, req.user.username);
  res.json({ ok: true, owner: req.user.username });
});

router.post("/:name/transfer", async (req, res) => {
  const project = await resolveProject(req, res, "body");
  if (!project) return;
  const { name } = req.params;
  const { toUsername } = req.body || {};
  if (!(await branchExists(project, name)) || name === MAIN_BRANCH) {
    return res.status(404).json({ error: "브랜치를 찾을 수 없습니다" });
  }
  const owner = await getOwner(project, name);
  if (owner !== req.user.username && !(await isAdmin(req.user.username))) {
    return res.status(403).json({ error: "이 브랜치의 소유자 또는 관리자만 넘길 수 있습니다" });
  }
  const target = await findUser(toUsername);
  if (!target) {
    return res.status(404).json({ error: "해당 아이디의 사용자를 찾을 수 없습니다" });
  }
  await setOwner(project, name, toUsername);
  res.json({ ok: true, owner: toUsername, ownerName: target.name });
});

router.post("/:name/collaborators", async (req, res) => {
  const project = await resolveProject(req, res, "body");
  if (!project) return;
  const { name } = req.params;
  const { username } = req.body || {};
  if (!(await branchExists(project, name)) || name === MAIN_BRANCH) {
    return res.status(404).json({ error: "브랜치를 찾을 수 없습니다" });
  }
  const owner = await getOwner(project, name);
  if (owner !== req.user.username && !(await isAdmin(req.user.username))) {
    return res.status(403).json({ error: "이 브랜치의 소유자 또는 관리자만 협업자를 추가할 수 있습니다" });
  }
  const target = await findUser(username);
  if (!target) {
    return res.status(404).json({ error: "해당 아이디의 사용자를 찾을 수 없습니다" });
  }
  if (username === owner) {
    return res.status(409).json({ error: "이미 이 브랜치의 소유자입니다" });
  }
  await addCollaborator(project, name, username);
  res.json({ ok: true, username, name: target.name });
});

router.delete("/:name/collaborators/:username", async (req, res) => {
  const project = await resolveProject(req, res, "query");
  if (!project) return;
  const { name, username } = req.params;
  if (!(await branchExists(project, name)) || name === MAIN_BRANCH) {
    return res.status(404).json({ error: "브랜치를 찾을 수 없습니다" });
  }
  const owner = await getOwner(project, name);
  const isSelf = username === req.user.username;
  if (owner !== req.user.username && !isSelf && !(await isAdmin(req.user.username))) {
    return res.status(403).json({ error: "이 브랜치의 소유자, 본인, 또는 관리자만 협업자를 제거할 수 있습니다" });
  }
  await removeCollaborator(project, name, username);
  res.json({ ok: true });
});

router.delete("/:name", async (req, res) => {
  const project = await resolveProject(req, res, "query");
  if (!project) return;
  const { name } = req.params;
  if (name === MAIN_BRANCH) {
    return res.status(403).json({ error: "main 브랜치는 삭제할 수 없습니다" });
  }
  if (!(await branchRefExists(project, name))) {
    return res.status(404).json({ error: "브랜치를 찾을 수 없습니다" });
  }
  const owner = await getOwner(project, name);
  if (owner !== req.user.username && !(await isAdmin(req.user.username))) {
    return res.status(403).json({ error: "이 브랜치의 소유자 또는 관리자만 삭제할 수 있습니다" });
  }
  try {
    await removeBranchWorktree(project, name);
    await removeOwner(project, name);
    logAudit({ username: req.user.username, action: "branch_delete", project, branch: name }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "브랜치 삭제 실패" });
  }
});

export default router;
