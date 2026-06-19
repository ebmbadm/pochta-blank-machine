/**
 * Пресеты размера бланка под размер посылки.
 * Значения — целевая ширина всего бланка на листе A4, мм.
 * Это стартовые точки; пользователь дальше тонко настраивает слайдером/вводом.
 */

import { A4 } from "@/lib/units";
import type { LayoutModel, ParcelPreset } from "@/lib/layout/layoutModel";

export interface ParcelPresetDef {
  id: Exclude<ParcelPreset, "custom">;
  title: string;
  hint: string;
  formWidthMm: number;
}

export const PARCEL_PRESETS: ParcelPresetDef[] = [
  { id: "S", title: "Маленькая", hint: "конверт / мелкий пакет", formWidthMm: 90 },
  { id: "M", title: "Средняя", hint: "коробка среднего размера", formWidthMm: 130 },
  { id: "L", title: "Большая", hint: "крупная коробка", formWidthMm: 180 },
];

/** Минимально и максимально допустимая ширина бланка (мм). */
export const FORM_WIDTH_MIN_MM = 50;
export const FORM_WIDTH_MAX_MM = A4.widthMm - 10; // оставляем поля

export function getPreset(id: ParcelPreset): ParcelPresetDef | undefined {
  return PARCEL_PRESETS.find((p) => p.id === id);
}

/**
 * Применить пресет: задать ширину бланка и перецентрировать по горизонтали.
 * Возвращает НОВЫЙ объект (не мутирует вход).
 */
export function applyPreset(model: LayoutModel, id: ParcelPreset): LayoutModel {
  const preset = getPreset(id);
  if (!preset) return { ...model, preset: "custom" };
  const formWidthMm = preset.formWidthMm;
  return {
    ...model,
    preset: id,
    formWidthMm,
    formXMm: (A4.widthMm - formWidthMm) / 2,
  };
}

/**
 * Изменить ширину бланка вручную (слайдер/ввод). Сбрасывает пресет в "custom",
 * если значение не совпадает ни с одним пресетом; обрезает в допустимый диапазон.
 */
export function setFormWidth(model: LayoutModel, widthMm: number): LayoutModel {
  const clamped = Math.min(FORM_WIDTH_MAX_MM, Math.max(FORM_WIDTH_MIN_MM, widthMm));
  const matched = PARCEL_PRESETS.find((p) => Math.abs(p.formWidthMm - clamped) < 0.01);
  return {
    ...model,
    formWidthMm: clamped,
    preset: matched ? matched.id : "custom",
  };
}
