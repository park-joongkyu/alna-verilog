import { useState } from "react";
import { login, register, forgotPassword } from "../api";

export default function LoginScreen({ onAuthed }) {
  const [mode, setMode] = useState("login"); // login | register | forgot
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (m) => {
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "forgot") {
        const data = await forgotPassword(username);
        setInfo(data.message ?? "메일을 확인해주세요.");
        return;
      }
      if (mode === "register") {
        if (password !== confirmPassword) {
          setError("비밀번호가 서로 일치하지 않습니다.");
          return;
        }
        await register(username, password, email, name, inviteCode);
        setPassword("");
        setConfirmPassword("");
        setMode("login");
        setInfo("회원가입이 완료됐습니다. 로그인해주세요.");
        return;
      }
      const data = await login(username, password);
      onAuthed(data.token, data.username, data.name);
    } catch (err) {
      setError(err?.response?.data?.error ?? "요청 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-tagline">Assisted Logic Network Alliance</div>
      <form className="login-card" onSubmit={submit}>
        <h2>ALNA_Verilog</h2>
        <div className="login-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>
            로그인
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => switchMode("register")}
          >
            회원가입
          </button>
        </div>

        {mode === "register" && (
          <label>
            이름
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>
        )}

        <label>
          아이디
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        {mode === "register" && (
          <label>
            접속 코드
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
          </label>
        )}

        {mode === "register" && (
          <label>
            이메일
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
        )}

        {mode !== "forgot" && (
          <label>
            비밀번호
            <div className="password-input-wrap">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "숨기기" : "보기"}
              </button>
            </div>
          </label>
        )}

        {mode === "register" && (
          <label>
            비밀번호 확인
            <div className="password-input-wrap">
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "숨기기" : "보기"}
              </button>
            </div>
          </label>
        )}

        {error && <div className="login-error">{error}</div>}
        {info && <div className="login-info">{info}</div>}

        <button className="llm-submit" type="submit" disabled={busy}>
          {busy ? "처리 중..." : mode === "login" ? "로그인" : mode === "register" ? "회원가입" : "재설정 메일 보내기"}
        </button>

        {mode === "login" && (
          <button type="button" className="login-forgot-link" onClick={() => switchMode("forgot")}>
            비밀번호를 잊으셨나요?
          </button>
        )}
        {mode === "forgot" && (
          <button type="button" className="login-forgot-link" onClick={() => switchMode("login")}>
            로그인으로 돌아가기
          </button>
        )}
      </form>
    </div>
  );
}
