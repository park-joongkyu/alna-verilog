import axios from "axios";

export const TOKEN_KEY = "verilog-collab.token";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:4000/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && !err.config?.url?.includes("/auth/")) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export const register = (username, password, email, name, inviteCode) =>
  api.post("/auth/register", { username, password, email, name, inviteCode }).then((r) => r.data);

export const login = (username, password) =>
  api.post("/auth/login", { username, password }).then((r) => r.data);

export const fetchMe = () => api.get("/auth/me").then((r) => r.data);

export const forgotPassword = (username) =>
  api.post("/auth/forgot-password", { username }).then((r) => r.data);

export const resetPassword = (token, newPassword) =>
  api.post("/auth/reset-password", { token, newPassword }).then((r) => r.data);

export const listProjects = () => api.get("/projects").then((r) => r.data.projects);

export const createProject = (id, name) => api.post("/projects", { id, name }).then((r) => r.data.project);

export const addProjectMember = (id, username) =>
  api.post(`/projects/${encodeURIComponent(id)}/members`, { username }).then((r) => r.data.project);

export const removeProjectMember = (id, username) =>
  api.delete(`/projects/${encodeURIComponent(id)}/members/${encodeURIComponent(username)}`).then((r) => r.data.project);

export const listFiles = (project, branch) =>
  api.get("/files", { params: { project, branch } }).then((r) => r.data.files);

export const getFile = (project, name, branch) =>
  api.get(`/files/${encodeURIComponent(name)}`, { params: { project, branch } }).then((r) => r.data);

export const saveFile = (project, name, content, branch, commitMessage) =>
  api.put(`/files/${encodeURIComponent(name)}`, { project, content, branch, commitMessage }).then((r) => r.data);

export const createFile = (project, name, content = "", branch, commitMessage) =>
  api.post("/files", { project, name, content, branch, commitMessage }).then((r) => r.data);

export const deleteFile = (project, name, branch) =>
  api.delete(`/files/${encodeURIComponent(name)}`, { params: { project, branch } }).then((r) => r.data);

export const renameFile = (project, name, newName, branch) =>
  api.post(`/files/${encodeURIComponent(name)}/rename`, { project, newName, branch }).then((r) => r.data);

export const listArchivedFiles = (project, branch) =>
  api.get("/files/archived", { params: { project, branch } }).then((r) => r.data.files);

export const archiveFile = (project, name, branch) =>
  api.post(`/files/${encodeURIComponent(name)}/archive`, { project, branch }).then((r) => r.data);

export const unarchiveFile = (project, name, branch) =>
  api.post(`/files/${encodeURIComponent(name)}/unarchive`, { project, branch }).then((r) => r.data);

export const exportBranch = (project, branch) =>
  api.get("/files/export", { params: { project, branch }, responseType: "blob" }).then((r) => r.data);

export const runSimulation = (project, branch, files, options) =>
  api
    .post("/simulate", { project, branch, ...(files ? { files } : {}), ...(options?.compileOnly ? { compileOnly: true } : {}) })
    .then((r) => r.data);

export const listSimRuns = (project, branch, limit) =>
  api.get("/simulate/history", { params: { project, branch, limit } }).then((r) => r.data.runs);

export const listHistory = (project, branch, params) =>
  api.get("/history", { params: { project, branch, ...params } }).then((r) => r.data.entries);

export const getFileAtCommit = (project, hash, name, branch) =>
  api.get(`/history/${hash}/file/${encodeURIComponent(name)}`, { params: { project, branch } }).then((r) => r.data);

export const revertToCommit = (project, hash, branch, file) =>
  api.post(`/history/${hash}/revert`, { project, branch, file }).then((r) => r.data);

export const listBranches = (project) => api.get("/branches", { params: { project } }).then((r) => r.data.branches);

export const createBranch = (project, name) => api.post("/branches", { project, name }).then((r) => r.data);

export const claimBranch = (project, name) =>
  api.post(`/branches/${encodeURIComponent(name)}/claim`, { project }).then((r) => r.data);

export const deleteBranch = (project, name) =>
  api.delete(`/branches/${encodeURIComponent(name)}`, { params: { project } }).then((r) => r.data);

export const transferBranch = (project, name, toUsername) =>
  api.post(`/branches/${encodeURIComponent(name)}/transfer`, { project, toUsername }).then((r) => r.data);

export const addCollaborator = (project, name, username) =>
  api.post(`/branches/${encodeURIComponent(name)}/collaborators`, { project, username }).then((r) => r.data);

export const removeCollaborator = (project, name, username) =>
  api
    .delete(`/branches/${encodeURIComponent(name)}/collaborators/${encodeURIComponent(username)}`, {
      params: { project },
    })
    .then((r) => r.data);

export const mergeStatus = (project, branch) =>
  api.get("/merge/status", { params: { project, branch } }).then((r) => r.data);

export const mergeStart = (project, source, branch) =>
  api.post("/merge/start", { project, source, branch }).then((r) => r.data);

export const mergeResolve = (project, file, content, branch) =>
  api.post("/merge/resolve", { project, file, content, branch }).then((r) => r.data);

export const mergeComplete = (project, branch) => api.post("/merge/complete", { project, branch }).then((r) => r.data);

export const mergeAbort = (project, branch) => api.post("/merge/abort", { project, branch }).then((r) => r.data);

export const adminListUsers = () => api.get("/admin/users").then((r) => r.data.users);

export const adminResetPassword = (username, newPassword) =>
  api.post(`/admin/users/${encodeURIComponent(username)}/reset-password`, { newPassword }).then((r) => r.data);

export const adminListAccessLog = () => api.get("/admin/access-log").then((r) => r.data.entries);

export const adminListAuditLog = () => api.get("/admin/audit-log").then((r) => r.data.entries);

export const adminUnlockUser = (username) =>
  api.post(`/admin/users/${encodeURIComponent(username)}/unlock`).then((r) => r.data);

export const submitFeedback = (category, message, project) =>
  api.post("/feedback", { category, message, project }).then((r) => r.data.feedback);

export const listFeedback = () => api.get("/feedback").then((r) => r.data.feedback);

export const setFeedbackStatus = (id, status) =>
  api.post(`/feedback/${encodeURIComponent(id)}/status`, { status }).then((r) => r.data.feedback);

export default api;
