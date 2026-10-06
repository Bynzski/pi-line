import {
  type Component,
  type Focusable,
  type TUI,
  matchesKey,
  parseColor,
  styleText,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type BorderStyle,
  type BoxBorderStyle,
  type BoxSlotName,
  type IconSet,
  type SegmentType,
  type SeparatorStyle,
  type StatuslineConfig,
  type StatuslineSegment,
  emptyRow,
} from "./types.js";
import { boxCorners, renderBoxBorders, renderStatusline } from "./renderer.js";
import { getMockContext } from "./providers.js";

type Tab = "box" | "statusline" | "global";
const TABS: { id: Tab; label: string }[] = [
  { id: "box", label: "Box" },
  { id: "statusline", label: "Statusline" },
  { id: "global", label: "Global" },
];

const SEGMENT_CATALOG: { type: SegmentType; label: string; color: string; priority: number; style?: StatuslineSegment["style"] }[] = [
  { type: "git_branch", label: "Git branch", color: "#a6e3a1", priority: 1 },
  { type: "git_dirty", label: "Git dirty count", color: "#f9e2af", priority: 3 },
  { type: "model_name", label: "Model", color: "#89b4fa", priority: 1 },
  { type: "provider_name", label: "Provider", color: "#74c7ec", priority: 4 },
  { type: "thinking_level", label: "Thinking level", color: "#cba6f7", priority: 2 },
  { type: "context_gauge", label: "Context gauge (blocks)", color: "#a6e3a1", priority: 2, style: "blocks" },
  { type: "context_gauge", label: "Context gauge (braille)", color: "#fab387", priority: 2, style: "braille" },
  { type: "context_usage", label: "Context %", color: "#89dceb", priority: 2 },
  { type: "token_usage", label: "Tokens in/out", color: "#89b4fa", priority: 2 },
  { type: "session_cost", label: "Session cost", color: "#f38ba8", priority: 1 },
  { type: "cache_hit", label: "Cache hit ratio", color: "#94e2d5", priority: 3 },
  { type: "cache_read", label: "Cache read tokens", color: "#a6e3a1", priority: 4 },
  { type: "cwd", label: "Directory", color: "#89b4fa", priority: 3 },
  { type: "extension_statuses", label: "Extension statuses", color: "#cdd6f4", priority: 3 },
  { type: "custom_bus", label: "Custom metric (bus key)", color: "#cdd6f4", priority: 3 },
  { type: "text", label: "Static text", color: "#cdd6f4", priority: 5 },
];

const FG_PALETTE: (string | undefined)[] = [undefined, "#cdd6f4", "#a6e3a1", "#89b4fa", "#f9e2af", "#f38ba8", "#cba6f7", "#94e2d5", "#fab387", "#6c7086"];
const BG_PALETTE: (string | undefined)[] = [undefined, "#1e1e2e", "#313244", "#45475a", "#a6e3a1", "#89b4fa", "#f9e2af", "#f38ba8", "#cba6f7", "#94e2d5"];

const SEPARATORS: SeparatorStyle[] = ["pipe", "blend", "slash", "bullet", "none", "powerline", "powerline-thin", "pill"];
const FILL_STYLES: ("flat" | "minimal" | "pill" | "subtle")[] = ["flat", "minimal", "pill", "subtle"];
const FOOTER_BORDERS: BorderStyle[] = ["none", "top-only", "single", "rounded", "double"];
const BOX_BORDERS: BoxBorderStyle[] = ["rounded", "single", "double"];
const ICON_SETS: IconSet[] = ["unicode", "ascii", "nerd"];
const COMPACT_STEPS = [60, 70, 85, 100, 120];
const HIDE_STEPS = [40, 50, 65, 80, 100];

type Item =
  | { kind: "slot"; label: string; list: StatuslineSegment[]; row?: number }
  | { kind: "setting"; label: string; value: string; change: (dir: 1 | -1) => void };

function cycle<T>(arr: readonly T[], cur: T, dir: 1 | -1): T {
  const i = arr.indexOf(cur);
  return arr[(i + dir + arr.length * 2) % arr.length]!;
}

export class StatuslineEditorModal implements Component, Focusable {
  focused = true;

  private tab: Tab = "box";
  private cursor = 0; // index into current tab's items
  private segIndex = 0; // selected segment inside a slot item
  private adding = false;
  private addIndex = 0;

  private config: StatuslineConfig;

  constructor(
    private tui: TUI,
    private theme: Theme,
    initialConfig: StatuslineConfig,
    private done: (result?: StatuslineConfig) => void
  ) {
    this.config = JSON.parse(JSON.stringify(initialConfig));
  }

  invalidate(): void {}

  // ---- model -------------------------------------------------------------

  private items(): Item[] {
    const c = this.config;
    if (this.tab === "box") {
      const slot = (label: string, name: BoxSlotName): Item => ({ kind: "slot", label, list: c.box.slots[name] });
      return [
        slot("Top-left   ", "topLeft"),
        slot("Top-right  ", "topRight"),
        slot("Bottom-left ", "bottomLeft"),
        slot("Bottom-right", "bottomRight"),
        { kind: "setting", label: "Box enabled ", value: c.box.enabled ? "on" : "off", change: () => (c.box.enabled = !c.box.enabled) },
        { kind: "setting", label: "Box border  ", value: c.box.border, change: (d) => (c.box.border = cycle(BOX_BORDERS, c.box.border, d)) },
      ];
    }
    if (this.tab === "statusline") {
      const out: Item[] = [];
      c.statusline.rows.forEach((row, i) => {
        out.push({ kind: "slot", label: `Row ${i + 1} left  `, list: row.left, row: i });
        out.push({ kind: "slot", label: `Row ${i + 1} center`, list: row.center, row: i });
        out.push({ kind: "slot", label: `Row ${i + 1} right `, list: row.right, row: i });
      });
      out.push({ kind: "setting", label: "Statusline enabled", value: c.statusline.enabled ? "on" : "off", change: () => (c.statusline.enabled = !c.statusline.enabled) });
      out.push({ kind: "setting", label: "Segment style     ", value: c.statusline.fillStyle || "flat", change: (d) => (c.statusline.fillStyle = cycle(FILL_STYLES, c.statusline.fillStyle || "flat", d)) });
      out.push({ kind: "setting", label: "Frame             ", value: c.statusline.border, change: (d) => (c.statusline.border = cycle(FOOTER_BORDERS, c.statusline.border, d)) });
      out.push({ kind: "setting", label: "Separators        ", value: c.statusline.separatorStyle, change: (d) => (c.statusline.separatorStyle = cycle(SEPARATORS, c.statusline.separatorStyle, d)) });
      return out;
    }
    return [
      { kind: "setting", label: "Icon set            ", value: c.icons, change: (d) => (c.icons = cycle(ICON_SETS, c.icons, d)) },
      { kind: "setting", label: "Compact below (cols)", value: String(c.breakpoints.compactBelow ?? 85), change: (d) => (c.breakpoints.compactBelow = cycle(COMPACT_STEPS, c.breakpoints.compactBelow ?? 85, d)) },
      { kind: "setting", label: "Hide P3+ below (cols)", value: String(c.breakpoints.hideOptionalBelow ?? 65), change: (d) => (c.breakpoints.hideOptionalBelow = cycle(HIDE_STEPS, c.breakpoints.hideOptionalBelow ?? 65, d)) },
    ];
  }

  private current(): Item | undefined {
    const items = this.items();
    this.cursor = Math.max(0, Math.min(this.cursor, items.length - 1));
    return items[this.cursor];
  }

  private currentSeg(): StatuslineSegment | undefined {
    const it = this.current();
    if (it?.kind !== "slot") return undefined;
    this.segIndex = Math.max(0, Math.min(this.segIndex, it.list.length - 1));
    return it.list[this.segIndex];
  }

  // ---- input -------------------------------------------------------------

  handleInput(data: string): void {
    if (this.adding) return this.handleAdd(data);

    if (matchesKey(data, "escape")) return this.done(undefined);
    if (data === "s" || data === "S") return this.done(this.config);

    if (matchesKey(data, "tab")) return this.switchTab(1);
    if (matchesKey(data, "shift+tab")) return this.switchTab(-1);

    const items = this.items();
    if (matchesKey(data, "up")) {
      this.cursor = Math.max(0, this.cursor - 1);
      this.segIndex = 0;
      return this.tui.requestRender();
    }
    if (matchesKey(data, "down")) {
      this.cursor = Math.min(items.length - 1, this.cursor + 1);
      this.segIndex = 0;
      return this.tui.requestRender();
    }

    const it = this.current();
    if (!it) return;

    if (it.kind === "setting") {
      if (matchesKey(data, "left")) it.change(-1);
      else if (matchesKey(data, "right") || matchesKey(data, "enter")) it.change(1);
      else return;
      return this.tui.requestRender();
    }

    this.handleSlotKey(data, it, items);
  }

  private switchTab(dir: 1 | -1): void {
    const i = TABS.findIndex((t) => t.id === this.tab);
    this.tab = TABS[(i + dir + TABS.length) % TABS.length]!.id;
    this.cursor = 0;
    this.segIndex = 0;
    this.tui.requestRender();
  }

  private handleSlotKey(data: string, it: Extract<Item, { kind: "slot" }>, items: Item[]): void {
    const list = it.list;
    const seg = this.currentSeg();
    let changed = true;

    if (matchesKey(data, "left")) this.segIndex = Math.max(0, this.segIndex - 1);
    else if (matchesKey(data, "right")) this.segIndex = Math.min(list.length - 1, this.segIndex + 1);
    else if (data === "[" && seg && this.segIndex > 0) {
      [list[this.segIndex - 1], list[this.segIndex]] = [list[this.segIndex]!, list[this.segIndex - 1]!];
      this.segIndex--;
    } else if (data === "]" && seg && this.segIndex < list.length - 1) {
      [list[this.segIndex + 1], list[this.segIndex]] = [list[this.segIndex]!, list[this.segIndex + 1]!];
      this.segIndex++;
    } else if ((data === "m" || data === "M") && seg) {
      // move to the next slot in this tab (wraps)
      const slots = items.map((x, i) => ({ x, i })).filter((p) => p.x.kind === "slot");
      const pos = slots.findIndex((p) => p.i === this.cursor);
      const next = slots[(pos + 1) % slots.length]!;
      list.splice(this.segIndex, 1);
      (next.x as Extract<Item, { kind: "slot" }>).list.push(seg);
      this.cursor = next.i;
      this.segIndex = (next.x as Extract<Item, { kind: "slot" }>).list.length - 1;
    } else if ((data === "p" || data === "P") && seg) seg.priority = ((seg.priority ?? 2) % 5) + 1;
    else if (data === "c" && seg) seg.color = cycle(FG_PALETTE, seg.color, 1);
    else if (data === "g" && seg) seg.bg = cycle(BG_PALETTE, seg.bg, 1);
    else if (data === "i" && seg) seg.noIcon = !seg.noIcon;
    else if (data === "a" || data === "A") {
      this.adding = true;
      this.addIndex = 0;
    } else if ((data === "d" || data === "x") && seg) {
      list.splice(this.segIndex, 1);
      this.segIndex = Math.max(0, Math.min(this.segIndex, list.length - 1));
    } else if (data === "n" && this.tab === "statusline") {
      this.config.statusline.rows.push(emptyRow());
    } else if (data === "X" && this.tab === "statusline" && it.row !== undefined && this.config.statusline.rows.length > 1) {
      this.config.statusline.rows.splice(it.row, 1);
      this.cursor = Math.max(0, this.cursor - 3);
    } else changed = false;

    if (changed) this.tui.requestRender();
  }

  private handleAdd(data: string): void {
    if (matchesKey(data, "escape")) {
      this.adding = false;
    } else if (matchesKey(data, "up")) {
      this.addIndex = Math.max(0, this.addIndex - 1);
    } else if (matchesKey(data, "down")) {
      this.addIndex = Math.min(SEGMENT_CATALOG.length - 1, this.addIndex + 1);
    } else if (matchesKey(data, "enter")) {
      const it = this.current();
      if (it?.kind === "slot") {
        const def = SEGMENT_CATALOG[this.addIndex]!;
        it.list.push({
          id: `seg-${Date.now()}`,
          type: def.type,
          priority: def.priority,
          color: def.color,
          style: def.style,
          text: def.type === "text" ? "text" : def.type === "custom_bus" ? "key" : undefined,
        });
        this.segIndex = it.list.length - 1;
      }
      this.adding = false;
    } else return;
    this.tui.requestRender();
  }

  // ---- rendering ---------------------------------------------------------

  render(width: number): string[] {
    const w = Math.max(44, width - 4); // content width
    const t = this.theme;
    const accent = (s: string) => t.fg("accent", s);
    const dim = (s: string) => t.fg("dim", s);
    const bold = (s: string) => t.style(s, { bold: true, fg: "accent" });
    const mode = t.getColorMode();
    const line = (content: string) => accent("│ ") + truncateToWidth(content, w, "") + " ".repeat(Math.max(0, w - visibleWidth(content))) + accent(" │");
    const rule = (l: string, r: string) => accent(l + "─".repeat(w + 2) + r);

    const maxH = Math.max(16, Math.floor(this.tui.terminal.rows * 0.9));
    const c = this.config;
    const mock = getMockContext();

    // --- header + tabs (one line)
    const head: string[] = [rule("╭", "╮"), line(bold("pi-line ") + this.tabBar()), rule("├", "┤")];

    // --- preview: whole composition
    const prev: string[] = [];
    const prompt = "make the README say what the harness brings █";
    if (c.box.enabled) {
      const b = renderBoxBorders(c.box, c.breakpoints, c.icons, mock, w, mode, accent);
      const v = accent(boxCorners(c.box.border).v);
      prev.push(line(b.top));
      prev.push(line(v + " " + truncateToWidth(prompt, w - 4, "…") + " ".repeat(Math.max(0, w - 4 - visibleWidth(truncateToWidth(prompt, w - 4, "…")))) + " " + v));
      prev.push(line(b.bottom));
    } else {
      prev.push(line(dim("─".repeat(w))));
      prev.push(line(truncateToWidth(prompt, w, "…")));
      prev.push(line(dim("─".repeat(w))));
    }
    if (c.statusline.enabled) {
      for (const l of renderStatusline(c.statusline, c.breakpoints, c.icons, mock, w, mode)) prev.push(line(l));
    } else {
      prev.push(line(dim("(statusline off — Pi's built-in footer is shown)")));
    }
    prev.push(rule("├", "┤"));

    // --- footer / help
    const it = this.current();
    const help1 =
      it?.kind === "slot"
        ? "←/→ select  [ ] reorder  m move  a add  d delete  p priority  c fg  g bg  i icon"
        : "←/→ or Enter: change value";
    const help2 = "↑/↓ item  Tab/Shift+Tab switch tab  " + (this.tab === "statusline" ? "n add row  X del row  " : "") + "s save  Esc cancel";
    const foot: string[] = [rule("├", "┤"), line(dim(help1)), line(dim(help2)), rule("╰", "╯")];

    // --- panel (scrolls to keep cursor visible)
    const budget = Math.max(4, maxH - head.length - prev.length - foot.length - 1);
    const panel = this.adding ? this.renderAdd(line, dim, budget) : this.renderPanel(line, dim, budget);

    return [...head, ...prev, ...panel, ...foot].map((l) => truncateToWidth(l, width));
  }

  private tabBar(): string {
    return TABS.map((tb) => (tb.id === this.tab ? this.theme.style(` ${tb.label} `, { bold: true, fg: "success", bg: "selectedBg" }) : this.theme.fg("dim", ` ${tb.label} `))).join("  ");
  }

  private swatch(seg: StatuslineSegment): string {
    const mode = this.theme.getColorMode();
    const fg = seg.color ? parseColor(seg.color) : undefined;
    const bg = seg.bg ? parseColor(seg.bg) : undefined;
    return styleText("●", { fg: fg ?? bg }, mode);
  }

  private renderPanel(line: (s: string) => string, dim: (s: string) => string, budget: number): string[] {
    const items = this.items();
    this.current();
    const rows = items.map((item, idx) => {
      const selected = idx === this.cursor;
      const ptr = selected ? this.theme.fg("accent", "▶ ") : "  ";
      if (item.kind === "setting") {
        const val = selected ? this.theme.style(`‹ ${item.value} ›`, { bold: true, fg: "success" }) : item.value;
        return line(`${ptr}${item.label}: ${val}`);
      }
      const segs = item.list.length
        ? item.list
            .map((s, i) => {
              const txt = `${s.type}${s.priority ? ` P${s.priority}` : ""}`;
              return selected && i === this.segIndex
                ? this.theme.style(`[${txt}]`, { bold: true, fg: "success", bg: "selectedBg" })
                : `${this.swatch(s)} ${txt}`;
            })
            .join("  ")
        : dim("(empty — press a to add)");
      return line(`${ptr}${item.label}: ${segs}`);
    });

    if (rows.length <= budget) return rows;
    const start = Math.max(0, Math.min(this.cursor - Math.floor(budget / 2), rows.length - budget));
    return rows.slice(start, start + budget);
  }

  private renderAdd(line: (s: string) => string, dim: (s: string) => string, budget: number): string[] {
    const header = line(this.theme.style("Add segment — ↑/↓ choose, Enter add, Esc cancel", { bold: true, fg: "warning" }));
    const rows = SEGMENT_CATALOG.map((d, i) => {
      const sel = i === this.addIndex;
      const txt = `${sel ? "▶ " : "  "}${d.label}  ${dim(`(${d.type}, P${d.priority})`)}`;
      return line(sel ? this.theme.style(txt, { bold: true, fg: "success" }) : txt);
    });
    const room = Math.max(3, budget - 1);
    const start = Math.max(0, Math.min(this.addIndex - Math.floor(room / 2), rows.length - room));
    return [header, ...rows.slice(start, start + room)];
  }
}
