import { Router } from "express";
import { listFeedback, createFeedback, setFeedbackStatus } from "../lib/feedback.js";
import { isAdmin, getDisplayName } from "../lib/users.js";

const router = Router();
const VALID_CATEGORIES = new Set(["bug", "suggestion", "other"]);

router.post("/", async (req, res) => {
  const { category, message, project } = req.body || {};
  if (!VALID_CATEGORIES.has(category)) {
    return res.status(400).json({ error: "카테고리를 선택하세요" });
  }
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "내용을 입력하세요" });
  }
  const entry = await createFeedback({
    username: req.user.username,
    category,
    message: message.trim(),
    project: typeof project === "string" ? project : null,
  });
  res.status(201).json({ ok: true, feedback: entry });
});

router.get("/", async (req, res) => {
  if (!(await isAdmin(req.user.username))) {
    return res.status(403).json({ error: "관리자만 볼 수 있습니다" });
  }
  const all = await listFeedback();
  const withNames = await Promise.all(
    all.map(async (f) => ({ ...f, name: await getDisplayName(f.username) }))
  );
  res.json({ feedback: withNames });
});

router.post("/:id/status", async (req, res) => {
  if (!(await isAdmin(req.user.username))) {
    return res.status(403).json({ error: "관리자만 변경할 수 있습니다" });
  }
  const { status } = req.body || {};
  if (!["open", "resolved"].includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }
  const entry = await setFeedbackStatus(req.params.id, status);
  if (!entry) return res.status(404).json({ error: "찾을 수 없습니다" });
  res.json({ ok: true, feedback: entry });
});

export default router;
