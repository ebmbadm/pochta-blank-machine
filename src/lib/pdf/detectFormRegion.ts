/**
 * Поиск области бланка (непустого содержимого) на растровом рендере страницы PDF
 * и перевод найденного bbox в FormRegion в координатах pdf-lib.
 *
 * Соглашения о координатах:
 *  - Пиксельный bbox (PxBBox): начало в ВЕРХНЕМ ЛЕВОМ углу, ось Y вниз, единицы — px.
 *  - FormRegion (см. layout/layoutModel.ts): начало в НИЖНЕМ ЛЕВОМ углу страницы
 *    pdf-lib, ось Y вверх, единицы — pt. Перевод выполняется в pxBBoxToFormRegion
 *    (флип по Y).
 */

import type { FormRegion } from "@/lib/layout/layoutModel";
import { clamp } from "@/lib/units";

/** Прямоугольник в пикселях, начало координат в верхнем левом углу. */
export interface PxBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageLike {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

interface FindContentBBoxOptions {
  /** Порог светимости (0..255): пиксель считается «чернилами», если luminance < threshold. */
  threshold?: number;
  /** Отступ вокруг найденной области, px. Обрезается до границ изображения. */
  paddingPx?: number;
}

/**
 * Находит ограничивающий прямоугольник непустого содержимого в RGBA-изображении.
 * Пиксель считается «чернилами», если он НЕ почти белый: alpha 0 — пусто; иначе по
 * светимости (luminance < threshold). Возвращает null, если чернил нет.
 */
export function findContentBBox(
  image: ImageLike,
  opts: FindContentBBoxOptions = {},
): PxBBox | null {
  const threshold = opts.threshold ?? 245;
  const paddingPx = opts.paddingPx ?? 0;
  const { data, width, height } = image;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a === 0) continue; // полностью прозрачный — пусто

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Светимость по Rec. 601.
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luminance >= threshold) continue; // почти белый — пусто

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null; // чернил не найдено
  }

  // Применяем отступ и обрезаем до границ изображения.
  const x0 = clamp(minX - paddingPx, 0, width);
  const y0 = clamp(minY - paddingPx, 0, height);
  const x1 = clamp(maxX + 1 + paddingPx, 0, width);
  const y1 = clamp(maxY + 1 + paddingPx, 0, height);

  return {
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
  };
}

/**
 * Браузерная обёртка: берёт 2D-контекст canvas, читает пиксели и ищет bbox.
 * Возвращает null, если контекст недоступен или содержимого нет.
 */
export function detectFormRegionFromCanvas(
  canvas: HTMLCanvasElement,
  opts: FindContentBBoxOptions = {},
): PxBBox | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return findContentBBox(
    { data: imageData.data, width: imageData.width, height: imageData.height },
    opts,
  );
}

interface PxBBoxToFormRegionParams {
  pageIndex: number;
  canvasWidthPx: number;
  canvasHeightPx: number;
  pageWidthPt: number;
  pageHeightPt: number;
}

/**
 * Переводит пиксельный bbox (верхний левый угол) в FormRegion (pt, нижний левый
 * угол страницы pdf-lib) с флипом по оси Y.
 */
export function pxBBoxToFormRegion(
  bbox: PxBBox,
  params: PxBBoxToFormRegionParams,
): FormRegion {
  const {
    pageIndex,
    canvasWidthPx,
    canvasHeightPx,
    pageWidthPt,
    pageHeightPt,
  } = params;

  const scaleX = pageWidthPt / canvasWidthPx;
  const scaleY = pageHeightPt / canvasHeightPx;

  const widthPt = bbox.width * scaleX;
  const heightPt = bbox.height * scaleY;
  const xPt = bbox.x * scaleX;
  // Флип Y: нижний край bbox (bbox.y + bbox.height) от верха → расстояние от низа страницы.
  const yPt = pageHeightPt - (bbox.y + bbox.height) * scaleY;

  return { pageIndex, xPt, yPt, widthPt, heightPt };
}
