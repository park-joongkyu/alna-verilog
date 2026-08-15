import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./jsonStore.js";

const SECRET_FILE = path.join(DATA_DIR, "jwt-secret.txt");
const TOKEN_TTL = "30d";

let cachedSecret = null;

async function getSecret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.JWT_SECRET) {
    cachedSecret = process.env.JWT_SECRET;
    return cachedSecret;
  }
  try {
    cachedSecret = (await fs.readFile(SECRET_FILE, "utf-8")).trim();
  } catch {
    cachedSecret = crypto.randomBytes(48).toString("hex");
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SECRET_FILE, cachedSecret, "utf-8");
  }
  return cachedSecret;
}

export async function signToken(username) {
  const secret = await getSecret();
  return jwt.sign({ sub: username }, secret, { expiresIn: TOKEN_TTL });
}

export async function verifyToken(token) {
  const secret = await getSecret();
  try {
    const payload = jwt.verify(token, secret);
    return { username: payload.sub };
  } catch {
    return null;
  }
}
