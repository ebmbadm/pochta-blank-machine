# Локальный print-мост — дизайн

**Дата:** 2026-06-21
**Статус:** утверждён, готов к плану реализации
**Связано с:** [`2026-06-21-pochta-label-print-design.md`](2026-06-21-pochta-label-print-design.md)

## Цель

Дать прямое управление печатью этикеток из самого приложения (принтер, размер,
ориентация, копии, плотность, скорость) — без стандартного диалога печати
браузера. Браузер в песочнице не имеет доступа к драйверу, поэтому добавляем
**маленький локальный Node-сервис**, который отдаёт собранный UI и принимает
задания на печать, исполняя их через систему печати macOS (CUPS, команда `lp`).

## Контекст (факты о принтере, проверено через CUPS)

Очередь `LABEL__9X00` (USB, 203 dpi) принимает в задании, среди прочего:
`PageSize` (включая `Custom.WIDTHxHEIGHT`), `OP_Rotate` (0/1/2/3),
`OP_PrintDensity` (1–15), `OP_PrintSpeed` (1–12). Системный принтер по умолчанию —
`LABEL__9X00`. Также установлен `Brother_MFC_L2700DW_series`.

Приложение — статический экспорт (`output: "export"`, нет рантайм-сервера Next),
поэтому сервис может сам отдавать `out/`.

## Решения (зафиксированы при брейншторме)

1. **Режим запуска** — одна программа: локальный сервис отдаёт и UI, и печать
   (`http://localhost:8787`), всё same-origin (без CORS/mixed-content в основном
   сценарии).
2. **Контролы в UI** — выбор принтера, копии, ориентация (поворот), плотность +
   скорость. Размер уже есть в секции «Этикетка» → маппится в `PageSize=Custom`.
3. **Язык** — Node (тот же репозиторий/тулчейн; чистую логику тестируем vitest).
4. **Генерация PDF** — в браузере существующим `composeLabelPdf` (он уже работает
   в браузере); сервис получает готовый PDF и печатает. Сервис остаётся крошечным.
5. **Зависимости** — без новых рантайм-зависимостей: только Node built-ins
   (`node:http`, `node:child_process`, `node:fs`, `node:path`).

## Архитектура

```
Браузер (статический UI, отдаётся сервисом)
  │  1. composeLabelPdf → PDF (как сейчас)
  │  2. fetch POST /api/print  { pdfBase64, printer, copies, rotate, density, speed, widthMm, heightMm }
  ▼
print-server (Node, 127.0.0.1:8787)
  ├─ GET  /            → статика из out/ (zero-dep file handler)
  ├─ GET  /api/health  → { ok: true }
  ├─ GET  /api/printers→ [{ name, isDefault }]   (lpstat -e / -d)
  └─ POST /api/print   → temp-файл + execFile('lp', buildLpArgs(opts)) → { jobId }
```

PDF едет в JSON как base64 (этикетки крошечные, парсинг без сторонних библиотек).
`PageSize=Custom.WxHmm` дублирует уже точный размер PDF — чтобы драйвер не масштабировал.

### Структура файлов

| Файл | Ответственность |
|---|---|
| `print-server/lp.mjs` | Чистые/инфра-функции CUPS: `buildLpArgs(opts)` (чистая, тестируемая), `parsePrinters(lpstatE, lpstatD)` (чистая), `runLp(pdfPath, opts)` и `listPrinters()` (execFile-обёртки) |
| `print-server/static.mjs` | Zero-dep отдача `out/`: путь→файл, `index.html` для `/` и директорий (trailingSlash), MIME по расширению, защита от path-traversal |
| `print-server/server.mjs` | `node:http` сервер: роутинг `/api/*` + статика, CORS для localhost, лимит размера тела, запуск на `127.0.0.1:PRINT_PORT` |
| `print-server/lp.test.mjs` | Тесты `buildLpArgs` и `parsePrinters` |
| `print-server/static.test.mjs` | Тесты резолва путей/MIME/anti-traversal |
| `src/lib/print/printClient.ts` | Браузерный клиент: `printApiBase()`, `checkPrintService()`, `fetchPrinters()`, `sendPrintJob(pdfBytes, opts)` |
| `src/components/LabelSection.tsx` | (правка) контролы прямой печати + индикатор сервиса + fallback |
| `src/lib/layout/layoutModel.ts` | (правка) `PrintOptions` + поле `printOptions` |
| `src/state/useEditorState.ts` | (правка) prefs + `setPrintOption`, `printLabelDirect` |

## Сборка команды `lp` (ядро, чистая функция)

```
buildLpArgs({ printer, copies, rotate, density, speed, widthMm, heightMm, pdfPath })
→ [ "-d", printer,
    "-n", String(copies),
    "-o", `PageSize=Custom.${widthMm}x${heightMm}mm`,
    "-o", `OP_Rotate=${rotate}`,
    "-o", `OP_PrintDensity=${density}`,
    "-o", `OP_PrintSpeed=${speed}`,
    pdfPath ]
```

Все значения **валидируются** перед сборкой (см. «Безопасность»). Возможность
печати без `OP_*` (например на Brother) — вне scope; контролы `OP_*` рассчитаны на
термопринтер, для других очередей CUPS их проигнорирует.

## UI (расширение секции «Этикетка»)

- **Детект сервиса** (`GET /api/health` при монтировании + ссылка «обновить»):
  - доступен → блок прямой печати: выпадающий список **принтеров**
    (`/api/printers`, дефолт — системный), **копии**, **ориентация**
    (0/90/180/270° → `OP_Rotate` 0/1/2/3), **плотность** (1–15), **скорость**
    (1–12), кнопка **«Печать на принтер»**;
  - недоступен → подсказка «запустите `npm run print:server`» + остаются текущие
    кнопки браузерной печати/скачивания (graceful fallback).
- Размер — из существующих настроек этикетки (`model.label.widthMm/heightMm`).
- Ошибка печати → `toast` (как в текущем `handlePrint`).

## Состояние и prefs

```ts
export interface PrintOptions {
  printerName: string; // "" → системный по умолчанию
  copies: number;      // ≥1
  rotate: 0 | 1 | 2 | 3;
  density: number;     // 1..15
  speed: number;       // 1..12
}
```

- Поле `printOptions` в `LayoutModel`, дефолт `{ printerName:"", copies:1, rotate:0, density:8, speed:8 }`.
- В localStorage-prefs сохраняются `printerName/rotate/density/speed` (настройки под
  принтер); `copies` — по умолчанию 1, не персистится.
- `EditorApi`: `setPrintOption(key, value)`, `printLabelDirect()` (генерит PDF
  существующим `composeLabelPdf` → base64 → POST `/api/print`).
- `printers`/`serviceAvailable` — эфемерное состояние компонента (не модель).

## Безопасность

- Сервис слушает **только loopback** (`127.0.0.1`), не `0.0.0.0`.
- **Без shell**: `execFile('lp', args)` (массив аргументов, не строка).
- **Валидация всех опций** перед `buildLpArgs`:
  - `printer` — строго из списка `listPrinters()` (иначе 400);
  - `copies` — целое 1..99; `rotate` ∈ {0,1,2,3}; `density` — целое 1..15;
    `speed` — целое 1..12; `widthMm`/`heightMm` — числа в [20..200], округляются.
  - невалидное значение → HTTP 400, печать не запускается.
- CORS — только источники `http://localhost:*` и `http://127.0.0.1:*`.
- Лимит тела запроса (например 10 МБ).
- Temp-PDF создаётся в `os.tmpdir()` и удаляется после задания.

## Тестирование (vitest, Node)

- **Чистые:** `buildLpArgs` (формат `Custom.WxHmm`, порядок/наличие аргументов,
  что отклоняются значения вне диапазона), `parsePrinters` (парсинг вывода
  `lpstat -e`/`-d`, пометка дефолта), резолв путей в `static.mjs`
  (`/`→index.html, поддиректории, отказ при `..`-traversal, MIME).
- **Лёгкие RTL:** новые контролы рендерятся при доступном сервисе; fallback-режим
  без сервиса показывает подсказку и старые кнопки.
- **Вручную:** реальный запуск `lp` (печать на LABEL__9X00) и отдача статики.

Конфиг vitest должен подхватывать `print-server/**/*.test.mjs` (расширить `include`).

## Запуск

- `npm run print:server` — поднять сервис (читает `out/`; если нет — подсказать
  `npm run build`).
- `npm run app` — собрать `out/` (без basePath) + поднять сервис + открыть
  `http://localhost:8787` («одна команда»).
- В dev (`npm run dev` на :3000) клиент шлёт запросы на `http://localhost:8787`
  (CORS разрешён) — для разработки.

## Не-цели (YAGNI)

- Парсинг возможностей каждого принтера через `lpoptions -l` (берём фикс-диапазоны
  известного драйвера; контролы рассчитаны на термопринтер).
- Сырые TSPL/ESC-POS команды.
- Автозапуск сервиса (launchd-агент) — пока ручной `npm`-скрипт.
- Пакетная печать нескольких разных этикеток за один запрос.
- Печать с задеплоенного HTTPS-сайта (mixed-content) — используется локальный режим.
