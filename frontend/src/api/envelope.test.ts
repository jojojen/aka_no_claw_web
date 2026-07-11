import { describe, expect, it } from "vitest";
import { envelopeVersionError, IncompatibleEnvelopeError, SUPPORTED_ENVELOPE_VERSIONS } from "./envelope";

describe("envelopeVersionError", () => {
  it("accepts a payload with no envelope_version (legacy v0)", () => {
    expect(envelopeVersionError({ status: "ok" })).toBeNull();
  });

  it("accepts a supported envelope_version", () => {
    expect(envelopeVersionError({ status: "ok", envelope_version: 1 })).toBeNull();
  });

  it("rejects an unsupported envelope_version", () => {
    const err = envelopeVersionError({ status: "ok", envelope_version: 99 });
    expect(err).toContain("99");
    expect(err).toContain("unsupported");
  });

  it("accepts non-object payloads (nothing to validate)", () => {
    expect(envelopeVersionError(null)).toBeNull();
    expect(envelopeVersionError("string")).toBeNull();
    expect(envelopeVersionError(42)).toBeNull();
  });

  it("current supported set is exactly {1}", () => {
    expect(Array.from(SUPPORTED_ENVELOPE_VERSIONS)).toEqual([1]);
  });

  it("IncompatibleEnvelopeError carries the offending version in its message", () => {
    const err = new IncompatibleEnvelopeError(2);
    expect(err.message).toContain("2");
    expect(err.name).toBe("IncompatibleEnvelopeError");
  });
});
