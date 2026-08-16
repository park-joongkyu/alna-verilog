const STATUS_LABEL = {
  pass: { text: "PASS", className: "status-pass" },
  fail: { text: "FAIL", className: "status-fail" },
  compile_error: { text: "컴파일 에러", className: "status-fail" },
  timeout: { text: "타임아웃", className: "status-fail" },
  unknown: { text: "결과 불명", className: "status-unknown" },
};

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function HistoryPanel({ entries, files, onRevert, filter, onFilterChange, simRuns }) {
  const hasFilter = filter?.since || filter?.until || filter?.file;
  const fileFilterActive = Boolean(filter?.file);

  return (
    <div className="history-panel">
      <div className="file-list-header">
        <span>커밋 이력</span>
      </div>

      {simRuns && simRuns.length > 0 && (
        <details className="sim-run-history">
          <summary>▸ 최근 시뮬레이션 실행 ({simRuns.length})</summary>
          <ul className="sim-run-list">
            {simRuns.map((r, i) => (
              <li key={i} className="sim-run-item">
                <div className="sim-run-item-top">
                  <span className={`status-pill ${STATUS_LABEL[r.status]?.className ?? ""}`}>
                    {STATUS_LABEL[r.status]?.text ?? r.status}
                  </span>
                  <span className="sim-run-tb" title={r.testbench ?? ""}>{r.testbench ?? "(알 수 없음)"}</span>
                </div>
                <div className="sim-run-meta">{formatDate(r.at)} · {r.username}</div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="history-filter">
        <label>
          파일
          <select
            value={filter?.file ?? ""}
            onChange={(e) => onFilterChange({ ...filter, file: e.target.value })}
          >
            <option value="">전체 파일</option>
            {(files ?? []).map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          시작일
          <input
            type="date"
            value={filter?.since ?? ""}
            onChange={(e) => onFilterChange({ ...filter, since: e.target.value })}
          />
        </label>
        <label>
          종료일
          <input
            type="date"
            value={filter?.until ?? ""}
            onChange={(e) => onFilterChange({ ...filter, until: e.target.value })}
          />
        </label>
        {hasFilter && (
          <button className="filter-clear" onClick={() => onFilterChange({ since: "", until: "", file: "" })}>
            초기화
          </button>
        )}
      </div>
      {fileFilterActive && (
        <div className="history-filter-hint">
          "{filter.file}" 파일에 영향을 준 커밋만 표시 중 · 되돌리기는 이 파일만 복원합니다
        </div>
      )}

      <ul className="history-list">
        {entries.map((entry, idx) => (
          <li key={entry.hash} className="history-item">
            <div className="history-row">
              <span className="history-date">{formatDate(entry.date)}</span>
            </div>
            <div className="history-message">{entry.message}</div>
            {entry.note && (
              <div className={`status-pill ${STATUS_LABEL[entry.note.status]?.className ?? ""}`}>
                {STATUS_LABEL[entry.note.status]?.text ?? entry.note.status}
              </div>
            )}
            {onRevert && (idx !== 0 || hasFilter) && (
              <button className="revert-btn" onClick={() => onRevert(entry.hash)}>
                {fileFilterActive ? "이 파일만 되돌리기" : "이 버전으로 되돌리기"}
              </button>
            )}
          </li>
        ))}
        {entries.length === 0 && <li className="empty">해당 기간에 커밋이 없습니다</li>}
      </ul>
    </div>
  );
}
