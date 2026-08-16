import { Router } from "express";
import {
  isValidUsername,
  isValidEmail,
  isValidName,
  createUser,
  verifyPassword,
  findUser,
  setPassword,
  isLocked,
  recordLoginFailure,
  recordLoginSuccess,
} from "../lib/users.js";
import { signToken } from "../lib/auth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { createResetToken, consumeResetToken } from "../lib/resetTokens.js";
import { sendPasswordResetEmail, isMailConfigured } from "../lib/mailer.js";
import { logAccess } from "../lib/accessLog.js";

const router = Router();

router.post("/register", async (req, res) => {
  const { username, password, email, name, inviteCode } = req.body || {};
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: "아이디는 영문/숫자/_/- 2~32자여야 합니다" });
  }
  if (typeof password !== "string" || password.length < 4) {
    return res.status(400).json({ error: "비밀번호는 4자 이상이어야 합니다" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "올바른 이메일 주소를 입력하세요" });
  }
  if (!isValidName(name)) {
    return res.status(400).json({ error: "이름을 입력하세요" });
  }
  if (typeof inviteCode !== "string" || inviteCode !== process.env.REGISTER_INVITE_CODE) {
    return res.status(403).json({ error: "접속 코드가 올바르지 않습니다" });
  }
  try {
    await createUser(username, password, email, name);
    res.status(201).json({ ok: true, username });
  } catch (err) {
    if (err.code === "USER_EXISTS" || err.code === "EMAIL_EXISTS") {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: "회원가입 실패" });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "아이디와 비밀번호를 입력하세요" });
  }
  if (await isLocked(username)) {
    return res.status(423).json({ error: "로그인 실패 횟수를 초과하여 계정이 잠겼습니다. 관리자에게 문의해주세요." });
  }
  const ok = await verifyPassword(username, password);
  if (!ok) {
    await recordLoginFailure(username);
    return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다" });
  }
  await recordLoginSuccess(username);
  const token = await signToken(username);
  const user = await findUser(username);
  logAccess({ username, ip: req.ip, userAgent: req.headers["user-agent"] }).catch(() => {});
  res.json({ token, username, name: user?.name ?? username, isAdmin: user?.role === "admin" });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await findUser(req.user.username);
  res.json({
    username: req.user.username,
    name: user?.name ?? req.user.username,
    isAdmin: user?.role === "admin",
  });
});

router.post("/forgot-password", async (req, res) => {
  const { username } = req.body || {};
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: "아이디를 입력하세요" });
  }
  if (!isMailConfigured()) {
    return res.status(503).json({ error: "메일 발송 기능이 서버에 설정되어 있지 않습니다." });
  }

  const user = await findUser(username);
  // Respond the same way whether or not the user exists, so this endpoint
  // can't be used to check which usernames are registered.
  if (user) {
    const token = await createResetToken(username);
    const origin = req.headers.origin || process.env.FRONTEND_ORIGIN || "http://localhost:5173";
    const resetUrl = `${origin}/?resetToken=${token}`;
    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      console.error("password reset email failed:", err.message);
    }
  }
  res.json({ ok: true, message: "가입하신 이메일로 재설정 링크를 보냈습니다 (계정이 존재하는 경우)." });
});

router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (typeof token !== "string" || !token) {
    return res.status(400).json({ error: "잘못된 요청입니다" });
  }
  if (typeof newPassword !== "string" || newPassword.length < 4) {
    return res.status(400).json({ error: "비밀번호는 4자 이상이어야 합니다" });
  }
  const username = await consumeResetToken(token);
  if (!username) {
    return res.status(400).json({ error: "링크가 만료됐거나 이미 사용됐습니다. 다시 요청해주세요." });
  }
  await setPassword(username, newPassword);
  const authToken = await signToken(username);
  res.json({ ok: true, token: authToken, username });
});

export default router;
