import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { type StatuslineConfig, DEFAULT_CONFIG } from "./types.js";

export function getConfigPath(): string {
  return path.join(os.homedir(), ".pi", "agent", "statusline.json");
}

export function loadConfig(): StatuslineConfig {
  const filePath = getConfigPath();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content) as StatuslineConfig;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.rows)) {
        // Ensure each segment has an id
        let counter = 1;
        for (const row of parsed.rows) {
          for (const pos of ["left", "center", "right"] as const) {
            for (const seg of row[pos] || []) {
              if (!seg.id) {
                seg.id = `seg-${counter++}`;
              }
            }
          }
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn("[pi-line] Failed to load statusline.json, falling back to default:", err);
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

export function saveConfig(config: StatuslineConfig): void {
  const filePath = getConfigPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}
