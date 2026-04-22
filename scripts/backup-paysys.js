/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const BACKUP_FORMAT = "PAYSYS-BACKUP-AES-256-GCM-V1";
const DEFAULT_RETENTION_DAYS = 30;

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

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: options.silent ? "pipe" : "pipe",
    shell: false,
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${output ? `\n${output}` : ""}`);
  }
  return (result.stdout || "").trim();
}

function gitMaybe(commandArgs, cwd) {
  const result = spawnSync("git", commandArgs, { cwd, encoding: "utf8", stdio: "pipe", shell: false });
  return {
    ok: result.status === 0,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function chinaStamp(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}${parts.minute}${parts.second}`,
    label: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`,
  };
}

function ensureGitRepo(repoDir, remoteUrl) {
  fs.mkdirSync(repoDir, { recursive: true });
  if (!fs.existsSync(path.join(repoDir, ".git"))) {
    run("git", ["init", "-b", "main"], repoDir);
  }

  const name = gitMaybe(["config", "user.name"], repoDir);
  if (!name.ok || !name.stdout) {
    run("git", ["config", "user.name", "PaySys Backup"], repoDir);
  }
  const email = gitMaybe(["config", "user.email"], repoDir);
  if (!email.ok || !email.stdout) {
    run("git", ["config", "user.email", "paysys-backup@local.invalid"], repoDir);
  }

  const currentRemote = gitMaybe(["remote", "get-url", "origin"], repoDir);
  const effectiveRemote = remoteUrl || (currentRemote.ok ? currentRemote.stdout : "");
  if (effectiveRemote) {
    const remote = currentRemote;
    if (!remote.ok) {
      run("git", ["remote", "add", "origin", effectiveRemote], repoDir);
    } else if (remote.stdout !== effectiveRemote) {
      run("git", ["remote", "set-url", "origin", effectiveRemote], repoDir);
    }

    const fetch = gitMaybe(["fetch", "origin"], repoDir);
    if (!fetch.ok) {
      console.warn(`GitHub fetch skipped: ${fetch.stderr || fetch.stdout}`);
    } else {
      const remoteMain = gitMaybe(["rev-parse", "--verify", "origin/main"], repoDir);
      if (remoteMain.ok) {
        const pull = gitMaybe(["pull", "--rebase", "origin", "main"], repoDir);
        if (!pull.ok) {
          throw new Error(`git pull --rebase origin main failed\n${pull.stderr || pull.stdout}`);
        }
      }
    }
  }
}

function ensureBackupRepoFiles(repoDir) {
  const gitignorePath = path.join(repoDir, ".gitignore");
  const gitignore = [
    ".paysys-backup-key",
    "RECOVERY_KEY_DO_NOT_COMMIT.txt",
    "*.sqlite",
    "*.sqlite-wal",
    "*.sqlite-shm",
    "tmp/",
    "logs/",
    "",
  ].join("\n");
  if (!fs.existsSync(gitignorePath) || fs.readFileSync(gitignorePath, "utf8") !== gitignore) {
    fs.writeFileSync(gitignorePath, gitignore, "utf8");
  }

  const readmePath = path.join(repoDir, "README.md");
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(
      readmePath,
      [
        "# PaySysBackups",
        "",
        "Encrypted PaySys SQLite backups.",
        "",
        "- Files under `backups/` are encrypted with AES-256-GCM.",
        "- The recovery key is not committed to this repository.",
        "- Keep the recovery key outside the cloud computer.",
        "",
      ].join("\n"),
      "utf8",
    );
  }
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

async function sqliteBackup(sourcePath, destinationPath) {
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destinationPath);
  } finally {
    source.close();
  }
}

function encryptBuffer(buffer, passphrase) {
  const compressed = zlib.gzipSync(buffer, { level: 9 });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    format: BACKUP_FORMAT,
    createdAt: new Date().toISOString(),
    kdf: "scrypt",
    cipher: "aes-256-gcm",
    originalSize: buffer.length,
    compressedSize: compressed.length,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function listFilesRecursively(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFilesRecursively(fullPath) : [fullPath];
  });
}

function pruneOldBackups(repoDir, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
  const backupsDir = path.join(repoDir, "backups");
  const cutoff = Date.now() - retentionDays * 86_400_000;
  let removed = 0;
  for (const file of listFilesRecursively(backupsDir)) {
    if (!file.endsWith(".sqlite.gz.enc")) continue;
    const stat = fs.statSync(file);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(file);
      removed += 1;
    }
  }
  return removed;
}

function cleanupEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) cleanupEmptyDirs(path.join(dir, entry.name));
  }
  if (dir.endsWith("backups")) return;
  if (fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}

function commitAndPush(repoDir, message, shouldPush) {
  run("git", ["add", "README.md", ".gitignore", "backups"], repoDir);
  const status = run("git", ["status", "--porcelain"], repoDir);
  if (!status) return { committed: false, pushed: false };

  run("git", ["commit", "-m", message], repoDir);
  if (shouldPush) {
    run("git", ["push", "origin", "main"], repoDir);
  }
  return { committed: true, pushed: shouldPush };
}

async function main() {
  const noPush = process.argv.includes("--no-push");
  const env = loadEnv();
  const repoDir = resolvePath(env.PAYSYS_BACKUP_REPO_DIR || path.resolve(ROOT, "..", "PaySysBackups"));
  const remoteUrl = env.PAYSYS_BACKUP_REMOTE || "";
  const retentionDays = Number(env.PAYSYS_BACKUP_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  const dbPath = resolvePath(env.PAYSYS_DB_PATH || path.join(ROOT, "data", "paysys.sqlite"));

  ensureGitRepo(repoDir, remoteUrl);
  ensureBackupRepoFiles(repoDir);

  const passphrase = readPassphrase(env, repoDir);
  const stamp = chinaStamp();
  const backupDir = path.join(repoDir, "backups", stamp.date.slice(0, 7));
  fs.mkdirSync(backupDir, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paysys-backup-"));
  const tempDbPath = path.join(tempDir, "paysys.sqlite");
  try {
    await sqliteBackup(dbPath, tempDbPath);
    const plain = fs.readFileSync(tempDbPath);
    const encryptedPayload = encryptBuffer(plain, passphrase);
    const outputPath = path.join(backupDir, `paysys-${stamp.date}-${stamp.time}.sqlite.gz.enc`);
    fs.writeFileSync(outputPath, JSON.stringify(encryptedPayload), "utf8");
    const removed = pruneOldBackups(repoDir, retentionDays);
    cleanupEmptyDirs(path.join(repoDir, "backups"));

    const remote = gitMaybe(["remote", "get-url", "origin"], repoDir);
    const shouldPush = !noPush && remote.ok && Boolean(remote.stdout);
    const gitResult = commitAndPush(repoDir, `Backup PaySys database ${stamp.label}`, shouldPush);
    console.log(
      JSON.stringify({
        ok: true,
        backup: path.relative(repoDir, outputPath),
        originalSize: plain.length,
        encryptedSize: fs.statSync(outputPath).size,
        removed,
        committed: gitResult.committed,
        pushed: gitResult.pushed,
      }),
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
