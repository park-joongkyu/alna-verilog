import { verifyToken } from "../lib/auth.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "로그인이 필요합니다" });

  const user = await verifyToken(token);
  if (!user) return res.status(401).json({ error: "세션이 만료됐습니다. 다시 로그인해주세요" });

  req.user = user;
  next();
}
