import { Router } from "express";
import { listAllUsers, findUser, setPassword, getDisplayName, unlockUser } from "../lib/users.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { listAccessLog } from "../lib/accessLog.js";
import { listAuditLog } from "../lib/auditLog.js";
import { listOnline } from "../lib/presence.js";
import { getInviteCode, setInviteCode } from "../lib/settings.js";
import { logAudit } from "../lib/auditLog.js";

const router = Router();

router.use(requireAdmin);

router.get("/users", async (_req, res) => {
  const users = await listAllUsers();
  res.json({ users });
});

router.get("/presence", async (_req, res) => {
  const users = await listAllUsers();
  const online = await Promise.all(
    listOnline().map(async (e) => ({ ...e, name: await getDisplayName(e.username) }))
  );
  online.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  res.json({ online, totalUsers: users.length });
});

router.get("/access-log", async (_req, res) => {
  const entries = await listAccessLog();
  const withNames = await Promise.all(
    entries.map(async (e) => ({ ...e, name: await getDisplayName(e.username) }))
  );
  res.json({ entries: withNames });
});

router.get("/audit-log", async (_req, res) => {
  const entries = await listAuditLog();
  const withNames = await Promise.all(
    entries.map(async (e) => ({ ...e, name: await getDisplayName(e.username) }))
  );
  res.json({ entries: withNames });
});

router.post("/users/:username/reset-password", async (req, res) => {
  const { username } = req.params;
  const { newPassword } = req.body || {};
  if (typeof newPassword !== "string" || newPassword.length < 4) {
    return res.status(400).json({ error: "비밀번호는 4자 이상이어야 합니다" });
  }
  const user = await findUser(username);
  if (!user) return res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
  await setPassword(username, newPassword);
  res.json({ ok: true });
});

router.post("/users/:username/unlock", async (req, res) => {
  const { username } = req.params;
  const user = await findUser(username);
  if (!user) return res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
  await unlockUser(username);
  res.json({ ok: true });
});

router.get("/invite-code", async (_req, res) => {
  res.json({ inviteCode: await getInviteCode() });
});

router.post("/invite-code", async (req, res) => {
  const { inviteCode } = req.body || {};
  if (typeof inviteCode !== "string" || !inviteCode.trim()) {
    return res.status(400).json({ error: "접속 코드를 입력하세요" });
  }
  await setInviteCode(inviteCode.trim());
  logAudit({ username: req.user.username, action: "invite_code_change" }).catch(() => {});
  res.json({ ok: true });
});

export default router;
