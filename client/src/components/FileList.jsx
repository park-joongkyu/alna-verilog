import { useRef, useState } from "react";

const KIND_LABEL = { testbench: "TB", rtl: "RTL", bram: "BRAM" };
const FILTERS = [
  { key: "all", label: "전체" },
  { key: "rtl", label: "RTL" },
  { key: "testbench", label: "TB" },
  { key: "bram", label: "BRAM" },
];

export default function FileList({ files, activeName, onSelect, onCreate, onUpload, onDelete }) {
  const editable = Boolean(onCreate);
  const [filterKind, setFilterKind] = useState("all");
  const fileInputRef = useRef(null);

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
        {editable && (
          <div className="file-list-header-actions">
            <button onClick={handleCreate} title="새 파일">+</button>
            <button onClick={handleUploadClick} title="파일 업로드">↑</button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".v,.sv,.vh,.txt"
              style={{ display: "none" }}
              onChange={handleFileInputChange}
            />
          </div>
        )}
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
      <ul>
        {visibleFiles.map((f) => (
          <li key={f.name} className={f.name === activeName ? "active" : ""}>
            <span className={`badge badge-${f.kind}`}>{KIND_LABEL[f.kind] ?? f.kind}</span>
            <span className="file-name" onClick={() => onSelect(f.name)}>{f.name}</span>
            {editable && (
              <button className="delete-btn" title="삭제" onClick={() => onDelete(f.name)}>×</button>
            )}
          </li>
        ))}
        {visibleFiles.length === 0 && (
          <li className="empty">{files.length === 0 ? "파일이 없습니다" : "해당 종류의 파일이 없습니다"}</li>
        )}
      </ul>
    </div>
  );
}
