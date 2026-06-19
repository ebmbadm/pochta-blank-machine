/**
 * Браузерные утилиты для загрузки PDF-бланка с pochta.ru.
 *
 * Этот модуль предназначен ТОЛЬКО для браузера: он импортируется из клиентских
 * компонентов. Он отдаёт всё, что нужно остальным модулям:
 *  - исходные байты файла (для pdf-lib — сборка/экспорт нового PDF);
 *  - документ pdf.js (для рендера предпросмотра и чтения текстового слоя);
 *  - вспомогательные функции рендера страницы в canvas и извлечения текста.
 *
 * Координаты: pdf.js viewport со `scale: 1` использует единицы PDF — пункты (pt).
 * Эти величины (pageWidthPt/pageHeightPt) совместимы с pdf-lib.
 */

import type {
  PDFDocumentProxy,
  TextItem,
  TextMarkedContent,
} from "pdfjs-dist/types/src/display/api";
import { withBasePath } from "@/lib/basePath";

// pdf.js импортируется ДИНАМИЧЕСКИ внутри браузерных функций. Статический импорт
// подтягивает браузерные глобалы (DOMMatrix и т.п.) на этапе загрузки модуля и
// ломает SSR / Node-окружение юнит-тестов. Тип импорта берётся отдельно (стирается
// при компиляции), поэтому он безопасен.
type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/** Лениво загружает модуль pdf.js (только в браузере). */
async function getPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import("pdfjs-dist");
  return pdfjsPromise;
}

/** Результат загрузки исходного PDF, общий для pdf-lib и pdf.js. */
export interface LoadedSource {
  /** Нетронутые байты исходного файла — отдаются в pdf-lib как есть. */
  bytes: Uint8Array;
  /** Документ pdf.js для рендера и чтения текста. */
  pdfjsDoc: PDFDocumentProxy;
  /** Число страниц в документе. */
  numPages: number;
}

/** Результат рендера одной страницы в canvas. */
export interface RenderedPage {
  /** Готовый canvas с отрендеренной страницей. */
  canvas: HTMLCanvasElement;
  /** Ширина canvas в пикселях (с учётом scale). */
  widthPx: number;
  /** Высота canvas в пикселях (с учётом scale). */
  heightPx: number;
  /** Ширина страницы в пунктах PDF (pt), независимо от scale. */
  pageWidthPt: number;
  /** Высота страницы в пунктах PDF (pt), независимо от scale. */
  pageHeightPt: number;
}

let workerConfigured = false;

/**
 * Лениво настраивает worker pdf.js. Защищено проверкой `window`, чтобы импорт
 * на стороне сервера (SSR) не падал.
 *
 * Worker отдаётся как статический файл из /public (`public/pdf.worker.min.mjs`),
 * скопированный из node_modules/pdfjs-dist/build той же версии. Это надёжнее, чем
 * `new URL(..., import.meta.url)`: Turbopack в dev отдавал модульный worker,
 * который не инициализировался и подвешивал getDocument. Файл в /public
 * корректно работает и в dev, и в проде (Vercel).
 */
function ensureWorker(pdfjsLib: PdfjsModule): void {
  if (workerConfigured) return;
  if (typeof window === "undefined") return;

  pdfjsLib.GlobalWorkerOptions.workerSrc = withBasePath("/pdf.worker.min.mjs");
  workerConfigured = true;
}

/** Читает `File` целиком в `Uint8Array`. */
export async function readFileBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Чистая функция: склеивает элементы текстового слоя pdf.js в одну строку.
 *
 * Правила склейки:
 *  - элементы соединяются ПРОБЕЛОМ;
 *  - после элемента с `hasEOL === true` ставится ПЕРЕВОД СТРОКИ вместо пробела.
 *
 * Пример: [{str:"A"},{str:"B",hasEOL:true},{str:"C"}] → "A B\nC".
 *
 * Вынесена отдельно и экспортируется для юнит-тестов (Node-safe).
 */
export function joinTextItems(
  items: Array<{ str?: string; hasEOL?: boolean }>,
): string {
  let result = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    result += item.str ?? "";
    if (i < items.length - 1) {
      result += item.hasEOL ? "\n" : " ";
    }
  }
  return result;
}

/**
 * Загружает исходный PDF из `File` и открывает его в pdf.js.
 *
 * ВАЖНО: pdf.js может «отсоединить» (detach) переданный ему ArrayBuffer.
 * Поэтому файл читается в байты один раз, в pdf.js передаётся КОПИЯ
 * (`bytes.slice()`), а нетронутые `bytes` возвращаются для pdf-lib.
 */
export async function loadSource(file: File): Promise<LoadedSource> {
  const pdfjsLib = await getPdfjs();
  ensureWorker(pdfjsLib);

  const bytes = await readFileBytes(file);

  // Копия для pdf.js: getDocument может detach'нуть свой буфер.
  const task = pdfjsLib.getDocument({ data: bytes.slice() });
  const pdfjsDoc = await task.promise;

  return {
    bytes,
    pdfjsDoc,
    numPages: pdfjsDoc.numPages,
  };
}

/**
 * Рендерит страницу (0-based индекс) в новый canvas при заданном `scale`.
 *
 * pageWidthPt/pageHeightPt берутся из viewport со `scale: 1` — это единицы PDF
 * (пункты, pt), пригодные для pdf-lib и независимые от масштаба рендера.
 */
export async function renderPageToCanvas(
  pdfjsDoc: PDFDocumentProxy,
  pageIndex0: number,
  scale: number,
): Promise<RenderedPage> {
  // pdf.js использует 1-based нумерацию страниц.
  const page = await pdfjsDoc.getPage(pageIndex0 + 1);

  // Базовый viewport (scale 1) → размеры в пунктах PDF.
  const baseViewport = page.getViewport({ scale: 1 });
  const pageWidthPt = baseViewport.width;
  const pageHeightPt = baseViewport.height;

  const viewport = page.getViewport({ scale });
  const widthPx = Math.ceil(viewport.width);
  const heightPx = Math.ceil(viewport.height);

  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;

  // pdf.js v6: передаём canvas (рекомендуемый способ). Передавать одновременно
  // canvas и canvasContext нельзя.
  //
  // intent: "print" важен: в режиме "display" pdf.js продолжает рендер между
  // чанками через requestAnimationFrame, который НЕ вызывается в скрытой/фоновой
  // вкладке — рендер зависает навсегда. В режиме "print" продолжение идёт через
  // микротаски, поэтому рендер надёжно завершается в любой вкладке. Визуально
  // для нашей задачи (растровая копия области бланка) режимы эквивалентны.
  await page.render({ canvas, viewport, intent: "print" }).promise;

  return { canvas, widthPx, heightPx, pageWidthPt, pageHeightPt };
}

/**
 * Извлекает текстовый слой страницы (0-based индекс) и склеивает его в строку
 * через `joinTextItems`.
 */
export async function getPageText(
  pdfjsDoc: PDFDocumentProxy,
  pageIndex0: number,
): Promise<string> {
  const page = await pdfjsDoc.getPage(pageIndex0 + 1);
  const textContent = await page.getTextContent();

  // textContent.items: Array<TextItem | TextMarkedContent>.
  // У TextMarkedContent нет str/hasEOL — joinTextItems корректно их пропускает
  // (str?: undefined → ""), но отфильтруем для чистоты типов.
  const items = textContent.items.filter(
    (item: TextItem | TextMarkedContent): item is TextItem => "str" in item,
  );

  return joinTextItems(items);
}
