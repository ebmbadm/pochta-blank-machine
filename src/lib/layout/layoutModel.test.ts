import { describe, it, expect } from "vitest";
import { createDefaultLayout } from "./layoutModel";

describe("createDefaultLayout label", () => {
  it("включает дефолтную конфигурацию этикетки 58×40", () => {
    const m = createDefaultLayout();
    expect(m.label).toEqual({ preset: "58x40", widthMm: 58, heightMm: 40 });
  });
});

import { describe as describe2, it as it2, expect as expect2 } from "vitest";
import { createDefaultLayout as cdl } from "./layoutModel";

describe2("createDefaultLayout printOptions", () => {
  it2("включает дефолтные опции печати", () => {
    expect2(cdl().printOptions).toEqual({
      printerName: "",
      copies: 1,
      rotate: 0,
      density: 8,
      speed: 8,
    });
  });
});
