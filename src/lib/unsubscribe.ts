import { createHmac, timingSafeEqual } from "crypto";

/**
 * HMAC-signs a userId for digest unsubscribe links, so only a link we actually
 * generated can opt someone out — not an arbitrary userId typed into the URL.
 * Reuses AUTH_SECRET (already required for auth). Paired with a POST-only
 * mutation in the unsubscribe route so mail scanners can't unsubscribe on GET.
 */
function signingKey(): string {
  return process.env.AUTH_SECRET ?? "";
}

export function signUnsubscribe(userId: string): string {
  return createHmac("sha256", signingKey()).update(`unsub:${userId}`).digest("hex");
}

export function verifyUnsubscribe(userId: string, token: string): boolean {
  const key = signingKey();
  if (!key || !userId || !token) return false;
  const expected = signUnsubscribe(userId);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
