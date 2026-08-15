import { useState } from "react";
import { resetPassword } from "../api";

export default function ResetPasswordScreen({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await resetPassword(token, password);
      onDone(data.token, data.username);
    } catch (err) {
      setError(err?.response?.data?.error ?? "재설정 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h2>새 비밀번호 설정</h2>
        <label>
          새 비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="llm-submit" type="submit" disabled={busy}>
          {busy ? "처리 중..." : "비밀번호 변경"}
        </button>
      </form>
    </div>
  );
}
