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
  runSimulation,
  listHistory,
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
  const [activeName, setActiveName] = useState(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [sidebarTab, setSidebarTab] = useState("files");
  const [history, setHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState({ since: "", until: "", file: "" });
  const [branches, setBranches] = useState([]);
  const [currentBranch, setCurrentBranch] = useState(MAIN_BRANCH);
  const [selectedTestbench, setSelectedTestbench] = useState(null);
  const [mergeConflict, setMergeConflict] = useState(null);
  const [projectMembers, setProjectMembers] = useState([]);
  const [showMembers, setShowMembers] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const [llmCollapsed, setLlmCollapsed] = useState(() => localStorage.getItem("llmCollapsed") === "1");

  const toggleLlmCollapsed = () => {
    setLlmCollapsed((v) => {
      const next = !v;
      localStorage.setItem("llmCollapsed", next ? "1" : "0");
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
  const effectiveSidebarTab =
    isNarrow && (mobileView === "files" || mobileView === "history") ? mobileView : sidebarTab;
  const effectiveLlmCollapsed = llmCollapsed && !isNarrow;

  const testbenchFiles = files.filter((f) => f.kind === "testbench");
  const effectiveTestbench = testbenchFiles.some((f) => f.name === selectedTestbench)
    ? selectedTestbench
    : testbenchFiles[0]?.name ?? null;

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

  const openFile = async (name, branch) => {
    const data = await getFile(currentProject, name, branch ?? currentBranch);
    setActiveName(data.name);
    setContent(data.content);
    setDirty(false);
  };

  useEffect(() => {
    refreshBranches();
    refreshFiles(MAIN_BRANCH).then((list) => {
      if (list.length > 0) openFile(list[0].name, MAIN_BRANCH);
    });
    refreshHistory(undefined, MAIN_BRANCH);
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
    await refreshHistory(historyFilter, branch);
    if (list.length > 0) {
      openFile(list[0].name, branch);
    } else {
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

  const handleDelete = async (name) => {
    if (!canEdit) return;
    if (!window.confirm(`${name} 파일을 삭제할까요?`)) return;
    await deleteFile(currentProject, name, currentBranch);
    const list = await refreshFiles();
    refreshHistory();
    if (activeName === name) {
      if (list.length > 0) openFile(list[0].name);
      else {
        setActiveName(null);
        setContent("");
      }
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

  const handleRun = async () => {
    if (!canSimulate || !effectiveTestbench) return;
    if (dirty) await doSave(content);
    setRunning(true);
    setResult(null);
    try {
      const rtlNames = files.filter((f) => f.kind !== "testbench").map((f) => f.name);
      const data = await runSimulation(currentProject, currentBranch, [effectiveTestbench, ...rtlNames]);
      setResult(data);
      refreshHistory();
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

      <aside className={`branch-sidebar ${mobileView === "branches" ? "mobile-active" : ""}`}>
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
      </aside>

      <aside className={`sidebar ${mobileView === "files" || mobileView === "history" ? "mobile-active" : ""}`}>
        <div className="sidebar-tabs">
          <button
            className={sidebarTab === "files" ? "active" : ""}
            onClick={() => setSidebarTab("files")}
          >
            파일
          </button>
          <button
            className={sidebarTab === "history" ? "active" : ""}
            onClick={() => setSidebarTab("history")}
          >
            히스토리
          </button>
        </div>
        {effectiveSidebarTab === "files" ? (
          <FileList
            files={files}
            activeName={activeName}
            onSelect={handleSelect}
            onCreate={canEdit ? handleCreate : null}
            onDelete={canEdit ? handleDelete : null}
          />
        ) : (
          <HistoryPanel
            entries={history}
            files={files}
            onRevert={canRevert ? handleRevert : null}
            filter={historyFilter}
            onFilterChange={handleHistoryFilterChange}
          />
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
            {testbenchFiles.length > 1 && (
              <select
                className="tb-select"
                value={effectiveTestbench ?? ""}
                onChange={(e) => setSelectedTestbench(e.target.value)}
              >
                {testbenchFiles.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className="run-btn"
              disabled={running || !canSimulate || !effectiveTestbench}
              title={!effectiveTestbench ? "테스트벤치(_tb.v) 파일이 없습니다" : undefined}
              onClick={handleRun}
            >
              {running ? "실행 중..." : "Run Simulation"}
            </button>
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

        <div className="log-wrap">
          <LogPanel running={running} result={result} />
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
