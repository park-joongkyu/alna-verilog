import { useEffect, useState } from "react";
import { listFiles, getFile } from "../api";
import { buildPrompt, parseTextResponse, stripCodeFence } from "../llmPrompt";

const VALID_NAME = /^[A-Za-z0-9_-]+\.v$/;

export default function LLMPanel({ activeName, currentProject, currentBranch, lastResult, onApply }) {
  const [requestText, setRequestText] = useState("");
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [files, setFiles] = useState([]);
  const [copiedFileName, setCopiedFileName] = useState(null);
  const [busy, setBusy] = useState(false);
  const [promptFallback, setPromptFallback] = useState(null);
  const [summary, setSummary] = useState("");
  const [availableFiles, setAvailableFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState(() => new Set());

  useEffect(() => {
    listFiles(currentProject, currentBranch).then((list) => setAvailableFiles(list));
  }, [currentProject, currentBranch]);

  // Default to just the file currently open in the editor - including every
  // project file every time makes the prompt huge and slow to paste/copy,
  // especially on mobile. The user can still tick more files on if needed.
  useEffect(() => {
    if (activeName) setSelectedFiles(new Set([activeName]));
  }, [activeName]);

  const toggleFile = (name) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const copyPrompt = async () => {
    if (!requestText.trim() || selectedFiles.size === 0) return;
    setBusy(true);
    setPromptFallback(null);
    try {
      const names = availableFiles.map((f) => f.name).filter((n) => selectedFiles.has(n));
      const projectFiles = await Promise.all(
        names.map(async (name) => {
          const data = await getFile(currentProject, name, currentBranch);
          return { name, content: data.content };
        })
      );
      const prompt = buildPrompt({ requestText, files: projectFiles, lastResult });
      try {
        await navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard permission denied: show the prompt so the user can select-all and copy manually.
        setPromptFallback(prompt);
      }
    } finally {
      setBusy(false);
    }
  };

  const parsePasted = () => {
    if (!pasted.trim()) return;
    const result = parseTextResponse(pasted, activeName);
    setSummary(result.summary);
    setFiles(result.files);
  };

  const handleFileUpload = async (e) => {
    const uploaded = Array.from(e.target.files ?? []);
    if (uploaded.length === 0) return;
    const read = await Promise.all(
      uploaded.map(async (f) => ({ name: f.name, content: stripCodeFence(await f.text()) }))
    );
    setSummary("");
    setFiles(read);
    e.target.value = "";
  };

  const updateFileName = (index, newName) => {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, name: newName } : f)));
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const copyFile = async (name, content) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFileName(name);
      setTimeout(() => setCopiedFileName(null), 1500);
    } catch {
      alert("클립보드 복사가 차단되었어요. 아래 코드 영역에서 직접 드래그해 복사해주세요.");
    }
  };

  return (
    <div className="llm-panel">
      <div className="llm-panel-header">LLM에게 요청 (무료 · ChatGPT/Claude 등)</div>

      <div className="llm-step">
        <span className="llm-step-num">1</span>
        <span>요청 내용을 적고, 보낼 파일을 고른 뒤 프롬프트를 복사해서 AI 챗봇에 붙여넣으세요</span>
      </div>
      <textarea
        className="llm-input"
        placeholder="예: 이 에러 고쳐줘 / 카운터에 리셋 조건 추가해줘"
        value={requestText}
        onChange={(e) => setRequestText(e.target.value)}
        rows={3}
      />

      <div className="llm-file-picker">
        {availableFiles.map((f) => (
          <label key={f.name} className="llm-file-check">
            <input
              type="checkbox"
              checked={selectedFiles.has(f.name)}
              onChange={() => toggleFile(f.name)}
            />
            {f.name}
          </label>
        ))}
        {availableFiles.length === 0 && <span className="llm-empty">파일 없음</span>}
      </div>

      <button
        className="llm-submit"
        disabled={busy || !requestText.trim() || selectedFiles.size === 0}
        onClick={copyPrompt}
      >
        {busy ? "준비 중..." : copied ? "복사됨!" : `프롬프트 복사 (${selectedFiles.size}개 파일)`}
      </button>

      {promptFallback && (
        <div className="llm-fallback">
          <p className="llm-error">
            클립보드 자동 복사가 차단되었어요. 아래 내용을 직접 선택해서 복사해주세요 (Ctrl+A, Ctrl+C).
          </p>
          <textarea
            className="llm-input"
            readOnly
            rows={6}
            value={promptFallback}
            onFocus={(e) => e.target.select()}
          />
        </div>
      )}

      <div className="llm-step">
        <span className="llm-step-num">2</span>
        <span>답변으로 받은 파일을 업로드하거나, 답변 텍스트를 붙여넣으세요</span>
      </div>

      <label className="llm-upload-btn">
        파일 업로드 (여러 개 선택 가능)
        <input type="file" multiple accept=".v,.txt" onChange={handleFileUpload} hidden />
      </label>

      <details className="llm-paste-details">
        <summary>또는 텍스트로 붙여넣기</summary>
        <textarea
          className="llm-input"
          placeholder="LLM 응답 전체를 여기에 붙여넣으세요 (Ctrl+V)"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={5}
        />
        <button className="llm-submit secondary" disabled={!pasted.trim()} onClick={parsePasted}>
          붙여넣은 내용 확인
        </button>
      </details>

      {(files.length > 0 || summary) && (
        <div className="llm-response">
          {summary && <p className="llm-summary">{summary}</p>}
          {files.length === 0 && (
            <p className="llm-empty">
              파일 내용을 인식하지 못했어요. 답변 전체(설명 포함)를 그대로 붙여넣었는지 확인해 주세요.
            </p>
          )}
          {files.map((f, i) => (
            <div key={i} className="llm-file">
              <div className="llm-file-header">
                <input
                  className={`llm-file-name ${VALID_NAME.test(f.name) ? "" : "invalid"}`}
                  value={f.name}
                  onChange={(e) => updateFileName(i, e.target.value)}
                  title="적용할 파일명 (필요하면 수정하세요)"
                />
                <div className="llm-file-actions">
                  <button onClick={() => copyFile(f.name, f.content)}>
                    {copiedFileName === f.name ? "복사됨" : "복사"}
                  </button>
                  <button
                    className="apply-btn"
                    disabled={!VALID_NAME.test(f.name)}
                    onClick={() => onApply(f.name, f.content, requestText)}
                  >
                    적용
                  </button>
                  <button className="remove-btn" onClick={() => removeFile(i)}>
                    지우기
                  </button>
                </div>
              </div>
              <pre className="llm-code">{f.content}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
