import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ControlsPanel } from "@/components/ControlsPanel";
import { createDefaultLayout } from "@/lib/layout/layoutModel";
import type { EditorApi } from "@/state/useEditorState";

function makeApi(overrides: Partial<EditorApi> = {}): EditorApi {
  const exportPdf = vi.fn().mockResolvedValue(undefined);
  const api = {
    status: "ready",
    error: null,
    fileName: "blank.pdf",
    formImageUrl: null,
    formAspectRatio: 0.3,
    formRegion: null,
    model: createDefaultLayout({
      trackingNumber: "LS018350611RU",
      printDateText: "19.06.2026",
    }),
    exporting: false,

    loadFile: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
    selectPreset: vi.fn(),
    changeFormWidth: vi.fn(),
    setFormPosition: vi.fn(),
    centerFormX: vi.fn(),
    setTrackingNumber: vi.fn(),
    togglePrintDate: vi.fn(),
    toggleShipDate: vi.fn(),
    toggleExtraBarcodes: vi.fn(),
    setBarcodeWidth: vi.fn(),
    addBarcodeCopy: vi.fn(),
    removeBarcodeCopy: vi.fn(),
    exportPdf,
    setLabelPreset: vi.fn(),
    setLabelSize: vi.fn(),
    printLabel: vi.fn().mockResolvedValue(undefined),
    setPrintOption: vi.fn(),
    printLabelDirect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as EditorApi;
  return api;
}

describe("ControlsPanel", () => {
  it("renders the parcel-size preset buttons", () => {
    render(<ControlsPanel api={makeApi()} />);
    expect(screen.getByText("Маленькая")).toBeInTheDocument();
    expect(screen.getByText("Средняя")).toBeInTheDocument();
    expect(screen.getByText("Большая")).toBeInTheDocument();
  });

  it("renders the download button", () => {
    render(<ControlsPanel api={makeApi()} />);
    expect(
      screen.getByRole("button", { name: /Скачать PDF/i }),
    ).toBeInTheDocument();
  });

  it("calls exportPdf('download') when the download button is clicked", () => {
    const api = makeApi();
    render(<ControlsPanel api={api} />);
    fireEvent.click(screen.getByRole("button", { name: /Скачать PDF/i }));
    expect(api.exportPdf).toHaveBeenCalledTimes(1);
    expect(api.exportPdf).toHaveBeenCalledWith("download");
  });

  it("renders the label section", () => {
    render(<ControlsPanel api={makeApi()} />);
    expect(screen.getByText("Этикетка (термопринтер)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Печать этикетки/i }),
    ).toBeInTheDocument();
  });
});
