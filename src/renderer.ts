import {
  mixColors,
  parseColor,
  styleText,
  truncateToWidth,
  visibleWidth,
  type Color,
  type TerminalColorMode,
} from "@earendil-works/pi-tui";
import {
  type BoxBorderStyle,
  type BoxConfig,
  type FooterConfig,
  type IconSet,
  type SegmentFillStyle,
  type SeparatorStyle,
  type StatuslineBreakpoints,
  type StatuslineRow,
  type StatuslineSegment,
  NERD_ONLY_SEPARATORS,
  SEPARATOR_PRESETS,
} from "./types.js";
import { evaluateSegment, type StatuslineContext } from "./providers.js";

export function effectiveSeparator(style: SeparatorStyle, icons: IconSet): SeparatorStyle {
  if (icons !== "nerd" && NERD_ONLY_SEPARATORS.includes(style)) {
    return "blend"; // Clean universal block gradient fallback
  }
  return style;
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

function resolveColors(seg: StatuslineSegment): { fg?: Color; bg?: Color } {
  const fg = seg.color ? parseColor(seg.color) : undefined;
  const bg = seg.bg ? parseColor(seg.bg) : undefined;
  return { fg, bg };
}

function styleSeg(seg: StatuslineSegment, text: string, mode: TerminalColorMode): string {
  const { fg, bg } = resolveColors(seg);
  return fg || bg ? styleText(text, { fg, bg }, mode) : text;
}

// ---------------------------------------------------------------------------
// Footer statusline with multiple visual styles (flat, minimal, pill, subtle)
// ---------------------------------------------------------------------------

export function renderRowContent(
  row: StatuslineRow,
  footer: Pick<FooterConfig, "separatorStyle" | "fillStyle">,
  bp: StatuslineBreakpoints,
  icons: IconSet,
  context: StatuslineContext,
  width: number,
  mode: TerminalColorMode = "truecolor"
): string {
  const fillStyle: SegmentFillStyle = footer.fillStyle || "flat";
  const sepStyle = effectiveSeparator(footer.separatorStyle, icons);
  const sep = SEPARATOR_PRESETS[sepStyle];

  const side = (segs: StatuslineSegment[], pos: "left" | "center" | "right") => {
    const { filtered, isCompact } = filterSegmentsForWidth(segs, width, bp);
    const items = filtered
      .map((seg) => ({ seg, text: evaluateSegment(seg, context, isCompact, icons) }))
      .filter((i) => i.text);

    if (items.length === 0) return "";

    // 1. MINIMAL STYLE: Clean text, colored icons/labels, no block backgrounds
    if (fillStyle === "minimal") {
      const glue = sepStyle === "none" ? "  " : ` ${sep.left} `;
      return items
        .map(({ seg, text }) => {
          const fg = seg.color ? parseColor(seg.color) : (seg.bg ? parseColor(seg.bg) : undefined);
          return fg ? styleText(text, { fg }, mode) : text;
        })
        .join(glue);
    }

    // 2. SUBTLE STYLE: Soft dark background tags with colored foreground
    if (fillStyle === "subtle") {
      const subtleBg = parseColor("#1e1e2e");
      return items
        .map(({ seg, text }) => {
          const fg = seg.color ? parseColor(seg.color) : (seg.bg ? parseColor(seg.bg) : undefined);
          return styleText(` ${text} `, { fg, bg: subtleBg }, mode);
        })
        .join(" ");
    }

    // 3. PILL STYLE: Rounded bubble pills per segment ( text  or ( text ))
    if (fillStyle === "pill") {
      const leftCap = icons === "nerd" ? "\uE0B6" : "(";
      const rightCap = icons === "nerd" ? "\uE0B4" : ")";
      return items
        .map(({ seg, text }) => {
          const { fg, bg } = resolveColors(seg);
          const effectiveBg = bg || (fg ? fg : parseColor("#313244"));
          const effectiveFg = fg && bg ? fg : parseColor("#1e1e2e");

          const leftCapStyled = styleText(leftCap, { fg: effectiveBg }, mode);
          const body = styleText(` ${text} `, { fg: effectiveFg, bg: effectiveBg }, mode);
          const rightCapStyled = styleText(rightCap, { fg: effectiveBg }, mode);

          return `${leftCapStyled}${body}${rightCapStyled}`;
        })
        .join(" ");
    }

    // 4. FLAT / POWERLINE / BLEND GRADIENT STYLE
    if (sepStyle === "blend" && pos !== "center") {
      // Soft color gradient separator transition between adjacent segment backgrounds
      const parts: string[] = [];
      items.forEach(({ seg, text }, i) => {
        const { fg, bg } = resolveColors(seg);
        const curBg = bg || parseColor("#313244");
        const body = styleText(` ${text} `, { fg: fg || parseColor("#1e1e2e"), bg: curBg }, mode);

        if (pos === "left") {
          parts.push(body);
          if (i < items.length - 1) {
            const nextBg = items[i + 1]?.seg.bg ? parseColor(items[i + 1]!.seg.bg!) : parseColor("#313244");
            const mid = mixColors(curBg, nextBg, 0.5);
            // 2-step soft blend: [curBg -> mid] then [mid -> nextBg]
            const step1 = styleText("▌", { fg: mid, bg: curBg }, mode);
            const step2 = styleText("▌", { fg: nextBg, bg: mid }, mode);
            parts.push(step1 + step2);
          }
        } else {
          if (i > 0) {
            const prevBg = items[i - 1]?.seg.bg ? parseColor(items[i - 1]!.seg.bg!) : parseColor("#313244");
            const mid = mixColors(prevBg, curBg, 0.5);
            const step1 = styleText("▐", { fg: mid, bg: prevBg }, mode);
            const step2 = styleText("▐", { fg: curBg, bg: mid }, mode);
            parts.push(step1 + step2);
          }
          parts.push(body);
        }
      });
      return parts.join("");
    }

    if (NERD_ONLY_SEPARATORS.includes(sepStyle) && pos !== "center") {
      const parts: string[] = [];
      items.forEach(({ seg, text }, i) => {
        const { fg, bg } = resolveColors(seg);
        const curBg = bg || parseColor("#313244");
        const body = styleText(` ${text} `, { fg: fg || parseColor("#1e1e2e"), bg: curBg }, mode);

        if (pos === "left") {
          const nextBg = items[i + 1]?.seg.bg ? parseColor(items[i + 1]!.seg.bg!) : undefined;
          parts.push(body, curBg ? styleText(sep.left, { fg: curBg, bg: nextBg }, mode) : sep.left);
        } else {
          const prevBg = items[i - 1]?.seg.bg ? parseColor(items[i - 1]!.seg.bg!) : undefined;
          parts.push(curBg ? styleText(sep.right, { fg: curBg, bg: prevBg }, mode) : sep.right, body);
        }
      });
      return parts.join("");
    }

    const glue = sepStyle === "none" ? " " : ` ${sep.left} `;
    return items.map(({ seg, text }) => styleSeg(seg, ` ${text} `, mode)).join(glue);
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
