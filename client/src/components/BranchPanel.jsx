import { useEffect, useRef, useState } from "react";

function BranchItem({
  b,
  isCurrent,
  currentUser,
  isAdmin,
  onSwitch,
  onClaim,
  onMerge,
  onDelete,
  onTransfer,
  onSyncMain,
  onAddCollaborator,
  onRemoveCollaborator,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const isMine = b.owner === currentUser;
  const isCollaborator = (b.collaborators ?? []).some((c) => c.username === currentUser);
  const isUnowned = !b.owner && !b.isMain;
  const canEditBranch = !b.isMain && (isMine || isCollaborator || isAdmin);
  const canManage = !b.isMain && (isMine || isAdmin);

  const runAndClose = (fn) => () => {
    setMenuOpen(false);
    fn(b.name);
  };

  return (
    <li className={`branch-item ${isCurrent ? "active" : ""}`}>
      <button className="branch-row" onClick={() => onSwitch(b.name)}>
        <span className="branch-current-dot" aria-hidden>{isCurrent ? "●" : ""}</span>
        <span className="branch-name" title={b.name}>{b.name}</span>
      </button>

      <div className="branch-badges">
        {b.isMain && <span className="badge badge-main">MAIN</span>}
        {isMine && <span className="badge badge-mine">내 브랜치</span>}
        {isCollaborator && <span className="badge badge-collab">협업 중</span>}
        {!b.isMain && (
          <span className={`badge badge-owner ${isUnowned ? "badge-owner-empty" : ""}`}>
            {b.ownerName ?? "소유자 없음"}
          </span>
        )}
      </div>

      {!b.isMain && (b.collaborators ?? []).length > 0 && (
        <div className="branch-collab-list">
          {b.collaborators.map((c) => (
            <span key={c.username} className="badge badge-collab-member">
              {c.name}
              {(isMine || isAdmin || c.username === currentUser) && (
                <button
                  className="collab-remove-btn"
                  title="협업자 제외"
                  onClick={() => onRemoveCollaborator(b.name, c.username)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {b.lastCommit && (
        <div className="branch-last-commit" title={b.lastCommit.message}>
          <span className="branch-commit-msg">{b.lastCommit.message}</span>
        </div>
      )}

      {(isUnowned || canEditBranch || canManage) && (
        <div className="branch-actions">
          {isUnowned && (
            <button className="claim-btn" onClick={() => onClaim(b.name)}>
              내 브랜치로
            </button>
          )}
          {canEditBranch && (
            <button className="merge-btn" onClick={() => onMerge(b.name)}>
              merge
            </button>
          )}
          {canEditBranch && (
            <button className="sync-btn" onClick={() => onSyncMain(b.name)} title="main의 최신 내용을 이 브랜치로 가져오기">
              main 반영
            </button>
          )}
          {canManage && (
            <div className="branch-more" ref={menuRef}>
              <button className="more-btn" title="더 보기" onClick={() => setMenuOpen((v) => !v)}>
                ⋯
              </button>
              {menuOpen && (
                <div className="branch-more-menu">
                  <button onClick={runAndClose(onAddCollaborator)}>협업자 추가</button>
                  <button onClick={runAndClose(onTransfer)}>넘기기</button>
                  <button className="danger" onClick={runAndClose(onDelete)}>삭제</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function BranchPanel({
  branches,
  currentBranch,
  currentUser,
  isAdmin,
  onSwitch,
  onCreate,
  onClaim,
  onMerge,
  onDelete,
  onTransfer,
  onSyncMain,
  onAddCollaborator,
  onRemoveCollaborator,
}) {
  return (
    <div className="branch-panel">
      <div className="file-list-header">
        <span>브랜치</span>
        <button onClick={onCreate} title="새 브랜치 만들기">+</button>
      </div>
      <ul className="branch-list">
        {branches.map((b) => (
          <BranchItem
            key={b.name}
            b={b}
            isCurrent={b.name === currentBranch}
            currentUser={currentUser}
            isAdmin={isAdmin}
            onSwitch={onSwitch}
            onClaim={onClaim}
            onMerge={onMerge}
            onDelete={onDelete}
            onTransfer={onTransfer}
            onSyncMain={onSyncMain}
            onAddCollaborator={onAddCollaborator}
            onRemoveCollaborator={onRemoveCollaborator}
          />
        ))}
        {branches.length === 0 && <li className="empty">브랜치가 없습니다</li>}
      </ul>
    </div>
  );
}
