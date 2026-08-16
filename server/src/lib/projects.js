import fs from "node:fs/promises";
import path from "node:path";
import { ensureMainRepo } from "./git.js";
import { workspaceDir, projectDir } from "./workspace.js";
import { readJson, writeJson } from "./jsonStore.js";
import { isAdmin } from "./users.js";

const FILE = "projects.json";

const MAIN_V_TEMPLATE = `// 예제로 자동 생성된 파일입니다 - 자유롭게 수정하거나 지우세요.
// 4비트 동기 리셋 카운터.
module main (
    input  wire       clk,
    input  wire       rst,
    output reg  [3:0] count
);
    always @(posedge clk) begin
        if (rst)
            count <= 4'd0;
        else
            count <= count + 4'd1;
    end
endmodule
`;

const MAIN_TB_V_TEMPLATE = `// 예제로 자동 생성된 테스트벤치입니다 - main.v를 시뮬레이션합니다.
\`timescale 1ns/1ps

module main_tb;
    reg clk = 0;
    reg rst;
    wire [3:0] count;

    main dut (
        .clk(clk),
        .rst(rst),
        .count(count)
    );

    always #5 clk = ~clk;

    integer i;
    integer errors = 0;

    initial begin
        rst = 1;
        @(posedge clk); #1;
        rst = 0;

        for (i = 0; i < 5; i = i + 1) begin
            if (count !== i) begin
                $display("[FAIL] step %0d: expected count=%0d, got %0d", i, i, count);
                errors = errors + 1;
            end
            @(posedge clk); #1;
        end

        if (errors == 0)
            $display("[PASS] counter incremented correctly for 5 cycles");
        else
            $display("[FAIL] %0d mismatches found", errors);

        $finish;
    end
endmodule
`;

function normalize(id, meta) {
  return { id, ...meta, members: meta.members ?? [] };
}

// Returns every registered project, regardless of membership - only for
// internal/boot use (e.g. ensuring each project's git repo exists at
// startup). Route handlers must filter with listProjectsFor instead.
export async function listProjects() {
  const map = await readJson(FILE, {});
  return Object.entries(map).map(([id, meta]) => normalize(id, meta));
}

export async function listProjectsFor(username, userIsAdmin) {
  const all = await listProjects();
  if (userIsAdmin) return all;
  return all.filter((p) => p.members.includes(username));
}

export async function getProject(id) {
  const map = await readJson(FILE, {});
  return map[id] ? normalize(id, map[id]) : null;
}

export async function isMember(id, username) {
  const project = await getProject(id);
  return Boolean(project?.members.includes(username));
}

// Admins can access every project regardless of membership, same as they
// bypass branch ownership checks.
export async function canAccessProject(id, username) {
  if (await isAdmin(username)) return true;
  return isMember(id, username);
}

export async function createProject(id, name, createdBy) {
  const map = await readJson(FILE, {});
  if (map[id]) {
    const err = new Error("이미 존재하는 프로젝트입니다");
    err.code = "PROJECT_EXISTS";
    throw err;
  }
  const dir = workspaceDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "main.v"), MAIN_V_TEMPLATE, "utf-8");
  await fs.writeFile(path.join(dir, "main_tb.v"), MAIN_TB_V_TEMPLATE, "utf-8");
  await ensureMainRepo(id);
  map[id] = { name, createdBy, createdAt: new Date().toISOString(), members: [createdBy] };
  await writeJson(FILE, map);
  return normalize(id, map[id]);
}

export async function deleteProject(id) {
  const map = await readJson(FILE, {});
  if (!map[id]) return false;
  delete map[id];
  await writeJson(FILE, map);
  await fs.rm(projectDir(id), { recursive: true, force: true });
  return true;
}

export async function addMember(id, username) {
  const map = await readJson(FILE, {});
  if (!map[id]) return null;
  const meta = map[id];
  meta.members = meta.members ?? [];
  if (!meta.members.includes(username)) meta.members.push(username);
  map[id] = meta;
  await writeJson(FILE, map);
  return normalize(id, meta);
}

export async function removeMember(id, username) {
  const map = await readJson(FILE, {});
  if (!map[id]) return null;
  const meta = map[id];
  meta.members = (meta.members ?? []).filter((u) => u !== username);
  map[id] = meta;
  await writeJson(FILE, map);
  return normalize(id, meta);
}
