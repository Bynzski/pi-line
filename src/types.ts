export type SegmentType =
  | "git_branch"
  | "git_dirty"
  | "model_name"
  | "provider_name"
  | "thinking_level"
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
  id: string;
  type: SegmentType;
  priority?: number; // 1 (critical) .. 5 (optional)
  color?: string; // fg hex
  bg?: string; // bg hex
  prefix?: string;
  suffix?: string;
  icon?: string; // explicit override; otherwise taken from the icon set
  noIcon?: boolean;
  style?: "blocks" | "braille" | "percentage" | "compact"; // context_gauge
  text?: string; // static text, or custom_bus key
}

export type IconSet = "nerd" | "unicode" | "ascii";
export type BorderStyle = "none" | "single" | "rounded" | "double" | "top-only";
export type BoxBorderStyle = "rounded" | "single" | "double";
export type SeparatorStyle = "none" | "powerline" | "powerline-thin" | "slash" | "pipe" | "pill" | "bullet";

export interface StatuslineBreakpoints {
  compactBelow?: number;
  hideOptionalBelow?: number;
}

export type BoxSlotName = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
export type RowSlotName = "left" | "center" | "right";

/** Segments embedded in the typing box border. */
export interface BoxConfig {
  enabled: boolean;
  border: BoxBorderStyle;
  slots: Record<BoxSlotName, StatuslineSegment[]>;
}

export interface StatuslineRow {
  left: StatuslineSegment[];
  center: StatuslineSegment[];
  right: StatuslineSegment[];
}

/** Rows rendered in the footer area (replaces Pi's built-in footer when enabled). */
export interface FooterConfig {
  enabled: boolean;
  border: BorderStyle;
  separatorStyle: SeparatorStyle;
  rows: StatuslineRow[];
}

export interface StatuslineConfig {
  version: 2;
  icons: IconSet;
  breakpoints: StatuslineBreakpoints;
  box: BoxConfig;
  statusline: FooterConfig;
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

/** Separators that need a Nerd Font; replaced with `pipe` when icon set is not "nerd". */
export const NERD_ONLY_SEPARATORS: SeparatorStyle[] = ["powerline", "powerline-thin", "pill"];

export function emptyRow(): StatuslineRow {
  return { left: [], center: [], right: [] };
}

export const DEFAULT_CONFIG: StatuslineConfig = {
  version: 2,
  icons: "unicode",
  breakpoints: { compactBelow: 85, hideOptionalBelow: 65 },
  box: {
    enabled: true,
    border: "rounded",
    slots: {
      topLeft: [
        { id: "b1", type: "git_branch", priority: 1, color: "#a6e3a1" },
        { id: "b2", type: "cwd", priority: 3, color: "#89b4fa" },
      ],
      topRight: [{ id: "b3", type: "thinking_level", priority: 2, color: "#cba6f7" }],
      bottomLeft: [{ id: "b4", type: "model_name", priority: 1, color: "#89b4fa" }],
      bottomRight: [
        { id: "b5", type: "context_gauge", priority: 2, style: "blocks", color: "#a6e3a1" },
      ],
    },
  },
  statusline: {
    enabled: true,
    border: "none",
    separatorStyle: "pipe",
    rows: [
      {
        left: [
          { id: "s1", type: "session_cost", priority: 1, prefix: "$", color: "#f38ba8" },
          { id: "s2", type: "token_usage", priority: 2, color: "#89b4fa" },
        ],
        center: [],
        right: [{ id: "s3", type: "cache_hit", priority: 3, color: "#94e2d5" }],
      },
    ],
  },
};
