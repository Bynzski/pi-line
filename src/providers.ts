import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionContext, ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import type { IconSet, SegmentType, StatuslineSegment } from "./types.js";

// ---- Dynamic metric bus ----------------------------------------------------
const dynamicBusRegistry = new Map<string, string>();
export function setBusMetric(key: string, value: string): void {
  dynamicBusRegistry.set(key, value);
}
export function getBusMetric(key: string): string | undefined {
  return dynamicBusRegistry.get(key);
}

// ---- Shared git state (works for box and footer, independent of footerData) --
export const gitState: { branch: string | null; dirty: number; worktree: string | null } = {
  branch: null,
  dirty: 0,
  worktree: null,
};

// ---- Icon sets ---------------------------------------------------------------
type IconMap = Partial<Record<SegmentType, string>>;
export const ICONS: Record<IconSet, IconMap> = {
  nerd: {
    git_branch: "\uE0A0",
    git_dirty: "\uF111",
    git_worktree: "\uF126",
    model_name: "\uF2DB",
    provider_name: "\uF0C2",
    thinking_level: "\uF0EB",
    token_usage: "\uF1C0",
    cwd: "\uF07C",
    context_gauge: "\uF2DB",
    context_usage: "\uF2DB",
    cache_hit: "\uF0E7",
    cache_read: "\uF0E7",
    extension_statuses: "\uF05A",
    custom_bus: "\uF12E",
  },
  unicode: {
    git_branch: "⎇",
    git_dirty: "●",
    git_worktree: "⑂",
    model_name: "◆",
    provider_name: "☁",
    thinking_level: "✦",
    token_usage: "↕",
    cwd: "▸",
    context_gauge: "◔",
    context_usage: "◔",
    cache_hit: "⚡",
    cache_read: "⚡",
    extension_statuses: "ℹ",
    custom_bus: "◇",
  },
  ascii: {
    git_branch: "git:",
    git_dirty: "dirty:",
    git_worktree: "wt:",
    model_name: "m:",
    provider_name: "p:",
    thinking_level: "think:",
    token_usage: "tok:",
    cwd: "dir:",
    context_gauge: "ctx:",
    context_usage: "ctx:",
    cache_hit: "cache:",
    cache_read: "cache:",
    extension_statuses: "i:",
    custom_bus: "#",
  },
};

export function iconFor(seg: StatuslineSegment, set: IconSet): string {
  if (seg.noIcon) return "";
  if (seg.icon !== undefined) return seg.icon;
  const glyph = ICONS[set][seg.type];
  if (!glyph) return "";
  return set === "ascii" ? glyph : glyph + " ";
}

// ---- Context -----------------------------------------------------------------
export interface StatuslineContext {
  gitBranch: string | null;
  gitDirty: number;
  gitWorktree: string | null;
  modelName: string;
  providerName: string;
  thinkingLevel: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  cwd: string;
  contextUsagePercent: number | null;
  contextTokens: number | null;
  contextWindow: number | null;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheHitRatio: number;
  extensionStatuses: string[];
}

export function extractStatuslineContext(
  ctx: ExtensionContext,
  footerData?: ReadonlyFooterDataProvider
): StatuslineContext {
  let input = 0;
  let output = 0;
  let cost = 0;
  let cacheRead = 0;
  let cacheWrite = 0;

  try {
    for (const e of ctx.sessionManager.getBranch()) {
      if (e.type === "message" && e.message.role === "assistant") {
        const m = e.message as AssistantMessage;
        if (m.usage) {
          input += m.usage.input || 0;
          output += m.usage.output || 0;
          cacheRead += m.usage.cacheRead || 0;
          cacheWrite += m.usage.cacheWrite || 0;
          cost += m.usage.cost?.total || 0;
        }
      }
    }
  } catch {
    // no active branch yet
  }

  const contextUsage = ctx.getContextUsage?.();

  let extStatuses: string[] = [];
  if (footerData) {
    try {
      extStatuses = Array.from(footerData.getExtensionStatuses().values()).filter(
        (s): s is string => typeof s === "string" && Boolean(s)
      );
    } catch {
      // ignore
    }
  }

  const branch = footerData?.getGitBranch() ?? gitState.branch;
  const totalInput = input + cacheRead;

  return {
    gitBranch: branch,
    gitDirty: gitState.dirty,
    gitWorktree: gitState.worktree,
    modelName: ctx.model?.id || "no-model",
    providerName: ctx.model?.provider || "",
    thinkingLevel: ctx.thinkingLevel ?? "off",
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
    cost,
    cwd: ctx.cwd || process.cwd(),
    contextUsagePercent: contextUsage?.percent ?? null,
    contextTokens: contextUsage?.tokens ?? null,
    contextWindow: contextUsage?.contextWindow ?? null,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    cacheHitRatio: totalInput > 0 ? cacheRead / totalInput : 0,
    extensionStatuses: extStatuses,
  };
}

export function formatTokenNumber(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}m`;
}

export function renderGauge(
  percent: number,
  style: "blocks" | "braille" | "percentage" | "compact" = "blocks",
  width = 5
): string {
  const p = Math.max(0, Math.min(100, percent));
  if (style === "percentage" || style === "compact") return `${Math.round(p)}%`;
  const filled = Math.round((p / 100) * width);
  const empty = Math.max(0, width - filled);
  if (style === "braille") return "⣿".repeat(filled) + "⣀".repeat(empty);
  return "■".repeat(filled) + "□".repeat(empty) + ` ${Math.round(p)}%`;
}

export function evaluateSegment(
  seg: StatuslineSegment,
  data: StatuslineContext,
  isCompact = false,
  icons: IconSet = "unicode"
): string {
  let val = "";
  switch (seg.type) {
    case "git_branch":
      val = data.gitBranch || "no-git";
      break;
    case "git_dirty":
      val = data.gitDirty > 0 ? `${data.gitDirty}` : "clean";
      break;
    case "git_worktree":
      if (!data.gitWorktree) {
        val = "";
      } else if (seg.text) {
        val = seg.text;
      } else if (isCompact) {
        val = "wt";
      } else {
        val = data.gitWorktree;
      }
      break;
    case "model_name":
      val = data.modelName;
      if (isCompact && val.length > 12) {
        const parts = val.split("-");
        val = parts[parts.length - 1] || val;
      }
      break;
    case "provider_name":
      val = data.providerName || "ai";
      break;
    case "thinking_level":
      val = data.thinkingLevel;
      break;
    case "token_usage":
      val = isCompact
        ? formatTokenNumber(data.totalTokens)
        : `↑${formatTokenNumber(data.inputTokens)} ↓${formatTokenNumber(data.outputTokens)}`;
      break;
    case "session_cost":
      val = data.cost.toFixed(2);
      break;
    case "cwd": {
      const parts = data.cwd.split("/");
      val = parts[parts.length - 1] || data.cwd;
      break;
    }
    case "context_gauge":
      val = renderGauge(data.contextUsagePercent ?? 0, seg.style || "blocks", isCompact ? 3 : 5);
      break;
    case "context_usage":
      val = data.contextUsagePercent !== null ? `${Math.round(data.contextUsagePercent)}%` : "0%";
      break;
    case "cache_hit":
      val = `${Math.round(data.cacheHitRatio * 100)}%`;
      break;
    case "cache_read":
      val = formatTokenNumber(data.cacheReadTokens);
      break;
    case "extension_statuses":
      val = data.extensionStatuses.join(" | ");
      break;
    case "custom_bus":
      val = (seg.text && getBusMetric(seg.text)) || "";
      break;
    case "text":
      val = seg.text || "";
      break;
  }

  if (!val && (seg.type === "extension_statuses" || seg.type === "custom_bus" || seg.type === "git_worktree")) return "";
  return `${iconFor(seg, icons)}${seg.prefix || ""}${val}${seg.suffix || ""}`;
}

export function getMockContext(): StatuslineContext {
  return {
    gitBranch: "main",
    gitDirty: 2,
    gitWorktree: "feat-worktree",
    modelName: "claude-opus-5",
    providerName: "anthropic",
    thinkingLevel: "high",
    inputTokens: 42100,
    outputTokens: 12100,
    totalTokens: 54200,
    cost: 0.182,
    cwd: "pi-line",
    contextUsagePercent: 34,
    contextTokens: 68000,
    contextWindow: 200000,
    cacheReadTokens: 38000,
    cacheWriteTokens: 4100,
    cacheHitRatio: 0.47,
    extensionStatuses: ["ready"],
  };
}
