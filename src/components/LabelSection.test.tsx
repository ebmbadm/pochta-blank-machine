import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LabelSection } from "@/components/LabelSection";
import { createDefaultLayout } from "@/lib/layout/layoutModel";
import type { EditorApi } from "@/state/useEditorState";

function makeApi(overrides: Partial<EditorApi> = {}): EditorApi {
  return {
    model: createDefaultLayout({ trackingNumber: "LS018350611RU" }),
    exporting: false,
    setLabelPreset: vi.fn(),
    setLabelSize: vi.fn(),
    printLabel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as EditorApi;
}

describe("LabelSection", () => {
  it("рендерит пресеты размеров этикетки", () => {
    render(<LabelSection api={makeApi()} />);
    expect(screen.getByText("100 × 150")).toBeInTheDocument();
    expect(screen.getByText("58 × 40")).toBeInTheDocument();
    expect(screen.getByText("40 × 30")).toBeInTheDocument();
  });

  it("вызывает printLabel('print') по кнопке печати", () => {
    const api = makeApi();
    render(<LabelSection api={api} />);
    fireEvent.click(screen.getByRole("button", { name: /Печать этикетки/i }));
    expect(api.printLabel).toHaveBeenCalledWith("print");
  });

  it("блокирует кнопки без валидного трек-номера", () => {
    const api = makeApi({ model: createDefaultLayout({ trackingNumber: "" }) });
    render(<LabelSection api={api} />);
    expect(screen.getByRole("button", { name: /Печать этикетки/i })).toBeDisabled();
  });
});
