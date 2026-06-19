/**
 * Единицы измерения и геометрия листа.
 *
 * Соглашения о координатах в проекте:
 *  - UI / предпросмотр / LayoutModel: начало координат в ВЕРХНЕМ ЛЕВОМ углу,
 *    ось Y направлена ВНИЗ, единицы — миллиметры (мм).
 *  - pdf-lib: начало координат в НИЖНЕМ ЛЕВОМ углу, ось Y направлена ВВЕРХ,
 *    единицы — пункты (pt). Конвертация выполняется в render/exportPdf.
 */

/** 1 дюйм = 72 pt = 25.4 мм */
export const PT_PER_MM = 72 / 25.4; // ≈ 2.834645669
export const MM_PER_PT = 25.4 / 72; // ≈ 0.352777778
export const PT_PER_INCH = 72;
export const MM_PER_INCH = 25.4;

/** Размеры листа A4. */
export const A4 = {
  widthMm: 210,
  heightMm: 297,
  get widthPt() {
    return mmToPt(this.widthMm);
  },
  get heightPt() {
    return mmToPt(this.heightMm);
  },
} as const;

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

export function ptToMm(pt: number): number {
  return pt * MM_PER_PT;
}

export function mmToPx(mm: number, dpi = 96): number {
  return (mm / MM_PER_INCH) * dpi;
}

export function pxToMm(px: number, dpi = 96): number {
  return (px / dpi) * MM_PER_INCH;
}

export function ptToPx(pt: number, dpi = 96): number {
  return (pt / PT_PER_INCH) * dpi;
}

export function pxToPt(px: number, dpi = 96): number {
  return (px / dpi) * PT_PER_INCH;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Округление до n знаков (для аккуратных значений в UI). */
export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
