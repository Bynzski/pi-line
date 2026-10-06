import {
  type Component,
  type Focusable,
  type TUI,
  matchesKey,
  styleText,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type BorderStyle,
  type RenderTarget,
  type SegmentType,
  type SeparatorStyle,
  type StatuslineConfig,
  type StatuslineSegment,
  SEPARATOR_PRESETS,
} from "./types.js";
import { renderStatusline, formatEditorBorderLine } from "./renderer.js";
import { getMockContext } from "./providers.js";

const AVAILABLE_SEGMENTS: {
  type: SegmentType;
  label: string;
  icon: string;
  defaultColor: string;
  defaultBg: string;
  priority: number;
  style?: "blocks" | "braille" | "percentage";
}[] = [
  { type: "git_branch", label: "Git Branch", icon: " ", defaultColor: "#1e1e2e", defaultBg: "#a6e3a1", priority: 1 },
  { type: "git_dirty", label: "Git Dirty Status", icon: "", defaultColor: "#f38ba8", defaultBg: "#313244", priority: 3 },
  { type: "model_name", label: "Active Model", icon: "󰚩 ", defaultColor: "#cdd6f4", defaultBg: "#313244", priority: 1 },
  { type: "provider_name", label: "Provider Name", icon: "󰄛 ", defaultColor: "#1e1e2e", defaultBg: "#89b4fa", priority: 4 },
  { type: "context_gauge", label: "Context Gauge (■■□□□)", icon: "󰾆 ", defaultColor: "#1e1e2e", defaultBg: "#f9e2af", priority: 2, style: "blocks" },
  { type: "context_gauge", label: "Context Gauge (Braille)", icon: "󰾆 ", defaultColor: "#1e1e2e", defaultBg: "#fab387", priority: 2, style: "braille" },
  { type: "context_usage", label: "Context %", icon: "󰾆 ", defaultColor: "#1e1e2e", defaultBg: "#89dceb", priority: 2 },
  { type: "cache_hit", label: "Cache Hit Ratio", icon: "⚡", defaultColor: "#1e1e2e", defaultBg: "#94e2d5", priority: 3 },
  { type: "cache_read", label: "Cache Read Tokens", icon: "󰓅 ", defaultColor: "#1e1e2e", defaultBg: "#a6e3a1", priority: 4 },
  { type: "token_usage", label: "Token Usage", icon: "󰅒 ", defaultColor: "#1e1e2e", defaultBg: "#89b4fa", priority: 2 },
  { type: "session_cost", label: "Session Cost ($)", icon: "$", defaultColor: "#1e1e2e", defaultBg: "#f38ba8", priority: 1 },
  { type: "cwd", label: "Working Dir (basename)", icon: " ", defaultColor: "#cdd6f4", defaultBg: "#45475a", priority: 4 },
  { type: "extension_statuses", label: "Extension Statuses", icon: "󰋼 ", defaultColor: "#cdd6f4", defaultBg: "#585b70", priority: 3 },
  { type: "custom_bus", label: "Custom Metric Bus", icon: "󰒋 ", defaultColor: "#cdd6f4", defaultBg: "#45475a", priority: 3 },
  { type: "text", label: "Custom Static Text", icon: "", defaultColor: "#cdd6f4", defaultBg: "#313244", priority: 5 },
];

const SEPARATOR_CHOICES: SeparatorStyle[] = [
  "powerline",
  "powerline-thin",
  "pill",
  "slash",
  "pipe",
  "bullet",
  "none",
];

const BORDER_CHOICES: BorderStyle[] = ["rounded", "single", "double", "top-only", "none"];
const TARGET_CHOICES: RenderTarget[] = ["footer", "editor-border"];

export class StatuslineEditorModal implements Component, Focusable {
  focused = true;

  private activeZone: "slots" | "inspector" | "add_dialog" = "slots";
  private selectedPosition: "left" | "center" | "right" = "left";
  private selectedSlotIndex = 0;
  private selectedInspectorField = 0; // 0: target, 1: separator, 2: border
  private selectedAddTypeIndex = 0;

  private config: StatuslineConfig;
  private tui: TUI;
  private theme: Theme;
  private done: (result?: StatuslineConfig) => void;

  constructor(
    tui: TUI,
    theme: Theme,
    initialConfig: StatuslineConfig,
    done: (result?: StatuslineConfig) => void
  ) {
    this.tui = tui;
    this.theme = theme;
    // Deep clone config so cancel discards changes
    this.config = JSON.parse(JSON.stringify(initialConfig));
    this.done = done;
  }

  invalidate(): void {
    // Required by Component contract
  }

  private getActiveSlotList(): StatuslineSegment[] {
    const row = this.config.rows[0];
    if (!row) return [];
    return row[this.selectedPosition];
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape")) {
      if (this.activeZone === "add_dialog") {
        this.activeZone = "slots";
        this.tui.requestRender();
        return;
      }
      this.done(undefined);
      return;
    }

    if (this.activeZone === "add_dialog") {
      this.handleAddDialogInput(data);
      return;
    }

    if (data === "s" || data === "S") {
      this.done(this.config);
      return;
    }

    if (matchesKey(data, "tab")) {
      this.activeZone = this.activeZone === "slots" ? "inspector" : "slots";
      this.tui.requestRender();
      return;
    }

    if (this.activeZone === "slots") {
      this.handleSlotsInput(data);
    } else if (this.activeZone === "inspector") {
      this.handleInspectorInput(data);
    }
  }

  private handleSlotsInput(data: string): void {
    const row = this.config.rows[0]!;

    // Position switching via numeric keys (1=left, 2=center, 3=right)
    if (data === "1" || data === "l" || data === "L") {
      this.selectedPosition = "left";
      this.selectedSlotIndex = Math.min(this.selectedSlotIndex, Math.max(0, row.left.length - 1));
      this.tui.requestRender();
      return;
    }
    if (data === "2" || data === "c" || data === "C") {
      this.selectedPosition = "center";
      this.selectedSlotIndex = Math.min(this.selectedSlotIndex, Math.max(0, row.center.length - 1));
      this.tui.requestRender();
      return;
    }
    if (data === "3" || data === "r" || data === "R") {
      this.selectedPosition = "right";
      this.selectedSlotIndex = Math.min(this.selectedSlotIndex, Math.max(0, row.right.length - 1));
      this.tui.requestRender();
      return;
    }

    const slots = this.getActiveSlotList();

    // Up / Down navigate sections
    if (matchesKey(data, "up")) {
      if (this.selectedPosition === "right") this.selectedPosition = "center";
      else if (this.selectedPosition === "center") this.selectedPosition = "left";
      this.selectedSlotIndex = Math.min(this.selectedSlotIndex, Math.max(0, this.getActiveSlotList().length - 1));
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "down")) {
      if (this.selectedPosition === "left") this.selectedPosition = "center";
      else if (this.selectedPosition === "center") this.selectedPosition = "right";
      this.selectedSlotIndex = Math.min(this.selectedSlotIndex, Math.max(0, this.getActiveSlotList().length - 1));
      this.tui.requestRender();
      return;
    }

    // Left / Right navigation between segments in active section
    if (matchesKey(data, "left")) {
      if (this.selectedSlotIndex > 0) {
        this.selectedSlotIndex--;
      }
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "right")) {
      if (this.selectedSlotIndex < slots.length - 1) {
        this.selectedSlotIndex++;
      }
      this.tui.requestRender();
      return;
    }

    // Shift segment order inside row: [ or ]
    if (data === "[" && slots.length > 1 && this.selectedSlotIndex > 0) {
      const temp = slots[this.selectedSlotIndex]!;
      slots[this.selectedSlotIndex] = slots[this.selectedSlotIndex - 1]!;
      slots[this.selectedSlotIndex - 1] = temp;
      this.selectedSlotIndex--;
      this.tui.requestRender();
      return;
    }
    if (data === "]" && slots.length > 1 && this.selectedSlotIndex < slots.length - 1) {
      const temp = slots[this.selectedSlotIndex]!;
      slots[this.selectedSlotIndex] = slots[this.selectedSlotIndex + 1]!;
      slots[this.selectedSlotIndex + 1] = temp;
      this.selectedSlotIndex++;
      this.tui.requestRender();
      return;
    }

    // Move segment between sections: m or M (Left -> Center -> Right -> Left)
    if ((data === "m" || data === "M") && slots.length > 0) {
      const seg = slots.splice(this.selectedSlotIndex, 1)[0]!;
      if (this.selectedPosition === "left") {
        row.center.push(seg);
        this.selectedPosition = "center";
        this.selectedSlotIndex = row.center.length - 1;
      } else if (this.selectedPosition === "center") {
        row.right.push(seg);
        this.selectedPosition = "right";
        this.selectedSlotIndex = row.right.length - 1;
      } else {
        row.left.push(seg);
        this.selectedPosition = "left";
        this.selectedSlotIndex = row.left.length - 1;
      }
      this.tui.requestRender();
      return;
    }

    // Toggle priority: p or P (cycles priority 1 -> 2 -> 3 -> 4 -> 5 -> 1)
    if ((data === "p" || data === "P") && slots.length > 0) {
      const cur = slots[this.selectedSlotIndex]!;
      const nextPriority = ((cur.priority ?? 2) % 5) + 1;
      cur.priority = nextPriority;
      this.tui.requestRender();
      return;
    }

    // Add segment: 'a'
    if (data === "a" || data === "A") {
      this.activeZone = "add_dialog";
      this.selectedAddTypeIndex = 0;
      this.tui.requestRender();
      return;
    }

    // Delete segment: 'd' or 'x'
    if ((data === "d" || data === "x") && slots.length > 0) {
      slots.splice(this.selectedSlotIndex, 1);
      if (this.selectedSlotIndex >= slots.length) {
        this.selectedSlotIndex = Math.max(0, slots.length - 1);
      }
      this.tui.requestRender();
      return;
    }
  }

  private handleInspectorInput(data: string): void {
    if (matchesKey(data, "up")) {
      this.selectedInspectorField = (this.selectedInspectorField - 1 + 3) % 3;
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "down")) {
      this.selectedInspectorField = (this.selectedInspectorField + 1) % 3;
      this.tui.requestRender();
      return;
    }

    if (this.selectedInspectorField === 0) {
      // Render Target toggle (footer vs editor-border)
      const current = this.config.target || "footer";
      const next = current === "footer" ? "editor-border" : "footer";
      if (matchesKey(data, "left") || matchesKey(data, "right") || matchesKey(data, "enter")) {
        this.config.target = next;
        this.tui.requestRender();
      }
      return;
    }

    if (this.selectedInspectorField === 1) {
      // Separator style cycling
      const current = this.config.style.separatorStyle || "powerline";
      const idx = SEPARATOR_CHOICES.indexOf(current);
      if (matchesKey(data, "right") || matchesKey(data, "enter")) {
        const next = SEPARATOR_CHOICES[(idx + 1) % SEPARATOR_CHOICES.length]!;
        this.config.style.separatorStyle = next;
        this.config.style.separators = SEPARATOR_PRESETS[next];
      } else if (matchesKey(data, "left")) {
        const prev = SEPARATOR_CHOICES[(idx - 1 + SEPARATOR_CHOICES.length) % SEPARATOR_CHOICES.length]!;
        this.config.style.separatorStyle = prev;
        this.config.style.separators = SEPARATOR_PRESETS[prev];
      }
      this.tui.requestRender();
      return;
    }

    if (this.selectedInspectorField === 2) {
      // Border style cycling
      const current = this.config.style.border || "rounded";
      const idx = BORDER_CHOICES.indexOf(current);
      if (matchesKey(data, "right") || matchesKey(data, "enter")) {
        this.config.style.border = BORDER_CHOICES[(idx + 1) % BORDER_CHOICES.length]!;
      } else if (matchesKey(data, "left")) {
        const prev = BORDER_CHOICES[(idx - 1 + BORDER_CHOICES.length) % BORDER_CHOICES.length]!;
        this.config.style.border = prev;
      }
      this.tui.requestRender();
      return;
    }
  }

  private handleAddDialogInput(data: string): void {
    if (matchesKey(data, "up")) {
      if (this.selectedAddTypeIndex > 0) this.selectedAddTypeIndex--;
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "down")) {
      if (this.selectedAddTypeIndex < AVAILABLE_SEGMENTS.length - 1) this.selectedAddTypeIndex++;
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, "enter")) {
      const chosen = AVAILABLE_SEGMENTS[this.selectedAddTypeIndex]!;
      const newSeg: StatuslineSegment = {
        id: `seg-${Date.now()}`,
        type: chosen.type,
        priority: chosen.priority,
        icon: chosen.icon,
        color: chosen.defaultColor,
        bg: chosen.defaultBg,
        style: chosen.style,
      };
      const slots = this.getActiveSlotList();
      slots.push(newSeg);
      this.selectedSlotIndex = slots.length - 1;
      this.activeZone = "slots";
      this.tui.requestRender();
      return;
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const contentWidth = Math.max(50, width - 4);

    const bColor = (s: string) => this.theme.fg("accent", s);
    const dim = (s: string) => this.theme.fg("dim", s);
    const title = (s: string) => this.theme.style(s, { bold: true, fg: "accent" });

    // Top border of modal frame
    lines.push(bColor("╭" + "─".repeat(contentWidth + 2) + "╮"));

    // Header Title
    const headerTitle = " 󰌌  PI STATUSLINE & BORDER BUILDER ";
    const headerPad = Math.max(0, contentWidth + 2 - visibleWidth(headerTitle));
    lines.push(bColor("│") + title(headerTitle) + " ".repeat(headerPad) + bColor("│"));
    lines.push(bColor("├" + "─".repeat(contentWidth + 2) + "┤"));

    // 1. LIVE PREVIEW PANE
    const target = this.config.target || "footer";
    const borderLabel = `Target: ${target} | Border: ${this.config.style.border || "rounded"} | Sep: ${this.config.style.separatorStyle || "powerline"}`;
    const pHeader = ` 1. LIVE PREVIEW PANE (${borderLabel})`;
    lines.push(bColor("│") + dim(pHeader) + " ".repeat(Math.max(0, contentWidth + 2 - visibleWidth(pHeader))) + bColor("│"));

    const mockContext = getMockContext();
    if (target === "editor-border") {
      // Simulate typing box with embedded border preview
      const row = this.config.rows[0] || { left: [], center: [], right: [] };
      const topBorder = formatEditorBorderLine(row.left, row.right, mockContext, contentWidth - 4, "╭─", "─╮");
      lines.push(bColor("│  ") + topBorder + bColor("  │"));
      const promptLine = "│  │ make the README say what the harness brings █" + " ".repeat(Math.max(0, contentWidth - 52)) + "│  │";
      lines.push(bColor(promptLine));
      const bottomBorder = formatEditorBorderLine(row.center, row.right, mockContext, contentWidth - 4, "╰─", "─╯");
      lines.push(bColor("│  ") + bottomBorder + bColor("  │"));
    } else {
      const previewLines = renderStatusline(this.config, mockContext, contentWidth);
      for (const pLine of previewLines) {
        const pW = visibleWidth(pLine);
        const pad = " ".repeat(Math.max(0, contentWidth - pW));
        lines.push(bColor("│ ") + pLine + pad + bColor(" │"));
      }
    }

    lines.push(bColor("├" + "─".repeat(contentWidth + 2) + "┤"));

    // 2. SEGMENT ARRANGEMENT (Slot Builder)
    const slotZoneActive = this.activeZone === "slots";
    const slotHeader = ` 2. SEGMENT ARRANGEMENT ${slotZoneActive ? "◄ ACTIVE (Tab: Inspector | ↑/↓: Section)" : ""}`;
    lines.push(bColor("│") + (slotZoneActive ? title(slotHeader) : dim(slotHeader)) + " ".repeat(Math.max(0, contentWidth + 2 - visibleWidth(slotHeader))) + bColor("│"));

    const row = this.config.rows[0] || { left: [], center: [], right: [] };
    const renderSlotsRow = (pos: "left" | "center" | "right", label: string, shortcut: string) => {
      const isPosSelected = this.selectedPosition === pos && slotZoneActive;
      const list = row[pos] || [];
      const prefix = `  ${isPosSelected ? "▶" : " "} [${shortcut}] ${label}: `;
      let segsStr = "";

      if (list.length === 0) {
        segsStr = dim("[empty]");
      } else {
        segsStr = list
          .map((seg, i) => {
            const isSegSelected = isPosSelected && this.selectedSlotIndex === i;
            const prioBadge = seg.priority ? ` P${seg.priority}` : "";
            const text = `${seg.type}${prioBadge}`;
            if (isSegSelected) {
              return this.theme.style(`[▶ ${text} ◀]`, { bold: true, fg: "success", bg: "selectedBg" });
            }
            return `[${text}]`;
          })
          .join(" ");
      }

      const fullLine = prefix + segsStr;
      const pad = " ".repeat(Math.max(0, contentWidth + 2 - visibleWidth(fullLine)));
      return bColor("│") + fullLine + pad + bColor("│");
    };

    lines.push(renderSlotsRow("left", "Left  ", "1/L"));
    lines.push(renderSlotsRow("center", "Center", "2/C"));
    lines.push(renderSlotsRow("right", "Right ", "3/R"));

    const actionsLine = "  Keys: [↑/↓] Section  [←/→] Select  [ [ / ] ] Move  [m] Move Section  [p] Priority  [a] Add  [d] Delete";
    lines.push(bColor("│") + dim(actionsLine) + " ".repeat(Math.max(0, contentWidth + 2 - visibleWidth(actionsLine))) + bColor("│"));

    lines.push(bColor("├" + "─".repeat(contentWidth + 2) + "┤"));

    // 3. STYLE & DIVIDER INSPECTOR
    const inspZoneActive = this.activeZone === "inspector";
    const inspHeader = ` 3. STYLE & LOCATION INSPECTOR ${inspZoneActive ? "◄ ACTIVE (Tab to switch)" : ""}`;
    lines.push(bColor("│") + (inspZoneActive ? title(inspHeader) : dim(inspHeader)) + " ".repeat(Math.max(0, contentWidth + 2 - visibleWidth(inspHeader))) + bColor("│"));

    // Target row (footer vs editor-border)
    const curTarget = this.config.target || "footer";
    const targetStr = TARGET_CHOICES.map((t) => (t === curTarget ? this.theme.style(`❯ ${t} ❮`, { bold: true, fg: "accent" }) : t)).join(" | ");
    const targetFocusMarker = inspZoneActive && this.selectedInspectorField === 0 ? "▶ " : "  ";
    const targetFull = `  ${targetFocusMarker}Render Target: [ ${targetStr} ]`;
    lines.push(bColor("│") + targetFull + " ".repeat(Math.max(0, contentWidth + 2 - visibleWidth(targetFull))) + bColor("│"));

    // Separators row
    const curSep = this.config.style.separatorStyle || "powerline";
    const sepStr = SEPARATOR_CHOICES.map((s) => (s === curSep ? this.theme.style(`❯ ${s} ❮`, { bold: true, fg: "accent" }) : s)).join(" | ");
    const sepFocusMarker = inspZoneActive && this.selectedInspectorField === 1 ? "▶ " : "  ";
    const sepFull = `  ${sepFocusMarker}Separators:    [ ${sepStr} ]`;
    lines.push(bColor("│") + sepFull + " ".repeat(Math.max(0, contentWidth + 2 - visibleWidth(sepFull))) + bColor("│"));

    // Border row
    const curBorder = this.config.style.border || "rounded";
    const borderStr = BORDER_CHOICES.map((b) => (b === curBorder ? this.theme.style(`❯ ${b} ❮`, { bold: true, fg: "accent" }) : b)).join(" | ");
    const borderFocusMarker = inspZoneActive && this.selectedInspectorField === 2 ? "▶ " : "  ";
    const borderFull = `  ${borderFocusMarker}Border Box:    [ ${borderStr} ]`;
    lines.push(bColor("│") + borderFull + " ".repeat(Math.max(0, contentWidth + 2 - visibleWidth(borderFull))) + bColor("│"));

    // If Add Dialog is open, overlay options
    if (this.activeZone === "add_dialog") {
      lines.push(bColor("├" + "─".repeat(contentWidth + 2) + "┤"));
      const addHeader = "  SELECT WIDGET TYPE TO ADD (↑/↓ Navigate, Enter Select, Esc Cancel):";
      lines.push(bColor("│") + this.theme.style(addHeader, { bold: true, fg: "warning" }) + " ".repeat(Math.max(0, contentWidth + 2 - visibleWidth(addHeader))) + bColor("│"));
      AVAILABLE_SEGMENTS.forEach((segDef, idx) => {
        const isSel = idx === this.selectedAddTypeIndex;
        const pointer = isSel ? " ▶ " : "   ";
        const itemText = `${pointer}${segDef.icon} ${segDef.label} (type: ${segDef.type}, P${segDef.priority})`;
        const styledItem = isSel ? this.theme.style(itemText, { bold: true, fg: "success", bg: "selectedBg" }) : itemText;
        lines.push(bColor("│") + styledItem + " ".repeat(Math.max(0, contentWidth + 2 - visibleWidth(itemText))) + bColor("│"));
      });
    }

    lines.push(bColor("├" + "─".repeat(contentWidth + 2) + "┤"));

    // Footer shortcuts
    const footerShortcuts = " [s] Save & Apply    [Esc] Cancel    [Tab] Switch Zone ";
    lines.push(bColor("│") + this.theme.style(footerShortcuts, { bold: true, fg: "success" }) + " ".repeat(Math.max(0, contentWidth + 2 - visibleWidth(footerShortcuts))) + bColor("│"));

    // Bottom border of modal frame
    lines.push(bColor("╰" + "─".repeat(contentWidth + 2) + "╯"));

    return lines.map((l) => truncateToWidth(l, width));
  }
}
