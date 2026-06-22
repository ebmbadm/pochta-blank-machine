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
