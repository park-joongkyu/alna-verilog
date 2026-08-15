import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const CANDIDATE_DIRS = [
  process.env.IVERILOG_BIN_DIR,
  "C:\\iverilog\\bin",
  "C:\\Program Files\\iverilog\\bin",
  "C:\\Program Files (x86)\\iverilog\\bin",
].filter(Boolean);

function resolveBin(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  for (const dir of CANDIDATE_DIRS) {
    const full = path.join(dir, exe);
    if (existsSync(full)) return full;
  }
  return exe; // fall back to PATH lookup
}

const IVERILOG_BIN = resolveBin("iverilog");
const VVP_BIN = resolveBin("vvp");

const SIM_TIMEOUT_MS = Number(process.env.SIM_TIMEOUT_MS || 15000);
const MAX_OUTPUT_CHARS = 200_000;

function runProcess(cmd, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      if (stdout.length < MAX_OUTPUT_CHARS) stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < MAX_OUTPUT_CHARS) stderr += d.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}`, timedOut: false });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

function judgePassFail(runStdout, exitCode, timedOut) {
  if (timedOut) return "timeout";
  if (exitCode !== 0) return "fail";
  if (/\$fatal/i.test(runStdout)) return "fail";

  // Only trust explicit tagged markers ("[FAIL] ..." / "FAIL: ..." at the
  // start of a line), not a bare word-boundary search — prose describing a
  // passing check can itself contain the word "fail" (e.g. "8 failed trials
  // should terminate..."), which would otherwise produce false FAILs.
  // Testbenches that print neither marker report "unknown" rather than a guess.
  const hasFailTag = /\[FAIL\]|^FAIL(ED)?:/im.test(runStdout);
  const hasPassTag = /\[PASS\]|^PASS(ED)?:/im.test(runStdout);
  if (hasFailTag) return "fail";
  if (hasPassTag) return "pass";
  return "unknown";
}

/**
 * Compiles and runs every .v file in `dir` together.
 */
export async function runSimulation(dir, files) {
  const outFile = "sim_out.vvp";
  const compileArgs = ["-g2012", "-o", outFile, ...files];

  const compile = await runProcess(IVERILOG_BIN, compileArgs, dir, SIM_TIMEOUT_MS);
  if (compile.code !== 0 || compile.timedOut) {
    return {
      status: compile.timedOut ? "timeout" : "compile_error",
      compileLog: compile.stderr || compile.stdout,
      runLog: "",
    };
  }

  const run = await runProcess(VVP_BIN, [outFile], dir, SIM_TIMEOUT_MS);
  const status = judgePassFail(run.stdout, run.code, run.timedOut);

  return {
    status,
    compileLog: compile.stdout + compile.stderr,
    runLog: run.stdout + (run.stderr ? `\n[stderr]\n${run.stderr}` : ""),
  };
}

export { IVERILOG_BIN, VVP_BIN };
