import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type KeybindingsManager,
  type ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import { type Component, type EditorTheme, type TUI, truncateToWidth } from "@earendil-works/pi-tui";
import { loadConfig, saveConfig } from "./config.js";
import { extractStatuslineContext, setBusMetric } from "./providers.js";
import { renderStatusline, formatEditorBorderLine } from "./renderer.js";
import { StatuslineEditorModal } from "./modal.js";
import type { StatuslineConfig } from "./types.js";

let currentConfig: StatuslineConfig = loadConfig();
let activeTui: TUI | null = null;
let activeFooterDataProvider: ReadonlyFooterDataProvider | null = null;

class EmbeddedBorderEditor extends CustomEditor {
  private extContext: ExtensionContext;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    extContext: ExtensionContext
  ) {
    super(tui, theme, keybindings, { paddingX: 0 });
    this.extContext = extContext;
    activeTui = tui;
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length < 2) return lines;

    const row = currentConfig.rows[0];
    if (!row) return lines;

    const statusContext = extractStatuslineContext(this.extContext, activeFooterDataProvider || undefined);
    const borderStyle = currentConfig.style.border || "rounded";

    let topLeft = "╭─";
    let topRight = "─╮";
    let bottomLeft = "╰─";
    let bottomRight = "─╯";
    let fill = "─";

    if (borderStyle === "single") {
      topLeft = "┌─";
      topRight = "─┐";
      bottomLeft = "└─";
      bottomRight = "─┘";
    } else if (borderStyle === "double") {
      topLeft = "╔═";
      topRight = "═╗";
      bottomLeft = "╚═";
      bottomRight = "═╝";
      fill = "═";
    }

    // Top border embeds left segments on left, right segments on right
    lines[0] = formatEditorBorderLine(
      row.left,
      row.right,
      statusContext,
      width,
      topLeft,
      topRight,
      fill
    );

    // Bottom border embeds center segments on left (e.g. context gauge), right segments on right (cost/tokens)
    lines[lines.length - 1] = formatEditorBorderLine(
      row.center,
      row.right,
      statusContext,
      width,
      bottomLeft,
      bottomRight,
      fill
    );

    return lines;
  }
}

function applyLayout(ctx: ExtensionContext): void {
  const target = currentConfig.target || "footer";

  if (target === "editor-border") {
    // 1. Clear footer so it's clean and doesn't duplicate info
    ctx.ui.setFooter(undefined);

    // 2. Wrap custom editor to embed statusline tokens into typing box borders
    ctx.ui.setEditorComponent((tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => {
      return new EmbeddedBorderEditor(tui, theme, keybindings, ctx);
    });
  } else {
    // Restore default editor border
    ctx.ui.setEditorComponent(undefined);

    // Mount custom footer component
    ctx.ui.setFooter((tui: TUI, _theme, footerData: ReadonlyFooterDataProvider) => {
      activeTui = tui;
      activeFooterDataProvider = footerData;
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose() {
          unsub();
          activeTui = null;
          activeFooterDataProvider = null;
        },
        invalidate() {},
        render(width: number): string[] {
          const statusContext = extractStatuslineContext(ctx, footerData);
          const lines = renderStatusline(currentConfig, statusContext, width);
          return lines.map((l) => truncateToWidth(l, width));
        },
      };
    });
  }
}

export default function (pi: ExtensionAPI) {
  // Hook session_start to establish layout
  pi.on("session_start", (_event, ctx) => {
    applyLayout(ctx);
  });

  // Re-render footer / editor on turn boundaries and model changes
  pi.on("turn_end", () => {
    activeTui?.requestRender();
  });

  pi.on("model_select", () => {
    activeTui?.requestRender();
  });

  // Register /statusline-edit command
  pi.registerCommand("statusline-edit", {
    description: "Open the interactive statusline visual layout builder",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/statusline-edit is only available in interactive mode", "warning");
        return;
      }

      const result = await ctx.ui.custom<StatuslineConfig | undefined>(
        (tui, theme, _keybindings, done) => {
          return new StatuslineEditorModal(tui, theme, currentConfig, done);
        },
        {
          overlay: true,
          overlayOptions: {
            anchor: "center",
            width: "94%",
            maxHeight: 28,
          },
        }
      );

      if (result) {
        currentConfig = result;
        saveConfig(currentConfig);
        applyLayout(ctx);
        ctx.ui.notify("Statusline updated and applied!", "info");
      }
    },
  });

  // Register /statusline-metric command to allow shell scripts or extensions to emit metrics
  pi.registerCommand("statusline-metric", {
    description: "Set a dynamic metric token for statusline (e.g. /statusline-metric build passing)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) {
        ctx.ui.notify("Usage: /statusline-metric <key> <value>", "warning");
        return;
      }
      const key = parts[0]!;
      const val = parts.slice(1).join(" ");
      setBusMetric(key, val);
      activeTui?.requestRender();
      ctx.ui.notify(`Set metric [${key}] = "${val}"`, "info");
    },
  });

  // Register toggle command
  pi.registerCommand("statusline-toggle", {
    description: "Refresh or restore custom statusline layout",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      applyLayout(ctx);
      ctx.ui.notify("Custom statusline layout refreshed", "info");
    },
  });
}
