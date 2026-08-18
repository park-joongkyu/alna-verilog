export function buildPrompt({ requestText, files, lastResult }) {
  const filesBlock = files.map((f) => `--- ${f.name} ---\n${f.content}`).join("\n\n");

  let logBlock = "";
  if (lastResult) {
    logBlock = `\n\n최근 시뮬레이션 결과 (status: ${lastResult.status}):\n[컴파일 로그]\n${lastResult.compileLog || "(없음)"}\n\n[실행 로그]\n${lastResult.runLog || "(없음)"}`;
  }

  return `너는 Verilog RTL/testbench 코드를 수정하는 것을 돕는 어시스턴트야.
아래는 현재 프로젝트의 .v 파일들이야.

${filesBlock}${logBlock}

사용자 요청:
${requestText}

중요: 답변할 때 수정이 필요한 파일마다 아래 형식을 정확히 지켜서 파일 전체 내용을 반환해줘 (일부 수정이 아니라 전체 코드). 마크다운 코드블록(\`\`\`)은 쓰지 말고 아래 마커만 사용해:

### FILE: 파일명.v
(수정된 파일 전체 내용)

### FILE: 다른파일명.v
(수정된 파일 전체 내용)

수정이 필요 없는 파일은 답변에 포함하지 마. 컴파일 에러가 "모듈을 찾을 수 없음(Unknown module type)"이라면, 기존 파일을 고치는 대신 그 모듈을 정의하는 새 파일을 만들어서 같은 형식으로 반환해도 돼 (파일명은 모듈 이름 + .v).
맨 앞에 무엇을 왜 고쳤는지 1~2문장으로 간단히 설명하고 나서 위 형식으로 파일들을 나열해줘.
파일을 다운로드할 수 있는 형태로 줄 수 있으면 그렇게 줘도 좋아 (파일마다 하나씩).`;
}

export function buildMergeConflictPrompt({ fileName, base, ours, theirs, note }) {
  const baseBlock = base ? `--- 공통 조상(base) 버전 ---\n${base}\n\n` : "";
  return `너는 Verilog 코드의 git merge 충돌을 해결하는 것을 돕는 어시스턴트야.
파일: ${fileName}

${baseBlock}--- main(ours) 버전 ---
${ours ?? "(base에서 삭제됨)"}

--- 브랜치(theirs) 버전 ---
${theirs ?? "(base에서 삭제됨)"}
${note ? `\n참고 사항:\n${note}\n` : ""}
두 버전을 의미적으로 합쳐서 하나의 완성된 파일로 만들어줘. 양쪽의 의도를 모두 반영하되, 서로 충돌하는 부분은 더 합리적인 쪽을 선택하고 왜 그렇게 했는지 설명해줘.

중요: 답변 맨 앞에 무엇을 어떻게 합쳤는지 1~3문장으로 설명한 뒤, 아래 형식으로 병합된 파일 전체 내용을 반환해줘 (일부만 X, 마크다운 코드블록 \`\`\` 쓰지 말 것):

### FILE: ${fileName}
(병합된 파일 전체 내용)`;
}

const FILE_MARKER = /^###\s*FILE:\s*(\S+\.(?:v|vh))\s*$/gm;

export function stripCodeFence(text) {
  return text
    .trim()
    .replace(/^```[a-zA-Z]*\n/, "")
    .replace(/\n```$/, "")
    .trim();
}

export function parseTextResponse(raw, fallbackName) {
  const matches = [...raw.matchAll(FILE_MARKER)];

  if (matches.length === 0) {
    const content = stripCodeFence(raw);
    if (!content) return { summary: "", files: [] };
    return {
      summary: "",
      files: fallbackName ? [{ name: fallbackName, content }] : [],
    };
  }

  const summary = raw.slice(0, matches[0].index).trim();
  const files = matches.map((m, i) => {
    const name = m[1];
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    const content = stripCodeFence(raw.slice(start, end));
    return { name, content };
  });

  return { summary, files };
}
