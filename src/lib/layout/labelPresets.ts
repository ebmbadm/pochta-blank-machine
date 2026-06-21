/**
 * Пресеты размера термоэтикетки + ручной ввод (мм). По образцу presets.ts.
 * Работают над LayoutModel.label, возвращают НОВЫЙ объект (без мутаций).
 */
import type { LabelPreset, LayoutModel } from "@/lib/layout/layoutModel";

export interface LabelPresetDef {
  id: Exclude<LabelPreset, "custom">;
  title: string;
  widthMm: number;
  heightMm: number;
}

export const LABEL_PRESETS: LabelPresetDef[] = [
  { id: "100x150", title: "100 × 150", widthMm: 100, heightMm: 150 },
  { id: "58x40", title: "58 × 40", widthMm: 58, heightMm: 40 },
  { id: "40x30", title: "40 × 30", widthMm: 40, heightMm: 30 },
];

export const LABEL_MIN_MM = 20;
export const LABEL_MAX_MM = 200;

export function getLabelPreset(id: LabelPreset): LabelPresetDef | undefined {
  return LABEL_PRESETS.find((p) => p.id === id);
}

function clampMm(v: number): number {
  if (!Number.isFinite(v)) return LABEL_MIN_MM;
  return Math.min(LABEL_MAX_MM, Math.max(LABEL_MIN_MM, Math.round(v)));
}

/** Подобрать id пресета по точному совпадению размеров, иначе "custom". */
export function matchLabelPreset(widthMm: number, heightMm: number): LabelPreset {
  const m = LABEL_PRESETS.find(
    (p) => Math.abs(p.widthMm - widthMm) < 0.5 && Math.abs(p.heightMm - heightMm) < 0.5,
  );
  return m ? m.id : "custom";
}

export function applyLabelPreset(model: LayoutModel, id: LabelPreset): LayoutModel {
  const preset = getLabelPreset(id);
  if (!preset) return { ...model, label: { ...model.label, preset: "custom" } };
  return {
    ...model,
    label: { preset: id, widthMm: preset.widthMm, heightMm: preset.heightMm },
  };
}

export function setLabelSizeOnModel(
  model: LayoutModel,
  widthMm: number,
  heightMm: number,
): LayoutModel {
  const w = clampMm(widthMm);
  const h = clampMm(heightMm);
  return { ...model, label: { preset: matchLabelPreset(w, h), widthMm: w, heightMm: h } };
}
