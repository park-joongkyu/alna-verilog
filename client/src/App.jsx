import { useEffect, useState } from "react";
import LoginScreen from "./components/LoginScreen";
import ResetPasswordScreen from "./components/ResetPasswordScreen";
import ProjectSelector from "./components/ProjectSelector";
import Workspace from "./Workspace";
import { fetchMe, TOKEN_KEY } from "./api";
import "./App.css";

function getResetTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("resetToken");
}

const IDLE_TIMEOUT_MS = 2.5 * 60 * 60 * 1000; // 2.5 hours of no activity
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserName, setCurrentUserName] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [resetToken, setResetToken] = useState(getResetTokenFromUrl);
  const [currentProject, setCurrentProject] = useState(null);
  const [currentProjectName, setCurrentProjectName] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setChecking(false);
      return;
    }
    fetchMe()
      .then((data) => {
        setCurrentUser(data.username);
        setCurrentUserName(data.name ?? data.username);
        setIsAdmin(Boolean(data.isAdmin));
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setChecking(false));
  }, []);

  const handleAuthed = async (token, username, name) => {
    localStorage.setItem(TOKEN_KEY, token);
    setCurrentUser(username);
    setResetToken(null);
    window.history.replaceState({}, "", window.location.pathname);
    try {
      const data = await fetchMe();
      setCurrentUserName(data.name ?? name ?? username);
      setIsAdmin(Boolean(data.isAdmin));
    } catch {
      setCurrentUserName(name ?? username);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setCurrentUser(null);
    setCurrentUserName(null);
    setIsAdmin(false);
    setCurrentProject(null);
    setCurrentProjectName(null);
  };

  useEffect(() => {
    if (!currentUser) return;
    let timer;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        handleLogout();
        alert("장시간 활동이 없어 자동으로 로그아웃됐습니다.");
      }, IDLE_TIMEOUT_MS);
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetTimer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleSelectProject = (id, name) => {
    setCurrentProject(id);
    setCurrentProjectName(name);
  };

  const handleExitProject = () => {
    setCurrentProject(null);
    setCurrentProjectName(null);
  };

  if (checking) return null;

  if (resetToken) {
    return <ResetPasswordScreen token={resetToken} onDone={handleAuthed} />;
  }

  if (!currentUser) {
    return <LoginScreen onAuthed={handleAuthed} />;
  }

  if (!currentProject) {
    return <ProjectSelector onSelect={handleSelectProject} onLogout={handleLogout} isAdmin={isAdmin} />;
  }

  return (
    <Workspace
      currentUser={currentUser}
      currentUserName={currentUserName}
      isAdmin={isAdmin}
      currentProject={currentProject}
      currentProjectName={currentProjectName}
      onExitProject={handleExitProject}
      onLogout={handleLogout}
    />
  );
}
