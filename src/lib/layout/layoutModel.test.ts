import { describe, it, expect } from "vitest";
import { createDefaultLayout } from "./layoutModel";

describe("createDefaultLayout label", () => {
  it("включает дефолтную конфигурацию этикетки 58×40", () => {
    const m = createDefaultLayout();
    expect(m.label).toEqual({ preset: "58x40", widthMm: 58, heightMm: 40 });
  });
});
