import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { type StatuslineConfig, DEFAULT_CONFIG, emptyRow } from "./types.js";

export function getConfigPath(): string {
  return path.join(os.homedir(), ".pi", "agent", "statusline.json");
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Convert a v1 config (single footer/editor-border target) into v2. */
export function migrateV1(old: any): StatuslineConfig {
  const cfg = clone(DEFAULT_CONFIG);
  const row = old.rows?.[0] ?? emptyRow();
  cfg.statusline.rows = [
    { left: row.left ?? [], center: row.center ?? [], right: row.right ?? [] },
  ];
  cfg.statusline.border = old.style?.border ?? "none";
  cfg.statusline.separatorStyle = old.style?.separatorStyle ?? "pipe";
  cfg.breakpoints = old.breakpoints ?? cfg.breakpoints;
  const editorBorder = old.target === "editor-border";
  cfg.box.enabled = editorBorder;
  cfg.statusline.enabled = !editorBorder;
  // v1 icons were Nerd Font glyphs baked into segments; drop them so the icon set decides.
  for (const r of cfg.statusline.rows) {
    for (const pos of ["left", "center", "right"] as const) {
      for (const seg of r[pos]) delete seg.icon;
    }
  }
  return cfg;
}

function ensureIds(cfg: StatuslineConfig): void {
  let n = 1;
  const fix = (list: { id?: string }[]) => {
    for (const s of list) if (!s.id) s.id = `seg-${n++}`;
  };
  for (const list of Object.values(cfg.box.slots)) fix(list);
  for (const r of cfg.statusline.rows) {
    fix(r.left);
    fix(r.center);
    fix(r.right);
  }
}

export function loadConfig(): StatuslineConfig {
  const filePath = getConfigPath();
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      let cfg: StatuslineConfig | undefined;
      if (parsed?.version === 2 && parsed.box && parsed.statusline) {
        const base = clone(DEFAULT_CONFIG);
        cfg = {
          ...base,
          ...parsed,
          box: { ...base.box, ...parsed.box, slots: { ...base.box.slots, ...parsed.box.slots } },
          statusline: { ...base.statusline, ...parsed.statusline },
        };
      } else if (parsed?.version === 1) {
        cfg = migrateV1(parsed);
      }
      if (cfg) {
        ensureIds(cfg);
        return cfg;
      }
    }
  } catch (err) {
    console.warn("[pi-line] Failed to load statusline.json, using defaults:", err);
  }
  return clone(DEFAULT_CONFIG);
}

export function saveConfig(config: StatuslineConfig): void {
  const filePath = getConfigPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}
