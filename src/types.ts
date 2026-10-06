export type SegmentType =
  | "git_branch"
  | "git_dirty"
  | "model_name"
  | "provider_name"
  | "token_usage"
  | "session_cost"
  | "cwd"
  | "context_gauge"
  | "context_usage"
  | "cache_hit"
  | "cache_read"
  | "extension_statuses"
  | "custom_bus"
  | "text";

export interface StatuslineSegment {
  id: string; // unique identifier for the segment in editor
  type: SegmentType;
  priority?: number; // 1 (highest/critical) to 5 (optional/collapsible)
  color?: string; // hex or ansi color, e.g. "#89b4fa"
  bg?: string; // hex or ansi background, e.g. "#1e1e2e"
  prefix?: string;
  suffix?: string;
  icon?: string;
  format?: string; // e.g. "{used}/{total}" or "{percent}%"
  style?: "blocks" | "braille" | "percentage" | "compact"; // for context_gauge
  text?: string; // For static text type or custom_bus key
}

export type BorderStyle = "none" | "single" | "rounded" | "double" | "top-only";
export type SeparatorStyle = "none" | "powerline" | "powerline-thin" | "slash" | "pipe" | "pill" | "bullet";

export interface StatuslineBreakpoints {
  compactBelow?: number; // default 85
  hideOptionalBelow?: number; // default 65 (hides priority >= 3)
}

export interface StatuslineStyle {
  border?: BorderStyle;
  theme?: string;
  separators?: {
    left?: string;
    right?: string;
  };
  separatorStyle?: SeparatorStyle;
}

export interface StatuslineRow {
  left: StatuslineSegment[];
  center: StatuslineSegment[];
  right: StatuslineSegment[];
}

export interface StatuslineConfig {
  version: 1;
  style: StatuslineStyle;
  breakpoints?: StatuslineBreakpoints;
  rows: StatuslineRow[];
}

export const SEPARATOR_PRESETS: Record<SeparatorStyle, { left: string; right: string }> = {
  none: { left: "", right: "" },
  powerline: { left: "\uE0B0", right: "\uE0B2" },
  "powerline-thin": { left: "\uE0B1", right: "\uE0B3" },
  slash: { left: "/", right: "/" },
  pipe: { left: "│", right: "│" },
  pill: { left: "\uE0B4", right: "\uE0B6" },
  bullet: { left: "•", right: "•" },
};

export const DEFAULT_CONFIG: StatuslineConfig = {
  version: 1,
  style: {
    border: "rounded",
    separatorStyle: "powerline",
    separators: SEPARATOR_PRESETS.powerline,
  },
  breakpoints: {
    compactBelow: 85,
    hideOptionalBelow: 65,
  },
  rows: [
    {
      left: [
        { id: "seg-1", type: "git_branch", priority: 1, icon: " ", color: "#1e1e2e", bg: "#a6e3a1" },
        { id: "seg-2", type: "model_name", priority: 1, icon: "󰚩 ", color: "#cdd6f4", bg: "#313244" },
      ],
      center: [
        { id: "seg-3", type: "context_gauge", priority: 2, style: "blocks", color: "#1e1e2e", bg: "#f9e2af" },
      ],
      right: [
        { id: "seg-4", type: "cache_hit", priority: 3, icon: "⚡", color: "#1e1e2e", bg: "#94e2d5" },
        { id: "seg-5", type: "token_usage", priority: 2, icon: "󰅒 ", color: "#1e1e2e", bg: "#89b4fa" },
        { id: "seg-6", type: "session_cost", priority: 1, prefix: "$", color: "#1e1e2e", bg: "#f38ba8" },
      ],
    },
  ],
};
