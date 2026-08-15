const STATUS_LABEL = {
  pass: { text: "PASS", className: "status-pass" },
  fail: { text: "FAIL", className: "status-fail" },
  compile_error: { text: "컴파일 에러", className: "status-fail" },
  timeout: { text: "타임아웃", className: "status-fail" },
  unknown: { text: "결과 불명 (PASS/FAIL 마커 없음)", className: "status-unknown" },
};

export default function LogPanel({ running, result }) {
  return (
    <div className="log-panel">
      <div className="log-panel-header">
        <span>시뮬레이션 결과</span>
        {result && (
          <span className={`status-pill ${STATUS_LABEL[result.status]?.className ?? ""}`}>
            {STATUS_LABEL[result.status]?.text ?? result.status}
          </span>
        )}
      </div>

      {running && <div className="log-running">실행 중...</div>}

      {!running && !result && <div className="log-empty">아직 실행한 시뮬레이션이 없습니다.</div>}

      {!running && result && (
        <>
          {result.status === "compile_error" ? (
            <div className="log-section">
              <h4>컴파일 로그</h4>
              <pre className="log-block error">{result.compileLog || "(내용 없음)"}</pre>
            </div>
          ) : (
            <>
              {result.compileLog?.trim() && (
                <div className="log-section">
                  <h4>컴파일 로그</h4>
                  <pre className="log-block">{result.compileLog}</pre>
                </div>
              )}
              <div className="log-section">
                <h4>실행 로그</h4>
                <pre className="log-block">{result.runLog || "(출력 없음)"}</pre>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
