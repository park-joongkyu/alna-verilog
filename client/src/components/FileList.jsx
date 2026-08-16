import { useEffect, useRef, useState } from "react";

const KIND_LABEL = { testbench: "TB", rtl: "RTL", bram: "BRAM" };
const FILTERS = [
  { key: "all", label: "전체" },
  { key: "rtl", label: "RTL" },
  { key: "testbench", label: "TB" },
  { key: "bram", label: "BRAM" },
];

function FileItem({
  f,
  activeName,
  onSelect,
  onRunTestbench,
  onCheckCompile,
  running,
  editable,
  onRename,
  onArchive,
  onDelete,
  selectedTbs,
  onToggleTb,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const handleRename = () => {
    setMenuOpen(false);
    const newName = window.prompt("새 파일 이름", f.name);
    if (!newName || newName === f.name) return;
    onRename(f.name, newName);
  };

  const hasMenu = editable && (onRename || onArchive || onDelete);

  return (
    <li className={f.name === activeName ? "active" : ""}>
      {f.kind === "testbench" && onToggleTb && (
        <input
          type="checkbox"
          className="tb-suite-checkbox"
          checked={selectedTbs?.has(f.name) ?? false}
          onChange={() => onToggleTb(f.name)}
          title={`${f.name} 스위트에 포함`}
        />
      )}
      <span className={`badge badge-${f.kind}`}>{KIND_LABEL[f.kind] ?? f.kind}</span>
      <span className="file-name" onClick={() => onSelect(f.name)}>{f.name}</span>
      {f.kind === "testbench" && onRunTestbench && (
        <button
          className="file-inline-btn run"
          title={`${f.name} 실행`}
          disabled={running}
          onClick={() => onRunTestbench(f.name)}
        >
          ▶
        </button>
      )}
      {f.kind === "rtl" && onCheckCompile && (
        <button
          className="file-inline-btn check"
          title={`${f.name} 컴파일 확인 (테스트벤치 없이)`}
          disabled={running}
          onClick={() => onCheckCompile(f.name)}
        >
          ✓
        </button>
      )}
      {hasMenu && (
        <div className="branch-more" ref={menuRef}>
          <button className="more-btn" title="더 보기" onClick={() => setMenuOpen((v) => !v)}>
            ⋯
          </button>
          {menuOpen && (
            <div className="branch-more-menu">
              {onRename && <button onClick={handleRename}>이름 변경</button>}
              {onArchive && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onArchive(f.name);
                  }}
                >
                  보관
                </button>
              )}
              {onDelete && (
                <button
                  className="danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(f.name);
                  }}
                >
                  삭제
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function FileList({
  files,
  activeName,
  onSelect,
  onCreate,
  onUpload,
  onDelete,
  onRename,
  onExport,
  onRunTestbench,
  onCheckCompile,
  running,
  archivedFiles,
  onArchive,
  onUnarchive,
  selectedTbs,
  onToggleTb,
  onRunSuite,
  onRunAllTbs,
  onRerunFailing,
}) {
  const editable = Boolean(onCreate);
  const [filterKind, setFilterKind] = useState("all");
  const fileInputRef = useRef(null);
  const tbCount = files.filter((f) => f.kind === "testbench").length;

  const counts = files.reduce((acc, f) => {
    acc[f.kind] = (acc[f.kind] ?? 0) + 1;
    return acc;
  }, {});

  const visibleFiles = filterKind === "all" ? files : files.filter((f) => f.kind === filterKind);

  const handleCreate = () => {
    const name = window.prompt("새 파일 이름 (예: alu.v, alu_tb.v)");
    if (!name) return;
    onCreate(name);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onUpload?.(file);
  };

  return (
    <div className="file-list">
      <div className="file-list-header">
        <span>파일</span>
        <div className="file-list-header-actions">
          {editable && (
            <>
              <button onClick={handleCreate} title="새 파일">+</button>
              <button onClick={handleUploadClick} title="파일 업로드">↑</button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".v,.sv,.vh,.txt"
                style={{ display: "none" }}
                onChange={handleFileInputChange}
              />
            </>
          )}
          {onExport && (
            <button onClick={onExport} title="브랜치 전체 내보내기 (zip)">⬇</button>
          )}
        </div>
      </div>
      <div className="file-filter-tabs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={filterKind === f.key ? "active" : ""}
            onClick={() => setFilterKind(f.key)}
          >
            {f.label} ({f.key === "all" ? files.length : counts[f.key] ?? 0})
          </button>
        ))}
      </div>
      {tbCount > 0 && (onRunSuite || onRunAllTbs || onRerunFailing) && (
        <div className="tb-suite-bar">
          {onRunSuite && (
            <button onClick={() => onRunSuite([...selectedTbs])} disabled={!selectedTbs?.size || running}>
              선택 실행 ({selectedTbs?.size ?? 0})
            </button>
          )}
          {onRunAllTbs && (
            <button onClick={onRunAllTbs} disabled={running}>
              전체 실행 ({tbCount})
            </button>
          )}
          {onRerunFailing && (
            <button onClick={onRerunFailing} disabled={running}>
              실패만 재실행
            </button>
          )}
        </div>
      )}
      <ul>
        {visibleFiles.map((f) => (
          <FileItem
            key={f.name}
            f={f}
            activeName={activeName}
            onSelect={onSelect}
            onRunTestbench={onRunTestbench}
            onCheckCompile={onCheckCompile}
            running={running}
            editable={editable}
            onRename={onRename}
            onArchive={onArchive}
            onDelete={onDelete}
            selectedTbs={selectedTbs}
            onToggleTb={onToggleTb}
          />
        ))}
        {visibleFiles.length === 0 && (
          <li className="empty">{files.length === 0 ? "파일이 없습니다" : "해당 종류의 파일이 없습니다"}</li>
        )}
      </ul>

      {archivedFiles && archivedFiles.length > 0 && (
        <details className="archived-files-details">
          <summary>▸ 보관된 파일 ({archivedFiles.length})</summary>
          <ul>
            {archivedFiles.map((f) => (
              <li key={f.name} className="archived-file-item">
                <span className={`badge badge-${f.kind}`}>{KIND_LABEL[f.kind] ?? f.kind}</span>
                <span className="file-name-archived">{f.name}</span>
                {editable && onUnarchive && (
                  <button className="claim-btn" onClick={() => onUnarchive(f.name)}>복원</button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
