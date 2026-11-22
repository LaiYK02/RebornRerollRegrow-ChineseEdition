import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { isIPv4 } from "node:net";
import { hostname, networkInterfaces } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { act, newGame, setOnline, view } from "./game.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const publicFiles = new Set([
  "/index.html",
  "/app.mjs",
  "/game.mjs",
  "/battle.mjs",
  "/cards.mjs",
  "/styles.css",
]);
const types = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
};
const colors = [
  "#348f98",
  "#4f83cc",
  "#d36755",
  "#8880b4",
  "#cb932d",
  "#648b51",
];
const bridgePage =
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>正在连接房间</title><p>正在连接房间…</p><script src="/connect.mjs" type="module"></script></html>';
const bridgeScript = `
const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'create' ? 'create' : 'join';
if (window.opener) {
  try {
    const target = new URL(params.get('origin'));
    if (['https:', 'http:'].includes(target.protocol)) {
      window.opener.postMessage({ type: 'reroll-connected' }, target.origin);
    }
  } catch {}
  window.opener = null;
}
location.replace('/?mode=' + mode + location.hash);
`;

function fail(status, code, message) {
  throw Object.assign(new Error(message), { status, code });
}

function reply(
  res,
  status,
  body,
  contentType = "application/json; charset=utf-8",
) {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

export function listAddresses(port, interfaces = networkInterfaces()) {
  const addresses = [];
  const hostOnly =
    /host[- ]only|vmware network adapter vmnet(?:1|8)\b|vethernet.*(?:wsl|default switch|dockernat)|^docker\d+$|^br-[a-f\d]+$|^veth[a-f\d]+$/i;
  const vpn =
    /radmin|zerotier|tailscale|hamachi|wireguard|vpn|^(?:wg|tun|tap|utun)\d+$/i;
  for (const [name, entries] of Object.entries(interfaces)) {
    if (hostOnly.test(name)) continue;
    for (const entry of entries ?? []) {
      if (entry.internal || !isIPv4(entry.address)) continue;
      const [first, second] = entry.address.split(".").map(Number);
      if (
        !first ||
        first === 127 ||
        first >= 224 ||
        (first === 169 && second === 254)
      )
        continue;
      if (addresses.some((row) => row.address === entry.address)) continue;
      addresses.push({
        name,
        address: entry.address,
        url: "http://" + entry.address + ":" + port,
      });
    }
  }
  addresses.sort((a, b) => Number(vpn.test(a.name)) - Number(vpn.test(b.name)));
  if (!addresses.length) {
    addresses.push({
      name: "本机",
      address: "127.0.0.1",
      url: "http://127.0.0.1:" + port,
    });
  }
  return addresses;
}

function isLoopback(address = "") {
  return address === "::1" || /^(?:::ffff:)?127\./.test(address);
}

async function readBody(req) {
  if (
    req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    fail(415, "JSON_REQUIRED", "请求必须使用 JSON 格式。");
  }
  if (Number(req.headers["content-length"]) > 4096)
    fail(413, "TOO_LARGE", "请求内容过长。");
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 4096) fail(413, "TOO_LARGE", "请求内容过长。");
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {}
  if (!body || typeof body !== "object" || Array.isArray(body))
    fail(400, "BAD_JSON", "请求格式无效。");
  return body;
}

function cleanText(input, limit, label) {
  const value = typeof input === "string" ? input.trim().normalize("NFC") : "";
  if (
    !value ||
    [...value].length > limit ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    fail(400, "INVALID_TEXT", label + "须为 1 至 " + limit + " 个字符。");
  }
  return value;
}

function newSeat(body, players, time) {
  const name = cleanText(body.name, 16, "昵称");
  if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    fail(409, "NAME_IN_USE", "这个昵称已有人使用，请换一个昵称。");
  }
  const color = /^#[\da-f]{6}$/i.test(body.color)
    ? body.color
    : colors[players.length % colors.length];
  return {
    id: randomUUID(),
    name,
    color,
    online: true,
    lastSeen: time,
    token: randomBytes(32).toString("base64url"),
  };
}

function publicSeat({ id, name, color, online }) {
  return { id, name, color, online };
}

function selectAddress(addresses, requested) {
  if (!requested) return addresses[0];
  const match = addresses.find((row) => row.address === requested);
  if (!match) fail(400, "BAD_ADDRESS", "请选择房主电脑上的局域网或 VPN 地址。");
  return match;
}

async function serveStatic(req, res, path) {
  if (req.method !== "GET" && req.method !== "HEAD")
    fail(405, "METHOD", "此请求方法不适用。");
  if (path === "/connect" || path === "/connect.mjs") {
    const isPage = path === "/connect";
    return reply(
      res,
      200,
      req.method === "HEAD" ? "" : isPage ? bridgePage : bridgeScript,
      types[isPage ? ".html" : ".mjs"],
    );
  }
  if (path === "/") path = "/index.html";
  const isAsset = /^\/assets\/(?:[\p{L}\p{N} _.-]+\/)*[\p{L}\p{N} _.-]+$/u.test(
    path,
  );
  const type = types[extname(path).toLowerCase()];
  if (
    (!publicFiles.has(path) && !isAsset) ||
    !type ||
    path.split("/").some((p) => p.startsWith("."))
  ) {
    fail(404, "NOT_FOUND", "找不到该文件。");
  }
  const candidate = await realpath(join(root, path)).catch(() => "");
  const boundary = isAsset ? join(root, "assets") : root;
  if (!candidate.startsWith(boundary + sep))
    fail(404, "NOT_FOUND", "找不到该文件。");
  const file = await stat(candidate);
  if (!file.isFile()) fail(404, "NOT_FOUND", "找不到该文件。");
  if (path === "/assets/host-kit.zip")
    res.setHeader("Content-Disposition", 'attachment; filename="host-kit.zip"');
  res.writeHead(200, { "Content-Type": type, "Content-Length": file.size });
  if (req.method === "HEAD") return res.end();
  createReadStream(candidate)
    .on("error", () => res.destroy())
    .pipe(res);
}

export function createRoomServer({ now = Date.now, offlineMs = 25_000 } = {}) {
  let room = null;
  let addresses;
  let refreshedAt = -Infinity;

  function updateOnline(seat, online) {
    if (seat.online === online) return;
    seat.online = online;
    if (room.game) {
      setOnline(room.game, seat.id, online);
      room.revision++;
    }
  }

  function refreshPresence(time) {
    for (const seat of room.players) {
      if (seat.online && time - seat.lastSeen >= offlineMs)
        updateOnline(seat, false);
    }
    if (!room.game) {
      room.players = room.players.filter(
        (seat) => seat.id === room.hostId || time - seat.lastSeen < 120_000,
      );
    }
  }

  function snapshot(seat) {
    return {
      id: room.id,
      phase: room.game ? "game" : "lobby",
      you: seat.id,
      hostId: room.hostId,
      players: room.players.map(publicSeat),
      chat: room.chat,
      revision: room.revision,
      address: room.selected.address,
      url: room.selected.url,
      addresses: seat.id === room.hostId ? addresses : [room.selected],
      game: room.game ? view(room.game, seat.id) : null,
    };
  }

  const server = createServer(async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      const authority = req.headers.host;
      if (!authority || /[\s@\\/?#]/.test(authority))
        fail(403, "HOST", "无效的主机地址。");
      let origin;
      try {
        origin = new URL("http://" + authority);
      } catch {
        fail(403, "HOST", "无效的主机地址。");
      }
      if (now() - refreshedAt >= 10_000) {
        addresses = listAddresses(server.address().port);
        refreshedAt = now();
        if (
          room &&
          !addresses.some((row) => row.address === room.selected.address)
        )
          room.selected = addresses[0];
      }
      const localName = hostname().toLowerCase();
      const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(
        origin.hostname,
      );
      if (
        !localHost &&
        ![localName, localName + ".local"].includes(origin.hostname) &&
        !addresses.some((a) => a.address === origin.hostname)
      ) {
        fail(403, "HOST", "请使用房主分享的网络地址。");
      }
      let path;
      try {
        path = decodeURIComponent(new URL(req.url, origin).pathname);
      } catch {
        fail(400, "BAD_PATH", "无效的地址。");
      }
      if (!path.startsWith("/api/")) return await serveStatic(req, res, path);
      if (
        (req.headers.origin && req.headers.origin !== origin.origin) ||
        req.headers["sec-fetch-site"] === "cross-site"
      ) {
        fail(403, "ORIGIN", "请从房间页面操作。");
      }
      const route = path.slice(5);
      const reads = ["state", "info"];
      const writes = [
        "create",
        "join",
        "chat",
        "action",
        "start",
        "restart",
        "address",
        "leave",
        "destroy",
      ];
      if (!reads.includes(route) && !writes.includes(route))
        fail(404, "NOT_FOUND", "找不到该接口。");
      if (req.method !== (reads.includes(route) ? "GET" : "POST"))
        fail(405, "METHOD", "此请求方法不适用。");
      // Await the entire request before reading or changing shared room state.
      const body = req.method === "POST" ? await readBody(req) : {};
      const time = now();
      if (room) refreshPresence(time);
      const canHost = localHost && isLoopback(req.socket.remoteAddress);
      if (route === "info")
        return reply(res, 200, {
          room: Boolean(room),
          canHost,
          addresses: canHost ? addresses : [],
        });
      if (route === "create") {
        if (!canHost)
          fail(
            403,
            "LOCAL_HOST_ONLY",
            "请在房主电脑上用 127.0.0.1 打开游戏并创建房间。",
          );
        if (room) fail(409, "ROOM_EXISTS", "房间已经存在，请返回已有的房间。");
        const seat = newSeat(body, [], time);
        const selected = selectAddress(addresses, body.address);
        room = {
          id: randomUUID(),
          hostId: seat.id,
          selected,
          players: [seat],
          chat: [],
          game: null,
          revision: 0,
        };
        return reply(res, 200, { token: seat.token, room: snapshot(seat) });
      }
      if (!room)
        fail(404, "NO_ROOM", "没有找到房间，房主可能尚未创建或已解散房间。");
      if (route === "join") {
        if (room.game)
          fail(409, "IN_GAME", "游戏已经开始，只有原有玩家可以重连。");
        if (room.players.length >= 4)
          fail(409, "ROOM_FULL", "房间已满，最多允许 4 名玩家。");
        const seat = newSeat(body, room.players, time);
        room.players.push(seat);
        return reply(res, 200, { token: seat.token, room: snapshot(seat) });
      }
      const token = /^Bearer ([\w-]+)$/.exec(
        req.headers.authorization ?? "",
      )?.[1];
      const seat = room.players.find((p) => p.token === token);
      if (!seat) fail(401, "NO_SEAT", "无法恢复座位，请重新加入房间。");
      seat.lastSeen = time;
      updateOnline(seat, true);
      if (route === "state") return reply(res, 200, { room: snapshot(seat) });
      if (
        ["start", "restart", "address", "destroy"].includes(route) &&
        seat.id !== room.hostId
      ) {
        fail(403, "HOST_ONLY", "只有房主可以执行此操作。");
      }
      if (route === "destroy") {
        room = null;
        return reply(res, 200, { ok: true });
      }
      if (route === "leave") {
        if (room.game || seat.id === room.hostId) updateOnline(seat, false);
        else room.players = room.players.filter((p) => p !== seat);
        return reply(res, 200, { ok: true });
      }
      if (route === "address")
        room.selected = selectAddress(addresses, body.address);
      if (route === "chat") {
        const text = cleanText(body.text, 240, "消息");
        room.chat.push({
          id: randomUUID(),
          playerId: seat.id,
          name: seat.name,
          text,
          time,
        });
        if (room.chat.length > 100) room.chat.shift();
      }
      if (route === "start" || route === "restart") {
        if (route === "start" && room.game)
          fail(409, "IN_GAME", "游戏已经开始。");
        if (route === "restart" && !room.game)
          fail(409, "LOBBY", "请先开始游戏。");
        room.game = newGame(room.players.map(publicSeat));
        room.revision++;
      }
      if (route === "action") {
        if (!room.game) fail(409, "LOBBY", "游戏尚未开始。");
        if (body.revision !== room.revision)
          fail(409, "STALE", "场上局势已改变，请刷新后再试。");
        if (
          typeof body.actionId !== "string" ||
          !body.actionId ||
          body.actionId.length > 240
        )
          fail(400, "BAD_ACTION", "无效的行动。");
        const nextGame = structuredClone(room.game);
        try {
          act(nextGame, seat.id, body.actionId);
        } catch (error) {
          fail(400, "BAD_ACTION", error.message || "无效的行动。");
        }
        room.game = nextGame;
        room.revision++;
      }
      return reply(res, 200, { room: snapshot(seat) });
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (!error.status) console.error(error);
      reply(res, error.status || 500, {
        code: error.status ? error.code : "SERVER_ERROR",
        error: error.status ? error.message : "房间服务暂时无法处理请求。",
      });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const port = Number(process.env.PORT ?? 3633);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT 须为 1 至 65535。");
  const server = createRoomServer();
  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "端口已被占用，请先关闭旧的服务窗口或设置其他 PORT。"
        : error.message,
    );
    process.exitCode = 1;
  });
  server.listen(port, "0.0.0.0", () => {
    const local = "http://127.0.0.1:" + port;
    console.log("重生之我靠回城变强 · 房间服务\n房主打开 " + local);
    for (const address of listAddresses(port))
      console.log(address.name + "  " + address.url);
    console.log("保留本窗口以便玩家连接。按 Ctrl+C 停止服务。");
    if (process.platform === "win32" && process.argv.includes("--open")) {
      const browser = spawn(
        "rundll32.exe",
        ["url.dll,FileProtocolHandler", local],
        { detached: true, stdio: "ignore", windowsHide: true },
      );
      browser.on("error", () => console.log("请用浏览器打开 " + local));
      browser.unref();
    }
  });
}
