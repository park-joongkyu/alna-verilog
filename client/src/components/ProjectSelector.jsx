import { useEffect, useState } from "react";
import { listProjects, createProject } from "../api";

export default function ProjectSelector({ onSelect, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setProjects(await listProjects());
    } catch (e) {
      setError(e?.response?.data?.error ?? "프로젝트 목록을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const slugify = (name) => {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || `project-${Date.now()}`;
  };

  const handleCreate = async () => {
    const name = window.prompt("새 프로젝트 이름 (예: AIX Tiny-YOLO)");
    if (!name) return;
    try {
      const project = await createProject(slugify(name), name);
      await refresh();
      onSelect(project.id, project.name);
    } catch (e) {
      alert(e?.response?.data?.error ?? "프로젝트 생성 실패");
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card project-selector">
        <h2>프로젝트 선택</h2>
        {loading && <p>불러오는 중...</p>}
        {error && <div className="login-error">{error}</div>}
        {!loading && !error && (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id}>
                <button className="project-item" onClick={() => onSelect(p.id, p.name)}>
                  <span className="project-name">{p.name}</span>
                  <span className="project-id">{p.id}</span>
                </button>
              </li>
            ))}
            {projects.length === 0 && <li className="empty">프로젝트가 없습니다</li>}
          </ul>
        )}
        <button className="llm-submit secondary" onClick={handleCreate}>+ 새 프로젝트</button>
        {onLogout && (
          <button type="button" className="login-forgot-link" onClick={onLogout}>
            로그아웃
          </button>
        )}
      </div>
    </div>
  );
}
