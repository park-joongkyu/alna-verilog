import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import filesRouter from "./routes/files.js";
import simulateRouter from "./routes/simulate.js";
import historyRouter from "./routes/history.js";
import branchesRouter from "./routes/branches.js";
import mergeRouter from "./routes/merge.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import projectsRouter from "./routes/projects.js";
import feedbackRouter from "./routes/feedback.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { authRateLimit } from "./middleware/authRateLimit.js";
import { PROJECTS_ROOT } from "./lib/workspace.js";
import { ensureMainRepo } from "./lib/git.js";
import { listProjects } from "./lib/projects.js";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "2mb" }));

app.use("/api/auth", authRateLimit, authRouter);
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/files", requireAuth, filesRouter);
app.use("/api/simulate", requireAuth, simulateRouter);
app.use("/api/history", requireAuth, historyRouter);
app.use("/api/branches", requireAuth, branchesRouter);
app.use("/api/merge", requireAuth, mergeRouter);
app.use("/api/admin", requireAuth, adminRouter);
app.use("/api/projects", requireAuth, projectsRouter);
app.use("/api/feedback", requireAuth, feedbackRouter);

const PORT = process.env.PORT || 4000;

async function main() {
  if (!process.env.REGISTER_INVITE_CODE) {
    console.warn("REGISTER_INVITE_CODE is not set - registration will reject everyone.");
  }
  await fs.mkdir(PROJECTS_ROOT, { recursive: true });
  const projects = await listProjects();
  for (const p of projects) {
    await ensureMainRepo(p.id);
  }
  app.listen(PORT, () => {
    console.log(`server listening on http://localhost:${PORT}`);
  });
}

main();
