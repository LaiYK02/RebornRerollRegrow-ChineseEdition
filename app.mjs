import { cards } from "./cards.mjs";
import { newGame, restoreGame, act, view } from "./game.mjs";
import {
  esc,
  icon,
  art,
  palette,
  regions,
  tiles,
  hearts,
  button,
  menu,
  lobby,
  game,
  board,
  pawns,
} from "./assets/ui.mjs";

const $ = (s) => document.querySelector(s);
const app = $("#app"),
  overlay = $("#overlay");
const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem("reroll." + k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem("reroll." + k);
      else localStorage.setItem("reroll." + k, JSON.stringify(v));
    } catch {}
  },
};
const hash = new URLSearchParams(location.hash.slice(1));
const profile = store.get("profile") || {
  name:
    ["晨风", "星野", "青岚", "松露", "流萤"][Math.floor(Math.random() * 5)] +
    "骑士" +
    (10 + Math.floor(Math.random() * 90)),
  color: palette[0],
};
if (hash.get("name")) profile.name = hash.get("name").slice(0, 16);
if (palette.includes(hash.get("color"))) profile.color = hash.get("color");
let room = null,
  soloState = null,
  info = null,
  token = store.get("seat"),
  busy = false,
  polling = false,
  version = 0,
  lastPoll = 0;
let snapshot = "",
  noticeTimer,
  animToken = 0,
  animating = false,
  diceAnimation = null,
  previousFocus = null,
  atlasFilter = "",
  modalName = "",
  rulesCache = "",
  muted = store.get("muted") ?? false;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
document
  .querySelectorAll("[data-icon]")
  .forEach((el) => el.replaceWith(fragment(icon(el.dataset.icon))));
function fragment(html) {
  const t = document.createElement("template");
  t.innerHTML = html;
  return t.content;
}
function showMenu() {
  app.innerHTML = menu(profile, !!store.get("solo"));
  document.body.classList.remove("playing");
  snapshot = "";
  if (token)
    $("#app .setup").insertAdjacentHTML(
      "beforeend",
      button("reconnect", "返回上次的联机房间", "", "sub-action"),
    );
}
function profileSave() {
  if ($("#pname")) {
    const name = $("#pname").value.trim();
    if (!name) {
      $("#pname").focus();
      throw Error("请先输入骑士名字。");
    }
    profile.name = name;
  }
  store.set("profile", profile);
}
function notice(msg) {
  $("#notice").textContent = msg;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("#notice").textContent = ""), 4900);
}
let audio;
function tone(freq = 440) {
  if (muted) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(0.045, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.13);
    osc.start();
    osc.stop(audio.currentTime + 0.14);
  } catch {}
}
function soundIcon() {
  document.querySelector('[data-do="sound"]').innerHTML = icon(
    muted ? "mute" : "sound",
  );
  document
    .querySelector('[data-do="sound"]')
    .setAttribute("aria-pressed", String(!muted));
}
function modal(title, content, wide = false, key = "") {
  if (!overlay.firstChild) previousFocus = document.activeElement;
  modalName = key;
  overlay.innerHTML =
    '<section role="dialog" aria-modal="true" aria-label="' +
    esc(title) +
    '" class="modal paper ' +
    (wide ? "wide" : "") +
    '"><div class="panel-heading"><h2>' +
    esc(title) +
    "</h2>" +
    button("close", "", "close", "mini", 'aria-label="关闭"') +
    "</div>" +
    content +
    "</section>";
  overlay.querySelector("input,button")?.focus({ preventScroll: true });
}
function close() {
  overlay.replaceChildren();
  modalName = "";
  previousFocus?.focus?.({ preventScroll: true });
  previousFocus = null;
}
function atlas(filter = "全部") {
  atlasFilter = filter;
  const filters = ["全部", "角色", "怪物", "普通装备", "传说装备", "道具"];
  const ids = ["knight", ...Object.keys(cards)].filter(
    (id) =>
      filter === "全部" ||
      (filter === "角色"
        ? id === "knight"
        : filter === "怪物"
          ? /^[neb]|^final/.test(id)
          : cards[id]?.kind === filter),
  );
  modal(
    "卡牌图鉴",
    '<div class="tabs">' +
      filters
        .map(
          (x) =>
            '<button class="mini ' +
            (x === filter ? "active" : "") +
            '" data-filter="' +
            x +
            '">' +
            x +
            "</button>",
        )
        .join("") +
      '</div><div class="catalog">' +
      ids
        .map(
          (id) =>
            '<button data-detail="' +
            id +
            '">' +
            art(id) +
            "<span>" +
            esc(cards[id]?.name || "初始骑士") +
            "</span></button>",
        )
        .join("") +
      "</div>",
    true,
    "atlas",
  );
}
function detail(id, back = false) {
  const c =
    cards[id] ||
    (id === "knight"
      ? {
          id,
          name: "初始骑士",
          kind: "角色",
          text: "初始攻击、防御与行动点数均为 1。拥有 3 个装备栏和 5 个道具栏。",
          hp: 10,
          atk: 1,
          def: 1,
        }
      : null);
  if (!c) return;
  const actions = (room?.game?.actions || []).filter((a) => a.card === id);
  modal(
    c.name,
    '<div class="entry-detail">' +
      art(id) +
      '<div><span class="kicker">' +
      esc(c.kind) +
      "</span>" +
      (c.hp
        ? "<p>" +
          hearts(c.hp, c.hp) +
          "<br>攻击 " +
          (id === "final" ? "对手防御 × 3" : c.atk) +
          " · 防御 " +
          (id === "final" ? "对手攻击 × 3" : c.def) +
          "</p>"
        : "") +
      (c.text ? "<p>" + esc(c.text) + "</p>" : "") +
      (c.effects || [])
        .filter((e) => e !== c.text)
        .map((e, i) => "<p>" + ["①", "②", "③"][i] + " " + esc(e) + "</p>")
        .join("") +
      "</div></div>" +
      (c.quote ? '<p class="quote">' + esc(c.quote) + "</p>" : "") +
      (actions.length
        ? '<div class="action-row">' +
          actions
            .map(
              (a) =>
                '<button class="mini" data-action="' +
                esc(a.id) +
                '">' +
                esc(a.label) +
                "</button>",
            )
            .join("") +
          "</div>"
        : "") +
      (back ? button("backAtlas", "返回图鉴", "", "soft") : ""),
  );
}
async function rules() {
  modal("游戏规则", '<div class="rules">正在读取规则…</div>', true, "rules");
  if (!rulesCache) {
    const res = await fetch("./assets/rules.txt");
    if (!res.ok) throw Error("读取规则失败。");
    rulesCache = await res.text();
  }
  if (modalName === "rules") $(".rules").textContent = rulesCache;
}
function sparks(x = innerWidth / 2, y = innerHeight / 2, n = 22) {
  if (reduced) return;
  const box = document.createElement("div");
  box.className = "sparks";
  for (let i = 0; i < n; i++) {
    const s = document.createElement("i"),
      angle = Math.random() * 2 * Math.PI,
      r = 40 + Math.random() * 170;
    s.style.cssText =
      "left:" +
      x +
      "px;top:" +
      y +
      "px;--dx:" +
      Math.cos(angle) * r +
      "px;--dy:" +
      Math.sin(angle) * r +
      "px;background:" +
      ["#f4b743", "#eb765c", "#41adab", "#fff6be"][i % 4];
    box.append(s);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 850);
}
function travel() {
  if (reduced) return;
  const el = $("#transition");
  el.classList.remove("go");
  void el.offsetWidth;
  el.classList.add("go");
  tone(740);
  setTimeout(() => el.classList.remove("go"), 1350);
}
async function api(route, body, seat = token) {
  const ctrl = new AbortController(),
    tm = setTimeout(() => ctrl.abort(), 5500);
  try {
    const res = await fetch("./api/" + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(seat ? { Authorization: "Bearer " + seat } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok)
      throw Object.assign(Error(data.error || "请求失败。"), {
        code: data.code,
      });
    return data;
  } finally {
    clearTimeout(tm);
  }
}
const onlineHost =
  /^(localhost|127\.0\.0\.1|\[::1\]|\d+\.\d+\.\d+\.\d+)$/.test(
    location.hostname,
  ) || location.protocol === "http:";
async function detect() {
  if (!onlineHost) return null;
  try {
    return await api("info", undefined, null);
  } catch {
    return null;
  }
}
function destination(raw) {
  const s = raw.trim();
  if (!s) throw Error("请输入房主的 IPv4 地址。");
  const m =
    /^(?:http:\/\/)?(localhost|(?:\d{1,3}\.){3}\d{1,3})(?::(\d{1,5}))?\/?$/i.exec(
      s,
    );
  if (!m || m[1].split(".").some((x) => Number(x) > 255))
    throw Error("请输入有效的 IPv4 地址，例如 192.168.1.23:3633。");
  const port = Number(m[2] || 3633);
  if (port < 1 || port > 65535) throw Error("端口须介于 1 和 65535 之间。");
  return new URL("http://" + m[1] + ":" + port).origin;
}
let bridgeCleanup;
function openBridge(origin, mode) {
  bridgeCleanup?.();
  const u = new URL("/connect", origin);
  u.searchParams.set("mode", mode);
  u.searchParams.set("origin", location.origin);
  u.hash = new URLSearchParams({ name: profile.name, color: profile.color });
  const pop = window.open(u.href, "_blank");
  if (!pop) {
    modal(
      "浏览器拦截了新窗口",
      '<p>请点击下方链接打开房主的游戏菜单。</p><a class="cta" href="' +
        esc(u.href) +
        '" target="_blank" rel="noopener">打开房间地址</a>',
    );
    return;
  }
  close();
  notice("正在连接房间…");
  const timer = setTimeout(() => {
    cleanup();
    try {
      pop.close();
    } catch {}
    showMenu();
    notice("连接失败，请确认房主服务已启动，并检查 IP 和网络。");
  }, 7500);
  function ack(e) {
    if (
      e.source !== pop ||
      e.origin !== origin ||
      e.data?.type !== "reroll-connected"
    )
      return;
    cleanup();
    notice("已连接，房间已在新窗口打开。");
  }
  function cleanup() {
    clearTimeout(timer);
    window.removeEventListener("message", ack);
    bridgeCleanup = null;
  }
  bridgeCleanup = cleanup;
  window.addEventListener("message", ack);
}
function hostHelp() {
  const setup = info
    ? "<p>要在自己的电脑开房，请启动房主包里的 <b>start-game.cmd</b>。服务已运行时，可直接连接本机。</p>"
    : '<p>房主电脑需要运行房间服务。同伴用浏览器加入即可。</p><ol><li>下载并解压房主包。</li><li>安装 Node.js 22 或更高版本，启动 <b>start-game.cmd</b>。</li><li>在打开的本机菜单创建房间，复制 IP 给同伴。</li></ol><a class="cta" href="./assets/host-kit.zip" download>下载房主包</a>';
  modal(
    "创建局域网房间",
    setup + button("bridgeCreate", "连接本机房间服务", "door", "cta primary"),
  );
}
function joinDialog() {
  const defaultIP =
    info && !info.canHost ? location.host : store.get("lastIP") || "";
  modal(
    "加入房间",
    '<form id="joinForm"><label class="field-label" for="joinIP">房主的 LAN / VPN 地址</label><input id="joinIP" required autocomplete="off" placeholder="192.168.1.23:3633" value="' +
      esc(defaultIP) +
      '"><button class="cta primary">' +
      icon("door") +
      "连接房间</button></form>",
  );
  $("#joinIP").focus();
}
async function enter(mode) {
  if (busy) return;
  busy = true;
  try {
    if (token) {
      try {
        const d = await api("state");
        close();
        setRoom(d.room);
        return;
      } catch (e) {
        if (["NO_SEAT", "NO_ROOM"].includes(e.code)) {
          token = null;
          store.set("seat", null);
        } else throw e;
      }
    }
    const d = await api(
      mode,
      { name: profile.name, color: profile.color },
      null,
    );
    token = d.token;
    store.set("seat", token);
    close();
    setRoom(d.room);
  } catch (e) {
    close();
    showMenu();
    notice("连接失败，" + (e.code ? e.message : "请检查房主服务与网络。"));
  } finally {
    busy = false;
  }
}
function soloStart(reset = false) {
  const roster = [
    { id: "solo", name: profile.name, color: profile.color, online: true },
  ];
  const saved = !reset && store.get("solo");
  soloState = saved ? restoreGame(saved) : newGame(roster);
  store.set("solo", soloState);
  close();
  setRoom({
    id: "solo",
    phase: "game",
    you: "solo",
    hostId: "solo",
    players: roster,
    chat: [],
    game: view(soloState, "solo"),
    revision: 0,
  });
}
function renderRoom() {
  if (!room) return;
  const chatInput = $("#chat input"),
    textValue = chatInput?.value,
    focus = document.activeElement === chatInput,
    selection = chatInput?.selectionStart;
  const oldChat = $(".chat-msg"),
    chatAtEnd =
      !oldChat ||
      oldChat.scrollHeight - oldChat.scrollTop - oldChat.clientHeight < 10,
    scroll = oldChat?.scrollTop,
    logTop = $(".logbox")?.scrollTop;
  app.innerHTML = room.game ? game(room, !!soloState) : lobby(room);
  document.body.classList.toggle("playing", !!room.game);
  const input = $("#chat input");
  if (input && textValue) input.value = textValue;
  if (focus && input) {
    input.focus({ preventScroll: true });
    input.setSelectionRange(selection, selection);
  }
  const next = $(".chat-msg");
  if (next) next.scrollTop = chatAtEnd ? next.scrollHeight : scroll;
  if ($(".logbox") && logTop) $(".logbox").scrollTop = logTop;
}
function setRoom(next) {
  const signature = JSON.stringify(next);
  lastPoll = Date.now();
  if (snapshot === signature) return;
  const old = room;
  room = next;
  snapshot = signature;
  if (old?.id !== next.id || (!old?.game && next.game)) {
    animToken++;
    animating = false;
    if (next.game) travel();
  }
  const sameGame = old?.game && next.game && next.id === old.id;
  const moves =
    sameGame && next.game.movementSequence > old.game.movementSequence
      ? next.game.movements
      : [];
  if (
    sameGame &&
    next.game.dice?.rollId &&
    next.game.dice.rollId !== old.game.dice?.rollId
  )
    animateDice(next.game.dice);
  if (!animating) renderRoom();
  if (moves.length && !reduced) cameraMove(next.game, moves);
  if (
    next.game &&
    old?.game &&
    next.game.players.some(
      (p) => old.game.players.find((q) => q.id === p.id)?.hp < p.hp,
    )
  ) {
    sparks(innerWidth * 0.74, innerHeight * 0.76, 12);
    tone(620);
  }
  if (
    next.game?.battle?.monster &&
    old?.game?.battle?.monster === next.game.battle.monster &&
    next.game.battle.hp < old.game.battle.hp
  ) {
    sparks(innerWidth * 0.52, innerHeight * 0.42, 20);
    tone(235);
  }
  if (next.game?.winner && !old?.game?.winner) {
    sparks(innerWidth / 2, innerHeight * 0.4, 60);
    tone(880);
  }
  if (
    next.game &&
    old?.game &&
    next.game.players.some(
      (p) => old.game.players.find((q) => q.id === p.id)?.hp > p.hp,
    )
  ) {
    app.classList.remove("impact");
    void app.offsetWidth;
    app.classList.add("impact");
    if (!reduced) navigator.vibrate?.(60);
    sparks(innerWidth * 0.54, innerHeight * 0.48, 13);
    tone(160);
  }
}
function animateDice(dice) {
  diceAnimation?.();
  if (reduced) return;
  const panel = document.createElement("div");
  panel.className = "dice-animation";
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = '<div class="rolling-faces"></div><b></b>';
  const heading = panel.querySelector("b");
  const faces = panel.querySelector(".rolling-faces");
  const visible = dice.values.slice(0, 8);
  const glyphs = "⚀⚁⚂⚃⚄⚅";
  const diceElements = visible.map(() => document.createElement("span"));
  faces.append(...diceElements);
  const show = (values) => {
    values.forEach((n, i) => {
      diceElements[i].textContent = glyphs[n - 1];
    });
  };
  show(visible.map(() => 1));
  heading.textContent = dice.label + " · 掷骰中";
  app.classList.add("rolling-dice");
  document.body.append(panel);
  let face = 1;
  const rolling = setInterval(() => {
    show(visible.map((_, i) => 1 + ((face + i) % 6)));
    face++;
  }, 75);
  const reveal = setTimeout(() => {
    clearInterval(rolling);
    show(visible);
    heading.textContent = dice.label + " · " + dice.total;
    panel.classList.add("revealed");
    app.classList.remove("rolling-dice");
    if (
      room?.game?.actor === room?.you &&
      document.activeElement === document.body
    )
      $(
        ".actions [data-action^='confirm'], .actions [data-action='check:accept']",
      )?.focus({ preventScroll: true });
  }, 740);
  const dismiss = setTimeout(() => diceAnimation?.(), 1450);
  diceAnimation = () => {
    clearInterval(rolling);
    clearTimeout(reveal);
    clearTimeout(dismiss);
    panel.remove();
    app.classList.remove("rolling-dice");
    diceAnimation = null;
  };
}

async function cameraMove(g, moves) {
  const tag = ++animToken;
  animating = true;
  const stage = $(".stage");
  if (!stage) {
    animating = false;
    return;
  }
  const drawPlayers = g.players.map((p) => ({
    ...p,
    pos: moves.find(({ id }) => id === p.id)?.from ?? p.pos,
  }));
  stage.innerHTML = board({ ...g, players: drawPlayers });
  const world = stage.firstElementChild;
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  function aim(pos) {
    const cell = world.querySelector('[data-tile="' + pos + '"]');
    if (!cell) return;
    const scale = 1.8;
    const x = Math.min(
        0,
        Math.max(
          world.clientWidth * (1 - scale),
          world.clientWidth / 2 -
            (cell.offsetLeft + cell.offsetWidth / 2) * scale,
        ),
      ),
      y = Math.min(
        0,
        Math.max(
          world.clientHeight * (1 - scale),
          world.clientHeight / 2 -
            (cell.offsetTop + cell.offsetHeight / 2) * scale,
        ),
      );
    world.style.transform =
      "translate(" + x + "px," + y + "px) scale(" + scale + ")";
  }
  world.style.transition = "transform .32s ease-in-out";
  aim(moves[0].from);
  await pause(340);
  for (const { id, from, to, stepwise } of moves) {
    const p = drawPlayers.find((player) => player.id === id);
    const steps = stepwise ? Math.min(12, Math.abs(to - from)) : 1;
    for (let i = 1; i <= steps; i++) {
      if (tag !== animToken) return;
      const old = p.pos;
      p.pos = from + Math.round(((to - from) * i) / steps);
      for (const n of [old, p.pos]) {
        const cell = world.querySelector('[data-tile="' + n + '"]'),
          on = drawPlayers.filter((x) => x.pos === n);
        cell.querySelector(".pawns").outerHTML = pawns(on);
        cell.classList.toggle("occupied", !!on.length);
      }
      aim(p.pos);
      await pause(stepwise ? 345 : 500);
    }
  }
  if (tag !== animToken) return;
  world.style.transform = "none";
  await pause(330);
  if (tag === animToken) {
    animating = false;
    renderRoom();
  }
}
function returnMenu(clear = false) {
  version++;
  animToken++;
  animating = false;
  diceAnimation?.();
  soloState = null;
  room = null;
  if (clear) {
    token = null;
    store.set("seat", null);
  }
  close();
  showMenu();
}
async function request(route, body = {}) {
  if (busy) return;
  busy = true;
  version++;
  try {
    if (soloState) {
      if (route === "restart") {
        soloStart(true);
        travel();
        return;
      }
      if (route === "destroy") {
        store.set("solo", null);
        returnMenu();
        return;
      }
      if (route === "leave") {
        returnMenu();
        return;
      }
      if (route === "action") {
        const replacement = structuredClone(soloState);
        act(replacement, "solo", body.actionId);
        soloState = replacement;
        store.set("solo", soloState);
        setRoom({
          ...room,
          revision: room.revision + 1,
          game: view(soloState, "solo"),
        });
      }
      return;
    }
    const old = room,
      data = await api(route, body);
    if (route === "destroy" || route === "leave") {
      returnMenu(route === "destroy" || (!old.game && old.hostId !== old.you));
      return;
    }
    if (data.room) setRoom(data.room);
  } catch (e) {
    notice(e.code || soloState ? e.message : "连接失败，正在等待房主服务。");
    if (e.code === "NO_ROOM" || e.code === "NO_SEAT") returnMenu(true);
  } finally {
    busy = false;
  }
}
async function poll() {
  if (polling || busy || !room || soloState) return;
  const epoch = version;
  polling = true;
  try {
    const d = await api("state");
    if (epoch === version && !busy) setRoom(d.room);
  } catch (e) {
    if (epoch !== version) return;
    if (["NO_ROOM", "NO_SEAT"].includes(e.code)) {
      returnMenu(true);
      notice(e.message);
    } else if (Date.now() - lastPoll > 12500) {
      returnMenu();
      notice("连接中断，使用原地址可返回房间。");
    }
  } finally {
    polling = false;
  }
}
function roomOpts() {
  modal(
    "房间选项",
    (room.id === "solo"
      ? ""
      : "<p>房间地址　" +
        esc(room.url) +
        "</p>" +
        button("copy", "复制邀请地址", "copy")) +
      button("leave", "返回主菜单", "door", "cta") +
      (room.hostId === room.you
        ? button("restart", "重新开始", "dice", "cta") +
          button("destroy", "解散房间", "close", "cta")
        : ""),
  );
}
function confirmation(route) {
  modal(
    route === "restart" ? "重新开始游戏？" : "解散房间？",
    "<p>" +
      (route === "restart"
        ? "所有骑士将从第 1 格重新出发。"
        : "本次对局和进度将结束。") +
      "</p>" +
      button(
        "confirm-" + route,
        route === "restart" ? "重新开始" : "解散房间",
        "",
        "cta primary",
      ) +
      button("close", "取消", "", "cta"),
  );
}
async function click(e) {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  try {
    if (d.color) {
      profile.color = d.color;
      store.set("profile", profile);
      document.querySelectorAll(".swatch").forEach((s) => {
        s.classList.toggle("selected", s === b);
        s.setAttribute("aria-pressed", String(s === b));
      });
      return;
    }
    if (d.filter) {
      atlas(d.filter);
      return;
    }
    if (d.detail) {
      detail(d.detail, modalName === "atlas");
      return;
    }
    if (d.tile) {
      if (animating) return;
      const t = room.game.board[Number(d.tile) - 1],
        r = regions.find((x) => x[0] === t.biome);
      modal(
        "第 " + t.pos + " 格 · " + tiles[t.type][0],
        "<p>" +
          esc(r[1]) +
          (t.terrain !== "plain" ? " · 触发特殊地形" : "") +
          (t.to ? " · 通往第 " + t.to + " 格" : "") +
          "</p>" +
          (t.monster
            ? button(
                "openMonster",
                esc(cards[t.monster]?.name),
                "skull",
                "soft",
                'data-monster="' + esc(t.monster) + '"',
              )
            : "") +
          "<p>" +
          room.game.players
            .filter((p) => p.pos === t.pos)
            .map((p) => esc(p.name))
            .join("　") +
          "</p>",
      );
      return;
    }
    if (d.action && app.classList.contains("rolling-dice")) return;
    if (d.action && room?.game?.phase === "offer" && !overlay.firstChild) {
      const offer = room.game.actions.find((a) => a.id === d.action);
      if (offer?.card) {
        detail(offer.card);
        return;
      }
    }
    if (d.action) {
      if (!busy && !animating) {
        diceAnimation?.();
        tone(495);
        close();
        await request("action", {
          actionId: d.action,
          revision: room.revision,
        });
      }
      return;
    }
    const k = d.do;
    if (!k) return;
    if (!["sound", "close"].includes(k)) tone();
    if (k === "close") {
      close();
      return;
    }
    if (k === "atlas" || k === "backAtlas") {
      atlas(k === "backAtlas" ? atlasFilter : "全部");
      return;
    }
    if (k === "rules") {
      await rules();
      return;
    }
    if (k === "openMonster") {
      detail(d.monster);
      return;
    }
    if (k === "sound") {
      muted = !muted;
      store.set("muted", muted);
      soundIcon();
      tone();
      notice(muted ? "音效已关闭" : "音效已开启");
      return;
    }
    if (k === "fullscreen") {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      return;
    }
    if (["create", "join", "solo", "bridgeCreate", "reconnect"].includes(k))
      profileSave();
    if (k === "solo") {
      soloStart();
      return;
    }
    if (k === "create") {
      if (info?.canHost) await enter("create");
      else hostHelp();
      return;
    }
    if (k === "bridgeCreate") {
      openBridge("http://127.0.0.1:3633", "create");
      return;
    }
    if (k === "join") {
      joinDialog();
      return;
    }
    if (k === "reconnect") {
      await enter("join");
      return;
    }
    if (k === "roomOptions") {
      roomOpts();
      return;
    }
    if (k === "legend") {
      modal(
        "地图图例",
        '<div class="legend">' +
          Object.values(tiles)
            .map(
              (t) =>
                '<span style="color:' +
                t[2] +
                '">' +
                icon(t[1]) +
                " " +
                t[0] +
                "</span>",
            )
            .join("") +
          "</div><p>路线按数字从 1 到 100 蛇形前进，每 25 格更换环境。平原无额外效果。落在沙漠后退 1 格，从雨林出发前须判定，落在火山失去 1 点生命。火山中的传说宝箱只提供传说装备。</p>",
      );
      return;
    }
    if (k === "copy") {
      const txt = room.url;
      try {
        if (!navigator.clipboard) throw Error();
        await navigator.clipboard.writeText(txt);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = txt;
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        if (!ok) {
          modal("复制房间地址", '<input readonly value="' + esc(txt) + '">');
          overlay.querySelector("input").select();
          return;
        }
      }
      notice("已复制房间地址 " + txt);
      return;
    }
    if (k === "leave") {
      await request("leave");
      return;
    }
    if (k === "restart" || k === "destroy") {
      confirmation(k);
      return;
    }
    if (k === "start") {
      close();
      await request("start");
      return;
    }
    if (k.startsWith("confirm-")) {
      close();
      await request(k.slice(8));
    }
  } catch (err) {
    notice(err.message || "操作失败。");
  }
}
app.addEventListener("change", (e) => {
  if (e.target.id === "address")
    request("address", { address: e.target.value });
  if (e.target.id === "pname" && e.target.value.trim()) {
    profile.name = e.target.value.trim();
    store.set("profile", profile);
  }
});
document.addEventListener("click", click);
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    if (e.target.id === "chat") {
      if (busy) return;
      const input = e.target.querySelector("input"),
        text = input.value.trim();
      if (text) {
        input.value = "";
        await request("chat", { text });
      }
    }
    if (e.target.id === "joinForm") {
      const origin = destination($("#joinIP").value);
      store.set("lastIP", new URL(origin).host);
      if (origin === location.origin) await enter("join");
      else openBridge(origin, "join");
    }
  } catch (err) {
    notice(err.message);
  }
});
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) close();
});
document.addEventListener("keydown", (e) => {
  if (!overlay.firstChild) return;
  if (e.key === "Escape") close();
  if (e.key === "Tab") {
    const all = overlay.querySelectorAll("button,input,a[href],select");
    if (!all.length) return;
    if (e.shiftKey && document.activeElement === all[0]) {
      e.preventDefault();
      all[all.length - 1].focus();
    } else if (!e.shiftKey && document.activeElement === all[all.length - 1]) {
      e.preventDefault();
      all[0].focus();
    }
  }
});
for (let i = 0; i < 18 && !reduced; i++) {
  const s = document.createElement("b");
  s.style.cssText =
    "left:" +
    Math.random() * 100 +
    "%;top:" +
    Math.random() * 100 +
    "%;animation-delay:-" +
    Math.random() * 8 +
    "s";
  $("#dust").append(s);
}
showMenu();
soundIcon();
const query = new URLSearchParams(location.search),
  mode = query.get("mode");
if (mode || hash.has("name")) history.replaceState(null, "", location.pathname);
info = await detect();
if (info && (mode === "join" || mode === "create")) {
  await enter(mode);
} else if (info && token) {
  try {
    const v = await api("state");
    setRoom(v.room);
  } catch (e) {
    if (e.code === "NO_ROOM" || e.code === "NO_SEAT") returnMenu(true);
  }
}
setInterval(poll, 900);
