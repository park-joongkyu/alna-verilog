import { simpleGit, CheckRepoActions } from "simple-git";
import fs from "node:fs/promises";
import path from "node:path";
import { workspaceDir, branchesRoot, MAIN_BRANCH } from "./workspace.js";

const BOT_NAME = "RTL Collab";
const BOT_EMAIL = "collab@local";

function client(dir) {
  return simpleGit(dir);
}

export async function ensureMainRepo(project) {
  const dir = workspaceDir(project);
  await fs.mkdir(dir, { recursive: true });
  const git = client(dir);
  const isRepo = await git.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
  if (!isRepo) {
    await git.init(["--initial-branch=main"]);
  }
  await git.addConfig("user.name", BOT_NAME, false, "local");
  await git.addConfig("user.email", BOT_EMAIL, false, "local");

  const hasCommits = await git
    .log()
    .then(() => true)
    .catch(() => false);

  if (!hasCommits) {
    await git.add(["-A"]);
    const status = await git.status();
    if (status.staged.length > 0) {
      await git.commit("초기 커밋: 워크스페이스 시딩");
    } else {
      // No files to seed (e.g. a brand-new empty project) - branches still
      // need main to have at least one commit to branch off of, so seed an
      // empty one rather than leaving main "unborn".
      await git.raw(["commit", "--allow-empty", "-m", "초기 커밋: 프로젝트 생성"]);
    }
  }
}

/**
 * Stages the given files (relative names) and commits if there is an actual diff.
 * Returns the new commit hash, or null if nothing changed.
 */
export async function commitIfChanged(dir, fileNames, message) {
  const git = client(dir);
  await git.add(fileNames);
  const status = await git.status();
  if (status.staged.length === 0) return null;
  const result = await git.commit(message);
  return result.commit;
}

export async function renameFile(dir, oldName, newName, message) {
  const git = client(dir);
  await git.mv(oldName, newName);
  const result = await git.commit(message);
  return result.commit;
}

/**
 * Renames multiple files (each [oldName, newName] pair) in one commit.
 */
export async function renameFiles(dir, pairs, message) {
  const git = client(dir);
  for (const [oldName, newName] of pairs) {
    await git.mv(oldName, newName);
  }
  const result = await git.commit(message);
  return result.commit;
}

export async function attachNoteToHead(dir, noteObj) {
  const git = client(dir);
  const hash = await git.revparse(["HEAD"]);
  const json = JSON.stringify(noteObj);
  await git.raw(["notes", "add", "-f", "-m", json, hash]);
  return hash;
}

export async function getHistory(dir, limit = 100, since, until, file) {
  const git = client(dir);
  const args = [`-${limit}`, "--notes"];
  if (since) args.push(`--since=${since} 00:00:00`);
  if (until) args.push(`--until=${until} 23:59:59`);
  if (file) args.push("--", file);
  let logResult;
  try {
    logResult = await git.log(args);
  } catch {
    return []; // repo has no commits yet
  }
  const entries = [];
  for (const commit of logResult.all) {
    let note = null;
    try {
      const raw = await git.raw(["notes", "show", commit.hash]);
      note = JSON.parse(raw.trim());
    } catch {
      note = null;
    }
    entries.push({
      hash: commit.hash,
      shortHash: commit.hash.slice(0, 7),
      message: commit.message,
      date: commit.date,
      note,
    });
  }
  return entries;
}

export async function getFileAtCommit(dir, hash, fileName) {
  return client(dir).show([`${hash}:${fileName}`]);
}

export async function revertToCommit(dir, hash, actorName) {
  const git = client(dir);
  await git.raw(["checkout", hash, "--", "."]);
  await git.add(["-A"]);
  const status = await git.status();
  if (status.staged.length === 0) {
    return null; // working tree already matches that commit
  }
  const short = hash.slice(0, 7);
  const suffix = actorName ? ` (by ${actorName})` : "";
  const result = await git.commit(`되돌리기: ${short} 시점으로 복원${suffix}`);
  return result.commit;
}

export async function revertFileToCommit(dir, hash, fileName, actorName) {
  const git = client(dir);
  await git.raw(["checkout", hash, "--", fileName]);
  await git.add([fileName]);
  const status = await git.status();
  if (status.staged.length === 0) {
    return null; // file already matches that commit
  }
  const short = hash.slice(0, 7);
  const suffix = actorName ? ` (by ${actorName})` : "";
  const result = await git.commit(`되돌리기: ${fileName} → ${short} 시점으로 복원${suffix}`);
  return result.commit;
}

export async function listBranches(project) {
  const git = client(workspaceDir(project));
  const raw = await git.raw(["branch", "--format=%(refname:short)"]);
  const names = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const branches = [];
  for (const name of names) {
    let lastCommit = null;
    try {
      const log = await git.log([name, "-1"]);
      if (log.latest) {
        lastCommit = {
          hash: log.latest.hash,
          shortHash: log.latest.hash.slice(0, 7),
          date: log.latest.date,
          message: log.latest.message,
        };
      }
    } catch {
      lastCommit = null;
    }
    branches.push({ name, isMain: name === MAIN_BRANCH, lastCommit });
  }
  return branches;
}

export async function branchRefExists(project, name) {
  const git = client(workspaceDir(project));
  try {
    await git.raw(["rev-parse", "--verify", `refs/heads/${name}`]);
    return true;
  } catch {
    return false;
  }
}

export async function createBranchWorktree(project, name) {
  const git = client(workspaceDir(project));
  await fs.mkdir(branchesRoot(project), { recursive: true });
  const target = path.join(branchesRoot(project), name);
  await git.raw(["worktree", "add", target, "-b", name, MAIN_BRANCH]);
  return target;
}

export async function removeBranchWorktree(project, name) {
  const git = client(workspaceDir(project));
  const target = path.join(branchesRoot(project), name);
  try {
    await git.raw(["worktree", "remove", target, "--force"]);
  } catch {
    // Worktree entry may be stale/missing (e.g. its directory never existed
    // on this machine) - clear the administrative metadata instead so the
    // branch ref can still be deleted below.
    await git.raw(["worktree", "prune"]).catch(() => {});
    await fs.rm(target, { recursive: true, force: true }).catch(() => {});
  }
  await git.raw(["branch", "-D", name]);
}

export async function isMergeInProgress(dir) {
  const git = client(dir);
  const raw = (await git.raw(["rev-parse", "--git-path", "MERGE_HEAD"])).trim();
  const abs = path.isAbsolute(raw) ? raw : path.join(dir, raw);
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

export async function getConflictedFiles(dir) {
  const git = client(dir);
  const status = await git.status();
  return status.conflicted || [];
}

export async function getConflictSides(dir, fileName) {
  const git = client(dir);
  const readStage = async (stage) => {
    try {
      return await git.show([`:${stage}:${fileName}`]);
    } catch {
      return null;
    }
  };
  const [base, ours, theirs] = await Promise.all([readStage(1), readStage(2), readStage(3)]);
  return { base, ours, theirs };
}

/**
 * Attempts `git merge --no-ff <source>` into the branch checked out at `dir`.
 * Returns { status: "merged", commit } or { status: "conflict", files }.
 */
export async function mergeBranch(dir, source, targetLabel = MAIN_BRANCH, actorName) {
  const git = client(dir);
  const suffix = actorName ? ` (by ${actorName})` : "";
  const message = `Merge branch '${source}' into ${targetLabel}${suffix}`;
  try {
    await git.merge(["--no-ff", source, "-m", message]);
    const commit = await git.revparse(["HEAD"]);
    return { status: "merged", commit };
  } catch {
    const conflicted = await getConflictedFiles(dir);
    if (conflicted.length > 0) {
      return { status: "conflict", files: conflicted };
    }
    throw new Error("merge failed");
  }
}

export async function resolveConflictFile(dir, fileName, content) {
  await fs.writeFile(path.join(dir, fileName), content, "utf-8");
  await client(dir).add([fileName]);
}

export async function completeMerge(dir) {
  const git = client(dir);
  const conflicted = await getConflictedFiles(dir);
  if (conflicted.length > 0) {
    const err = new Error(`아직 해결되지 않은 충돌이 있습니다: ${conflicted.join(", ")}`);
    err.code = "UNRESOLVED_CONFLICTS";
    throw err;
  }
  await git.raw(["commit", "--no-edit"]);
  return git.revparse(["HEAD"]);
}

export async function abortMerge(dir) {
  await client(dir).raw(["merge", "--abort"]);
}
