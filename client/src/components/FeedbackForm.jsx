import { useState } from "react";
import { submitFeedback } from "../api";

const CATEGORIES = [
  { value: "bug", label: "버그" },
  { value: "suggestion", label: "제안" },
  { value: "other", label: "기타" },
];

export default function FeedbackForm({ currentProject }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("bug");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!message.trim()) return;
    setBusy(true);
    try {
      await submitFeedback(category, message.trim(), currentProject);
      setMessage("");
      setSent(true);
      setTimeout(() => setSent(false), 2500);
    } catch (e) {
      alert(e?.response?.data?.error ?? "전송 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="feedback-box">
      <button type="button" className="panel-toggle-btn feedback-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "▾" : "▸"} 피드백 / 버그 제보
      </button>
      {open && (
        <div className="feedback-form">
          <select className="feedback-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <textarea
            className="llm-input"
            placeholder="버그나 개선 제안을 자유롭게 적어주세요"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className="llm-submit secondary" disabled={busy || !message.trim()} onClick={submit}>
            {busy ? "보내는 중..." : sent ? "전송됨!" : "보내기"}
          </button>
        </div>
      )}
    </div>
  );
}
