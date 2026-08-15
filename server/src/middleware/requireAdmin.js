import { isAdmin } from "../lib/users.js";

export async function requireAdmin(req, res, next) {
  if (!(await isAdmin(req.user.username))) {
    return res.status(403).json({ error: "관리자만 접근할 수 있습니다" });
  }
  next();
}
