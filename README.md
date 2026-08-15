# ALNA Verilog

[한국어](#한국어) | [English](#english)

---

## 한국어

FPGA/RTL 팀 프로젝트를 위한 웹 기반 Verilog 협업 플랫폼입니다. 팀원마다 자기 소유의 git 브랜치에서 독립적으로 코드를 편집·시뮬레이션하고, LLM(ChatGPT/Claude)의 도움을 받아 코드를 수정한 뒤, 웹에서 바로 main 브랜치로 병합할 수 있습니다.

실제로 팀 프로젝트에서 사용 중인 서비스입니다: https://verilogserver.duckdns.org

### 주요 기능

- **프로젝트 단위 팀 관리**: 프로젝트를 만들고 팀원을 초대. 프로젝트마다 브랜치·파일·히스토리가 완전히 독립적으로 관리됨
- **브랜치 소유권 모델**: 브랜치를 만든 사람이 자동으로 소유자가 되고, 소유자만(또는 초대된 협업자만) 해당 브랜치를 편집 가능. 다른 사람 브랜치는 읽기 전용으로 열람만 가능
- **브라우저 내 Verilog 편집 & 시뮬레이션**: Monaco 에디터로 코드 편집, Icarus Verilog(iverilog/vvp)로 서버에서 바로 시뮬레이션 실행 → PASS/FAIL 결과 확인
- **버전 히스토리 & 되돌리기**: 저장할 때마다 자동 커밋, 파일/기간별 필터링, 특정 시점으로 되돌리기
- **LLM 연동 워크플로우**: 관련 코드/에러 로그를 자동으로 정리한 프롬프트를 생성 → ChatGPT/Claude 같은 외부 LLM에 붙여넣어 답변을 받고, 그 결과를 다시 파일에 적용(API 비용 없이 무료로 사용 가능한 구조)
- **웹 기반 Merge 충돌 해결**: 브랜치를 main에 병합할 때 충돌이 나면, 충돌 마커가 있는 코드를 웹에서 직접 편집해 해결. main(ours)/내 브랜치(theirs)/공통 조상 버전을 비교하며 작업 가능
- **관리자 패널**: 사용자 관리, 비밀번호 재설정, 피드백/버그 제보 확인, 로그인 접속 기록 조회

### 기술 스택

- **Frontend**: React, Vite, Monaco Editor
- **Backend**: Node.js, Express (ES modules)
- **버전 관리**: `simple-git` 기반 — 프로젝트별로 git 저장소를 만들고, 브랜치마다 git worktree를 생성해 완전히 격리된 작업 공간을 제공
- **시뮬레이션**: Icarus Verilog (오픈소스, 무료)
- **인증**: JWT + bcrypt
- **배포**: Oracle Cloud (ARM VPS), nginx 리버스 프록시, systemd 서비스, Let's Encrypt HTTPS

### 프로젝트 구조

```
client/   React + Vite 프론트엔드
server/   Express 백엔드 (REST API, git 연동, 시뮬레이션 실행)
```

### 로컬 실행

```bash
cd server && npm install && npm run dev   # http://localhost:4000
cd client && npm install && npm run dev   # http://localhost:5173
```

`server` 실행에는 [Icarus Verilog](http://iverilog.icarus.com/)가 시스템에 설치되어 있어야 합니다.

### 향후 계획

- **Verilator 지원 예정**: 대규모 설계의 시뮬레이션 속도를 높이기 위해, 현재 사용 중인 Icarus Verilog와 함께 [Verilator](https://github.com/verilator/verilator) 시뮬레이션 옵션을 추가할 계획입니다.

---

## English

A web-based Verilog collaboration platform for FPGA/RTL team projects. Each team member edits and simulates code independently on their own git branch, gets help from an LLM (ChatGPT/Claude) to fix code, and merges directly into the main branch from the browser.

Live and actively used for a real team project: https://verilogserver.duckdns.org

### Features

- **Project-based team management**: Create projects and invite teammates. Branches, files, and history are fully isolated per project
- **Branch ownership model**: Whoever creates a branch automatically becomes its owner; only the owner (or invited collaborators) can edit it. Other people's branches are visible but read-only
- **In-browser Verilog editing & simulation**: Edit code in the Monaco editor, run simulations server-side with Icarus Verilog (iverilog/vvp), and see PASS/FAIL results instantly
- **Version history & revert**: Every save auto-commits; filter history by file or date range, and revert to any prior point
- **LLM-assisted workflow**: Automatically builds a prompt bundling relevant code and recent error logs — paste it into ChatGPT/Claude, get a fix, and apply the result back to your files (no API cost, fully free)
- **Web-based merge conflict resolution**: When merging a branch into main hits a conflict, resolve it directly in the browser by editing the conflict markers, with side-by-side views of main (ours), your branch (theirs), and the common ancestor
- **Admin panel**: User management, password resets, feedback/bug report review, and login access log

### Tech Stack

- **Frontend**: React, Vite, Monaco Editor
- **Backend**: Node.js, Express (ES modules)
- **Version control**: Built on `simple-git` — each project gets its own git repository, and each branch gets its own git worktree for a fully isolated workspace
- **Simulation**: Icarus Verilog (open-source, free)
- **Auth**: JWT + bcrypt
- **Deployment**: Oracle Cloud (ARM VPS), nginx reverse proxy, systemd service, Let's Encrypt HTTPS

### Project Structure

```
client/   React + Vite frontend
server/   Express backend (REST API, git integration, simulation runner)
```

### Running Locally

```bash
cd server && npm install && npm run dev   # http://localhost:4000
cd client && npm install && npm run dev   # http://localhost:5173
```

[Icarus Verilog](http://iverilog.icarus.com/) must be installed on the system for the server to run.

### Roadmap

- **Verilator support (planned)**: alongside the current Icarus Verilog backend, we plan to add [Verilator](https://github.com/verilator/verilator) as a simulation option for faster runs on larger designs.
