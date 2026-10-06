# pi-line

An interactive visual layout builder and dual-surface statusline/border extension for [@earendil-works/pi-coding-agent](https://github.com/earendil-works/pi).

## Overview

Unlike extensions that require hand-editing JSON or relying on LLM tool prompts, `pi-line` provides a **keyboard-driven in-TUI visual editor** (`/statusline-edit`) with a live interactive preview pane to customize:

1. **Input Box Borders**: Embed real-time telemetry (Git branch, active model, thinking level, context gauges) directly into the typing box's top and bottom frames.
2. **Bottom Statusline (Footer)**: Configure multi-row statusline bars with left, center, and right alignments, custom separators, and box frames.
3. **Independent Surfaces**: Enable and customize either surface—or both simultaneously—without one interfering with the other.

---

## Features

- **Live In-TUI Visual Editor (`/statusline-edit`)**:
  - Live preview rendering both the typing box and bottom statusline together.
  - Interactive slot arrangement with instant cursor swapping.
  - Tabbed interface: `[Box]` ↔ `[Statusline]` ↔ `[Global]`.
  - Built-in responsive scroll keeping the interface usable on any terminal height.
- **Icon Set Selector**:
  - **`unicode`** (Default): Crisp, universally supported symbols (`⎇`, `●`, `◆`, `⚡`, `▸`, `◔`) that work on standard terminal fonts without missing glyph boxes.
  - **`ascii`**: Text-based tags (`git:`, `m:`, `ctx:`, `tok:`).
  - **`nerd`**: Nerd Font glyphs and Powerline transitions.
- **Context Gauges & Telemetry**:
  - Mini-gauges in block format (`■■□□□ 34%`), Braille (`⣿⣿⣀⣀`), or percentage.
  - Prompt cache metrics: hit ratio (`⚡47%`) and cache read tokens.
  - Live token counters (`↑42.1k ↓12.1k`) and running session financial spend.
  - Shared Git metadata updating reactively across turns without requiring external scripts.
- **Responsive Breakpoints**:
  - Set column thresholds (`compactBelow`, `hideOptionalBelow`).
  - Assign priority tiers (`P1` to `P5`) to automatically collapse or drop lower-priority segments on narrow terminals.
- **Dynamic Pub/Sub Metric Bus**:
  - Inject external metrics into the statusline from scripts or other extensions via `/statusline-metric <key> <value>` or the programmatic `setBusMetric(key, value)` API.

---

## Installation & Setup

To run `pi-line` in Pi:

```bash
pi -e /home/jay/Projects/pi-mods/pi-line/src/index.ts
```

Or install it into your Pi configuration (`~/.pi/agent/settings.json`):

```json
{
  "extensions": [
    "/home/jay/Projects/pi-mods/pi-line/src/index.ts"
  ]
}
```

---

## Keyboard Controls in `/statusline-edit`

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Switch tabs: **Box** ↔ **Statusline** ↔ **Global** |
| `↑` / `↓` | Navigate slots or settings rows |
| `←` / `→` | Select segments inside a slot (or cycle settings values) |
| `[` / `]` | Shift selected segment left / right |
| `m` | Move segment to the next slot |
| `p` | Cycle segment priority (`P1` - `P5`) |
| `c` | Cycle segment foreground color |
| `g` | Cycle segment background color |
| `i` | Toggle segment icon on/off |
| `a` | Add a new widget from the segment catalog |
| `d` / `x` | Delete selected segment |
| `n` *(Statusline tab)* | Add a new statusline row |
| `X` *(Statusline tab)* | Delete current statusline row |
| `s` | **Save & Apply** changes to `~/.pi/agent/statusline.json` |
| `Esc` | Cancel and discard changes |

---

## Configuration Schema (`~/.pi/agent/statusline.json`)

```json
{
  "version": 2,
  "icons": "unicode",
  "breakpoints": {
    "compactBelow": 85,
    "hideOptionalBelow": 65
  },
  "box": {
    "enabled": true,
    "border": "rounded",
    "slots": {
      "topLeft": [
        { "id": "b1", "type": "git_branch", "priority": 1, "color": "#a6e3a1" },
        { "id": "b2", "type": "cwd", "priority": 3, "color": "#89b4fa" }
      ],
      "topRight": [
        { "id": "b3", "type": "thinking_level", "priority": 2, "color": "#cba6f7" }
      ],
      "bottomLeft": [
        { "id": "b4", "type": "model_name", "priority": 1, "color": "#89b4fa" }
      ],
      "bottomRight": [
        { "id": "b5", "type": "context_gauge", "priority": 2, "style": "blocks", "color": "#a6e3a1" }
      ]
    }
  },
  "statusline": {
    "enabled": true,
    "border": "none",
    "separatorStyle": "pipe",
    "rows": [
      {
        "left": [
          { "id": "s1", "type": "session_cost", "priority": 1, "prefix": "$", "color": "#f38ba8" },
          { "id": "s2", "type": "token_usage", "priority": 2, "color": "#89b4fa" }
        ],
        "center": [],
        "right": [
          { "id": "s3", "type": "cache_hit", "priority": 3, "color": "#94e2d5" }
        ]
      }
    ]
  }
}
```

---

## Available Slash Commands

- `/statusline-edit`: Launch the visual interactive layout editor overlay.
- `/statusline-toggle`: Reload and re-apply `~/.pi/agent/statusline.json` immediately.
- `/statusline-metric <key> <value>`: Publish a metric to any `custom_bus` segment matching `key`.
