import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CONFIG_DIR = process.env.TASKS_CONFIG_DIR
  ? path.resolve(process.env.TASKS_CONFIG_DIR)
  : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "tasks");

export const CREDENTIALS_PATH = path.join(CONFIG_DIR, "credentials.json");
export const TOKEN_PATH = path.join(CONFIG_DIR, "token.json");
const SETTINGS_PATH = path.join(CONFIG_DIR, "config.json");

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`Could not read ${file}: ${err.message}`);
  }
}

// Credentials and tokens are secrets, so the directory and files are owner-only.
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

export function readSettings() {
  return readJson(SETTINGS_PATH) ?? {};
}

export function updateSettings(patch) {
  writeJson(SETTINGS_PATH, { ...readSettings(), ...patch });
}
