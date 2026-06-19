/**
 * Базовый путь приложения. На GitHub Pages проект живёт на под-пути
 * `/<repo>/`, поэтому к абсолютным ссылкам на статику (worker pdf.js, шрифты)
 * нужно добавлять этот префикс. Значение задаётся переменной окружения
 * NEXT_PUBLIC_BASE_PATH на этапе сборки (в dev пусто → корень).
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Добавляет базовый путь к абсолютной ссылке на статику. */
export function withBasePath(p: string): string {
  const path = p.startsWith("/") ? p : `/${p}`;
  return `${BASE_PATH}${path}`;
}
