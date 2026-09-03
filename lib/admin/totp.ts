// Two-factor authentication: TOTP (RFC 6238) via `otpauth` and a QR code via
// `uqr` (both MIT, no native or CLI dependencies).
//
//   otpauth — implements HOTP/TOTP, builds the otpauth:// provisioning URI
//             that authenticator apps expect, depends only on @noble/hashes.
//   uqr     — zero-dependency QR encoder that returns an SVG string, so the
//             browser needs no image library.

import * as OTPAuth from "otpauth";
import { renderSVG } from "uqr";

export const TOTP_ISSUER = "Wire Pay";
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30;

/** New base32 secret (160 bits, the size Google Authenticator expects). */
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totpFor(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: "SHA1",
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** otpauth://totp/... URI for the authenticator app. */
export function totpUri(secretBase32: string, label: string): string {
  return totpFor(secretBase32, label).toString();
}

/** Accepts the current code and the neighbouring time steps (±1 × 30 s) for clock skew. */
export function verifyTotp(secretBase32: string, code: string, now: Date = new Date()): boolean {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  return totpFor(secretBase32, "verify").validate({ token, timestamp: now.getTime(), window: 1 }) !== null;
}

/** Current code — used by tests and the seed, never by the UI. */
export function currentTotpCode(secretBase32: string, now: Date = new Date()): string {
  return totpFor(secretBase32, "generate").generate({ timestamp: now.getTime() });
}

/** Inline SVG (viewBox scaled) for the provisioning URI. */
export function totpQrSvg(uri: string): string {
  return renderSVG(uri, { pixelSize: 4, border: 2 });
}
