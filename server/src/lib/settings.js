import { readJson, writeJson } from "./jsonStore.js";

const FILE = "settings.json";

export async function getInviteCode() {
  const settings = await readJson(FILE, {});
  return settings.inviteCode ?? process.env.REGISTER_INVITE_CODE ?? null;
}

export async function setInviteCode(code) {
  const settings = await readJson(FILE, {});
  settings.inviteCode = code;
  await writeJson(FILE, settings);
}
