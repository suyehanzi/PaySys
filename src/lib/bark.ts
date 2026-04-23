import fs from "node:fs";
import path from "node:path";

type RegistrationNoticeInput = {
  displayName: string;
  qq: string;
  portalUrl: string;
  adminUrl: string;
};

function readKeyValueFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    values[key] = value;
  }

  return values;
}

function configValue(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  const monitorValues = readKeyValueFile(path.join(process.cwd(), ".monitor.env"));
  for (const key of keys) {
    const value = monitorValues[key]?.trim();
    if (value) return value;
  }

  return "";
}

function normalizeBarkBaseUrl(value: string): string {
  const candidate = value.trim().replace(/\/+$/, "");
  if (!candidate) return "";

  try {
    const url = new URL(candidate);
    const firstSegment = url.pathname.split("/").filter(Boolean)[0];
    if (firstSegment) {
      url.pathname = `/${firstSegment}`;
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    return candidate;
  }

  return candidate;
}

function barkBaseUrl(): string {
  return normalizeBarkBaseUrl(configValue("BARK_BASE_URL", "BARK_URL", "BARK_ENDPOINT"));
}

async function sendBark(title: string, body: string): Promise<void> {
  const baseUrl = barkBaseUrl();
  if (!baseUrl) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const url = `${baseUrl}/${encodeURIComponent(title)}/${encodeURIComponent(body)}?group=PaySys&isArchive=1`;

  try {
    await fetch(url, { cache: "no-store", signal: controller.signal });
  } catch {
    // Registration should never fail just because a phone push failed.
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyRegistrationRequest(input: RegistrationNoticeInput): Promise<void> {
  const body = [
    `昵称：${input.displayName}`,
    `QQ：${input.qq}`,
    `客户页：${input.portalUrl}`,
    `后台页：${input.adminUrl}`,
  ].join("\n");

  await sendBark("PaySys 新申请", body);
}
