// One-off migration: moves the single existing project (server/workspace +
// server/branches) into server/projects/<PROJECT_ID>/{workspace,branches},
// repairs git worktree links, and updates data/branch-owners.json +
// data/projects.json to match. Idempotent - safe to re-run if it aborts
// before making changes (it always backs up before moving anything).
//
// Run with: node server/scripts/migrate-to-projects.js
// Must be run with the server process STOPPED.

import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ID = "bbht-grover";
const PROJECT_NAME = "BBHT Grover FPGA RTL";
const PROJECT_CREATED_BY = "migration";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, "..");
const OLD_WORKSPACE = path.join(SERVER_ROOT, "workspace");
const OLD_BRANCHES = path.join(SERVER_ROOT, "branches");
const PROJECTS_ROOT = path.join(SERVER_ROOT, "projects");
const PROJECT_DIR = path.join(PROJECTS_ROOT, PROJECT_ID);
const NEW_WORKSPACE = path.join(PROJECT_DIR, "workspace");
const NEW_BRANCHES = path.join(PROJECT_DIR, "branches");
const DATA_DIR = path.join(SERVER_ROOT, "data");
const BACKUP_DIR = path.join(SERVER_ROOT, `.migration-backup-${Date.now()}`);

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

function log(msg) {
  console.log(`[migrate] ${msg}`);
}

async function listBranchDirs(branchesDir) {
  if (!existsSync(branchesDir)) return [];
  const entries = await fs.readdir(branchesDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function main() {
  if (existsSync(NEW_WORKSPACE)) {
    log(`already migrated (${NEW_WORKSPACE} exists) - nothing to do.`);
    return;
  }
  if (!existsSync(OLD_WORKSPACE)) {
    throw new Error(`no workspace found at ${OLD_WORKSPACE} - nothing to migrate`);
  }

  log("capturing pre-migration commit hash list...");
  const beforeHashes = git(OLD_WORKSPACE, ["log", "--format=%H"]);

  const branchNames = await listBranchDirs(OLD_BRANCHES);
  log(`found ${branchNames.length} branch worktree(s): ${branchNames.join(", ") || "(none)"}`);

  log(`backing up to ${BACKUP_DIR} ...`);
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.cp(OLD_WORKSPACE, path.join(BACKUP_DIR, "workspace"), { recursive: true });
  if (existsSync(OLD_BRANCHES)) {
    await fs.cp(OLD_BRANCHES, path.join(BACKUP_DIR, "branches"), { recursive: true });
  }

  log(`creating ${PROJECT_DIR} ...`);
  await fs.mkdir(PROJECT_DIR, { recursive: true });

  log(`moving workspace -> ${NEW_WORKSPACE} ...`);
  await fs.rename(OLD_WORKSPACE, NEW_WORKSPACE);

  if (existsSync(OLD_BRANCHES)) {
    log(`moving branches -> ${NEW_BRANCHES} ...`);
    await fs.rename(OLD_BRANCHES, NEW_BRANCHES);
  } else {
    await fs.mkdir(NEW_BRANCHES, { recursive: true });
  }

  const rollback = async (reason) => {
    console.error(`[migrate] VERIFICATION FAILED: ${reason}`);
    console.error("[migrate] rolling back from backup...");
    await fs.rm(PROJECT_DIR, { recursive: true, force: true });
    await fs.cp(path.join(BACKUP_DIR, "workspace"), OLD_WORKSPACE, { recursive: true });
    if (existsSync(path.join(BACKUP_DIR, "branches"))) {
      await fs.cp(path.join(BACKUP_DIR, "branches"), OLD_BRANCHES, { recursive: true });
    }
    console.error(`[migrate] rolled back. Original data restored. Backup kept at ${BACKUP_DIR} for inspection.`);
    process.exit(1);
  };

  try {
    log("repairing worktree links (main -> worktrees)...");
    if (branchNames.length > 0) {
      const branchPaths = branchNames.map((n) => path.join(NEW_BRANCHES, n));
      git(NEW_WORKSPACE, ["worktree", "repair", ...branchPaths]);
    }

    log("repairing worktree links (worktrees -> main)...");
    for (const name of branchNames) {
      git(path.join(NEW_BRANCHES, name), ["worktree", "repair"]);
    }
  } catch (err) {
    await rollback(`worktree repair threw: ${err.message}`);
    return;
  }

  log("verifying...");
  try {
    const worktreeList = git(NEW_WORKSPACE, ["worktree", "list"]);
    log(`worktree list:\n${worktreeList}`);
    if (/prunable|error/i.test(worktreeList)) {
      throw new Error(`worktree list shows an issue:\n${worktreeList}`);
    }

    git(NEW_WORKSPACE, ["status"]);
    for (const name of branchNames) {
      git(path.join(NEW_BRANCHES, name), ["status"]);
    }

    const afterHashes = git(NEW_WORKSPACE, ["log", "--format=%H"]);
    if (afterHashes !== beforeHashes) {
      throw new Error("commit hash list changed after migration - data may be corrupted");
    }
  } catch (err) {
    await rollback(err.message);
    return;
  }

  log("verification passed. Updating data files...");

  const ownersPath = path.join(DATA_DIR, "branch-owners.json");
  if (existsSync(ownersPath)) {
    const owners = JSON.parse(await fs.readFile(ownersPath, "utf-8"));
    const migrated = {};
    for (const [k, v] of Object.entries(owners)) {
      migrated[k.includes("::") ? k : `${PROJECT_ID}::${k}`] = v;
    }
    await fs.writeFile(ownersPath, JSON.stringify(migrated, null, 2), "utf-8");
    log(`migrated ${Object.keys(owners).length} branch-owner entr(y/ies) to project-scoped keys.`);
  }

  const projectsPath = path.join(DATA_DIR, "projects.json");
  let projects = {};
  if (existsSync(projectsPath)) {
    projects = JSON.parse(await fs.readFile(projectsPath, "utf-8"));
  }
  if (!projects[PROJECT_ID]) {
    projects[PROJECT_ID] = { name: PROJECT_NAME, createdBy: PROJECT_CREATED_BY, createdAt: new Date().toISOString() };
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(projectsPath, JSON.stringify(projects, null, 2), "utf-8");
    log(`registered project '${PROJECT_ID}' in projects.json.`);
  }

  log(`done. Backup kept at ${BACKUP_DIR} - safe to delete once you've confirmed everything works.`);
}

main().catch((err) => {
  console.error("[migrate] fatal error:", err);
  process.exit(1);
});
