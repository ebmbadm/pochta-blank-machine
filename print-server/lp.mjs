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
