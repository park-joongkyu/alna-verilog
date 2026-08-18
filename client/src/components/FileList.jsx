import { useEffect, useRef, useState } from "react";

const KIND_LABEL = { testbench: "TB", rtl: "RTL", bram: "BRAM", header: "VH" };
const FILTERS = [
  { key: "all", label: "전체" },
  { key: "rtl", label: "RTL" },
  { key: "testbench", label: "TB" },
  { key: "bram", label: "BRAM" },
  { key: "header", label: "VH" },
];

function collectSubtreeNames(node) {
  const names = node.file ? [node.file] : [];
  for (const child of node.children ?? []) {
    names.push(...collectSubtreeNames(child));
  }
  return names;
}

function FileItem({
  f,
  node,
  fileByName,
  depth = 0,
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
  selectMode,
  selectedFiles,
  onToggleSelect,
  onToggleSelectMany,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const hasChildren = Boolean(node?.children?.length);
  const [expanded, setExpanded] = useState(depth < 2);

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
  const label = node?.instanceName ? `${node.instanceName} : ${f.name}` : f.name;
  const indentStyle = depth > 0 ? { paddingLeft: `${12 + depth * 14}px` } : undefined;

  const expandControl = node ? (
    hasChildren ? (
      <button className="hierarchy-toggle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "▾" : "▸"}
      </button>
    ) : (
      <span className="hierarchy-toggle-spacer" />
    )
  ) : null;

  const childProps = {
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
    selectMode,
    selectedFiles,
    onToggleSelect,
    onToggleSelectMany,
  };

  const toggleThisSelection = () => {
    if (hasChildren) onToggleSelectMany(collectSubtreeNames(node));
    else onToggleSelect(f.name);
  };

  let row;
  if (selectMode) {
    row = (
      <div className="file-row" style={indentStyle}>
        {expandControl}
        <input
          type="checkbox"
          className="file-delete-checkbox"
          checked={selectedFiles?.has(f.name) ?? false}
          onChange={toggleThisSelection}
        />
        <span className={`badge badge-${f.kind}`}>{KIND_LABEL[f.kind] ?? f.kind}</span>
        <span className="file-name" onClick={toggleThisSelection}>{label}</span>
        {node?.cyclic && <span className="hierarchy-cyclic" title="순환 참조">⟲</span>}
      </div>
    );
  } else {
    row = (
      <div className="file-row" style={indentStyle}>
        {expandControl}
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
        <span className="file-name" onClick={() => onSelect(f.name)}>{label}</span>
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
        {node?.cyclic && <span className="hierarchy-cyclic" title="순환 참조">⟲</span>}
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
      </div>
    );
  }

  return (
    <li className={f.name === activeName ? "active" : ""}>
      {row}
      {hasChildren && expanded && (
        <ul>
          {node.children.map((child, i) => (
            <FileItem
              key={`${child.module}-${i}`}
              node={child}
              f={fileByName.get(child.file) ?? { name: child.file ?? child.module, kind: "rtl" }}
              fileByName={fileByName}
              depth={depth + 1}
              {...childProps}
            />
          ))}
        </ul>
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
  onDeleteBulk,
  onArchiveBulk,
  onRename,
  onExport,
  onRunTestbench,
  onCheckCompile,
  running,
  archivedFiles,
  onArchive,
  onUnarchive,
  onDeleteArchived,
  onDeleteArchivedBulk,
  selectedTbs,
  onToggleTb,
  onRunSuite,
  onRunAllTbs,
  onRerunFailing,
  hierarchy,
  onShowHistory,
}) {
  const editable = Boolean(onCreate);
  const [filterKind, setFilterKind] = useState("all");
  const fileInputRef = useRef(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(() => new Set());
  const [dragOver, setDragOver] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const tbCount = files.filter((f) => f.kind === "testbench").length;

  const counts = files.reduce((acc, f) => {
    acc[f.kind] = (acc[f.kind] ?? 0) + 1;
    return acc;
  }, {});

  const visibleFiles = filterKind === "all" ? files : files.filter((f) => f.kind === filterKind);

  const fileByName = new Map(files.map((f) => [f.name, f]));
  const showTree = filterKind === "all" && hierarchy && hierarchy.length > 0;
  const hierarchyFileNames = new Set();
  if (showTree) {
    const collect = (nodes) => {
      for (const n of nodes) {
        if (n.file) hierarchyFileNames.add(n.file);
        if (n.children?.length) collect(n.children);
      }
    };
    collect(hierarchy);
  }
  const flatFiles = showTree ? visibleFiles.filter((f) => !hierarchyFileNames.has(f.name)) : visibleFiles;

  const handleCreate = () => {
    const name = window.prompt("새 파일 이름 (예: alu.v, alu_tb.v)");
    if (!name) return;
    onCreate(name);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e) => {
    // Snapshot into a plain array before clearing e.target.value - .files is
    // a *live* FileList tied to the input, so resetting value first (as this
    // used to) empties it out from under the reference and silently drops
    // the whole selection.
    const uploads = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (uploads.length > 0) onUpload?.(uploads);
  };

  const handleDragOver = (e) => {
    if (!onUpload) return;
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e) => {
    if (!onUpload) return;
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length > 0) onUpload(e.dataTransfer.files);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedFiles(new Set());
  };

  const handleToggleSelect = (name) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleToggleSelectMany = (names) => {
    setSelectedFiles((prev) => {
      const allSelected = names.every((n) => prev.has(n));
      const next = new Set(prev);
      if (allSelected) names.forEach((n) => next.delete(n));
      else names.forEach((n) => next.add(n));
      return next;
    });
  };

  const allVisibleSelected = visibleFiles.length > 0 && visibleFiles.every((f) => selectedFiles.has(f.name));

  const handleSelectAllVisible = () => {
    setSelectedFiles((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleFiles.forEach((f) => next.delete(f.name));
        return next;
      }
      const next = new Set(prev);
      visibleFiles.forEach((f) => next.add(f.name));
      return next;
    });
  };

  const handleConfirmDelete = async () => {
    const names = [...selectedFiles];
    if (names.length === 0) return;
    if (!window.confirm(`선택한 ${names.length}개 파일을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      await onDeleteBulk(names);
      exitSelectMode();
    } catch {
      // error already surfaced by the handler
    }
  };

  const handleConfirmArchive = async () => {
    const names = [...selectedFiles];
    if (names.length === 0) return;
    if (!window.confirm(`선택한 ${names.length}개 파일을 보관할까요? 나중에 복원할 수 있습니다.`)) return;
    try {
      await onArchiveBulk(names);
      exitSelectMode();
    } catch {
      // error already surfaced by the handler
    }
  };

  const handleDeleteAllArchived = async () => {
    const names = archivedFiles.map((f) => f.name);
    if (names.length === 0) return;
    if (!window.confirm(`보관된 파일 ${names.length}개를 전부 완전히 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      await onDeleteArchivedBulk(names);
    } catch {
      // error already surfaced by the handler
    }
  };

  const commonItemProps = {
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
    selectMode,
    selectedFiles,
    onToggleSelect: handleToggleSelect,
    onToggleSelectMany: handleToggleSelectMany,
  };

  return (
    <div
      className={`file-list${dragOver ? " file-list-drag-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="file-list-header">
        <div className="file-list-header-title">
          <span>파일</span>
          {onShowHistory && (
            <button className="sidebar-view-toggle-btn" onClick={onShowHistory}>
              히스토리 OFF
            </button>
          )}
        </div>
        <div className="file-list-header-actions">
          {editable && (
            <>
              <button onClick={handleCreate} title="새 파일">+</button>
              <button onClick={handleUploadClick} title="파일 업로드 (여러 개 선택 또는 끌어다 놓기 가능)">↑</button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".v,.vh,.txt"
                style={{ display: "none" }}
                onChange={handleFileInputChange}
              />
            </>
          )}
          {onExport && (
            <button onClick={onExport} title="브랜치 전체 내보내기 (zip)">⬇</button>
          )}
          {(onDeleteBulk || onArchiveBulk) && files.length > 0 && (
            <button
              className={`file-delete-toggle-btn${selectMode ? " active" : ""}`}
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              title="여러 파일 선택해서 삭제/보관"
            >
              {selectMode ? "취소" : "선택"}
            </button>
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
      {selectMode ? (
        <div className="file-delete-bar">
          <label className="file-delete-select-all">
            <input type="checkbox" checked={allVisibleSelected} onChange={handleSelectAllVisible} />
            전체 선택
          </label>
          {onArchiveBulk && (
            <button onClick={handleConfirmArchive} disabled={selectedFiles.size === 0}>
              선택 보관 ({selectedFiles.size})
            </button>
          )}
          {onDeleteBulk && (
            <button
              className="danger"
              onClick={handleConfirmDelete}
              disabled={selectedFiles.size === 0}
            >
              선택 삭제 ({selectedFiles.size})
            </button>
          )}
        </div>
      ) : (
        tbCount > 0 &&
        (onRunSuite || onRunAllTbs || onRerunFailing) && (
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
        )
      )}
      <ul>
        {showTree &&
          hierarchy.map((node, i) => (
            <FileItem
              key={`tree-${node.module}-${i}`}
              node={node}
              f={fileByName.get(node.file) ?? { name: node.file ?? node.module, kind: "rtl" }}
              fileByName={fileByName}
              depth={0}
              {...commonItemProps}
            />
          ))}
        {flatFiles.map((f) => (
          <FileItem key={f.name} f={f} node={null} fileByName={fileByName} depth={0} {...commonItemProps} />
        ))}
        {visibleFiles.length === 0 && (
          <li className="empty">{files.length === 0 ? "파일이 없습니다" : "해당 종류의 파일이 없습니다"}</li>
        )}
      </ul>

      {archivedFiles && archivedFiles.length > 0 && (
        <div className="archived-files-section">
          <div className="archived-files-header">
            <button
              type="button"
              className="archived-files-toggle"
              onClick={() => setArchivedOpen((v) => !v)}
            >
              {archivedOpen ? "▾" : "▸"} 보관된 파일 ({archivedFiles.length})
            </button>
            {editable && onDeleteArchivedBulk && (
              <button className="claim-btn danger" onClick={handleDeleteAllArchived}>
                전체 삭제
              </button>
            )}
          </div>
          {archivedOpen && (
            <ul>
              {archivedFiles.map((f) => (
                <li key={f.name} className="archived-file-item">
                  <span className={`badge badge-${f.kind}`}>{KIND_LABEL[f.kind] ?? f.kind}</span>
                  <span className="file-name-archived">{f.name}</span>
                  {editable && onUnarchive && (
                    <button className="claim-btn" onClick={() => onUnarchive(f.name)}>복원</button>
                  )}
                  {editable && onDeleteArchived && (
                    <button className="claim-btn danger" onClick={() => onDeleteArchived(f.name)}>삭제</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
