import { mkdir } from "node:fs/promises";
import path from "node:path";
import { singleton, inject } from "@elia/shared";
import { HubConfig } from "../config";
import { LogRouter } from "../logs/log-router";

@singleton()
export class StoreService {
  private readonly config = inject(HubConfig);
  private readonly logs = inject(LogRouter);
  #homeDir: string;

  constructor() {
    this.#homeDir = this.config.homeDir;
  }

  async init(): Promise<void> {
    const dir = this.#pluginsDir();
    await mkdir(dir, { recursive: true });
    const pkg = path.join(dir, "package.json");
    if (!(await Bun.file(pkg).exists())) {
      await Bun.write(pkg, JSON.stringify({ name: "elia-plugins", private: true, dependencies: {} }, null, 2));
    }
  }

  #pluginsDir(): string { return path.join(this.#homeDir, "plugins-node"); }

  async install(ref: string, wanted?: string): Promise<void> {
    const spec = wanted ? `${ref}@${wanted}` : ref;
    this.logs.info("install.start", { spec });
    const proc = Bun.spawn({ cmd: ["bun", "add", spec], cwd: this.#pluginsDir(), stdout: "pipe", stderr: "pipe" });
    await this.#pipeProc(proc, "install");
    if ((await proc.exited) !== 0) throw new Error(`Install failed`);
    this.logs.info("install.done", { spec });
  }

  async uninstall(ref: string): Promise<void> {
    this.logs.info("uninstall.start", { ref });
    const proc = Bun.spawn({ cmd: ["bun", "remove", ref], cwd: this.#pluginsDir(), stdout: "pipe", stderr: "pipe" });
    await this.#pipeProc(proc, "uninstall");
    if ((await proc.exited) !== 0) throw new Error(`Uninstall failed`);
    this.logs.info("uninstall.done", { ref });
  }

  resolveEntry(ref: string): string | null {
    try { return require.resolve(ref, { paths: [this.#pluginsDir()] }); }
    catch { return null; }
  }

  async #pipeProc(proc: ReturnType<typeof Bun.spawn>, tag: string): Promise<void> {
    const decoder = new TextDecoder();
    const read = async (stream: ReadableStream<Uint8Array> | null | undefined, level: "info" | "warn") => {
      if (!stream) return;
      const reader = stream.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const line = decoder.decode(value).trim();
        if (line) this.logs.emit({ ts: Date.now(), level, source: "installer", message: tag, meta: { line } });
      }
    };
    const stdout = proc.stdout as ReadableStream<Uint8Array> | null;
    const stderr = proc.stderr as ReadableStream<Uint8Array> | null;
    await Promise.all([read(stdout, "info"), read(stderr, "warn")]);
  }
}
