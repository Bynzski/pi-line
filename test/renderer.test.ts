import test from "node:test";
import assert from "node:assert/strict";
import {
  boxCorners,
  effectiveSeparator,
  filterSegmentsForWidth,
  renderBoxBorders,
  renderStatusline,
} from "../src/renderer.js";
import { evaluateSegment, getMockContext, renderGauge, setBusMetric } from "../src/providers.js";
import { migrateV1 } from "../src/config.js";
import { DEFAULT_CONFIG, type StatuslineConfig } from "../src/types.js";
import { visibleWidth } from "@earendil-works/pi-tui";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const ctx = getMockContext();

test("segments use the icon set, with explicit icon and noIcon overrides", () => {
  const git = { id: "1", type: "git_branch" as const };
  assert.equal(evaluateSegment(git, ctx, false, "unicode"), "⎇ main");
  assert.equal(evaluateSegment(git, ctx, false, "ascii"), "git:main");
  assert.equal(evaluateSegment({ ...git, noIcon: true }, ctx, false, "unicode"), "main");
  assert.equal(evaluateSegment({ ...git, icon: "@" }, ctx, false, "unicode"), "@main");
});

test("cache, bus, thinking and cost tokens", () => {
  assert.equal(evaluateSegment({ id: "c", type: "cache_hit", noIcon: true }, ctx), "47%");
  assert.equal(evaluateSegment({ id: "t", type: "thinking_level", noIcon: true }, ctx), "high");
  assert.equal(evaluateSegment({ id: "s", type: "session_cost", prefix: "$", noIcon: true }, ctx), "$0.18");
  setBusMetric("build", "passing");
  assert.equal(evaluateSegment({ id: "b", type: "custom_bus", text: "build", noIcon: true }, ctx), "passing");
});

test("renderGauge styles", () => {
  assert.equal(renderGauge(50, "blocks", 4), "■■□□ 50%");
  assert.equal(renderGauge(50, "braille", 4), "⣿⣿⣀⣀");
  assert.equal(renderGauge(75, "percentage"), "75%");
});

test("priority breakpoints hide optional segments when narrow", () => {
  const segs = [
    { id: "1", type: "git_branch" as const, priority: 1 },
    { id: "2", type: "cache_read" as const, priority: 4 },
  ];
  assert.equal(filterSegmentsForWidth(segs, 100, DEFAULT_CONFIG.breakpoints).filtered.length, 2);
  const narrow = filterSegmentsForWidth(segs, 60, DEFAULT_CONFIG.breakpoints);
  assert.equal(narrow.filtered.length, 1);
  assert.equal(narrow.isCompact, true);
});

test("nerd-only separators fall back to blend without nerd icons", () => {
  assert.equal(effectiveSeparator("powerline", "unicode"), "blend");
  assert.equal(effectiveSeparator("powerline", "nerd"), "powerline");
  assert.equal(effectiveSeparator("slash", "ascii"), "slash");
});

test("statusline supports minimal, subtle, pill and blend fill styles", () => {
  const cfg = clone(DEFAULT_CONFIG);
  for (const style of ["flat", "minimal", "subtle", "pill"] as const) {
    cfg.statusline.fillStyle = style;
    const lines = renderStatusline(cfg.statusline, cfg.breakpoints, "unicode", ctx, 80);
    assert.ok(lines.length >= 1);
    assert.ok(visibleWidth(lines[0]!) <= 80);
  }

  cfg.statusline.separatorStyle = "blend";
  cfg.statusline.fillStyle = "flat";
  const blendLines = renderStatusline(cfg.statusline, cfg.breakpoints, "unicode", ctx, 80);
  assert.ok(blendLines.length >= 1);
  assert.ok(blendLines[0]!.includes("▌"));
});

test("box borders embed segments independently on top and bottom, at exact width", () => {
  for (const border of ["rounded", "single", "double"] as const) {
    const cfg = clone(DEFAULT_CONFIG);
    cfg.box.border = border;
    for (const width of [30, 60, 120]) {
      const { top, bottom } = renderBoxBorders(cfg.box, cfg.breakpoints, cfg.icons, ctx, width);
      assert.equal(visibleWidth(top), width, `top ${border}@${width}`);
      assert.equal(visibleWidth(bottom), width, `bottom ${border}@${width}`);
      assert.ok(top.startsWith(boxCorners(border).top.left));
      assert.ok(bottom.endsWith(boxCorners(border).bottom.right));
    }
  }
  const { top, bottom } = renderBoxBorders(DEFAULT_CONFIG.box, DEFAULT_CONFIG.breakpoints, "unicode", ctx, 100);
  assert.ok(top.includes("main"));
  assert.ok(!top.includes("claude-opus-5"));
  assert.ok(bottom.includes("claude-opus-5"));
  assert.ok(!bottom.includes("main"));
});

test("statusline renders every row within width and honors frames", () => {
  const cfg: StatuslineConfig = clone(DEFAULT_CONFIG);
  cfg.statusline.rows.push({ left: [{ id: "x", type: "cwd" }], center: [], right: [] });
  for (const border of ["none", "top-only", "single", "rounded", "double"] as const) {
    cfg.statusline.border = border;
    const lines = renderStatusline(cfg.statusline, cfg.breakpoints, cfg.icons, ctx, 80);
    for (const l of lines) assert.ok(visibleWidth(l) <= 80, `${border}: ${visibleWidth(l)}`);
    const frame = border === "none" ? 0 : border === "top-only" ? 1 : 2;
    assert.equal(lines.length, 2 + frame);
  }
});

test("surfaces are independent: toggling one leaves the other untouched", () => {
  const cfg = clone(DEFAULT_CONFIG);
  const boxBefore = JSON.stringify(cfg.box);
  cfg.statusline.enabled = false;
  cfg.statusline.rows[0]!.left.push({ id: "z", type: "cwd" });
  assert.equal(JSON.stringify(cfg.box), boxBefore);
});

test("v1 configs migrate to v2", () => {
  const v1 = {
    version: 1,
    target: "editor-border",
    style: { border: "double", separatorStyle: "powerline" },
    rows: [{ left: [{ id: "a", type: "git_branch", icon: "X" }], center: [], right: [] }],
  };
  const v2 = migrateV1(v1);
  assert.equal(v2.version, 2);
  assert.equal(v2.box.enabled, true);
  assert.equal(v2.statusline.enabled, false);
  assert.equal(v2.statusline.rows[0]!.left[0]!.icon, undefined);
});

test("git_worktree segment renders in worktrees and collapses when not in a worktree", () => {
  const seg = { id: "wt", type: "git_worktree" as const };
  // Mock context has gitWorktree: "feat-worktree"
  assert.equal(evaluateSegment(seg, ctx, false, "unicode"), "⑂ feat-worktree");
  assert.equal(evaluateSegment(seg, ctx, false, "ascii"), "wt:feat-worktree");
  assert.equal(evaluateSegment(seg, ctx, false, "nerd"), "\uF126 feat-worktree");
  assert.equal(evaluateSegment({ ...seg, noIcon: true }, ctx, false, "unicode"), "feat-worktree");
  assert.equal(evaluateSegment({ ...seg, noIcon: true, prefix: "[", suffix: "]" }, ctx, false, "unicode"), "[feat-worktree]");
  assert.equal(evaluateSegment({ ...seg, text: "wt" }, ctx, false, "unicode"), "⑂ wt");
  assert.equal(evaluateSegment(seg, ctx, true, "unicode"), "⑂ wt");

  // When not in a worktree
  const noWtCtx = { ...ctx, gitWorktree: null };
  assert.equal(evaluateSegment(seg, noWtCtx, false, "unicode"), "");
  assert.equal(evaluateSegment({ ...seg, prefix: "wt:" }, noWtCtx, false, "unicode"), "");
});

