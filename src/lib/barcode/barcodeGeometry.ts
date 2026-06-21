/**
 * Захват ВЕКТОРНОЙ геометрии Code 128 для отрисовки штрихов в pdf-lib.
 *
 * Использует drawing-интерфейс bwip-js (node-сборка — без canvas/DOM, как
 * barcodeToSvg): `render` вызывает `line()` для каждого штриха, мы собираем
 * прямоугольники в собственных px bwip-js (начало сверху-слева, ось Y вниз).
 * `includetext:false` — подпись номера рисуется отдельно (DejaVu) в exportLabelPdf.
 *
 * Чистая, работает в Node (тесты) и в браузере (для индикатора читаемости).
 */
import { render, type DrawingContext, type RenderOptions } from "bwip-js/node";
import { validateBarcodeValue } from "@/lib/barcode/generateBarcode";

/** Прямоугольник одного штриха (px bwip-js, начало сверху-слева). */
export interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BarcodeGeometry {
  /** Полная ширина символа, px bwip-js. */
  widthPx: number;
  /** Полная высота штрихов, px bwip-js (без подписи). */
  heightPx: number;
  /** Число модулей (widthPx / scale) — для расчёта X-dimension. */
  moduleCount: number;
  bars: BarRect[];
}

/** px на модуль при захвате. Геометрия относительная, абсолютное значение не важно. */
const CAPTURE_SCALE = 2;

export function captureBarcodeGeometry(value: string): BarcodeGeometry {
  const check = validateBarcodeValue(value);
  if (!check.ok) {
    throw new Error(`Невозможно сгенерировать штрих-код: ${check.error}`);
  }

  const bars: BarRect[] = [];
  let widthPx = 0;
  let heightPx = 0;

  const ctx: DrawingContext<BarcodeGeometry> = {
    scale: () => null,
    measure: (str, _font, fwidth, fheight) => ({
      width: str.length * fwidth * 0.6,
      ascent: fheight * 0.75,
      descent: fheight * 0.25,
    }),
    init: (w, h) => {
      widthPx = w;
      heightPx = h;
    },
    line: (x0, y0, x1, y1, lw) => {
      bars.push({
        x: Math.min(x0, x1) - lw / 2,
        y: Math.min(y0, y1),
        w: lw,
        h: Math.abs(y1 - y0),
      });
    },
    polygon: () => {},
    hexagon: () => {},
    ellipse: () => {},
    fill: () => {},
    text: () => {},
    end: () => ({
      widthPx,
      heightPx,
      moduleCount: Math.round(widthPx / CAPTURE_SCALE),
      bars,
    }),
  };

  const opts: RenderOptions = {
    bcid: "code128",
    text: value,
    scale: CAPTURE_SCALE,
    height: 10,
    includetext: false,
  };

  return render(opts, ctx);
}
