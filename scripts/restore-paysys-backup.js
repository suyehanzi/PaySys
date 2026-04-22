/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..");
const BACKUP_FORMAT = "PAYSYS-BACKUP-AES-256-GCM-V1";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function loadEnv() {
  return {
    ...parseEnvFile(path.join(ROOT, ".env")),
    ...parseEnvFile(path.join(ROOT, ".backup.env")),
    ...process.env,
  };
}

function resolvePath(value, base = ROOT) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

function readPassphrase(env, repoDir) {
  if (env.PAYSYS_BACKUP_PASSPHRASE) return env.PAYSYS_BACKUP_PASSPHRASE.trim();
  const keyFile = resolvePath(env.PAYSYS_BACKUP_KEY_FILE || path.join(repoDir, "RECOVERY_KEY_DO_NOT_COMMIT.txt"));
  if (fs.existsSync(keyFile)) {
    const value = fs.readFileSync(keyFile, "utf8").trim();
    if (value) return value;
  }
  throw new Error("Missing backup passphrase. Set PAYSYS_BACKUP_PASSPHRASE or create the recovery key file.");
}

function decryptPayload(payload, passphrase) {
  if (payload.format !== BACKUP_FORMAT) {
    throw new Error("Unsupported backup format");
  }
  const salt = Buffer.from(payload.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const encrypted = Buffer.from(payload.data, "base64");
  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const compressed = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return zlib.gunzipSync(compressed);
}

function usage() {
  console.log("Usage: node scripts/restore-paysys-backup.js <backup-file> [output-db] [--force]");
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help")) {
    usage();
    process.exit(args.length ? 0 : 1);
  }

  const force = args.includes("--force");
  const positional = args.filter((arg) => arg !== "--force");
  const env = loadEnv();
  const repoDir = resolvePath(env.PAYSYS_BACKUP_REPO_DIR || path.resolve(ROOT, "..", "PaySysBackups"));
  const inputPath = resolvePath(positional[0], process.cwd());
  const outputPath = resolvePath(positional[1] || path.join(ROOT, "data", "restored-paysys.sqlite"), process.cwd());

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Backup file not found: ${inputPath}`);
  }
  if (fs.existsSync(outputPath) && !force) {
    throw new Error(`Output exists: ${outputPath}. Pass --force to overwrite.`);
  }

  const passphrase = readPassphrase(env, repoDir);
  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const plain = decryptPayload(payload, passphrase);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, plain);
  console.log(JSON.stringify({ ok: true, output: outputPath, size: plain.length }));
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
