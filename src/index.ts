import {
  CustomEditor,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type KeybindingsManager,
  type ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import { type EditorTheme, type TUI, truncateToWidth } from "@earendil-works/pi-tui";
import { loadConfig, saveConfig } from "./config.js";
import { extractStatuslineContext, getMockContext, gitState, setBusMetric, type StatuslineContext } from "./providers.js";
import { boxCorners, renderBoxBorders, renderStatusline } from "./renderer.js";
import { StatuslineEditorModal } from "./modal.js";
import type { StatuslineConfig } from "./types.js";

let currentConfig: StatuslineConfig = loadConfig();
const activeTuis = new Set<TUI>();
let footerData: ReadonlyFooterDataProvider | undefined;
let lastContext: StatuslineContext = getMockContext();

function requestRender(): void {
  for (const tui of activeTuis) tui.requestRender();
}

/** Never throws: a stale ctx (after session replacement) falls back to the last good snapshot. */
function snapshot(ctx: ExtensionContext): StatuslineContext {
  try {
    lastContext = extractStatuslineContext(ctx, footerData);
  } catch {
    // keep lastContext
  }
  return lastContext;
}

class EmbeddedBorderEditor extends CustomEditor {
  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, private extCtx: ExtensionContext) {
    // paddingX: 1 gives comfortable breathing room between left border and text
    super(tui, theme, keybindings, { paddingX: 1 });
    activeTuis.add(tui);
  }

  private borders(width: number) {
    const cfg = currentConfig;
    return renderBoxBorders(cfg.box, cfg.breakpoints, cfg.icons, snapshot(this.extCtx), width, "truecolor", (s) =>
      this.borderColor(s)
    );
  }

  render(width: number): string[] {
    const cfg = currentConfig;
    // Calculate inner width subtracting 2 columns for left and right vertical borders
    const innerWidth = Math.max(10, width - 2);
    const rawLines = super.render(innerWidth);
    if (rawLines.length < 2) return rawLines;

    const corners = boxCorners(cfg.box.border);
    const v = this.borderColor(corners.v);

    const out: string[] = [];
    const topIdx = 0;
    const botIdx = rawLines.length - 1;

    for (let i = 0; i < rawLines.length; i++) {
      if (i === topIdx) {
        // Top border with embedded tokens
        out.push(this.borders(width).top);
      } else if (i === botIdx) {
        // Bottom border with embedded tokens
        out.push(this.borders(width).bottom);
      } else {
        // Middle text lines: wrap with left and right vertical borders
        const middle = rawLines[i]!;
        out.push(`${v}${middle}${v}`);
      }
    }
    return out;
  }
}

/** Apply both surfaces independently: box (editor borders) and statusline (footer). */
function applyLayout(ctx: ExtensionContext): void {
  const cfg = currentConfig;

  if (cfg.box.enabled) {
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new EmbeddedBorderEditor(tui, theme, keybindings, ctx));
  } else {
    ctx.ui.setEditorComponent(undefined);
  }

  if (cfg.statusline.enabled) {
    ctx.ui.setFooter((tui, _theme, data) => {
      activeTuis.add(tui);
      footerData = data;
      const unsub = data.onBranchChange(() => tui.requestRender());
      return {
        dispose() {
          unsub();
          activeTuis.delete(tui);
          if (footerData === data) footerData = undefined;
        },
        invalidate() {},
        render(width: number): string[] {
          const c = currentConfig;
          const lines = renderStatusline(c.statusline, c.breakpoints, c.icons, snapshot(ctx), width);
          return lines.map((l) => truncateToWidth(l, width));
        },
      };
    });
  } else {
    footerData = undefined;
    // Clearing the factory restores Pi's built-in footer; keep an empty one instead.
    ctx.ui.setFooter(() => ({
      invalidate() {},
      render(): string[] {
        return [];
      },
    }));
  }
}

export default function (pi: ExtensionAPI) {
  const refreshGit = async (cwd: string) => {
    try {
      const b = await pi.exec("git", ["branch", "--show-current"], { cwd, timeout: 3000 });
      if (b.code !== 0) {
        gitState.branch = null;
        gitState.dirty = 0;
      } else {
        gitState.branch = b.stdout.trim() || "detached";
        const s = await pi.exec("git", ["status", "--porcelain"], { cwd, timeout: 3000 });
        gitState.dirty = s.code === 0 ? s.stdout.split("\n").filter(Boolean).length : 0;
      }
    } catch {
      gitState.branch = null;
      gitState.dirty = 0;
    }
    requestRender();
  };

  pi.on("session_start", (_event, ctx) => {
    applyLayout(ctx);
    void refreshGit(ctx.cwd);
  });

  pi.on("session_shutdown", () => {
    activeTuis.clear();
    footerData = undefined;
  });

  pi.on("turn_end", (_e, ctx) => {
    requestRender();
    void refreshGit(ctx.cwd);
  });
  pi.on("agent_settled", (_e, ctx) => {
    void refreshGit(ctx.cwd);
  });
  pi.on("model_select", requestRender);
  pi.on("thinking_level_select", requestRender);

  pi.registerCommand("statusline-edit", {
    description: "Edit the typing-box border and statusline (independent surfaces)",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/statusline-edit is only available in interactive mode", "warning");
        return;
      }

      const result = await ctx.ui.custom<StatuslineConfig | undefined>(
        (tui, theme, _kb, done) => new StatuslineEditorModal(tui, theme, currentConfig, done),
        { overlay: true, overlayOptions: { anchor: "center", width: "94%", maxHeight: "90%" } }
      );

      if (result) {
        currentConfig = result;
        saveConfig(currentConfig);
        applyLayout(ctx);
        ctx.ui.notify("Statusline saved and applied", "info");
      }
    },
  });

  pi.registerCommand("statusline-metric", {
    description: "Set a metric for a custom_bus segment: /statusline-metric <key> <value>",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) {
        ctx.ui.notify("Usage: /statusline-metric <key> <value>", "warning");
        return;
      }
      setBusMetric(parts[0]!, parts.slice(1).join(" "));
      requestRender();
      ctx.ui.notify(`Set metric [${parts[0]}]`, "info");
    },
  });

  pi.registerCommand("statusline-toggle", {
    description: "Re-apply the saved box/statusline layout",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      currentConfig = loadConfig();
      applyLayout(ctx);
      ctx.ui.notify("Layout reloaded from statusline.json", "info");
    },
  });
}
