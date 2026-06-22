# Локальный print-мост — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Прямая печать этикеток из приложения (принтер, размер, ориентация, копии, плотность, скорость) через маленький локальный Node-сервис и `lp` (CUPS), минуя диалог браузера.

**Architecture:** Локальный сервис на `127.0.0.1:8787` отдаёт статический `out/` и принимает задания печати. Браузер генерирует PDF существующим `composeLabelPdf`, шлёт его (base64) + опции на `POST /api/print`; сервис пишет temp-файл и запускает `execFile('lp', …)`. Чистые функции (сборка аргументов `lp`, парсинг принтеров, резолв статики, валидация опций) покрыты vitest; HTTP-обвязка тестируется через инъекцию зависимостей.

**Tech Stack:** Node (ESM `.mjs`, только built-ins: `node:http`/`child_process`/`fs`/`path`/`crypto`/`os`), TypeScript (браузерный клиент), pdf-lib (уже есть), vitest.

**Spec:** [`docs/superpowers/specs/2026-06-21-local-print-bridge-design.md`](../specs/2026-06-21-local-print-bridge-design.md)

**Проверенные факты:**
- `lpstat -e` → имена очередей по строке; `lpstat -d` → `system default destination: LABEL__9X00`.
- `lp …` → stdout `request id is LABEL__9X00-42 (1 file(s))`.
- Драйвер LABEL__9X00 принимает `PageSize=Custom.WxHmm`, `OP_Rotate` 0–3, `OP_PrintDensity` 1–15, `OP_PrintSpeed` 1–12.
- vitest `include` сейчас: `["src/**/*.{test,spec}.{ts,tsx}"]`.

**Конвенции:** тесты рядом с модулем; импорты `@/…`; комментарии/UI на русском; коммит после каждой задачи с trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Не запускать dev-сервер/build, кроме шагов, где явно сказано.

---

## Task 1: `print-server/lp.mjs` — CUPS-логика (чистые функции + обёртки)

**Files:**
- Create: `print-server/lp.mjs`
- Test: `print-server/lp.test.mjs`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Расширить vitest `include`** (иначе `.mjs`-тесты в `print-server/` не находятся)

В `vitest.config.ts` заменить строку `include`:

```ts
    include: ["src/**/*.{test,spec}.{ts,tsx}", "print-server/**/*.test.mjs"],
```

- [ ] **Step 2: Тест**

```js
import { describe, it, expect } from "vitest";
import {
  buildLpArgs,
  parsePrinters,
  parseJobId,
  normalizePrintOptions,
} from "./lp.mjs";

describe("buildLpArgs", () => {
  it("собирает argv с размером, поворотом, плотностью, скоростью и путём", () => {
    const args = buildLpArgs({
      printer: "LABEL__9X00",
      copies: 2,
      rotate: 1,
      density: 10,
      speed: 8,
      widthMm: 58,
      heightMm: 40,
      pdfPath: "/tmp/a.pdf",
    });
    expect(args).toEqual([
      "-d", "LABEL__9X00",
      "-n", "2",
      "-o", "PageSize=Custom.58x40mm",
      "-o", "OP_Rotate=1",
      "-o", "OP_PrintDensity=10",
      "-o", "OP_PrintSpeed=8",
      "/tmp/a.pdf",
    ]);
  });
});

describe("parsePrinters", () => {
  it("парсит имена и помечает дефолт", () => {
    const e = "Brother_MFC_L2700DW_series\nLABEL__9X00\n";
    const d = "system default destination: LABEL__9X00";
    expect(parsePrinters(e, d)).toEqual([
      { name: "Brother_MFC_L2700DW_series", isDefault: false },
      { name: "LABEL__9X00", isDefault: true },
    ]);
  });
  it("без дефолта — все isDefault:false", () => {
    expect(parsePrinters("P1\n", "no default destination")).toEqual([
      { name: "P1", isDefault: false },
    ]);
  });
});

describe("parseJobId", () => {
  it("вытаскивает id задания", () => {
    expect(parseJobId("request id is LABEL__9X00-42 (1 file(s))")).toBe("LABEL__9X00-42");
  });
  it("null если не найдено", () => {
    expect(parseJobId("ничего")).toBeNull();
  });
});

describe("normalizePrintOptions", () => {
  const allowed = ["LABEL__9X00", "Brother_MFC_L2700DW_series"];
  it("валидирует принтер и зажимает диапазоны", () => {
    const r = normalizePrintOptions(
      { printer: "LABEL__9X00", copies: 999, rotate: 7, density: 99, speed: 0, widthMm: 5, heightMm: 9999 },
      allowed,
    );
    expect(r.ok).toBe(true);
    expect(r.opts).toEqual({
      printer: "LABEL__9X00",
      copies: 99,
      rotate: 0,
      density: 15,
      speed: 1,
      widthMm: 20,
      heightMm: 200,
    });
  });
  it("отклоняет неизвестный принтер", () => {
    const r = normalizePrintOptions({ printer: "evil", widthMm: 58, heightMm: 40 }, allowed);
    expect(r.ok).toBe(false);
  });
  it("отклоняет нечисловой размер", () => {
    const r = normalizePrintOptions({ printer: "LABEL__9X00", widthMm: "x", heightMm: 40 }, allowed);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Запустить — упадёт**

Run: `npm run test -- print-server/lp.test.mjs`
Expected: FAIL — модуль `./lp.mjs` не найден (тесты уже обнаруживаются после Step 1).

- [ ] **Step 4: Реализация**

```js
/**
 * CUPS-логика print-моста: сборка аргументов `lp`, парсинг принтеров и job id,
 * валидация опций. Чистые функции экспортируются для тестов; runLp/listPrinters —
 * тонкие обёртки над `execFile` (проверяются вручную).
 */
import { execFile } from "node:child_process";

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** Чистая: argv для `lp`. Значения должны быть уже нормализованы. */
export function buildLpArgs(o) {
  return [
    "-d", o.printer,
    "-n", String(o.copies),
    "-o", `PageSize=Custom.${o.widthMm}x${o.heightMm}mm`,
    "-o", `OP_Rotate=${o.rotate}`,
    "-o", `OP_PrintDensity=${o.density}`,
    "-o", `OP_PrintSpeed=${o.speed}`,
    o.pdfPath,
  ];
}

/** Чистая: [{name,isDefault}] из вывода `lpstat -e` и `lpstat -d`. */
export function parsePrinters(lpstatE, lpstatD) {
  const def = (/system default destination:\s*(\S+)/.exec(lpstatD || "") || [])[1] || null;
  return String(lpstatE || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, isDefault: name === def }));
}

/** Чистая: id задания из stdout `lp`. */
export function parseJobId(stdout) {
  const m = /request id is (\S+)/.exec(String(stdout || ""));
  return m ? m[1] : null;
}

/**
 * Чистая: проверка/нормализация опций печати. Принтер обязан быть в allowed.
 * Размеры обязаны быть числами. Остальное зажимается в безопасные диапазоны.
 */
export function normalizePrintOptions(raw, allowedPrinters) {
  const printer = typeof raw?.printer === "string" ? raw.printer : "";
  if (!allowedPrinters.includes(printer)) {
    return { ok: false, error: "Неизвестный принтер" };
  }
  const w = Number(raw?.widthMm);
  const h = Number(raw?.heightMm);
  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    return { ok: false, error: "Некорректный размер этикетки" };
  }
  const rotate = [0, 1, 2, 3].includes(Number(raw?.rotate)) ? Number(raw.rotate) : 0;
  return {
    ok: true,
    opts: {
      printer,
      copies: clampInt(raw?.copies, 1, 99, 1),
      rotate,
      density: clampInt(raw?.density, 1, 15, 8),
      speed: clampInt(raw?.speed, 1, 12, 8),
      widthMm: clampInt(w, 20, 200, 58),
      heightMm: clampInt(h, 20, 200, 40),
    },
  };
}

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });

/** Обёртка: список принтеров через lpstat (проверяется вручную). */
export async function listPrinters() {
  const [e, d] = await Promise.all([
    run("lpstat", ["-e"]).catch(() => ""),
    run("lpstat", ["-d"]).catch(() => ""),
  ]);
  return parsePrinters(e, d);
}

/** Обёртка: печать файла через lp (проверяется вручную). */
export async function runLp(pdfPath, opts) {
  const stdout = await run("lp", buildLpArgs({ ...opts, pdfPath }));
  return { jobId: parseJobId(stdout) };
}
```

- [ ] **Step 5: Запустить — пройдёт**

Run: `npm run test -- print-server/lp.test.mjs`
Expected: PASS (все describe-блоки).

- [ ] **Step 6: Commit**

```bash
git add print-server/lp.mjs print-server/lp.test.mjs vitest.config.ts
git commit -m "$(printf 'print-мост: CUPS-логика + vitest include для print-server\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: `print-server/static.mjs` — отдача статики (zero-dep)

**Files:**
- Create: `print-server/static.mjs`
- Test: `print-server/static.test.mjs`

- [ ] **Step 1: Тест**

```js
import { describe, it, expect } from "vitest";
import { resolveStaticPath, contentType } from "./static.mjs";

const ROOT = "/srv/out";

describe("resolveStaticPath", () => {
  it("/ → index.html в корне", () => {
    expect(resolveStaticPath("/", ROOT)).toBe("/srv/out/index.html");
  });
  it("директория со слешем → index.html внутри", () => {
    expect(resolveStaticPath("/sub/", ROOT)).toBe("/srv/out/sub/index.html");
  });
  it("файл отдаётся как есть", () => {
    expect(resolveStaticPath("/_next/app.js", ROOT)).toBe("/srv/out/_next/app.js");
  });
  it("отбрасывает query", () => {
    expect(resolveStaticPath("/a.js?v=1", ROOT)).toBe("/srv/out/a.js");
  });
  it("блокирует traversal (..)", () => {
    expect(resolveStaticPath("/../../etc/passwd", ROOT)).toBeNull();
  });
});

describe("contentType", () => {
  it("сопоставляет известные расширения", () => {
    expect(contentType("/x/app.js")).toBe("text/javascript; charset=utf-8");
    expect(contentType("/x/page.html")).toBe("text/html; charset=utf-8");
    expect(contentType("/x/f.svg")).toBe("image/svg+xml");
    expect(contentType("/x/f.ttf")).toBe("font/ttf");
  });
  it("неизвестное → octet-stream", () => {
    expect(contentType("/x/f.bin")).toBe("application/octet-stream");
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm run test -- print-server/static.test.mjs`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализация**

```js
/**
 * Zero-dep отдача статического экспорта (out/). Резолв URL→файл с защитой от
 * path-traversal и MIME по расширению. Реальное чтение файла — в serveStatic.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

export function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

/** URL-путь → абсолютный путь файла в root, либо null если выходит за root. */
export function resolveStaticPath(urlPath, rootDir) {
  const clean = decodeURIComponent((urlPath || "/").split("?")[0]);
  const rel = clean.endsWith("/") ? `${clean}index.html` : clean;
  const abs = path.join(rootDir, rel);
  const normRoot = path.resolve(rootDir);
  const normAbs = path.resolve(abs);
  if (normAbs !== normRoot && !normAbs.startsWith(normRoot + path.sep)) return null;
  return normAbs;
}

/** Отдаёт файл или 404. Возвращает true, если что-то отправлено. */
export async function serveStatic(req, res, rootDir) {
  const filePath = resolveStaticPath(req.url, rootDir);
  if (!filePath) {
    res.writeHead(403).end("Forbidden");
    return true;
  }
  try {
    const s = await stat(filePath);
    if (!s.isFile()) throw new Error("not a file");
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
  return true;
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `npm run test -- print-server/static.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add print-server/static.mjs print-server/static.test.mjs
git commit -m "$(printf 'print-мост: zero-dep отдача статики (resolve+MIME)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: `print-server/server.mjs` — HTTP-обвязка + запуск + vitest include

**Files:**
- Create: `print-server/server.mjs`, `print-server/start.mjs`
- Test: `print-server/server.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Тест (с инъекцией зависимостей, без реального `lp`)**

```js
// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "./server.mjs";

let server;
async function boot(deps) {
  server = createServer({ rootDir: "/nonexistent", deps });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}
afterEach(() => server && server.close());

const fakeDeps = {
  listPrinters: async () => [{ name: "LABEL__9X00", isDefault: true }],
  runLp: async () => ({ jobId: "LABEL__9X00-1" }),
};

describe("print-server", () => {
  it("GET /api/health → ok", async () => {
    const base = await boot(fakeDeps);
    const r = await fetch(`${base}/api/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("GET /api/printers → список", async () => {
    const base = await boot(fakeDeps);
    const r = await fetch(`${base}/api/printers`);
    expect(await r.json()).toEqual([{ name: "LABEL__9X00", isDefault: true }]);
  });

  it("POST /api/print с валидными опциями → jobId", async () => {
    const base = await boot(fakeDeps);
    const r = await fetch(`${base}/api/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfBase64: Buffer.from("%PDF-1.4 test").toString("base64"),
        printer: "LABEL__9X00", copies: 1, rotate: 0, density: 8, speed: 8,
        widthMm: 58, heightMm: 40,
      }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ jobId: "LABEL__9X00-1" });
  });

  it("POST /api/print с чужим принтером → 400", async () => {
    const base = await boot(fakeDeps);
    const r = await fetch(`${base}/api/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfBase64: "AA==", printer: "evil", widthMm: 58, heightMm: 40 }),
    });
    expect(r.status).toBe(400);
  });

  it("CORS preflight для localhost → разрешён", async () => {
    const base = await boot(fakeDeps);
    const r = await fetch(`${base}/api/print`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST" },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm run test -- print-server/server.test.mjs`
Expected: FAIL (модуль не найден).

- [ ] **Step 3a: Реализация `print-server/server.mjs`**

```js
/**
 * HTTP-обвязка print-моста (node:http, только loopback). Роутинг /api/* + статика.
 * Зависимости (listPrinters/runLp) инъектируются — для тестов без реального lp.
 */
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";

import { listPrinters as realListPrinters, runLp as realRunLp, normalizePrintOptions } from "./lp.mjs";
import { serveStatic } from "./static.mjs";

const MAX_BODY = 10 * 1024 * 1024; // 10 МБ

function allowedOrigin(origin) {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function createServer({ rootDir, deps = {} }) {
  const listPrinters = deps.listPrinters || realListPrinters;
  const runLp = deps.runLp || realRunLp;

  return http.createServer(async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const url = (req.url || "/").split("?")[0];

    if (req.method === "GET" && url === "/api/health") {
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && url === "/api/printers") {
      try {
        json(res, 200, await listPrinters());
      } catch {
        json(res, 500, { error: "lpstat failed" });
      }
      return;
    }
    if (req.method === "POST" && url === "/api/print") {
      let tmp;
      try {
        const body = await readBody(req);
        const raw = JSON.parse(body.toString("utf8"));
        const allowed = (await listPrinters()).map((p) => p.name);
        const norm = normalizePrintOptions(raw, allowed);
        if (!norm.ok) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end(norm.error);
          return;
        }
        const pdf = Buffer.from(String(raw.pdfBase64 || ""), "base64");
        if (pdf.length === 0) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Пустой PDF");
          return;
        }
        tmp = path.join(os.tmpdir(), `pochta-label-${randomUUID()}.pdf`);
        await writeFile(tmp, pdf);
        const { jobId } = await runLp(tmp, norm.opts);
        json(res, 200, { jobId });
      } catch (e) {
        json(res, 500, { error: e instanceof Error ? e.message : "print failed" });
      } finally {
        if (tmp) unlink(tmp).catch(() => {});
      }
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res, rootDir);
      return;
    }
    res.writeHead(404).end("Not found");
  });
}
```

- [ ] **Step 3b: Реализация `print-server/start.mjs`**

```js
/**
 * Запуск print-моста. `node print-server/start.mjs [--open]`.
 * Порт: PRINT_PORT или 8787. Отдаёт ./out (собранный статический экспорт).
 */
import path from "node:path";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "./server.mjs";

const PORT = Number(process.env.PRINT_PORT) || 8787;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");

if (!existsSync(rootDir)) {
  console.error("Нет каталога out/. Сначала: npm run build");
  process.exit(1);
}

const server = createServer({ rootDir });
server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`▶ print-мост: ${url} (Ctrl+C — остановить)`);
  if (process.argv.includes("--open")) execFile("open", [url]);
});
```

- [ ] **Step 3c: Добавить скрипты в `package.json`** (в блок `scripts`, после `"deploy": ...`):

```json
    "print:server": "node print-server/start.mjs",
    "app": "npm run build && node print-server/start.mjs --open"
```

(Не забудь запятую после предыдущего пункта.)

- [ ] **Step 4: Запустить — пройдёт**

Run: `npm run test -- print-server/server.test.mjs`
Expected: PASS (5 тестов). Затем полный прогон: `npm run test` — все зелёные, vitest теперь видит `print-server/**`.

- [ ] **Step 5: Commit**

```bash
git add print-server/server.mjs print-server/start.mjs print-server/server.test.mjs package.json
git commit -m "$(printf 'print-мост: HTTP-сервер (health/printers/print) + запуск + vitest include\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4: `src/lib/print/printClient.ts` — браузерный клиент

**Files:**
- Create: `src/lib/print/printClient.ts`
- Test: `src/lib/print/printClient.test.ts`

- [ ] **Step 1: Тест**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveApiBase,
  bytesToBase64,
  checkPrintService,
  sendPrintJob,
} from "./printClient";

afterEach(() => vi.restoreAllMocks());

describe("resolveApiBase", () => {
  it("dev (:3000) → абсолютный localhost:8787", () => {
    expect(resolveApiBase("3000")).toBe("http://localhost:8787");
  });
  it("served (:8787 или иной) → относительный путь", () => {
    expect(resolveApiBase("8787")).toBe("");
    expect(resolveApiBase("")).toBe("");
  });
});

describe("bytesToBase64", () => {
  it("кодирует байты", () => {
    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe("SGk=");
  });
});

describe("checkPrintService", () => {
  it("true при ok:true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ));
    expect(await checkPrintService()).toBe(true);
  });
  it("false при сетевой ошибке", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await checkPrintService()).toBe(false);
  });
});

describe("sendPrintJob", () => {
  it("POST'ит base64 PDF и опции, возвращает jobId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jobId: "X-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendPrintJob(new Uint8Array([1, 2, 3]), {
      printerName: "LABEL__9X00", copies: 2, rotate: 1, density: 10, speed: 8,
      widthMm: 58, heightMm: 40,
    });
    expect(res).toEqual({ jobId: "X-1" });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.printer).toBe("LABEL__9X00");
    expect(body.copies).toBe(2);
    expect(typeof body.pdfBase64).toBe("string");
  });
  it("бросает при не-ok ответе", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("нет", { status: 400 })));
    await expect(
      sendPrintJob(new Uint8Array([1]), {
        printerName: "P", copies: 1, rotate: 0, density: 8, speed: 8, widthMm: 58, heightMm: 40,
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm run test -- src/lib/print/printClient.test.ts`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализация**

```ts
/**
 * Браузерный клиент print-моста. В served-режиме (страницу отдаёт сам сервис)
 * используются относительные пути; в dev (next dev на :3000) — абсолютный
 * localhost:8787.
 */

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
}

export interface PrintJobOptions {
  printerName: string;
  copies: number;
  rotate: 0 | 1 | 2 | 3;
  density: number;
  speed: number;
  widthMm: number;
  heightMm: number;
}

/** Чистая: базовый URL API по текущему порту страницы. */
export function resolveApiBase(port: string): string {
  return port === "3000" ? "http://localhost:8787" : "";
}

function apiBase(): string {
  if (typeof window === "undefined") return "";
  return resolveApiBase(window.location.port);
}

/** Чистая: Uint8Array → base64 (для небольших PDF этикеток). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function checkPrintService(): Promise<boolean> {
  try {
    const r = await fetch(`${apiBase()}/api/health`);
    if (!r.ok) return false;
    const j = await r.json();
    return j?.ok === true;
  } catch {
    return false;
  }
}

export async function fetchPrinters(): Promise<PrinterInfo[]> {
  const r = await fetch(`${apiBase()}/api/printers`);
  if (!r.ok) throw new Error("Не удалось получить список принтеров");
  return (await r.json()) as PrinterInfo[];
}

export async function sendPrintJob(
  pdf: Uint8Array,
  opts: PrintJobOptions,
): Promise<{ jobId: string }> {
  const r = await fetch(`${apiBase()}/api/print`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pdfBase64: bytesToBase64(pdf),
      printer: opts.printerName,
      copies: opts.copies,
      rotate: opts.rotate,
      density: opts.density,
      speed: opts.speed,
      widthMm: opts.widthMm,
      heightMm: opts.heightMm,
    }),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(msg || "Печать не удалась");
  }
  return (await r.json()) as { jobId: string };
}
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `npm run test -- src/lib/print/printClient.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/print/printClient.ts src/lib/print/printClient.test.ts
git commit -m "$(printf 'print-мост: браузерный клиент (health/printers/sendPrintJob)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5: Модель — `PrintOptions` в `LayoutModel`

**Files:**
- Modify: `src/lib/layout/layoutModel.ts`
- Test: `src/lib/layout/layoutModel.test.ts`

- [ ] **Step 1: Тест** — добавить в `src/lib/layout/layoutModel.test.ts`:

```ts
import { describe as describe2, it as it2, expect as expect2 } from "vitest";
import { createDefaultLayout as cdl } from "./layoutModel";

describe2("createDefaultLayout printOptions", () => {
  it2("включает дефолтные опции печати", () => {
    expect2(cdl().printOptions).toEqual({
      printerName: "",
      copies: 1,
      rotate: 0,
      density: 8,
      speed: 8,
    });
  });
});
```

(Если в файле уже импортированы `describe/it/expect` и `createDefaultLayout` — используй их и не добавляй алиасы; этот блок самодостаточен на случай чтения вне порядка.)

- [ ] **Step 2: Запустить — упадёт**

Run: `npm run test -- src/lib/layout/layoutModel.test.ts`
Expected: FAIL (`printOptions` undefined).

- [ ] **Step 3: Реализация** — в `src/lib/layout/layoutModel.ts`:

Добавить тип (после `LabelConfig`):

```ts
export interface PrintOptions {
  /** Имя CUPS-очереди; "" → выбрать системный по умолчанию в UI. */
  printerName: string;
  copies: number;
  rotate: 0 | 1 | 2 | 3;
  density: number;
  speed: number;
}
```

В `LayoutModel` добавить поле (после `label: LabelConfig;`):

```ts
  /** Опции прямой печати на принтер (CUPS). */
  printOptions: PrintOptions;
```

В `createDefaultLayout`, в возвращаемый объект (после `label: { ... },`):

```ts
    printOptions: { printerName: "", copies: 1, rotate: 0, density: 8, speed: 8 },
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `npm run test -- src/lib/layout/ && npm run typecheck`
Expected: PASS (существующие тесты используют `createDefaultLayout` — не ломаются).

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/layoutModel.ts src/lib/layout/layoutModel.test.ts
git commit -m "$(printf 'Модель: добавить PrintOptions в LayoutModel\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 6: Состояние — prefs + `setPrintOption` + `printLabelDirect`

**Files:**
- Modify: `src/state/useEditorState.ts`

- [ ] **Step 1: Импорты + `EditorApi`**

Добавить импорты:

```ts
import { sendPrintJob } from "@/lib/print/printClient";
```

В импорт типов из `@/lib/layout/layoutModel` добавить `type PrintOptions`.

В интерфейс `EditorApi` добавить (после `printLabel(action: "download" | "print"): Promise<void>;`):

```ts
  setPrintOption<K extends keyof PrintOptions>(key: K, value: PrintOptions[K]): void;
  printLabelDirect(): Promise<void>;
```

- [ ] **Step 2: Prefs**

В `interface Prefs` добавить:

```ts
  printerName: string;
  rotate: 0 | 1 | 2 | 3;
  density: number;
  speed: number;
```

В `writePrefs` (объект `prefs`) добавить:

```ts
      printerName: model.printOptions.printerName,
      rotate: model.printOptions.rotate,
      density: model.printOptions.density,
      speed: model.printOptions.speed,
```

В `buildInitialModel`, внутри `if (prefs) { ... }` (после восстановления `label`), добавить:

```ts
    model = {
      ...model,
      printOptions: {
        ...model.printOptions,
        printerName: typeof prefs.printerName === "string" ? prefs.printerName : "",
        rotate: [0, 1, 2, 3].includes(prefs.rotate as number)
          ? (prefs.rotate as 0 | 1 | 2 | 3)
          : 0,
        density: typeof prefs.density === "number" ? prefs.density : 8,
        speed: typeof prefs.speed === "number" ? prefs.speed : 8,
      },
    };
```

- [ ] **Step 3: Методы + возврат**

Перед `exportPdf` добавить:

```ts
  const setPrintOption = useCallback(
    (key, value) =>
      updateModel((m) => ({ ...m, printOptions: { ...m.printOptions, [key]: value } })),
    [updateModel],
  ) as EditorApi["setPrintOption"];

  const printLabelDirect = useCallback(async () => {
    if (!model.trackingNumber || !validateBarcodeValue(model.trackingNumber).ok) return;
    setExporting(true);
    try {
      const fonts = await loadExportFonts(BASE_PATH);
      const pdfBytes = await composeLabelPdf({
        trackingNumber: model.trackingNumber,
        label: { widthMm: model.label.widthMm, heightMm: model.label.heightMm },
        fonts: { regular: fonts.regular },
      });
      await sendPrintJob(pdfBytes, {
        printerName: model.printOptions.printerName,
        copies: model.printOptions.copies,
        rotate: model.printOptions.rotate,
        density: model.printOptions.density,
        speed: model.printOptions.speed,
        widthMm: model.label.widthMm,
        heightMm: model.label.heightMm,
      });
    } catch (e) {
      console.error(e);
      throw e instanceof Error ? e : new Error("Ошибка прямой печати");
    } finally {
      setExporting(false);
    }
  }, [model]);
```

В возвращаемом объекте (после `printLabel,`) добавить:

```ts
    setPrintOption,
    printLabelDirect,
```

- [ ] **Step 4: Проверка**

Run: `npm run typecheck && npm run test`
Expected: typecheck PASS; тесты зелёные (UI ещё не использует методы — подключим в Task 7).

- [ ] **Step 5: Commit**

```bash
git add src/state/useEditorState.ts
git commit -m "$(printf 'Состояние: prefs печати + setPrintOption/printLabelDirect\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 7: UI — прямая печать в `LabelSection`

**Files:**
- Modify: `src/components/LabelSection.tsx`, `src/components/LabelSection.test.tsx`
- Modify: `src/components/ControlsPanel.test.tsx`

- [ ] **Step 1: Обновить моки + новый тест**

В `src/components/LabelSection.test.tsx`, в объект `makeApi` (после `printLabel: ...`), добавить:

```ts
    setPrintOption: vi.fn(),
    printLabelDirect: vi.fn().mockResolvedValue(undefined),
```

Добавить тест (сервис недоступен в jsdom → виден fallback-подсказка; браузерные кнопки остаются):

```ts
  it("без сервиса печати показывает подсказку запустить его", async () => {
    render(<LabelSection api={makeApi()} />);
    expect(await screen.findByText(/print:server/i)).toBeInTheDocument();
  });
```

В `src/components/ControlsPanel.test.tsx`, в `makeApi` (после `printLabel: ...` или рядом с label-моками), добавить:

```ts
    setPrintOption: vi.fn(),
    printLabelDirect: vi.fn().mockResolvedValue(undefined),
```

- [ ] **Step 2: Запустить — упадёт**

Run: `npm run test -- src/components/LabelSection.test.tsx`
Expected: FAIL на новом тесте (нет текста про `print:server`).

- [ ] **Step 3: Реализация** — заменить содержимое `src/components/LabelSection.tsx` на:

```tsx
"use client";

/**
 * LabelSection — печать трек-кода на термоэтикетке. Потребляет EditorApi.
 * Размер (пресеты + ручной ввод), мини-предпросмотр, индикатор читаемости,
 * браузерная печать/скачивание и — при запущенном локальном сервисе —
 * прямая печать на принтер с контролем принтера/копий/поворота/плотности/скорости.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { Download, Loader2, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import type { EditorApi } from "@/state/useEditorState";
import { LABEL_PRESETS, LABEL_MIN_MM, LABEL_MAX_MM } from "@/lib/layout/labelPresets";
import { barcodeToSvg, validateBarcodeValue } from "@/lib/barcode/generateBarcode";
import { captureBarcodeGeometry } from "@/lib/barcode/barcodeGeometry";
import {
  computeXDimensionMm,
  classifyReadability,
  type Readability,
} from "@/lib/render/exportLabelPdf";
import {
  checkPrintService,
  fetchPrinters,
  type PrinterInfo,
} from "@/lib/print/printClient";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const READABILITY_UI: Record<Readability, { text: string; className: string }> = {
  good: { text: "хорошо", className: "text-emerald-600" },
  marginal: { text: "на грани", className: "text-amber-600" },
  poor: { text: "мелко, может не сканироваться", className: "text-postal-red" },
};

const ROTATE_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: "0°",
  1: "90°",
  2: "180°",
  3: "270°",
};

interface LabelSectionProps {
  api: EditorApi;
}

export function LabelSection({ api }: LabelSectionProps) {
  const { model, exporting } = api;
  const widthId = useId();
  const heightId = useId();

  const tracking = model.trackingNumber;
  const valid = tracking.length > 0 && validateBarcodeValue(tracking).ok;

  const [serviceUp, setServiceUp] = useState<boolean | null>(null);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);

  async function refreshService() {
    const up = await checkPrintService();
    setServiceUp(up);
    if (up) {
      try {
        const list = await fetchPrinters();
        setPrinters(list);
        if (!model.printOptions.printerName) {
          const def = list.find((p) => p.isDefault) ?? list[0];
          if (def) api.setPrintOption("printerName", def.name);
        }
      } catch {
        setPrinters([]);
      }
    }
  }

  useEffect(() => {
    void refreshService();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const barcodeSvg = useMemo(() => {
    if (!valid) return null;
    try {
      return barcodeToSvg(tracking, { includeText: true });
    } catch {
      return null;
    }
  }, [tracking, valid]);

  const barcodeSrc = barcodeSvg
    ? "data:image/svg+xml;utf8," + encodeURIComponent(barcodeSvg)
    : null;

  const readability = useMemo(() => {
    if (!valid) return null;
    try {
      const geom = captureBarcodeGeometry(tracking);
      const xDim = computeXDimensionMm(model.label.widthMm, geom.moduleCount);
      return { xDim, level: classifyReadability(xDim) };
    } catch {
      return null;
    }
  }, [tracking, valid, model.label.widthMm]);

  const handleBrowser = (action: "download" | "print") => {
    api.printLabel(action).catch(() => toast.error("Не удалось создать этикетку"));
  };
  const handleDirect = () => {
    api
      .printLabelDirect()
      .then(() => toast.success("Отправлено на принтер"))
      .catch(() => toast.error("Прямая печать не удалась"));
  };

  const po = model.printOptions;

  return (
    <section>
      <h3 className="stamp-label mb-3">Этикетка (термопринтер)</h3>

      {/* Пресеты размера */}
      <div className="grid grid-cols-3 gap-1.5">
        {LABEL_PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={model.label.preset === p.id ? "default" : "outline"}
            onClick={() => api.setLabelPreset(p.id)}
            aria-pressed={model.label.preset === p.id}
            className="py-4 font-mono text-xs"
          >
            {p.title}
          </Button>
        ))}
      </div>

      {/* Ручной ввод Ш×В */}
      <div className="mt-3 flex items-center gap-2">
        <label htmlFor={widthId} className="text-xs text-muted-foreground">Ш</label>
        <Input
          id={widthId}
          type="number"
          inputMode="numeric"
          min={LABEL_MIN_MM}
          max={LABEL_MAX_MM}
          aria-label="Ширина этикетки в миллиметрах"
          value={model.label.widthMm}
          onChange={(e) => api.setLabelSize(Number(e.target.value), model.label.heightMm)}
          className="w-16 text-right font-mono tabular-nums"
        />
        <span className="text-xs text-muted-foreground">×</span>
        <label htmlFor={heightId} className="text-xs text-muted-foreground">В</label>
        <Input
          id={heightId}
          type="number"
          inputMode="numeric"
          min={LABEL_MIN_MM}
          max={LABEL_MAX_MM}
          aria-label="Высота этикетки в миллиметрах"
          value={model.label.heightMm}
          onChange={(e) => api.setLabelSize(model.label.widthMm, Number(e.target.value))}
          className="w-16 text-right font-mono tabular-nums"
        />
        <span className="font-mono text-xs text-muted-foreground">мм</span>
      </div>

      {/* Мини-предпросмотр */}
      <div className="mt-3">
        <div
          className="mx-auto flex items-center justify-center overflow-hidden rounded-sm border border-foreground/15 bg-white p-[6%]"
          style={{
            aspectRatio: `${model.label.widthMm} / ${model.label.heightMm}`,
            maxWidth: "min(100%, 260px)",
          }}
        >
          {barcodeSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={barcodeSrc}
              alt={`Штрих-код ${tracking}`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-xs text-muted-foreground">введите трек-номер</span>
          )}
        </div>
      </div>

      {/* Индикатор читаемости */}
      {readability && (
        <p className="mt-2 text-center text-xs">
          <Badge variant="outline" className="font-mono">
            X-dim ≈ {readability.xDim.toFixed(2)} мм
          </Badge>{" "}
          <span className={READABILITY_UI[readability.level].className}>
            {READABILITY_UI[readability.level].text}
          </span>
        </p>
      )}

      {/* Браузерная печать (всегда доступна) */}
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleBrowser("print")}
          disabled={!valid || exporting}
          className="grow"
        >
          {exporting ? <Loader2 className="animate-spin" /> : <Printer />}
          Печать этикетки
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleBrowser("download")}
          disabled={!valid || exporting}
        >
          {exporting ? <Loader2 className="animate-spin" /> : <Download />}
          Скачать
        </Button>
      </div>

      {/* Прямая печать (если сервис запущен) */}
      <div className="mt-4 border-t pt-3">
        {serviceUp ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="stamp-label">Прямая печать</span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => void refreshService()}
                aria-label="Обновить список принтеров"
                title="Обновить"
              >
                <RefreshCw />
              </Button>
            </div>

            <label className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Принтер</span>
              <select
                aria-label="Принтер"
                value={po.printerName}
                onChange={(e) => api.setPrintOption("printerName", e.target.value)}
                className="grow rounded-md border bg-background px-2 py-1 font-mono text-xs"
              >
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.isDefault ? " (по умолчанию)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Копии</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  aria-label="Копии"
                  value={po.copies}
                  onChange={(e) =>
                    api.setPrintOption("copies", Math.max(1, Number(e.target.value) || 1))
                  }
                  className="w-16 text-right font-mono tabular-nums"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Поворот</span>
                <select
                  aria-label="Ориентация"
                  value={po.rotate}
                  onChange={(e) =>
                    api.setPrintOption("rotate", Number(e.target.value) as 0 | 1 | 2 | 3)
                  }
                  className="rounded-md border bg-background px-2 py-1 font-mono text-xs"
                >
                  {([0, 1, 2, 3] as const).map((r) => (
                    <option key={r} value={r}>{ROTATE_LABELS[r]}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Плотность</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={15}
                  aria-label="Плотность"
                  value={po.density}
                  onChange={(e) => api.setPrintOption("density", Number(e.target.value) || 8)}
                  className="w-16 text-right font-mono tabular-nums"
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Скорость</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={12}
                  aria-label="Скорость"
                  value={po.speed}
                  onChange={(e) => api.setPrintOption("speed", Number(e.target.value) || 8)}
                  className="w-16 text-right font-mono tabular-nums"
                />
              </label>
            </div>

            <Button
              type="button"
              variant="default"
              onClick={handleDirect}
              disabled={!valid || exporting || !po.printerName}
              className="mt-3 w-full"
            >
              {exporting ? <Loader2 className="animate-spin" /> : <Printer />}
              Печать напрямую
            </Button>
          </>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            Прямая печать: запустите{" "}
            <code className="rounded bg-muted px-1 font-mono">npm run print:server</code>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => void refreshService()}
              aria-label="Проверить сервис печати снова"
              title="Проверить снова"
            >
              <RefreshCw />
            </Button>
          </p>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Прямая печать управляет размером/ориентацией/плотностью без диалога браузера.
      </p>
    </section>
  );
}

export default LabelSection;
```

- [ ] **Step 4: Запустить — пройдёт**

Run: `npm run test -- src/components/ && npm run typecheck`
Expected: PASS. (`checkPrintService` в jsdom без сервиса вернёт false → виден fallback с `print:server`; существующие тесты про пресеты/«Печать этикетки» проходят, т.к. браузерные кнопки на месте.)

- [ ] **Step 5: Commit**

```bash
git add src/components/LabelSection.tsx src/components/LabelSection.test.tsx src/components/ControlsPanel.test.tsx
git commit -m "$(printf 'UI: прямая печать на принтер в LabelSection (контролы + fallback)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 8: Финальная проверка

**Files:** —

- [ ] **Step 1: Полный прогон**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: всё зелёное (предсуществующие lint-ошибки только в `public/pdf.worker.min.mjs`).

- [ ] **Step 2: Сборка**

Run: `npm run build`
Expected: успешный статический экспорт.

- [ ] **Step 3: Ручная проверка прямой печати**

```bash
npm run app   # соберёт out/ + поднимет сервис + откроет http://localhost:8787
```
В браузере: загрузить `samples/sample-blank.pdf`, проверить секцию «Этикетка» → «Прямая печать»:
- список принтеров содержит LABEL__9X00 (по умолчанию);
- задать копии/поворот/плотность/скорость;
- «Печать напрямую» → этикетка печатается на термопринтере без диалога;
- toast «Отправлено на принтер».
Остановить: Ctrl+C. Проверить fallback: открыть `npm run dev` (:3000) без сервиса — виден текст про `npm run print:server`.

- [ ] **Step 4: Commit (если были правки)**

```bash
git add -A && git commit -m "$(printf 'print-мост: финальная проверка\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Самопроверка плана

**Покрытие спеки:**
- Локальный сервис отдаёт UI + печать (одна программа) → Task 3 (server+static+start).
- Контролы: принтер/копии/ориентация/плотность/скорость → Task 7; маппинг в `lp` → Task 1.
- Размер из секции «Этикетка» → `PageSize=Custom` → Task 1 (buildLpArgs) + Task 6 (печатает с `model.label`).
- PDF генерится в браузере (`composeLabelPdf`) → Task 6 (`printLabelDirect`).
- Без новых рантайм-зависимостей (Node built-ins) → Task 1–3.
- Endpoints health/printers/print → Task 3; браузерный клиент → Task 4.
- Состояние/prefs → Task 5, 6.
- Безопасность: loopback, execFile без shell, валидация, CORS только localhost, лимит тела, temp-файл с удалением → Task 1 (normalize), Task 3 (cors/limit/tmp).
- Тесты (чистые + DI-сервер + клиент + RTL) → Task 1–4, 7.
- Запуск `print:server`/`app` → Task 3.

**Согласованность типов/имён:** `PrintOptions` (Task 5) → `useEditorState` (Task 6) и `LabelSection` (Task 7). `PrintJobOptions`/`PrinterInfo`/`sendPrintJob`/`checkPrintService`/`fetchPrinters`/`resolveApiBase`/`bytesToBase64` (Task 4) → используются в Task 6, 7. `buildLpArgs`/`parsePrinters`/`parseJobId`/`normalizePrintOptions`/`listPrinters`/`runLp` (Task 1) → используются `server.mjs` (Task 3). `createServer({rootDir,deps})` (Task 3) → используется тестом и `start.mjs`. `resolveStaticPath`/`contentType`/`serveStatic` (Task 2) → `server.mjs` (Task 3).

**Заглушек нет:** весь код приведён целиком; форматы вывода `lp`/`lpstat` и опции драйвера проверены на реальном принтере.

