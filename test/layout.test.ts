import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { saveConfig } from "../src/config.js";
import { DEFAULT_CONFIG } from "../src/types.js";

type FooterFactory = NonNullable<Parameters<ExtensionContext["ui"]["setFooter"]>[0]>;
type Command = { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> };

test("disabled statusline hides the footer on startup and after re-applying the layout", async () => {
  const home = mkdtempSync(join(tmpdir(), "pi-line-test-"));
  const oldHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const config = structuredClone(DEFAULT_CONFIG);
    config.statusline.enabled = false;
    saveConfig(config);
    const { default: extension } = await import("../src/index.js");

    const events = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
    const commands = new Map<string, Command>();
    const pi = {
      on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => void) => events.set(name, handler),
      registerCommand: (name: string, command: Command) => commands.set(name, command),
      exec: async () => ({ code: 1, stdout: "", stderr: "" }),
    } as unknown as ExtensionAPI;
    let factory: FooterFactory | undefined;
    let editorFactory: unknown;
    const ctx = {
      cwd: home,
      ui: {
        setFooter: (value: FooterFactory | undefined) => { factory = value; },
        setEditorComponent: (value: unknown) => { editorFactory = value; },
        notify() {},
      },
    } as unknown as ExtensionCommandContext;
    extension(pi);
    events.get("session_start")!(undefined, ctx);

    const makeFooter = () => {
      assert.ok(factory, "must not restore Pi's default footer with undefined");
      return factory(
        { requestRender() {} } as Parameters<FooterFactory>[0],
        {} as Parameters<FooterFactory>[1],
        { onBranchChange: () => () => {} } as Parameters<FooterFactory>[2],
      );
    };
    assert.deepEqual(makeFooter().render(80), []);
    assert.ok(editorFactory, "typing-box customization remains enabled");

    config.statusline.enabled = true;
    saveConfig(config);
    await commands.get("statusline-toggle")!.handler("", ctx);
    const enabledFooter = makeFooter();
    assert.ok(enabledFooter.render(80).length > 0);
    enabledFooter.dispose?.();

    config.statusline.enabled = false;
    saveConfig(config);
    await commands.get("statusline-toggle")!.handler("", ctx);
    for (const width of [30, 80, 120]) assert.deepEqual(makeFooter().render(width), []);
    assert.ok(editorFactory);
    events.get("session_shutdown")!(undefined, ctx);
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    rmSync(home, { recursive: true, force: true });
  }
});
