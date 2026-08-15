import { useEffect, useState } from "react";
import { adminListUsers, adminResetPassword, listFeedback, setFeedbackStatus, adminListAccessLog } from "../api";

const CATEGORY_LABEL = { bug: "버그", suggestion: "제안", other: "기타" };

export default function AdminPanel({ onClose }) {
  const [tab, setTab] = useState("users"); // users | feedback | access
  const [users, setUsers] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [accessLog, setAccessLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      if (tab === "users") {
        setUsers(await adminListUsers());
      } else if (tab === "feedback") {
        setFeedback(await listFeedback());
      } else {
        setAccessLog(await adminListAccessLog());
      }
    } catch (e) {
      setError(e?.response?.data?.error ?? "목록을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setError(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleReset = async (username) => {
    const newPassword = window.prompt(`${username}님의 새 비밀번호를 입력하세요 (4자 이상)`);
    if (!newPassword) return;
    try {
      await adminResetPassword(username, newPassword);
      alert("비밀번호가 재설정됐습니다. 본인에게 새 비밀번호를 전달해주세요.");
    } catch (e) {
      alert(e?.response?.data?.error ?? "재설정 실패");
    }
  };

  const toggleFeedbackStatus = async (item) => {
    try {
      const next = item.status === "open" ? "resolved" : "open";
      await setFeedbackStatus(item.id, next);
      setFeedback((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: next } : f)));
    } catch (e) {
      alert(e?.response?.data?.error ?? "상태 변경 실패");
    }
  };

  return (
    <div className="merge-modal-backdrop" onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="merge-modal-header">
          <h3>관리자</h3>
          <button className="llm-submit secondary" onClick={onClose}>닫기</button>
        </div>

        <div className="sidebar-tabs">
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
            사용자 목록
          </button>
          <button className={tab === "feedback" ? "active" : ""} onClick={() => setTab("feedback")}>
            피드백
          </button>
          <button className={tab === "access" ? "active" : ""} onClick={() => setTab("access")}>
            접속 기록
          </button>
        </div>

        <div className="help-body">
          {loading && <p>불러오는 중...</p>}
          {error && <div className="login-error">{error}</div>}

          {!loading && !error && tab === "users" && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>아이디</th>
                    <th>이메일</th>
                    <th>권한</th>
                    <th>가입일</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.username}>
                      <td>{u.name}</td>
                      <td>{u.username}</td>
                      <td>{u.email}</td>
                      <td>{u.role === "admin" ? "관리자" : "일반"}</td>
                      <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString("ko-KR") : "-"}</td>
                      <td>
                        <button className="claim-btn" onClick={() => handleReset(u.username)}>
                          비밀번호 재설정
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6}>가입된 사용자가 없습니다</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && tab === "feedback" && (
            <ul className="feedback-list">
              {feedback.map((f) => (
                <li key={f.id} className="feedback-item">
                  <div className="feedback-item-head">
                    <span className={`badge badge-${f.category}`}>{CATEGORY_LABEL[f.category] ?? f.category}</span>
                    <span className="feedback-item-name">{f.name}</span>
                    <span className="feedback-item-date">
                      {new Date(f.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {f.project && <span className="feedback-item-project">{f.project}</span>}
                    <span className={`status-pill ${f.status === "resolved" ? "status-pass" : "status-unknown"}`}>
                      {f.status === "resolved" ? "해결됨" : "미해결"}
                    </span>
                  </div>
                  <p className="feedback-item-message">{f.message}</p>
                  <button className="claim-btn" onClick={() => toggleFeedbackStatus(f)}>
                    {f.status === "resolved" ? "다시 열기" : "해결됨으로 표시"}
                  </button>
                </li>
              ))}
              {feedback.length === 0 && <li className="empty">받은 피드백이 없습니다</li>}
            </ul>
          )}

          {!loading && !error && tab === "access" && (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>아이디</th>
                    <th>로그인 시각</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {accessLog.map((e, i) => (
                    <tr key={i} title={e.userAgent ?? ""}>
                      <td>{e.name}</td>
                      <td>{e.username}</td>
                      <td>
                        {new Date(e.at).toLocaleString("ko-KR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td>{e.ip ?? "-"}</td>
                    </tr>
                  ))}
                  {accessLog.length === 0 && (
                    <tr>
                      <td colSpan={4}>접속 기록이 없습니다</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
