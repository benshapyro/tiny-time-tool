import { describe, expect, it } from "vitest";
import { resolveLocale } from "./resolveLocale";

describe("resolveLocale", () => {
  it("an explicit 'en' setting always resolves to en, regardless of system locale", () => {
    expect(resolveLocale("en", "es-ES")).toBe("en");
  });

  it("an explicit 'es' setting always resolves to es, regardless of system locale", () => {
    expect(resolveLocale("es", "en-US")).toBe("es");
  });

  it("'system' with an es-* system locale resolves to es", () => {
    expect(resolveLocale("system", "es-ES")).toBe("es");
    expect(resolveLocale("system", "es-MX")).toBe("es");
    expect(resolveLocale("system", "es")).toBe("es");
  });

  it("'system' with an en-* system locale resolves to en", () => {
    expect(resolveLocale("system", "en-US")).toBe("en");
  });

  it("'system' with any other system locale falls back to en (the only two shipped locales)", () => {
    expect(resolveLocale("system", "fr-FR")).toBe("en");
    expect(resolveLocale("system", "de-DE")).toBe("en");
  });

  it("the system-locale match is case-insensitive", () => {
    expect(resolveLocale("system", "ES-es")).toBe("es");
  });
});
