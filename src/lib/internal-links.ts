import crypto from "node:crypto";

function internalLinkSecret(): string {
  return process.env.INTERNAL_TEST_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || `local:${process.cwd()}`;
}

function normalizedGroup(groupName: string): string {
  return groupName.trim();
}

export function createInternalGroupToken(groupName: string): string {
  return crypto
    .createHmac("sha256", internalLinkSecret())
    .update(`internal-group-subscription:${normalizedGroup(groupName)}`)
    .digest("base64url");
}

export function verifyInternalGroupToken(groupName: string, token: string): boolean {
  const expected = Buffer.from(createInternalGroupToken(groupName));
  const received = Buffer.from(token.trim());
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
