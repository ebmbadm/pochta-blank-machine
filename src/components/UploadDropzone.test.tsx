import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { UploadDropzone } from "./UploadDropzone";
import type { EditorApi } from "@/state/useEditorState";

// Минимальный мок EditorApi: заполняем только поля, которые читает
// UploadDropzone, остальное опускаем и приводим тип через as unknown as.
function makeApi(overrides: Partial<EditorApi>): EditorApi {
  return {
    status: "empty",
    error: null,
    loadFile: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
    ...overrides,
  } as unknown as EditorApi;
}

describe("UploadDropzone", () => {
  it("показывает заголовок и кнопку выбора файла в пустом состоянии", () => {
    const api = makeApi({ status: "empty" });
    render(<UploadDropzone api={api} />);

    expect(screen.getByText(/Перетащите/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Выбрать файл" }),
    ).toBeInTheDocument();
  });

  it("показывает текст ошибки в состоянии error", () => {
    const api = makeApi({ status: "error", error: "boom" });
    render(<UploadDropzone api={api} />);

    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});
