import { Router } from "express";
import {
  listProjectsFor,
  getProject,
  createProject,
  deleteProject,
  addMember,
  removeMember,
  canAccessProject,
} from "../lib/projects.js";
import { isValidProjectId } from "../lib/workspace.js";
import { isAdmin, findUser, getDisplayName } from "../lib/users.js";
import { logAudit } from "../lib/auditLog.js";

const router = Router();

async function withMemberNames(project) {
  const memberDetails = await Promise.all(
    project.members.map(async (username) => ({ username, name: await getDisplayName(username) }))
  );
  return { ...project, memberDetails };
}

router.get("/", async (req, res) => {
  const userIsAdmin = await isAdmin(req.user.username);
  const list = await listProjectsFor(req.user.username, userIsAdmin);
  const withNames = await Promise.all(list.map(withMemberNames));
  res.json({ projects: withNames });
});

router.post("/", async (req, res) => {
  const { id, name } = req.body || {};
  if (!isValidProjectId(id)) {
    return res.status(400).json({ error: "프로젝트 id는 영문/숫자/_/- 만 가능합니다" });
  }
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "프로젝트 이름을 입력하세요" });
  }
  if (await getProject(id)) {
    return res.status(409).json({ error: "이미 존재하는 프로젝트입니다" });
  }
  try {
    const project = await createProject(id, name.trim(), req.user.username);
    res.status(201).json({ ok: true, project });
  } catch (err) {
    res.status(500).json({ error: err.message || "프로젝트 생성 실패" });
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const project = await getProject(id);
  if (!project) return res.status(404).json({ error: "프로젝트를 찾을 수 없습니다" });
  if (!(await isAdmin(req.user.username))) {
    return res.status(403).json({ error: "프로젝트 삭제는 관리자만 할 수 있습니다" });
  }
  await deleteProject(id);
  logAudit({ username: req.user.username, action: "project_delete", project: id }).catch(() => {});
  res.json({ ok: true });
});

router.post("/:id/members", async (req, res) => {
  const { id } = req.params;
  const { username } = req.body || {};
  const project = await getProject(id);
  if (!project) return res.status(404).json({ error: "프로젝트를 찾을 수 없습니다" });
  if (!(await canAccessProject(id, req.user.username))) {
    return res.status(403).json({ error: "이 프로젝트의 멤버 또는 관리자만 초대할 수 있습니다" });
  }
  const target = await findUser(username);
  if (!target) return res.status(404).json({ error: "해당 아이디의 사용자를 찾을 수 없습니다" });
  const updated = await addMember(id, username);
  res.json({ ok: true, project: await withMemberNames(updated) });
});

router.delete("/:id/members/:username", async (req, res) => {
  const { id, username } = req.params;
  const project = await getProject(id);
  if (!project) return res.status(404).json({ error: "프로젝트를 찾을 수 없습니다" });
  const isSelf = username === req.user.username;
  if (!isSelf && !(await isAdmin(req.user.username))) {
    return res.status(403).json({ error: "멤버 제외는 관리자 또는 본인만 할 수 있습니다" });
  }
  const updated = await removeMember(id, username);
  res.json({ ok: true, project: await withMemberNames(updated) });
});

export default router;
