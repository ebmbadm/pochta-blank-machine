import { describe, it, expect } from "vitest";
import { createDefaultLayout } from "@/lib/layout/layoutModel";
import {
  applyLabelPreset,
  setLabelSizeOnModel,
  matchLabelPreset,
  LABEL_PRESETS,
  LABEL_MIN_MM,
  LABEL_MAX_MM,
} from "./labelPresets";

describe("labelPresets", () => {
  it("LABEL_PRESETS содержит три размера", () => {
    expect(LABEL_PRESETS.map((p) => p.id)).toEqual(["100x150", "58x40", "40x30"]);
  });
  it("applyLabelPreset проставляет ширину/высоту из пресета", () => {
    const m = applyLabelPreset(createDefaultLayout(), "100x150");
    expect(m.label).toEqual({ preset: "100x150", widthMm: 100, heightMm: 150 });
  });
  it("setLabelSizeOnModel обрезает диапазон и переходит в custom", () => {
    const m = setLabelSizeOnModel(createDefaultLayout(), 5, 9999);
    expect(m.label.widthMm).toBe(LABEL_MIN_MM);
    expect(m.label.heightMm).toBe(LABEL_MAX_MM);
    expect(m.label.preset).toBe("custom");
  });
  it("setLabelSizeOnModel распознаёт совпадение с пресетом", () => {
    const m = setLabelSizeOnModel(createDefaultLayout(), 58, 40);
    expect(m.label.preset).toBe("58x40");
  });
  it("matchLabelPreset → custom для нестандартного размера", () => {
    expect(matchLabelPreset(57, 41)).toBe("custom");
  });
});
