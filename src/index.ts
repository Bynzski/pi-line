import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import { type Component, type TUI, truncateToWidth } from "@earendil-works/pi-tui";
import { loadConfig, saveConfig } from "./config.js";
import { extractStatuslineContext, setBusMetric } from "./providers.js";
import { renderStatusline } from "./renderer.js";
import { StatuslineEditorModal } from "./modal.js";
import type { StatuslineConfig } from "./types.js";

let currentConfig: StatuslineConfig = loadConfig();
let activeTui: TUI | null = null;

function applyFooter(ctx: ExtensionContext): void {
  ctx.ui.setFooter((tui: TUI, _theme, footerData: ReadonlyFooterDataProvider) => {
    activeTui = tui;
    const unsub = footerData.onBranchChange(() => tui.requestRender());

    return {
      dispose() {
        unsub();
        activeTui = null;
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

export default function (pi: ExtensionAPI) {
  // Hook session_start to establish footer
  pi.on("session_start", (_event, ctx) => {
    applyFooter(ctx);
  });

  // Re-render footer on turn boundaries and message completions
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
            width: "92%",
            maxHeight: 28,
          },
        }
      );

      if (result) {
        currentConfig = result;
        saveConfig(currentConfig);
        applyFooter(ctx);
        ctx.ui.notify("Statusline updated and saved to ~/.pi/agent/statusline.json!", "info");
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
    description: "Refresh or restore custom statusline",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      applyFooter(ctx);
      ctx.ui.notify("Custom statusline refreshed", "info");
    },
  });
}
