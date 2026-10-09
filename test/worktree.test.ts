import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import extension from "../src/index.js";
import { gitState } from "../src/providers.js";

test("detects linked git worktree vs main git repo", async () => {
  const root = mkdtempSync(join(tmpdir(), "pi-line-wt-test-"));
  const mainRepo = join(root, "main-repo");
  const worktreeDir = join(root, "feature-worktree");

  try {
    // 1. Initialize main repo
    execFileSync("git", ["init", "-b", "main", mainRepo], { stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: mainRepo });
    execFileSync("git", ["config", "user.name", "Test User"], { cwd: mainRepo });
    execFileSync("git", ["commit", "--allow-empty", "-m", "initial commit"], { cwd: mainRepo });

    // 2. Create a linked worktree
    execFileSync("git", ["worktree", "add", "-b", "feature-x", worktreeDir], { cwd: mainRepo, stdio: "ignore" });

    const events = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
    const pi = {
      on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => void) => events.set(name, handler),
      registerCommand: () => {},
      exec: async (cmd: string, args: string[], options: { cwd: string }) => {
        try {
          const stdout = execFileSync(cmd, args, { cwd: options.cwd, encoding: "utf8" });
          return { code: 0, stdout, stderr: "" };
        } catch (err: any) {
          return { code: err.status ?? 1, stdout: err.stdout?.toString() ?? "", stderr: err.stderr?.toString() ?? "" };
        }
      },
    } as unknown as ExtensionAPI;

    extension(pi);

    const dummyCtx = (cwd: string) =>
      ({
        cwd,
        ui: {
          setFooter: () => {},
          setEditorComponent: () => {},
          notify: () => {},
        },
      }) as unknown as ExtensionContext;

    // Test in main repo
    events.get("session_start")!(undefined, dummyCtx(mainRepo));
    // Wait briefly for async git refresh
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(gitState.branch, "main");
    assert.equal(gitState.worktree, null, "main repo should not be flagged as a worktree");

    // Test in linked worktree
    events.get("session_start")!(undefined, dummyCtx(worktreeDir));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(gitState.branch, "feature-x");
    assert.equal(gitState.worktree, "feature-worktree", "linked worktree should be detected with its folder name");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
