import {
  parseColor,
  styleText,
  truncateToWidth,
  visibleWidth,
  type TerminalColorMode,
} from "@earendil-works/pi-tui";
import {
  type BorderStyle,
  type StatuslineConfig,
  type StatuslineRow,
  type StatuslineSegment,
  SEPARATOR_PRESETS,
} from "./types.js";
import { evaluateSegment, type StatuslineContext } from "./providers.js";

export function filterSegmentsForWidth(
  segments: StatuslineSegment[],
  width: number,
  config: StatuslineConfig
): { filtered: StatuslineSegment[]; isCompact: boolean } {
  const compactBelow = config.breakpoints?.compactBelow ?? 85;
  const hideOptionalBelow = config.breakpoints?.hideOptionalBelow ?? 65;

  const isCompact = width < compactBelow;
  const hideOptional = width < hideOptionalBelow;

  const filtered = segments.filter((seg) => {
    const priority = seg.priority ?? 2;
    if (hideOptional && priority >= 3) {
      return false;
    }
    return true;
  });

  return { filtered, isCompact };
}

export function renderRowContent(
  row: StatuslineRow,
  config: StatuslineConfig,
  context: StatuslineContext,
  width: number,
  mode: TerminalColorMode = "truecolor"
): string {
  const sepStyle = config.style.separatorStyle || "none";
  const defaultSep = SEPARATOR_PRESETS[sepStyle] || { left: "", right: "" };
  const leftSepGlyph = config.style.separators?.left ?? defaultSep.left;
  const rightSepGlyph = config.style.separators?.right ?? defaultSep.right;

  const { filtered: leftSegs, isCompact: leftCompact } = filterSegmentsForWidth(row.left, width, config);
  const { filtered: centerSegs, isCompact: centerCompact } = filterSegmentsForWidth(row.center, width, config);
  const { filtered: rightSegs, isCompact: rightCompact } = filterSegmentsForWidth(row.right, width, config);

  // Render Left Side
  const leftParts: string[] = [];
  for (let i = 0; i < leftSegs.length; i++) {
    const seg = leftSegs[i]!;
    const text = evaluateSegment(seg, context, leftCompact);
    if (!text) continue;

    const fg = seg.color ? parseColor(seg.color) : undefined;
    const bg = seg.bg ? parseColor(seg.bg) : undefined;
    const styledText = styleText(` ${text} `, { fg, bg }, mode);
    leftParts.push(styledText);

    if (leftSepGlyph) {
      const nextSeg = leftSegs[i + 1];
      const nextBg = nextSeg?.bg ? parseColor(nextSeg.bg) : undefined;
      if (bg) {
        const sepStyled = styleText(leftSepGlyph, { fg: bg, bg: nextBg }, mode);
        leftParts.push(sepStyled);
      } else {
        leftParts.push(leftSepGlyph);
      }
    }
  }

  // Render Center Side
  const centerParts: string[] = [];
  for (let i = 0; i < centerSegs.length; i++) {
    const seg = centerSegs[i]!;
    const text = evaluateSegment(seg, context, centerCompact);
    if (!text) continue;

    const fg = seg.color ? parseColor(seg.color) : undefined;
    const bg = seg.bg ? parseColor(seg.bg) : undefined;
    centerParts.push(styleText(` ${text} `, { fg, bg }, mode));
  }

  // Render Right Side
  const rightParts: string[] = [];
  for (let i = 0; i < rightSegs.length; i++) {
    const seg = rightSegs[i]!;
    const text = evaluateSegment(seg, context, rightCompact);
    if (!text) continue;

    const fg = seg.color ? parseColor(seg.color) : undefined;
    const bg = seg.bg ? parseColor(seg.bg) : undefined;

    if (rightSepGlyph) {
      const prevSeg = i > 0 ? rightSegs[i - 1] : undefined;
      const prevBg = prevSeg?.bg ? parseColor(prevSeg.bg) : undefined;
      if (bg) {
        const sepStyled = styleText(rightSepGlyph, { fg: bg, bg: prevBg }, mode);
        rightParts.push(sepStyled);
      } else {
        rightParts.push(rightSepGlyph);
      }
    }

    const styledText = styleText(` ${text} `, { fg, bg }, mode);
    rightParts.push(styledText);
  }

  const leftStr = leftParts.join("");
  const centerStr = centerParts.join("");
  const rightStr = rightParts.join("");

  const leftW = visibleWidth(leftStr);
  const centerW = visibleWidth(centerStr);
  const rightW = visibleWidth(rightStr);

  if (centerW > 0) {
    const totalRemaining = width - leftW - rightW - centerW;
    if (totalRemaining > 0) {
      const padLeft = Math.floor(totalRemaining / 2);
      const padRight = totalRemaining - padLeft;
      const combined = leftStr + " ".repeat(padLeft) + centerStr + " ".repeat(padRight) + rightStr;
      return truncateToWidth(combined, width);
    }
  }

  const padSpace = Math.max(0, width - leftW - rightW);
  const combined = leftStr + " ".repeat(padSpace) + rightStr;
  return truncateToWidth(combined, width);
}

export function renderStatusline(
  config: StatuslineConfig,
  context: StatuslineContext,
  width: number,
  mode: TerminalColorMode = "truecolor"
): string[] {
  const border = config.style.border || "none";
  const lines: string[] = [];

  if (border === "top-only") {
    lines.push("─".repeat(width));
    for (const row of config.rows) {
      lines.push(renderRowContent(row, config, context, width, mode));
    }
    return lines;
  }

  if (border === "rounded") {
    const innerWidth = Math.max(10, width - 2);
    lines.push("╭" + "─".repeat(innerWidth) + "╮");
    for (const row of config.rows) {
      const content = renderRowContent(row, config, context, innerWidth, mode);
      const cW = visibleWidth(content);
      const pad = " ".repeat(Math.max(0, innerWidth - cW));
      lines.push("│" + content + pad + "│");
    }
    lines.push("╰" + "─".repeat(innerWidth) + "╯");
    return lines;
  }

  if (border === "single") {
    const innerWidth = Math.max(10, width - 2);
    lines.push("┌" + "─".repeat(innerWidth) + "┐");
    for (const row of config.rows) {
      const content = renderRowContent(row, config, context, innerWidth, mode);
      const cW = visibleWidth(content);
      const pad = " ".repeat(Math.max(0, innerWidth - cW));
      lines.push("│" + content + pad + "│");
    }
    lines.push("└" + "─".repeat(innerWidth) + "┘");
    return lines;
  }

  if (border === "double") {
    const innerWidth = Math.max(10, width - 2);
    lines.push("╔" + "═".repeat(innerWidth) + "╗");
    for (const row of config.rows) {
      const content = renderRowContent(row, config, context, innerWidth, mode);
      const cW = visibleWidth(content);
      const pad = " ".repeat(Math.max(0, innerWidth - cW));
      lines.push("║" + content + pad + "║");
    }
    lines.push("╚" + "═".repeat(innerWidth) + "╝");
    return lines;
  }

  // Border === "none"
  for (const row of config.rows) {
    lines.push(renderRowContent(row, config, context, width, mode));
  }
  return lines;
}

/**
 * Formats a horizontal border line with embedded segments (for CustomEditor top/bottom borders).
 * e.g. ╭──  main  ~ ───────────────────────── ~/Projects ──╮
 */
export function formatEditorBorderLine(
  leftSegments: StatuslineSegment[],
  rightSegments: StatuslineSegment[],
  context: StatuslineContext,
  width: number,
  borderCornerLeft: string,
  borderCornerRight: string,
  borderFillChar = "─",
  mode: TerminalColorMode = "truecolor"
): string {
  if (width <= 0) return "";
  const fixedCornersWidth = visibleWidth(borderCornerLeft) + visibleWidth(borderCornerRight);
  if (width <= fixedCornersWidth) {
    return borderCornerLeft + borderCornerRight;
  }

  const formatSegs = (segs: StatuslineSegment[]) => {
    return segs
      .map((s) => {
        const val = evaluateSegment(s, context);
        if (!val) return "";
        const fg = s.color ? parseColor(s.color) : undefined;
        const bg = s.bg ? parseColor(s.bg) : undefined;
        return styleText(` ${val} `, { fg, bg }, mode);
      })
      .filter(Boolean)
      .join("");
  };

  let leftText = formatSegs(leftSegments);
  let rightText = formatSegs(rightSegments);

  const availableInside = width - fixedCornersWidth;
  const leftW = visibleWidth(leftText);
  const rightW = visibleWidth(rightText);

  if (leftW + rightW + 2 > availableInside) {
    // Truncate if too long
    const gap = 1;
    const maxLeft = Math.floor((availableInside - gap) / 2);
    leftText = truncateToWidth(leftText, maxLeft, "");
    rightText = truncateToWidth(rightText, Math.max(0, availableInside - gap - visibleWidth(leftText)), "");
  }

  const remainingGap = Math.max(0, availableInside - visibleWidth(leftText) - visibleWidth(rightText));
  const fill = borderFillChar.repeat(remainingGap);

  return `${borderCornerLeft}${leftText}${fill}${rightText}${borderCornerRight}`;
}
