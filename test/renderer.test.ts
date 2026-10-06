import test from "node:test";
import assert from "node:assert/strict";
import { renderStatusline, filterSegmentsForWidth } from "../src/renderer.js";
import { getMockContext, evaluateSegment, renderGauge, setBusMetric } from "../src/providers.js";
import { DEFAULT_CONFIG, type StatuslineConfig } from "../src/types.js";

test("evaluateSegment produces expected formatted output for core tokens", () => {
  const ctx = getMockContext();
  const gitSeg = { id: "1", type: "git_branch" as const, icon: " " };
  assert.equal(evaluateSegment(gitSeg, ctx), " main*");

  const modelSeg = { id: "2", type: "model_name" as const };
  assert.equal(evaluateSegment(modelSeg, ctx), "claude-3-7-sonnet");

  const costSeg = { id: "3", type: "session_cost" as const, prefix: "$" };
  assert.equal(evaluateSegment(costSeg, ctx), "$0.18");
});

test("evaluateSegment renders cache hit ratio and dynamic bus tokens", () => {
  const ctx = getMockContext();
  const cacheSeg = { id: "c1", type: "cache_hit" as const, icon: "⚡" };
  assert.equal(evaluateSegment(cacheSeg, ctx), "⚡47%");

  setBusMetric("build_status", "passing");
  const busSeg = { id: "b1", type: "custom_bus" as const, text: "build_status", prefix: "build:" };
  assert.equal(evaluateSegment(busSeg, ctx), "build:passing");
});

test("renderGauge renders block, braille, and percentage styles", () => {
  const blocks = renderGauge(50, "blocks", 4);
  assert.equal(blocks, "■■□□ 50%");

  const braille = renderGauge(50, "braille", 4);
  assert.equal(braille, "⣿⣿⣀⣀");

  const pct = renderGauge(75, "percentage");
  assert.equal(pct, "75%");
});

test("filterSegmentsForWidth respects priority breakpoints", () => {
  const segments = [
    { id: "1", type: "git_branch" as const, priority: 1 },
    { id: "2", type: "cache_read" as const, priority: 4 },
  ];
  // Standard width: all kept
  const normal = filterSegmentsForWidth(segments, 100, DEFAULT_CONFIG);
  assert.equal(normal.filtered.length, 2);
  assert.equal(normal.isCompact, false);

  // Narrow width (<65): priority 4 dropped
  const narrow = filterSegmentsForWidth(segments, 60, DEFAULT_CONFIG);
  assert.equal(narrow.filtered.length, 1);
  assert.equal(narrow.filtered[0]?.id, "1");
  assert.equal(narrow.isCompact, true);
});

test("renderStatusline handles different border geometries", () => {
  const ctx = getMockContext();

  const roundedConfig: StatuslineConfig = {
    ...DEFAULT_CONFIG,
    style: { ...DEFAULT_CONFIG.style, border: "rounded" },
  };
  const roundedLines = renderStatusline(roundedConfig, ctx, 80);
  assert.equal(roundedLines.length, 3);
  assert.ok(roundedLines[0]?.includes("╭"));
  assert.ok(roundedLines[1]?.includes("│"));
  assert.ok(roundedLines[2]?.includes("╰"));

  const singleConfig: StatuslineConfig = {
    ...DEFAULT_CONFIG,
    style: { ...DEFAULT_CONFIG.style, border: "single" },
  };
  const singleLines = renderStatusline(singleConfig, ctx, 80);
  assert.ok(singleLines[0]?.includes("┌"));
  assert.ok(singleLines[2]?.includes("└"));

  const topOnlyConfig: StatuslineConfig = {
    ...DEFAULT_CONFIG,
    style: { ...DEFAULT_CONFIG.style, border: "top-only" },
  };
  const topOnlyLines = renderStatusline(topOnlyConfig, ctx, 80);
  assert.equal(topOnlyLines.length, 2);
  assert.ok(topOnlyLines[0]?.includes("─"));

  const borderlessConfig: StatuslineConfig = {
    ...DEFAULT_CONFIG,
    style: { ...DEFAULT_CONFIG.style, border: "none" },
  };
  const borderlessLines = renderStatusline(borderlessConfig, ctx, 80);
  assert.equal(borderlessLines.length, 1);
});
