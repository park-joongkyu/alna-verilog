import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECTS_ROOT = path.resolve(__dirname, "..", "..", "projects");
export const MAIN_BRANCH = "main";

const VALID_NAME = /^[A-Za-z0-9_\-]+\.(v|vh)$/;
const VALID_BRANCH_NAME = /^[A-Za-z0-9_-]+$/;
const VALID_PROJECT_ID = /^[A-Za-z0-9_-]+$/;

export function isValidFileName(name) {
  return typeof name === "string" && VALID_NAME.test(name);
}

// .v and .vh are both plain Verilog source to Icarus Verilog (it doesn't
// gate behavior by extension) - .vh is just the convention for headers
// pulled in via `include`, so it's listed/simulated the same as .v.
export function isSourceFileName(name) {
  return typeof name === "string" && (name.endsWith(".v") || name.endsWith(".vh"));
}

export function isValidBranchName(name) {
  return typeof name === "string" && VALID_BRANCH_NAME.test(name) && name !== ".git";
}

export function isValidProjectId(id) {
  return typeof id === "string" && VALID_PROJECT_ID.test(id);
}

const TESTBENCH_RE = /(^|_)tb(_|\.|$)/i;

export function isTestbenchName(name) {
  return typeof name === "string" && TESTBENCH_RE.test(name);
}

export function projectDir(project) {
  return path.join(PROJECTS_ROOT, project);
}

export function workspaceDir(project) {
  return path.join(projectDir(project), "workspace");
}

export function branchesRoot(project) {
  return path.join(projectDir(project), "branches");
}

export async function projectExists(project) {
  if (!isValidProjectId(project)) return false;
  try {
    await fs.access(workspaceDir(project));
    return true;
  } catch {
    return false;
  }
}

export function safeFilePath(baseDir, name) {
  if (!isValidFileName(name)) return null;
  const full = path.join(baseDir, name);
  if (path.dirname(full) !== baseDir) return null;
  return full;
}

export function branchWorktreeDir(project, branch) {
  if (!branch || branch === MAIN_BRANCH) return workspaceDir(project);
  if (!isValidBranchName(branch)) return null;
  return path.join(branchesRoot(project), branch);
}

export async function branchExists(project, branch) {
  const dir = branchWorktreeDir(project, branch);
  if (!dir) return false;
  try {
    await fs.access(dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves ?project=&branch= query params to a worktree dir, branch
 * defaulting to main. Project has no default - it must be explicit.
 * Returns null (and does not respond) on success info; caller should check.
 */
export async function resolveBranch(req, res) {
  const project = req.query.project || req.body?.project;
  if (!isValidProjectId(project)) {
    res.status(400).json({ error: "invalid or missing project" });
    return null;
  }
  if (!(await projectExists(project))) {
    res.status(404).json({ error: `project '${project}' not found` });
    return null;
  }
  const branch = req.query.branch || req.body?.branch || MAIN_BRANCH;
  if (!isValidBranchName(branch) && branch !== MAIN_BRANCH) {
    res.status(400).json({ error: "invalid branch name" });
    return null;
  }
  const dir = branchWorktreeDir(project, branch);
  if (!(await branchExists(project, branch))) {
    res.status(404).json({ error: `branch '${branch}' not found` });
    return null;
  }
  return { project, branch, dir };
}
