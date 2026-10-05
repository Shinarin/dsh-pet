/**
 * dsh-pet 插件服务端入口
 * 功能：
 *   1. 提供默认 GIF 静态文件服务
 *   2. 保存/读取用户配置（GIF、大小、提醒等）
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const name = "dsh-pet";
export const inject = ["webServer"];

const DEFAULT_CONFIG = {
  enabled: true,
  scale: 1.0,
  hideMode: "off",
  alertApproval: true,
  alertSound: false,
  alertDone: true,
  alertDoneSound: true,
  dblclickAction: "pat",
};

function getConfigPath(dshHome) {
  return join(dshHome, "plugins", "dsh-pet", "config.json");
}

function loadConfig(dshHome) {
  try {
    const path = getConfigPath(dshHome);
    if (existsSync(path)) {
      const raw = readFileSync(path, "utf8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(dshHome, config) {
  try {
    const path = getConfigPath(dshHome);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(config, null, 2), "utf8");
  } catch (e) {
    console.warn("[dsh-pet] 保存配置失败:", e);
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > 256 * 1024) throw new Error("request body too large");
    chunks.push(buf);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function serveGif(req, res, state) {
  if (req.method !== "GET") {
    res.writeHead(405, { allow: "GET" });
    res.end();
    return;
  }
  try {
    const gifPath = join(__dirname, "..", "default-gifs", `${state}.gif`);
    const data = readFileSync(gifPath);
    res.writeHead(200, {
      "content-type": "image/gif",
      "cache-control": "public, max-age=86400",
    });
    res.end(data);
  } catch (err) {
    console.error(`[dsh-pet] serveGif ${state} failed:`, err.message);
    res.writeHead(404);
    res.end("not found");
  }
}

export function apply(ctx, config) {
  console.log("[dsh-pet] 插件加载中...");
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) };
  if (!cfg.enabled) {
    console.log("[dsh-pet] 插件已禁用");
    return;
  }

  const dshHome = process.env.DSH_HOME || join(process.env.HOME || process.env.USERPROFILE || ".", ".dsh");
  const userConfig = loadConfig(dshHome);
  console.log("[dsh-pet] 配置已加载:", userConfig);

  console.log("[dsh-pet] 注册 HTTP 路由...");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact", path: "/pet/state",
    handler: (req, res) => {
      if (req.method !== "GET") { res.writeHead(405); res.end(); return; }
      sendJson(res, 200, { ok: true, state: "idle" });
    },
  }, "pet: state"), "pet route: state");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact", path: "/pet/config",
    handler: (req, res) => {
      if (req.method === "GET") {
        sendJson(res, 200, { ok: true, config: userConfig });
      } else if (req.method === "POST") {
        readJsonBody(req).then((body) => {
          if (body.config && typeof body.config === "object") {
            Object.assign(userConfig, body.config);
            saveConfig(dshHome, userConfig);
          }
          sendJson(res, 200, { ok: true, config: userConfig });
        }).catch((e) => sendJson(res, 500, { ok: false, error: String(e) }));
      } else {
        res.writeHead(405); res.end();
      }
    },
  }, "pet: config"), "pet route: config");

  ctx.effect(() => ctx.webServer.register({
    kind: "exact", path: "/pet/default-gif/idle",
    handler: (req, res) => serveGif(req, res, "idle"),
  }, "pet: gif idle"), "pet route: gif-idle");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact", path: "/pet/default-gif/thinking",
    handler: (req, res) => serveGif(req, res, "thinking"),
  }, "pet: gif thinking"), "pet route: gif-thinking");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact", path: "/pet/default-gif/answering",
    handler: (req, res) => serveGif(req, res, "answering"),
  }, "pet: gif answering"), "pet route: gif-answering");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact", path: "/pet/default-gif/approval",
    handler: (req, res) => serveGif(req, res, "approval"),
  }, "pet: gif approval"), "pet route: gif-approval");

  console.log("[dsh-pet] HTTP 路由注册完成");
}
