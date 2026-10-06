import {
  parseColor,
  styleText,
  truncateToWidth,
  visibleWidth,
  type TerminalColorMode,
} from "@earendil-works/pi-tui";
import {
  type BoxBorderStyle,
  type BoxConfig,
  type FooterConfig,
  type IconSet,
  type SeparatorStyle,
  type StatuslineBreakpoints,
  type StatuslineRow,
  type StatuslineSegment,
  NERD_ONLY_SEPARATORS,
  SEPARATOR_PRESETS,
} from "./types.js";
import { evaluateSegment, type StatuslineContext } from "./providers.js";

export function effectiveSeparator(style: SeparatorStyle, icons: IconSet): SeparatorStyle {
  return icons !== "nerd" && NERD_ONLY_SEPARATORS.includes(style) ? "pipe" : style;
}

export function filterSegmentsForWidth(
  segments: StatuslineSegment[],
  width: number,
  bp: StatuslineBreakpoints
): { filtered: StatuslineSegment[]; isCompact: boolean } {
  const compactBelow = bp?.compactBelow ?? 85;
  const hideOptionalBelow = bp?.hideOptionalBelow ?? 65;
  const hideOptional = width < hideOptionalBelow;
  return {
    filtered: segments.filter((s) => !(hideOptional && (s.priority ?? 2) >= 3)),
    isCompact: width < compactBelow,
  };
}

function styleSeg(seg: StatuslineSegment, text: string, mode: TerminalColorMode): string {
  const fg = seg.color ? parseColor(seg.color) : undefined;
  const bg = seg.bg ? parseColor(seg.bg) : undefined;
  return fg || bg ? styleText(text, { fg, bg }, mode) : text;
}

// ---------------------------------------------------------------------------
// Footer statusline
// ---------------------------------------------------------------------------

export function renderRowContent(
  row: StatuslineRow,
  footer: Pick<FooterConfig, "separatorStyle">,
  bp: StatuslineBreakpoints,
  icons: IconSet,
  context: StatuslineContext,
  width: number,
  mode: TerminalColorMode = "truecolor"
): string {
  const sepStyle = effectiveSeparator(footer.separatorStyle, icons);
  const sep = SEPARATOR_PRESETS[sepStyle];
  const powerline = NERD_ONLY_SEPARATORS.includes(sepStyle);

  const side = (segs: StatuslineSegment[], pos: "left" | "center" | "right") => {
    const { filtered, isCompact } = filterSegmentsForWidth(segs, width, bp);
    const items = filtered
      .map((seg) => ({ seg, text: evaluateSegment(seg, context, isCompact, icons) }))
      .filter((i) => i.text);

    if (powerline && pos !== "center") {
      const parts: string[] = [];
      items.forEach(({ seg, text }, i) => {
        const bg = seg.bg ? parseColor(seg.bg) : undefined;
        const body = styleSeg(seg, ` ${text} `, mode);
        if (pos === "left") {
          const next = items[i + 1]?.seg.bg ? parseColor(items[i + 1]!.seg.bg!) : undefined;
          parts.push(body, bg ? styleText(sep.left, { fg: bg, bg: next }, mode) : sep.left);
        } else {
          const prev = items[i - 1]?.seg.bg ? parseColor(items[i - 1]!.seg.bg!) : undefined;
          parts.push(bg ? styleText(sep.right, { fg: bg, bg: prev }, mode) : sep.right, body);
        }
      });
      return parts.join("");
    }

    const glue = sepStyle === "none" ? " " : ` ${sep.left} `;
    return items.map(({ seg, text }) => styleSeg(seg, powerline ? ` ${text} ` : text, mode)).join(glue);
  };

  const leftStr = side(row.left, "left");
  const centerStr = side(row.center, "center");
  const rightStr = side(row.right, "right");
  const leftW = visibleWidth(leftStr);
  const centerW = visibleWidth(centerStr);
  const rightW = visibleWidth(rightStr);

  if (centerW > 0) {
    const remaining = width - leftW - rightW - centerW;
    if (remaining > 0) {
      const padLeft = Math.floor(remaining / 2);
      return truncateToWidth(
        leftStr + " ".repeat(padLeft) + centerStr + " ".repeat(remaining - padLeft) + rightStr,
        width
      );
    }
  }
  return truncateToWidth(leftStr + " ".repeat(Math.max(0, width - leftW - rightW)) + rightStr, width);
}

const FRAMES = {
  rounded: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
  single: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
} as const;

export function renderStatusline(
  footer: FooterConfig,
  bp: StatuslineBreakpoints,
  icons: IconSet,
  context: StatuslineContext,
  width: number,
  mode: TerminalColorMode = "truecolor"
): string[] {
  const rows = footer.rows;
  const border = footer.border;

  if (border === "none") {
    return rows.map((r) => renderRowContent(r, footer, bp, icons, context, width, mode));
  }
  if (border === "top-only") {
    return ["─".repeat(width), ...rows.map((r) => renderRowContent(r, footer, bp, icons, context, width, mode))];
  }

  const f = FRAMES[border];
  const inner = Math.max(10, width - 2);
  const lines = [f.tl + f.h.repeat(inner) + f.tr];
  for (const r of rows) {
    const content = renderRowContent(r, footer, bp, icons, context, inner, mode);
    lines.push(f.v + content + " ".repeat(Math.max(0, inner - visibleWidth(content))) + f.v);
  }
  lines.push(f.bl + f.h.repeat(inner) + f.br);
  return lines;
}

// ---------------------------------------------------------------------------
// Typing-box borders
// ---------------------------------------------------------------------------

/**
 * One horizontal border line with segments embedded: ╭─ left ───── right ─╮
 */
export function formatBorderLine(
  leftSegs: StatuslineSegment[],
  rightSegs: StatuslineSegment[],
  context: StatuslineContext,
  bp: StatuslineBreakpoints,
  icons: IconSet,
  width: number,
  corners: { left: string; right: string; fill: string },
  mode: TerminalColorMode = "truecolor",
  colorBorder: (s: string) => string = (s) => s
): string {
  if (width <= 0) return "";
  const cornerW = visibleWidth(corners.left) + visibleWidth(corners.right);
  if (width <= cornerW) return colorBorder(corners.left + corners.right);

  const fmt = (segs: StatuslineSegment[]) => {
    const { filtered, isCompact } = filterSegmentsForWidth(segs, width, bp);
    const parts = filtered
      .map((s) => ({ s, t: evaluateSegment(s, context, isCompact, icons) }))
      .filter((p) => p.t)
      .map((p) => styleSeg(p.s, ` ${p.t} `, mode));
    return parts.join("");
  };

  let left = fmt(leftSegs);
  let right = fmt(rightSegs);
  const avail = width - cornerW;

  if (visibleWidth(left) + visibleWidth(right) + 1 > avail) {
    const maxLeft = Math.floor((avail - 1) / 2);
    left = truncateToWidth(left, Math.max(maxLeft, avail - 1 - visibleWidth(right)), "");
    right = truncateToWidth(right, Math.max(0, avail - 1 - visibleWidth(left)), "");
  }

  const gap = Math.max(0, avail - visibleWidth(left) - visibleWidth(right));
  return colorBorder(corners.left) + left + colorBorder(corners.fill.repeat(gap)) + right + colorBorder(corners.right);
}

export function boxCorners(border: BoxBorderStyle) {
  const f = FRAMES[border];
  return {
    v: f.v,
    top: { left: f.tl + f.h, right: f.h + f.tr, fill: f.h },
    bottom: { left: f.bl + f.h, right: f.h + f.br, fill: f.h },
  };
}

export function renderBoxBorders(
  box: BoxConfig,
  bp: StatuslineBreakpoints,
  icons: IconSet,
  context: StatuslineContext,
  width: number,
  mode: TerminalColorMode = "truecolor",
  colorBorder: (s: string) => string = (s) => s
): { top: string; bottom: string } {
  const c = boxCorners(box.border);
  return {
    top: formatBorderLine(box.slots.topLeft, box.slots.topRight, context, bp, icons, width, c.top, mode, colorBorder),
    bottom: formatBorderLine(box.slots.bottomLeft, box.slots.bottomRight, context, bp, icons, width, c.bottom, mode, colorBorder),
  };
}
