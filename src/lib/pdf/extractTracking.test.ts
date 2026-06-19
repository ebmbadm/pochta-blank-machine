import { describe, it, expect } from "vitest";
import {
  isValidS10,
  extractTrackingNumber,
  extractAllTracking,
  hasValidS10CheckDigit,
} from "@/lib/pdf/extractTracking";

// Реалистичный фрагмент текстового слоя бланка CN22 с pochta.ru:
// номер встречается дважды (два штрих-кода).
const FORM_SNIPPET =
  "LS018350611RU\n ИНН: КПП: ... CN 22 ... LS018350611RU\n ИНН:";

describe("isValidS10", () => {
  it("accepts a well-formed S10 number", () => {
    expect(isValidS10("LS018350611RU")).toBe(true);
  });

  it("rejects one letter in the prefix (L018350611RU)", () => {
    expect(isValidS10("L018350611RU")).toBe(false);
  });

  it("rejects 8 digits (LS01835061RU)", () => {
    expect(isValidS10("LS01835061RU")).toBe(false);
  });

  it("rejects lowercase (not normalized input)", () => {
    expect(isValidS10("ls018350611ru")).toBe(false);
  });

  it("rejects extra trailing characters", () => {
    expect(isValidS10("LS018350611RUX")).toBe(false);
  });
});

describe("extractTrackingNumber", () => {
  it("extracts the first S10 from a realistic two-barcode snippet", () => {
    expect(extractTrackingNumber(FORM_SNIPPET)).toBe("LS018350611RU");
  });

  it("normalizes lowercase input to uppercase", () => {
    expect(extractTrackingNumber("ls018350611ru")).toBe("LS018350611RU");
  });

  it("strips internal whitespace within the number", () => {
    expect(extractTrackingNumber("track: LS 018350611 RU end")).toBe(
      "LS018350611RU",
    );
  });

  it("returns null when no S10 is present", () => {
    expect(extractTrackingNumber("нет номера здесь, только текст")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(extractTrackingNumber("")).toBeNull();
  });
});

describe("extractAllTracking", () => {
  it("dedups the two identical occurrences to a single value", () => {
    expect(extractAllTracking(FORM_SNIPPET)).toEqual(["LS018350611RU"]);
  });

  it("returns [] when no S10 is present", () => {
    expect(extractAllTracking("нет номера здесь")).toEqual([]);
  });

  it("returns unique numbers in order of appearance", () => {
    const text = "RA123456785RU ... LS018350611RU ... RA123456785RU";
    expect(extractAllTracking(text)).toEqual([
      "RA123456785RU",
      "LS018350611RU",
    ]);
  });

  it("normalizes lowercase occurrences", () => {
    expect(extractAllTracking("ls018350611ru and LS018350611RU")).toEqual([
      "LS018350611RU",
    ]);
  });
});

describe("hasValidS10CheckDigit", () => {
  it("validates the check digit of LS018350611RU", () => {
    expect(hasValidS10CheckDigit("LS018350611RU")).toBe(true);
  });

  it("accepts lowercase / spaced input", () => {
    expect(hasValidS10CheckDigit("ls 018350611 ru")).toBe(true);
  });

  it("rejects a number with a wrong check digit", () => {
    // Меняем контрольную цифру (1 → 2) на конце цифровой части.
    expect(hasValidS10CheckDigit("LS018350612RU")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(hasValidS10CheckDigit("L018350611RU")).toBe(false);
  });
});
