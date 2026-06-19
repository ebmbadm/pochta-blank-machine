import type { NextConfig } from "next";
import path from "node:path";

// На GitHub Pages проект отдаётся с под-пути /<repo>/. basePath задаётся
// переменной окружения NEXT_PUBLIC_BASE_PATH на этапе сборки для деплоя.
// В dev переменная пуста → приложение работает с корня.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  // Статический экспорт (out/) — для хостинга на GitHub Pages.
  output: "export",
  ...(basePath ? { basePath } : {}),
  images: { unoptimized: true },
  trailingSlash: true,
  // Зафиксировать корень проекта (в домашней папке есть посторонний lockfile).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
