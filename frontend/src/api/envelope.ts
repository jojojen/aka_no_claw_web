// Command-bridge transport envelope validation (aka_no_claw#77 D2.4
// follow-up). Mirrors the reputation_snapshot client's
// SUPPORTED_ENVELOPE_VERSIONS / IncompatibleEnvelopeError pattern
// (aka_no_claw/src/openclaw_adapter/reputation_snapshot.py). A response with
// no envelope_version is the legacy/implicit-v0 case and stays accepted
// during the compatibility window; an unsupported version must not be
// silently treated as an ordinary payload.

export const SUPPORTED_ENVELOPE_VERSIONS: ReadonlySet<number> = new Set([1]);

export class IncompatibleEnvelopeError extends Error {
  constructor(version: unknown) {
    super(
      `command bridge envelope_version ${JSON.stringify(version)} unsupported ` +
        `(supported: ${Array.from(SUPPORTED_ENVELOPE_VERSIONS).join(", ")})`,
    );
    this.name = "IncompatibleEnvelopeError";
  }
}

// Returns an error message if the payload carries an unsupported
// envelope_version, or null if it's absent (legacy v0) or supported.
export function envelopeVersionError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("envelope_version" in payload)) {
    return null;
  }
  const version = (payload as { envelope_version?: unknown }).envelope_version;
  if (typeof version === "number" && SUPPORTED_ENVELOPE_VERSIONS.has(version)) {
    return null;
  }
  return new IncompatibleEnvelopeError(version).message;
}
