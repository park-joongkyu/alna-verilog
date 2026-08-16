import { useState } from "react";

const STATUS_LABEL = {
  pass: { text: "PASS", className: "status-pass" },
  fail: { text: "FAIL", className: "status-fail" },
  compile_pass: { text: "컴파일 성공 (테스트벤치 미실행)", className: "status-pass" },
  compile_error: { text: "컴파일 에러", className: "status-fail" },
  timeout: { text: "타임아웃", className: "status-fail" },
  unknown: { text: "결과 불명 (PASS/FAIL 마커 없음)", className: "status-unknown" },
};

export default function LogPanel({ running, result }) {
  const [copiedKey, setCopiedKey] = useState(null);

  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1500);
    } catch {
      window.prompt("클립보드 복사가 차단됐어요. 아래 내용을 직접 복사하세요:", text || "");
    }
  };

  const copyCompileLog = () => copy("compile", result?.compileLog || "");
  const copyRunLog = () => copy("run", result?.runLog || "");
  const copyBoth = () => {
    const parts = [];
    if (result?.compileLog?.trim()) parts.push(`=== 컴파일 로그 ===\n${result.compileLog}`);
    if (result?.status !== "compile_pass") {
      parts.push(`=== 실행 로그 ===\n${result?.runLog || "(출력 없음)"}`);
    }
    copy("both", parts.join("\n\n"));
  };

  return (
    <div className="log-panel">
      <div className="log-panel-header">
        <span>시뮬레이션 결과</span>
        {result && (
          <span className={`status-pill ${STATUS_LABEL[result.status]?.className ?? ""}`}>
            {STATUS_LABEL[result.status]?.text ?? result.status}
          </span>
        )}
        {result && (
          <button className="log-copy-btn log-copy-all-btn" onClick={copyBoth}>
            {copiedKey === "both" ? "복사됨" : "전체 복사"}
          </button>
        )}
      </div>

      {running && <div className="log-running">실행 중...</div>}

      {!running && !result && <div className="log-empty">아직 실행한 시뮬레이션이 없습니다.</div>}

      {!running && result && (
        <>
          {result.status === "compile_error" || result.status === "compile_pass" ? (
            <div className="log-section">
              <div className="log-section-header">
                <h4>컴파일 로그</h4>
                <button className="log-copy-btn" onClick={copyCompileLog}>
                  {copiedKey === "compile" ? "복사됨" : "복사"}
                </button>
              </div>
              <pre className={`log-block ${result.status === "compile_error" ? "error" : ""}`}>
                {result.compileLog || "(내용 없음)"}
              </pre>
            </div>
          ) : (
            <>
              {result.compileLog?.trim() && (
                <div className="log-section">
                  <div className="log-section-header">
                    <h4>컴파일 로그</h4>
                    <button className="log-copy-btn" onClick={copyCompileLog}>
                      {copiedKey === "compile" ? "복사됨" : "복사"}
                    </button>
                  </div>
                  <pre className="log-block">{result.compileLog}</pre>
                </div>
              )}
              <div className="log-section">
                <div className="log-section-header">
                  <h4>실행 로그</h4>
                  <button className="log-copy-btn" onClick={copyRunLog}>
                    {copiedKey === "run" ? "복사됨" : "복사"}
                  </button>
                </div>
                <pre className="log-block">{result.runLog || "(출력 없음)"}</pre>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
