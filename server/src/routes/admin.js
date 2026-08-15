import { Router } from "express";
import { listAllUsers, findUser, setPassword, getDisplayName } from "../lib/users.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { listAccessLog } from "../lib/accessLog.js";

const router = Router();

router.use(requireAdmin);

router.get("/users", async (_req, res) => {
  const users = await listAllUsers();
  res.json({ users });
});

router.get("/access-log", async (_req, res) => {
  const entries = await listAccessLog();
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

export default router;
