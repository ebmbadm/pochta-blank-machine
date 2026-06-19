import { describe, it, expect } from "vitest";
import { joinTextItems } from "@/lib/pdf/loadPdf";

// ПРИМЕЧАНИЕ: browser/pdf.js-части этого модуля (ensureWorker, readFileBytes,
// loadSource, renderPageToCanvas, getPageText) работают только в браузере
// (worker, canvas, File API) и проверяются вручную. Здесь тестируется ТОЛЬКО
// чистая функция joinTextItems.

describe("joinTextItems", () => {
  it("joins items with spaces and a newline after hasEOL", () => {
    expect(
      joinTextItems([{ str: "A" }, { str: "B", hasEOL: true }, { str: "C" }]),
    ).toBe("A B\nC");
  });

  it("returns an empty string for an empty array", () => {
    expect(joinTextItems([])).toBe("");
  });

  it("returns a single item's text unchanged", () => {
    expect(joinTextItems([{ str: "solo" }])).toBe("solo");
  });

  it("treats a missing str as an empty string", () => {
    expect(joinTextItems([{ str: "A" }, {}, { str: "B" }])).toBe("A  B");
  });

  it("does not append a trailing newline when the last item has hasEOL", () => {
    expect(joinTextItems([{ str: "A", hasEOL: true }])).toBe("A");
  });
});
