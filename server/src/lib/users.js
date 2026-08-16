import bcrypt from "bcryptjs";
import { readJson, writeJson } from "./jsonStore.js";

const FILE = "users.json";
const VALID_USERNAME = /^[A-Za-z0-9_-]{2,32}$/;
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FAILED_ATTEMPTS = 10;

export function isValidUsername(name) {
  return typeof name === "string" && VALID_USERNAME.test(name);
}

export function isValidEmail(email) {
  return typeof email === "string" && VALID_EMAIL.test(email);
}

export function isValidName(name) {
  return typeof name === "string" && name.trim().length >= 1 && name.trim().length <= 50;
}

async function loadUsers() {
  return readJson(FILE, []);
}

export async function findUser(username) {
  const users = await loadUsers();
  return users.find((u) => u.username === username) ?? null;
}

export async function getDisplayName(username) {
  const user = await findUser(username);
  return user?.name || username;
}

export async function createUser(username, password, email, name) {
  const users = await loadUsers();
  if (users.some((u) => u.username === username)) {
    const err = new Error("이미 사용 중인 아이디입니다");
    err.code = "USER_EXISTS";
    throw err;
  }
  if (users.some((u) => u.email?.toLowerCase() === email?.toLowerCase())) {
    const err = new Error("이미 가입에 사용된 이메일입니다");
    err.code = "EMAIL_EXISTS";
    throw err;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  users.push({ username, passwordHash, email, name: name.trim(), createdAt: new Date().toISOString() });
  await writeJson(FILE, users);
  return { username };
}

export async function verifyPassword(username, password) {
  const user = await findUser(username);
  if (!user) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export async function setPassword(username, newPassword) {
  const users = await loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) return false;
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.failedAttempts = 0;
  user.lockedAt = null;
  await writeJson(FILE, users);
  return true;
}

export async function isLocked(username) {
  const user = await findUser(username);
  return Boolean(user?.lockedAt);
}

export async function recordLoginFailure(username) {
  const users = await loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user || user.lockedAt) return;
  user.failedAttempts = (user.failedAttempts ?? 0) + 1;
  if (user.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    user.lockedAt = new Date().toISOString();
  }
  await writeJson(FILE, users);
}

export async function recordLoginSuccess(username) {
  const users = await loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user || (!user.failedAttempts && !user.lockedAt)) return;
  user.failedAttempts = 0;
  user.lockedAt = null;
  await writeJson(FILE, users);
}

export async function unlockUser(username) {
  const users = await loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) return false;
  user.failedAttempts = 0;
  user.lockedAt = null;
  await writeJson(FILE, users);
  return true;
}

export async function isAdmin(username) {
  const user = await findUser(username);
  return user?.role === "admin";
}

export async function setRole(username, role) {
  const users = await loadUsers();
  const user = users.find((u) => u.username === username);
  if (!user) return false;
  user.role = role;
  await writeJson(FILE, users);
  return true;
}

export async function listAllUsers() {
  const users = await loadUsers();
  return users.map(({ username, name, email, role, createdAt, failedAttempts, lockedAt }) => ({
    username,
    name,
    email,
    role: role ?? "member",
    createdAt,
    failedAttempts: failedAttempts ?? 0,
    locked: Boolean(lockedAt),
  }));
}
