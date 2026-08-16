import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import FileList from "./components/FileList";
import LogPanel from "./components/LogPanel";
import LLMPanel from "./components/LLMPanel";
import HistoryPanel from "./components/HistoryPanel";
import BranchPanel from "./components/BranchPanel";
import MergeConflictModal from "./components/MergeConflictModal";
import HelpModal from "./components/HelpModal";
import AdminPanel from "./components/AdminPanel";
import FeedbackForm from "./components/FeedbackForm";
import {
  listFiles,
  getFile,
  saveFile,
  createFile,
  deleteFile,
  renameFile,
  listArchivedFiles,
  archiveFile,
  unarchiveFile,
  exportBranch,
  runSimulation,
  runSuite,
  listFailingTestbenches,
  listHistory,
  listSimRuns,
  revertToCommit,
  listBranches,
  createBranch,
  claimBranch,
  deleteBranch,
  transferBranch,
  addCollaborator,
  removeCollaborator,
  mergeStatus,
  mergeStart,
  mergeResolve,
  mergeComplete,
  mergeAbort,
  listProjects,
  addProjectMember,
  removeProjectMember,
} from "./api";
import { registerVerilogLanguage, VERILOG_LANGUAGE_ID, EDITOR_THEME_ID } from "./verilogLanguage";
import "./App.css";

const MAIN_BRANCH = "main";
const SUITE_STATUS_CLASS = {
  pass: "status-pass",
  fail: "status-fail",
  compile_error: "status-fail",
  timeout: "status-fail",
  unknown: "status-unknown",
};

export default function Workspace({
  currentUser,
  currentUserName,
  isAdmin,
  currentProject,
  currentProjectName,
  onExitProject,
  onLogout,
}) {
  const [files, setFiles] = useState([]);
  const [archivedFiles, setArchivedFiles] = useState([]);
  const [activeName, setActiveName] = useState(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedTbs, setSelectedTbs] = useState(() => new Set());
  const [suiteResults, setSuiteResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState({ since: "", until: "", file: "" });
  const [simRuns, setSimRuns] = useState([]);
  const [branches, setBranches] = useState([]);
  const [currentBranch, setCurrentBranch] = useState(MAIN_BRANCH);
  const [mergeConflict, setMergeConflict] = useState(null);
  const [projectMembers, setProjectMembers] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const [llmCollapsed, setLlmCollapsed] = useState(() => localStorage.getItem("llmCollapsed") === "1");
  const [branchSidebarCollapsed, setBranchSidebarCollapsed] = useState(
    () => localStorage.getItem("branchSidebarCollapsed") === "1"
  );

  const toggleLlmCollapsed = () => {
    setLlmCollapsed((v) => {
      const next = !v;
      localStorage.setItem("llmCollapsed", next ? "1" : "0");
      return next;
    });
  };

  const toggleBranchSidebarCollapsed = () => {
    setBranchSidebarCollapsed((v) => {
      const next = !v;
      localStorage.setItem("branchSidebarCollapsed", next ? "1" : "0");
      return next;
    });
  };

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDocClick = (e) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) setAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [accountMenuOpen]);
  const [showHelp, setShowHelp] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [mobileView, setMobileView] = useState("editor"); // files | editor | llm
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia("(max-width: 1200px)").matches);
  const saveTimer = useRef(null);
  const editorRef = useRef(null);
  const openFileRequestRef = useRef(0);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1200px)");
    const onChange = (e) => setIsNarrow(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Monaco initializes with a stale (often 0-size) layout if its container was
  // hidden (display:none, e.g. an inactive mobile tab) at mount time, and
  // automaticLayout's ResizeObserver doesn't always catch the jump back to a
  // real size. Force a re-layout whenever the editor tab becomes visible.
  useEffect(() => {
    if (mobileView === "editor" && editorRef.current) {
      const t = setTimeout(() => editorRef.current?.layout(), 60);
      return () => clearTimeout(t);
    }
  }, [mobileView]);

  useEffect(() => {
    const onResize = () => editorRef.current?.layout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The very first time real content lands in the editor (e.g. opening the
  // first file right after mount, before onMount's own layout() timer has
  // anything to measure), Monaco's viewport can get stuck rendering zero
  // lines even though the model itself holds the right text - it never
  // re-measures on its own since the container's size never changed, only
  // the content did. A forced layout() on every file switch fixes it.
  useEffect(() => {
    if (!activeName || !editorRef.current) return;
    const t = setTimeout(() => editorRef.current?.layout(), 60);
    return () => clearTimeout(t);
  }, [activeName]);

  const isMain = currentBranch === MAIN_BRANCH;
  const currentBranchInfo = branches.find((b) => b.name === currentBranch);
  const isCollaboratorHere = Boolean(
    currentBranchInfo?.collaborators?.some((c) => c.username === currentUser)
  );
  const isOwner =
    Boolean(currentBranchInfo && currentBranchInfo.owner === currentUser) || isCollaboratorHere || isAdmin;
  const canEdit = isOwner && !isMain;
  const canSimulate = isMain || isOwner;
  const canRevert = isMain ? isAdmin : isOwner;
  const mobileSidebarTab = mobileView === "history" ? "history" : "files";
  const effectiveLlmCollapsed = llmCollapsed && !isNarrow;
  const effectiveBranchSidebarCollapsed = branchSidebarCollapsed && !isNarrow;

  const activeKind = files.find((f) => f.name === activeName)?.kind ?? null;

  const refreshBranches = useCallback(async () => {
    const list = await listBranches(currentProject);
    setBranches(list);
    return list;
  }, [currentProject]);

  const refreshFiles = useCallback(
    async (branch) => {
      const list = await listFiles(currentProject, branch ?? currentBranch);
      setFiles(list);
      return list;
    },
    [currentProject, currentBranch]
  );

  const refreshArchivedFiles = useCallback(
    async (branch) => {
      const list = await listArchivedFiles(currentProject, branch ?? currentBranch);
      setArchivedFiles(list);
      return list;
    },
    [currentProject, currentBranch]
  );

  const refreshHistory = useCallback(
    async (filter, branch) => {
      const f = filter ?? historyFilter;
      const params = {};
      if (f.since) params.since = f.since;
      if (f.until) params.until = f.until;
      if (f.file) params.file = f.file;
      const entries = await listHistory(currentProject, branch ?? currentBranch, params);
      setHistory(entries);
      return entries;
    },
    [currentProject, historyFilter, currentBranch]
  );

  const refreshSimRuns = useCallback(
    async (branch) => {
      const runs = await listSimRuns(currentProject, branch ?? currentBranch);
      setSimRuns(runs);
      return runs;
    },
    [currentProject, currentBranch]
  );

  // Guards against out-of-order responses: the initial mount always opens
  // main's first file, and if the user switches branches before that
  // request resolves, its response could otherwise land after (and clobber)
  // the branch switch's own openFile result. Each call claims the latest
  // request id and only applies its result if nothing newer has started.
  const openFile = async (name, branch) => {
    const requestId = ++openFileRequestRef.current;
    const data = await getFile(currentProject, name, branch ?? currentBranch);
    if (openFileRequestRef.current !== requestId) return;
    setActiveName(data.name);
    setContent(data.content);
    setDirty(false);
  };

  useEffect(() => {
    refreshBranches();
    refreshFiles(MAIN_BRANCH).then((list) => {
      if (list.length > 0) openFile(list[0].name, MAIN_BRANCH);
    });
    refreshArchivedFiles(MAIN_BRANCH);
    refreshHistory(undefined, MAIN_BRANCH);
    refreshSimRuns(MAIN_BRANCH);
    mergeStatus(currentProject, MAIN_BRANCH).then((s) => {
      if (s.inProgress) setMergeConflict({ source: "(진행 중이던 병합)", target: MAIN_BRANCH, files: s.files });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject]);

  const switchBranch = async (branch) => {
    if (branch === currentBranch) return;
    setCurrentBranch(branch);
    setResult(null);
    const list = await refreshFiles(branch);
    refreshArchivedFiles(branch);
    await refreshHistory(historyFilter, branch);
    refreshSimRuns(branch);
    if (list.length > 0) {
      openFile(list[0].name, branch);
    } else {
      openFileRequestRef.current += 1;
      setActiveName(null);
      setContent("");
    }
    if (branch !== MAIN_BRANCH) {
      const s = await mergeStatus(currentProject, branch);
      if (s.inProgress) setMergeConflict({ source: "(진행 중이던 병합)", target: branch, files: s.files });
    }
  };

  const handleGoToLine = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const maxLine = editor.getModel()?.getLineCount() ?? 1;
    const input = window.prompt(`이동할 줄 번호 (1~${maxLine})`);
    if (!input) return;
    const line = Math.max(1, Math.min(maxLine, parseInt(input, 10)));
    if (!Number.isFinite(line)) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
  };

  const handleJumpToLine = async (fileName, line) => {
    const reveal = () => {
      const editor = editorRef.current;
      if (!editor) return;
      const maxLine = editor.getModel()?.getLineCount() ?? 1;
      const target = Math.max(1, Math.min(maxLine, line));
      editor.revealLineInCenter(target);
      editor.setPosition({ lineNumber: target, column: 1 });
      editor.focus();
    };
    if (fileName !== activeName) {
      if (!files.some((f) => f.name === fileName)) return;
      await openFile(fileName);
      setTimeout(reveal, 60);
    } else {
      reveal();
    }
  };

  const refreshProjectMembers = useCallback(async () => {
    const list = await listProjects();
    const proj = list.find((p) => p.id === currentProject);
    setProjectMembers(proj?.memberDetails ?? []);
  }, [currentProject]);

  useEffect(() => {
    refreshProjectMembers();
  }, [refreshProjectMembers]);

  const handleInviteProjectMember = async () => {
    const username = window.prompt("이 프로젝트에 초대할 사람의 아이디를 입력하세요");
    if (!username) return;
    try {
      await addProjectMember(currentProject, username);
      await refreshProjectMembers();
      alert(`${username}님을 "${currentProjectName ?? currentProject}" 프로젝트에 초대했습니다.`);
    } catch (e) {
      alert(e?.response?.data?.error ?? "초대 실패");
    }
  };

  const handleRemoveProjectMember = async (username) => {
    if (!window.confirm(`${username}님을 이 프로젝트에서 제외할까요?`)) return;
    try {
      await removeProjectMember(currentProject, username);
      await refreshProjectMembers();
    } catch (e) {
      alert(e?.response?.data?.error ?? "제외 실패");
    }
  };

  const handleCreateBranch = async () => {
    const name = window.prompt("새 브랜치 이름 (예: user-A, 영문/숫자/-/_ 만 가능)");
    if (!name) return;
    try {
      await createBranch(currentProject, name);
      await refreshBranches();
      await switchBranch(name);
    } catch (e) {
      alert(e?.response?.data?.error ?? "브랜치 생성 실패");
    }
  };

  const handleClaimBranch = async (name) => {
    if (!window.confirm(`"${name}" 브랜치를 내 브랜치로 표시할까요?`)) return;
    try {
      await claimBranch(currentProject, name);
      await refreshBranches();
    } catch (e) {
      alert(e?.response?.data?.error ?? "실패");
    }
  };

  const handleDeleteBranch = async (name) => {
    if (!window.confirm(`"${name}" 브랜치를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await deleteBranch(currentProject, name);
      await refreshBranches();
      if (currentBranch === name) {
        await switchBranch(MAIN_BRANCH);
      }
    } catch (e) {
      alert(e?.response?.data?.error ?? "삭제 실패");
    }
  };

  const handleTransferBranch = async (name) => {
    const toUsername = window.prompt(`"${name}" 브랜치를 넘겨받을 사람의 아이디를 입력하세요`);
    if (!toUsername) return;
    if (!window.confirm(`"${name}" 브랜치를 ${toUsername}님에게 넘길까요?`)) return;
    try {
      await transferBranch(currentProject, name, toUsername);
      await refreshBranches();
    } catch (e) {
      alert(e?.response?.data?.error ?? "넘기기 실패");
    }
  };

  const handleAddCollaborator = async (name) => {
    const username = window.prompt(`"${name}" 브랜치에 같이 작업할 사람의 아이디를 입력하세요`);
    if (!username) return;
    try {
      await addCollaborator(currentProject, name, username);
      await refreshBranches();
    } catch (e) {
      alert(e?.response?.data?.error ?? "협업자 추가 실패");
    }
  };

  const handleRemoveCollaborator = async (name, username) => {
    if (!window.confirm(`${username}님을 "${name}" 브랜치 협업자에서 제외할까요?`)) return;
    try {
      await removeCollaborator(currentProject, name, username);
      await refreshBranches();
    } catch (e) {
      alert(e?.response?.data?.error ?? "제외 실패");
    }
  };

  const handleHistoryFilterChange = (filter) => {
    setHistoryFilter(filter);
    refreshHistory(filter);
  };

  const handleSelect = (name) => {
    setMobileView("editor");
    if (name === activeName) return;
    openFile(name);
  };

  const handleChange = (value) => {
    if (!canEdit) return;
    setContent(value ?? "");
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(value ?? ""), 800);
  };

  const doSave = async (value) => {
    if (!activeName || !canEdit) return;
    setSaving(true);
    try {
      const res = await saveFile(currentProject, activeName, value, currentBranch);
      setDirty(false);
      if (res.commit) refreshHistory();
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (name) => {
    if (!canEdit) return;
    const finalName = name.endsWith(".v") ? name : `${name}.v`;
    try {
      await createFile(currentProject, finalName, "", currentBranch);
      const list = await refreshFiles();
      refreshHistory();
      if (list.some((f) => f.name === finalName)) openFile(finalName);
    } catch (e) {
      alert(e?.response?.data?.error ?? "파일 생성 실패");
    }
  };

  const handleUploadFile = async (file) => {
    if (!canEdit) return;
    try {
      const text = await file.text();
      const exists = files.some((f) => f.name === file.name);
      if (exists && !window.confirm(`${file.name} 파일이 이미 있습니다. 덮어쓸까요?`)) return;
      if (exists) {
        await saveFile(currentProject, file.name, text, currentBranch, `업로드: ${file.name}`);
      } else {
        await createFile(currentProject, file.name, text, currentBranch, `업로드: ${file.name}`);
        await refreshFiles();
      }
      await refreshHistory();
      openFile(file.name);
    } catch (e) {
      alert(e?.response?.data?.error ?? "파일 업로드 실패");
    }
  };

  const handleDelete = async (name) => {
    if (!canEdit) return;
    if (!window.confirm(`${name} 파일을 삭제할까요?`)) return;
    await deleteFile(currentProject, name, currentBranch);
    const list = await refreshFiles();
    refreshHistory();
    if (activeName === name) {
      if (list.length > 0) openFile(list[0].name);
      else {
        openFileRequestRef.current += 1;
        setActiveName(null);
        setContent("");
      }
    }
  };

  const handleRename = async (oldName, newName) => {
    if (!canEdit) return;
    const finalNewName = newName.endsWith(".v") ? newName : `${newName}.v`;
    try {
      await renameFile(currentProject, oldName, finalNewName, currentBranch);
      await refreshFiles();
      await refreshHistory();
      if (activeName === oldName) openFile(finalNewName);
    } catch (e) {
      alert(e?.response?.data?.error ?? "이름 변경 실패");
    }
  };

  const handleArchive = async (name) => {
    if (!canEdit) return;
    if (!window.confirm(`${name} 파일을 보관할까요? 파일 목록/시뮬레이션/내보내기에서 제외되고, 나중에 복원할 수 있습니다.`)) return;
    try {
      await archiveFile(currentProject, name, currentBranch);
      const list = await refreshFiles();
      await refreshArchivedFiles();
      await refreshHistory();
      if (activeName === name) {
        if (list.length > 0) openFile(list[0].name);
        else {
          openFileRequestRef.current += 1;
          setActiveName(null);
          setContent("");
        }
      }
    } catch (e) {
      alert(e?.response?.data?.error ?? "보관 실패");
    }
  };

  const handleUnarchive = async (name) => {
    if (!canEdit) return;
    try {
      await unarchiveFile(currentProject, name, currentBranch);
      await refreshFiles();
      await refreshArchivedFiles();
      await refreshHistory();
    } catch (e) {
      alert(e?.response?.data?.error ?? "보관 해제 실패");
    }
  };

  const handleApplyFromLLM = async (name, content, summary) => {
    if (!canEdit) return;
    const exists = files.some((f) => f.name === name);
    const commitMessage = summary ? `LLM 적용: ${summary}` : `LLM 적용: ${name}`;
    if (exists) {
      await saveFile(currentProject, name, content, currentBranch, commitMessage);
    } else {
      await createFile(currentProject, name, content, currentBranch, commitMessage);
      await refreshFiles();
    }
    await refreshHistory();
    await openFile(name);
  };

  const handleExport = async () => {
    try {
      const blob = await exportBranch(currentProject, currentBranch);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentProject}-${currentBranch}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e?.response?.data?.error ?? "내보내기 실패");
    }
  };

  const handleRun = async (tbName) => {
    if (!canSimulate || !tbName) return;
    // Save unconditionally, not just when tbName === activeName: the open
    // file might be an RTL dependency that gets compiled alongside whichever
    // testbench is being run, so stale on-disk content would be picked up.
    if (dirty) await doSave(content);
    setRunning(true);
    setResult(null);
    try {
      const rtlNames = files.filter((f) => f.kind !== "testbench").map((f) => f.name);
      const data = await runSimulation(currentProject, currentBranch, [tbName, ...rtlNames]);
      setResult(data);
      refreshHistory();
      refreshSimRuns();
    } catch (e) {
      setResult({
        status: "compile_error",
        compileLog: e?.response?.data?.error ?? e.message,
        runLog: "",
      });
    } finally {
      setRunning(false);
    }
  };

  const handleCheckCompile = async (name) => {
    if (!canSimulate) return;
    if (dirty) await doSave(content);
    setRunning(true);
    setResult(null);
    try {
      const otherRtlNames = files.filter((f) => f.kind !== "testbench" && f.name !== name).map((f) => f.name);
      const data = await runSimulation(currentProject, currentBranch, [name, ...otherRtlNames], { compileOnly: true });
      setResult(data);
    } catch (e) {
      setResult({
        status: "compile_error",
        compileLog: e?.response?.data?.error ?? e.message,
        runLog: "",
      });
    } finally {
      setRunning(false);
    }
  };

  const handleToggleTb = (name) => {
    setSelectedTbs((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleRunSuite = async (tbNames) => {
    if (!canSimulate || !tbNames || tbNames.length === 0) return;
    if (dirty) await doSave(content);
    setRunning(true);
    setResult(null);
    setSuiteResults(null);
    try {
      const results = await runSuite(currentProject, currentBranch, tbNames);
      setSuiteResults(results);
      refreshHistory();
      refreshSimRuns();
    } catch (e) {
      alert(e?.response?.data?.error ?? "스위트 실행 실패");
    } finally {
      setRunning(false);
    }
  };

  const handleRunAllTbs = () => {
    const allTbs = files.filter((f) => f.kind === "testbench").map((f) => f.name);
    handleRunSuite(allTbs);
  };

  const handleRerunFailing = async () => {
    try {
      const failing = await listFailingTestbenches(currentProject, currentBranch);
      if (failing.length === 0) {
        alert("최근에 실패로 기록된 테스트벤치가 없어요.");
        return;
      }
      await handleRunSuite(failing);
    } catch (e) {
      alert(e?.response?.data?.error ?? "실패 목록 조회 실패");
    }
  };

  const handleViewSuiteResult = (r) => {
    setResult(r);
  };

  const refreshAfterMerge = async (target) => {
    await refreshBranches();
    await refreshHistory(historyFilter, target);
    if (currentBranch === target) {
      const list = await refreshFiles(target);
      if (activeName && list.some((f) => f.name === activeName)) openFile(activeName, target);
    }
  };

  const handleMergeToMain = async (branchName) => {
    if (!window.confirm(`"${branchName}" 브랜치를 main으로 merge할까요?`)) return;
    try {
      const result = await mergeStart(currentProject, branchName, MAIN_BRANCH);
      if (result.status === "merged") {
        alert("충돌 없이 merge 완료됐습니다.");
        await refreshAfterMerge(MAIN_BRANCH);
      } else {
        setMergeConflict({ source: branchName, target: MAIN_BRANCH, files: result.files });
      }
    } catch (e) {
      const data = e?.response?.data;
      if (data?.files) {
        setMergeConflict({ source: branchName, target: MAIN_BRANCH, files: data.files });
      } else {
        alert(data?.error ?? "merge 시작 실패");
      }
    }
  };

  const handleSyncMain = async (branchName) => {
    if (!window.confirm(`main의 최신 내용을 "${branchName}" 브랜치에 반영할까요?`)) return;
    try {
      const result = await mergeStart(currentProject, MAIN_BRANCH, branchName);
      if (result.status === "merged") {
        alert("충돌 없이 main 최신 내용이 반영됐습니다.");
        await refreshAfterMerge(branchName);
      } else {
        setMergeConflict({ source: MAIN_BRANCH, target: branchName, files: result.files });
      }
    } catch (e) {
      const data = e?.response?.data;
      if (data?.files) {
        setMergeConflict({ source: MAIN_BRANCH, target: branchName, files: data.files });
      } else {
        alert(data?.error ?? "merge 시작 실패");
      }
    }
  };

  const handleMergeResolve = async (fileName, content) => {
    const result = await mergeResolve(currentProject, fileName, content, mergeConflict?.target ?? MAIN_BRANCH);
    setMergeConflict((prev) => (prev ? { ...prev, files: result.remaining } : prev));
  };

  const handleMergeComplete = async () => {
    const target = mergeConflict?.target ?? MAIN_BRANCH;
    try {
      await mergeComplete(currentProject, target);
      setMergeConflict(null);
      alert("병합이 완료됐습니다.");
      await refreshAfterMerge(target);
    } catch (e) {
      alert(e?.response?.data?.error ?? "병합 완료 실패");
    }
  };

  const handleMergeAbort = async () => {
    if (!window.confirm("진행 중인 병합을 취소할까요? 지금까지 해결한 내용은 모두 버려집니다.")) return;
    await mergeAbort(currentProject, mergeConflict?.target ?? MAIN_BRANCH);
    setMergeConflict(null);
  };

  const handleRevert = async (hash) => {
    if (!canRevert) return;
    const targetFile = historyFilter.file || null;
    const confirmMsg = targetFile
      ? `"${targetFile}" 파일만 이 버전으로 되돌릴까요? 새 커밋으로 복원됩니다.`
      : "이 버전으로 되돌릴까요? 현재 작업 내용 위에 새 커밋으로 복원됩니다.";
    if (!window.confirm(confirmMsg)) return;
    await revertToCommit(currentProject, hash, currentBranch, targetFile ?? undefined);
    const list = await refreshFiles();
    await refreshHistory();
    if (activeName && list.some((f) => f.name === activeName)) {
      openFile(activeName);
    } else if (list.length > 0) {
      openFile(list[0].name);
    }
  };

  const fileListPanel = (
    <FileList
      files={files}
      activeName={activeName}
      onSelect={handleSelect}
      onCreate={canEdit ? handleCreate : null}
      onUpload={canEdit ? handleUploadFile : null}
      onDelete={canEdit ? handleDelete : null}
      onRename={canEdit ? handleRename : null}
      onExport={handleExport}
      onRunTestbench={canSimulate ? handleRun : null}
      onCheckCompile={canSimulate ? handleCheckCompile : null}
      running={running}
      archivedFiles={archivedFiles}
      onArchive={canEdit ? handleArchive : null}
      onUnarchive={canEdit ? handleUnarchive : null}
      selectedTbs={selectedTbs}
      onToggleTb={canSimulate ? handleToggleTb : null}
      onRunSuite={canSimulate ? handleRunSuite : null}
      onRunAllTbs={canSimulate ? handleRunAllTbs : null}
      onRerunFailing={canSimulate ? handleRerunFailing : null}
    />
  );

  const historyPanel = (
    <HistoryPanel
      entries={history}
      files={files}
      onRevert={canRevert ? handleRevert : null}
      filter={historyFilter}
      onFilterChange={handleHistoryFilterChange}
      simRuns={simRuns}
    />
  );

  return (
    <div className="app">
      <div className="mobile-tabs">
        <button className={mobileView === "branches" ? "active" : ""} onClick={() => setMobileView("branches")}>
          브랜치
        </button>
        <button className={mobileView === "files" ? "active" : ""} onClick={() => setMobileView("files")}>
          파일
        </button>
        <button className={mobileView === "history" ? "active" : ""} onClick={() => setMobileView("history")}>
          히스토리
        </button>
        <button className={mobileView === "editor" ? "active" : ""} onClick={() => setMobileView("editor")}>
          에디터
        </button>
        <button className={mobileView === "llm" ? "active" : ""} onClick={() => setMobileView("llm")}>
          LLM
        </button>
      </div>

      <aside
        className={`branch-sidebar ${mobileView === "branches" ? "mobile-active" : ""} ${
          effectiveBranchSidebarCollapsed ? "branch-sidebar-collapsed" : ""
        }`}
      >
        {!isNarrow && (
          <button
            type="button"
            className="branch-collapse-btn"
            title={effectiveBranchSidebarCollapsed ? "브랜치 패널 펼치기" : "브랜치 패널 접기"}
            onClick={toggleBranchSidebarCollapsed}
          >
            {effectiveBranchSidebarCollapsed ? "›" : "‹ 접기"}
          </button>
        )}
        {!effectiveBranchSidebarCollapsed && (
          <>
        <div className="sidebar-account-bar">
          <div className="sidebar-account-name-row">
            <span className="current-user">{currentUserName ?? currentUser}</span>
            {isAdmin && (
              <button className="help-btn" title="관리자" onClick={() => setShowAdmin(true)}>
                관리자
              </button>
            )}
            <button className="help-btn" title="사용 방법" onClick={() => setShowHelp(true)}>
              매뉴얼
            </button>
            <div className="branch-more" ref={accountMenuRef}>
              <button className="more-btn" title="더 보기" onClick={() => setAccountMenuOpen((v) => !v)}>
                ⋯
              </button>
              {accountMenuOpen && (
                <div className="branch-more-menu">
                  <button
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onExitProject();
                    }}
                  >
                    프로젝트 변경
                  </button>
                  <button
                    onClick={() => {
                      setAccountMenuOpen(false);
                      handleInviteProjectMember();
                    }}
                  >
                    멤버 초대
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onLogout();
                    }}
                  >
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <BranchPanel
          branches={branches}
          currentBranch={currentBranch}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onSwitch={switchBranch}
          onCreate={handleCreateBranch}
          onClaim={handleClaimBranch}
          onDelete={handleDeleteBranch}
          onTransfer={handleTransferBranch}
          onMerge={handleMergeToMain}
          onSyncMain={handleSyncMain}
          onAddCollaborator={handleAddCollaborator}
          onRemoveCollaborator={handleRemoveCollaborator}
        />
        <div className="members-box">
          <button
            type="button"
            className="panel-toggle-btn members-toggle"
            onClick={() => setShowMembers((v) => !v)}
          >
            {showMembers ? "▾" : "▸"} 현재 프로젝트 참여자 ({projectMembers.length})
          </button>
          {showMembers && (
            <div className="branch-collab-list">
              {projectMembers.map((m) => (
                <span key={m.username} className="badge badge-collab-member">
                  {m.name}
                  {(isAdmin || m.username === currentUser) && (
                    <button
                      className="collab-remove-btn"
                      title={m.username === currentUser ? "프로젝트 나가기" : "멤버 제외"}
                      onClick={() => handleRemoveProjectMember(m.username)}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
          </>
        )}
      </aside>

      <aside className={`sidebar ${mobileView === "files" || mobileView === "history" ? "mobile-active" : ""}`}>
        {isNarrow ? (
          mobileSidebarTab === "files" ? fileListPanel : historyPanel
        ) : (
          <>
            <div className="sidebar-pane sidebar-pane-files">{fileListPanel}</div>
            <div className="sidebar-pane sidebar-pane-history">{historyPanel}</div>
          </>
        )}
      </aside>

      <main className={`main ${mobileView === "editor" ? "mobile-active" : ""}`}>
        <div className="toolbar">
          <span className="active-file">
            {currentBranch}
            {!canEdit && <span className="readonly-badge"> 읽기 전용</span>}
            {" / "}
            {activeName ?? "파일을 선택하세요"}
            {dirty && <span className="dirty-dot" title="저장되지 않음"> ●</span>}
            {saving && <span className="saving-label"> 저장 중...</span>}
          </span>
          <div className="run-controls">
            <button className="help-btn" title="줄 번호로 이동" disabled={!activeName} onClick={handleGoToLine}>
              줄 이동
            </button>
            {activeKind === "testbench" ? (
              <button
                className="run-btn"
                disabled={running || !canSimulate}
                onClick={() => handleRun(activeName)}
              >
                {running ? "실행 중..." : "Run Simulation"}
              </button>
            ) : (
              <button
                className="run-btn"
                disabled={running || !canSimulate || activeKind !== "rtl"}
                title={activeKind !== "rtl" ? "RTL 또는 테스트벤치 파일을 선택하세요" : undefined}
                onClick={() => handleCheckCompile(activeName)}
              >
                {running ? "확인 중..." : "컴파일 확인"}
              </button>
            )}
          </div>
        </div>

        <div className="editor-wrap">
          <Editor
            height="100%"
            language={VERILOG_LANGUAGE_ID}
            value={content}
            theme={EDITOR_THEME_ID}
            beforeMount={registerVerilogLanguage}
            onMount={(editor) => {
              editorRef.current = editor;
              setTimeout(() => editor.layout(), 60);
            }}
            onChange={handleChange}
            options={{
              fontSize: isNarrow ? 12 : 14,
              wordWrap: isNarrow ? "on" : "off",
              minimap: { enabled: false },
              automaticLayout: true,
              tabSize: 2,
              readOnly: !canEdit,
            }}
          />
        </div>

        {suiteResults && (
          <div className="suite-results">
            <div className="suite-results-header">
              <span>
                스위트 결과 — {suiteResults.filter((r) => r.status === "pass").length}/{suiteResults.length} PASS
              </span>
              <button className="log-copy-btn" onClick={() => setSuiteResults(null)}>닫기</button>
            </div>
            <ul>
              {suiteResults.map((r) => (
                <li key={r.testbench} onClick={() => handleViewSuiteResult(r)}>
                  <span className={`status-pill ${SUITE_STATUS_CLASS[r.status] ?? ""}`}>{r.status}</span>
                  <span className="suite-result-name">{r.testbench}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="log-wrap">
          <LogPanel running={running} result={result} onJumpToLine={handleJumpToLine} />
        </div>
      </main>

      <aside
        className={`llm-sidebar ${mobileView === "llm" ? "mobile-active" : ""} ${
          effectiveLlmCollapsed ? "llm-collapsed" : ""
        }`}
      >
        {!isNarrow && (
          <button
            type="button"
            className="llm-collapse-btn"
            title={effectiveLlmCollapsed ? "LLM 패널 펼치기" : "LLM 패널 접어서 에디터 넓히기"}
            onClick={toggleLlmCollapsed}
          >
            {effectiveLlmCollapsed ? "‹" : "접기 ›"}
          </button>
        )}
        {!effectiveLlmCollapsed && (
          <>
            {canEdit ? (
              <LLMPanel
                activeName={activeName}
                currentProject={currentProject}
                currentBranch={currentBranch}
                lastResult={result}
                onApply={handleApplyFromLLM}
              />
            ) : (
              <div className="llm-readonly-notice">
                내 브랜치가 아니라서 LLM 적용은 비활성화되어 있어요. 코드/이력/로그는 자유롭게 볼 수 있습니다.
              </div>
            )}
            <FeedbackForm currentProject={currentProject} />
          </>
        )}
      </aside>

      {mergeConflict && (
        <MergeConflictModal
          source={mergeConflict.source}
          target={mergeConflict.target}
          files={mergeConflict.files}
          onResolve={handleMergeResolve}
          onComplete={handleMergeComplete}
          onAbort={handleMergeAbort}
        />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </div>
  );
}
