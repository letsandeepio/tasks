import http from "node:http";
import crypto from "node:crypto";
import { exec } from "node:child_process";
import { auth } from "@googleapis/tasks";
import { CREDENTIALS_PATH, TOKEN_PATH, readJson, writeJson } from "./config.js";

const SCOPES = ["https://www.googleapis.com/auth/tasks"];

function loadClientConfig() {
  const raw = readJson(CREDENTIALS_PATH);
  if (!raw) {
    throw new Error(
      `No OAuth client found at ${CREDENTIALS_PATH}.\n` +
        `Download a Desktop OAuth client JSON from Google Cloud and run:\n` +
        `  tasks auth --credentials /path/to/client.json`
    );
  }
  const cfg = raw.installed ?? raw.web;
  if (!cfg?.client_id || !cfg?.client_secret) {
    throw new Error(`${CREDENTIALS_PATH} is not a Google OAuth client file.`);
  }
  return cfg;
}

function newClient(redirectUri) {
  const { client_id, client_secret } = loadClientConfig();
  const client = new auth.OAuth2(client_id, client_secret, redirectUri);
  // The library refreshes access tokens on its own. Persist whatever it gets,
  // keeping the refresh token, which Google only sends on the first consent.
  client.on("tokens", (tokens) => {
    const saved = readJson(TOKEN_PATH) ?? {};
    writeJson(TOKEN_PATH, { ...saved, ...tokens, refresh_token: tokens.refresh_token ?? saved.refresh_token });
  });
  return client;
}

export function getAuthorizedClient() {
  const token = readJson(TOKEN_PATH);
  if (!token?.refresh_token) {
    throw new Error("Not signed in. Run: tasks auth");
  }
  const client = newClient();
  client.setCredentials(token);
  return client;
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? 'start ""' : "xdg-open";
  exec(`${cmd} "${url}"`, () => {});
}

// Desktop OAuth flow: listen on a random loopback port, send the user to Google,
// and swap the returned code for tokens.
export async function login() {
  const state = crypto.randomBytes(16).toString("hex");
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const redirectUri = `http://127.0.0.1:${server.address().port}`;
  const client = newClient(redirectUri);
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();

  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for sign-in.")), 5 * 60 * 1000);
    server.on("request", (req, res) => {
      const params = new URL(req.url, redirectUri).searchParams;
      if (!params.has("code") && !params.has("error")) {
        res.writeHead(404).end();
        return;
      }
      const ok = params.get("state") === state && params.has("code");
      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html" });
      res.end(ok ? "<h1>Signed in.</h1><p>You can close this tab.</p>" : "<h1>Sign-in failed.</h1>");
      clearTimeout(timer);
      if (ok) resolve(params.get("code"));
      else reject(new Error(`Sign-in failed: ${params.get("error") ?? "state mismatch"}`));
    });
    console.log(`Opening your browser to sign in. If it doesn't open, visit:\n\n${url}\n`);
    openBrowser(url);
  }).finally(() => server.close());

  const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: redirectUri });
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Try again.");
  writeJson(TOKEN_PATH, tokens);
  return tokens;
}
