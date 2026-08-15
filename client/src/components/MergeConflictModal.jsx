import { useEffect, useState } from "react";
import { buildMergeConflictPrompt, parseTextResponse } from "../llmPrompt";

export default function MergeConflictModal({ source, target = "main", files, onResolve, onComplete, onAbort }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [refView, setRefView] = useState("ours");
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const active = files[Math.min(activeIndex, files.length - 1)];

  useEffect(() => {
    if (!active) return;
    setDrafts((prev) => (prev[active.name] !== undefined ? prev : { ...prev, [active.name]: active.raw }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.name]);

  if (!active) {
    return (
      <div className="merge-modal-backdrop">
        <div className="merge-modal">
          <h3>모든 충돌이 해결됐어요</h3>
          <div className="merge-modal-actions">
            <button className="llm-submit secondary" onClick={onAbort}>병합 취소</button>
            <button className="llm-submit" onClick={onComplete}>병합 완료</button>
          </div>
        </div>
      </div>
    );
  }

  const draft = drafts[active.name] ?? active.raw;
  const setDraft = (value) => setDrafts((prev) => ({ ...prev, [active.name]: value }));

  const copyMergePrompt = async () => {
    const prompt = buildMergeConflictPrompt({
      fileName: active.name,
      base: active.base,
      ours: active.ours,
      theirs: active.theirs,
    });
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("클립보드 복사가 차단됐어요. 아래 내용을 직접 복사하세요:", prompt);
    }
  };

  const applyPasted = () => {
    if (!pasted.trim()) return;
    const result = parseTextResponse(pasted, active.name);
    const match = result.files.find((f) => f.name === active.name) ?? result.files[0];
    if (match) setDraft(match.content);
    setPasted("");
  };

  const handleResolveFile = async () => {
    setBusy(true);
    try {
      await onResolve(active.name, draft);
      setActiveIndex(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="merge-modal-backdrop">
      <div className="merge-modal">
        <div className="merge-modal-header">
          <h3>"{source}" → "{target}" 병합 충돌 ({files.length}개 파일)</h3>
          <button className="llm-submit secondary" onClick={onAbort}>병합 취소</button>
        </div>

        <div className="merge-file-tabs">
          {files.map((f, i) => (
            <button
              key={f.name}
              className={i === activeIndex ? "active" : ""}
              onClick={() => setActiveIndex(i)}
            >
              {f.name}
            </button>
          ))}
        </div>

        <div className="merge-body">
          <div className="merge-draft-col">
            <h4>병합 결과 (편집해서 충돌 마커를 정리하세요)</h4>
            <textarea
              className="llm-input merge-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
            />
            <div className="merge-draft-actions">
              <button className="llm-submit" disabled={busy} onClick={handleResolveFile}>
                이 파일 저장
              </button>
            </div>

            <div className="merge-llm-help">
              <h4>LLM에게 병합 도움 요청</h4>
              <button className="llm-submit secondary" onClick={copyMergePrompt}>
                {copied ? "복사됨!" : "병합 프롬프트 복사"}
              </button>
              <textarea
                className="llm-input"
                placeholder="LLM이 병합해준 결과를 여기에 붙여넣으세요"
                rows={4}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
              <button className="llm-submit secondary" disabled={!pasted.trim()} onClick={applyPasted}>
                붙여넣은 내용을 위 편집창에 반영
              </button>
            </div>
          </div>

          <div className="merge-ref-col">
            <div className="merge-ref-tabs">
              <button className={refView === "ours" ? "active" : ""} onClick={() => setRefView("ours")}>
                {target} (ours)
              </button>
              <button className={refView === "theirs" ? "active" : ""} onClick={() => setRefView("theirs")}>
                {source} (theirs)
              </button>
              {active.base && (
                <button className={refView === "base" ? "active" : ""} onClick={() => setRefView("base")}>
                  공통 조상
                </button>
              )}
            </div>
            <pre className="merge-ref-content">{active[refView] ?? "(해당 버전에 파일 없음)"}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
