import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import PreviewCanvas from "./PreviewCanvas";
import type { EditorApi } from "@/state/useEditorState";
import { createDefaultLayout } from "@/lib/layout/layoutModel";

// Минимальный мок EditorApi: PreviewCanvas читает только formImageUrl,
// formAspectRatio, model и пару действий. Остальное приводим к типу
// через `as unknown as EditorApi` (единственный задокументированный каст).
function makeApi(overrides: Partial<EditorApi> = {}): EditorApi {
  return {
    formImageUrl: null,
    formAspectRatio: 0.3,
    model: createDefaultLayout({
      trackingNumber: "LS018350611RU",
      printDateText: "19.06.2026",
    }),
    setFormPosition: vi.fn(),
    changeFormWidth: vi.fn(),
    ...overrides,
  } as unknown as EditorApi;
}

describe("PreviewCanvas", () => {
  it("монтируется без ошибок и показывает подпись формата A4", () => {
    const api = makeApi();
    render(<PreviewCanvas api={api} />);

    // jsdom не делает раскладку (ширина листа = 0), поэтому проверяем только
    // статичный текст, который рендерится всегда.
    expect(screen.getByText(/A4/)).toBeInTheDocument();
    expect(screen.getByText(/210 × 297 ММ/)).toBeInTheDocument();
  });
});
