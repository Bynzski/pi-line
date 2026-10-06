import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionContext, ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import type { StatuslineSegment } from "./types.js";

// In-memory pub/sub metric bus for dynamic/third-party extensions (inspired by pi-fancy-footer:widget)
const dynamicBusRegistry = new Map<string, string>();

export function setBusMetric(key: string, value: string): void {
  dynamicBusRegistry.set(key, value);
}

export function getBusMetric(key: string): string | undefined {
  return dynamicBusRegistry.get(key);
}

export interface StatuslineContext {
  gitBranch: string | null;
  gitDirty: boolean;
  modelName: string;
  providerName: string;
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
  cacheHitRatio: number; // 0 to 1
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
          if (m.usage.cost?.total) {
            cost += m.usage.cost.total;
          }
        }
      }
    }
  } catch {
    // Session manager might not have active branch yet
  }

  const branch = footerData ? footerData.getGitBranch() : null;
  const contextUsage = ctx.getContextUsage?.();

  let extStatuses: string[] = [];
  if (footerData) {
    try {
      const statusesMap = footerData.getExtensionStatuses();
      extStatuses = Array.from(statusesMap.values()).filter((s): s is string => typeof s === "string" && Boolean(s));
    } catch {
      // Map retrieval fallback
    }
  }

  const totalInput = input + cacheRead;
  const cacheHitRatio = totalInput > 0 ? cacheRead / totalInput : 0;

  return {
    gitBranch: branch,
    gitDirty: branch?.includes("*") ?? false,
    modelName: ctx.model?.id || "no-model",
    providerName: ctx.model?.provider || "",
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
    cacheHitRatio,
    extensionStatuses: extStatuses,
  };
}

export function formatTokenNumber(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}m`;
}

export function renderGauge(percent: number, style: "blocks" | "braille" | "percentage" | "compact" = "blocks", width = 5): string {
  const p = Math.max(0, Math.min(100, percent));
  if (style === "percentage") {
    return `${Math.round(p)}%`;
  }
  if (style === "compact") {
    return `${Math.round(p)}%`;
  }
  if (style === "braille") {
    const brailleChars = ["⣀", "⣤", "⣶", "⣿"];
    const filledCount = Math.round((p / 100) * width);
    return "⣿".repeat(filledCount) + "⣀".repeat(Math.max(0, width - filledCount));
  }
  // Default blocks: ■■□□□
  const filledCount = Math.round((p / 100) * width);
  const emptyCount = Math.max(0, width - filledCount);
  return "■".repeat(filledCount) + "□".repeat(emptyCount) + ` ${Math.round(p)}%`;
}

export function evaluateSegment(
  seg: StatuslineSegment,
  data: StatuslineContext,
  isCompact = false
): string {
  let val = "";
  switch (seg.type) {
    case "git_branch":
      val = data.gitBranch || "no-git";
      break;
    case "git_dirty":
      val = data.gitDirty ? "●" : "✓";
      break;
    case "model_name":
      val = data.modelName;
      if (isCompact && val.length > 12) {
        // e.g. claude-3-7-sonnet -> sonnet
        const parts = val.split("-");
        val = parts[parts.length - 1] || val;
      }
      break;
    case "provider_name":
      val = data.providerName || "ai";
      break;
    case "token_usage":
      if (isCompact) {
        val = formatTokenNumber(data.totalTokens);
      } else {
        val = `${formatTokenNumber(data.inputTokens)}/${formatTokenNumber(data.outputTokens)}`;
      }
      break;
    case "session_cost":
      val = `${data.cost.toFixed(2)}`;
      break;
    case "cwd": {
      const parts = data.cwd.split("/");
      val = parts[parts.length - 1] || data.cwd;
      break;
    }
    case "context_gauge": {
      const pct = data.contextUsagePercent ?? 0;
      val = renderGauge(pct, seg.style || "blocks", isCompact ? 3 : 5);
      break;
    }
    case "context_usage":
      val = data.contextUsagePercent !== null ? `${Math.round(data.contextUsagePercent)}%` : "0%";
      break;
    case "cache_hit": {
      const pct = Math.round(data.cacheHitRatio * 100);
      val = `${pct}%`;
      break;
    }
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

  if (!val && (seg.type === "extension_statuses" || seg.type === "custom_bus")) {
    return "";
  }

  const prefix = seg.prefix || "";
  const suffix = seg.suffix || "";
  const icon = seg.icon || "";
  return `${icon}${prefix}${val}${suffix}`;
}

export function getMockContext(): StatuslineContext {
  return {
    gitBranch: "main*",
    gitDirty: true,
    modelName: "claude-3-7-sonnet",
    providerName: "anthropic",
    inputTokens: 42100,
    outputTokens: 12100,
    totalTokens: 54200,
    cost: 0.182,
    cwd: "pi-line",
    contextUsagePercent: 32,
    contextTokens: 64000,
    contextWindow: 200000,
    cacheReadTokens: 38000,
    cacheWriteTokens: 4100,
    cacheHitRatio: 0.47,
    extensionStatuses: ["ready"],
  };
}
