import { cards } from "./cards.mjs";
import { newGame, restoreGame, act, view } from "./game.mjs";
import {
  esc,
  icon,
  art,
  cardEffects,
  textLines,
  formatElapsed,
  offlineVotePrompt,
  palette,
  regions,
  tiles,
  hearts,
  button,
  menu,
  lobby,
  game,
  board,
  actionItem,
  chatMessages,
  dieCube,
  diceLayout,
  pawns,
  parityLabel,
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
  combatSequence = 0,
  battleEffectSequence = 0,
  announcementSequence = 0,
  announcementTimer = null,
  gameClock = null,
  clockTimer,
  playback = null,
  shownWinner = null,
  diceAnimation = null,
  reviewedDice = null,
  handSelection = null,
  reminderTimer,
  reminderKey = "",
  previousFocus = null,
  atlasFilter = "",
  modalName = "",
  rulesCache = "",
  muted = store.get("muted") ?? false;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const visualQueue = [];
const announcementQueue = [];
const announcementLive = document.createElement("div");
announcementLive.className = "announcement-live";
announcementLive.setAttribute("role", "status");
announcementLive.setAttribute("aria-atomic", "true");
document.body.append(announcementLive);
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
  const cardLayout = key === "card";
  const dismiss = button(
    "close",
    "",
    "close",
    cardLayout ? "card-close" : "mini",
    'aria-label="关闭"',
  );
  const heading = cardLayout
    ? dismiss
    : '<div class="panel-heading"><h2>' +
      esc(title) +
      "</h2>" +
      dismiss +
      "</div>";
  overlay.innerHTML =
    '<section role="dialog" aria-modal="true" aria-label="' +
    esc(title) +
    '" class="modal paper ' +
    (cardLayout ? "card-inspection" : wide ? "wide" : "") +
    '">' +
    heading +
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
function detail(id, back = false, confirm = null) {
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
  modal(
    c.name,
    '<div class="entry-detail"><span class="kicker">' +
      esc(c.kind) +
      '</span><div class="card-detail-art">' +
      art(id) +
      "</div><h2>" +
      esc(c.name) +
      "</h2>" +
      (c.hp
        ? "<p>" +
          hearts(c.hp, c.hp) +
          "<br>攻击 " +
          (id === "final" ? "对手防御 × 4" : c.atk) +
          " · 防御 " +
          (id === "final" ? "对手攻击 × 4" : c.def) +
          "</p>"
        : "") +
      '<div class="card-effects">' +
      cardEffects(c) +
      "</div>" +
      (c.quote ? '<p class="quote">' + textLines(c.quote) + "</p>" : "") +
      "</div>" +
      (confirm
        ? '<div class="card-confirmation">' +
          (confirm.note ? "<p>" + esc(confirm.note) + "</p>" : "") +
          '<div class="action-row"><button type="button" class="cta primary" data-action="' +
          esc(confirm.id) +
          '">' +
          esc(confirm.label) +
          "</button>" +
          button("close", "取消", "", "soft") +
          "</div></div>"
        : "") +
      (back ? button("backAtlas", "返回图鉴", "", "soft") : ""),
    false,
    "card",
  );
}
function confirmCardChoice(id) {
  const actions = room?.game?.actions || [];
  const action = actions.find((a) => a.id === id);
  if (!action?.card || busy || controlsLocked()) return;
  const pending = actions.find((a) => a.id === "decline");
  const verb = id.split(":")[0];
  const labels = {
    replace: "确认替换",
    decline: "确认放弃",
    discard: "确认弃置",
  };
  const note =
    verb === "replace" && pending
      ? "用「" + cards[pending.card].name + "」替换这张卡牌。"
      : action.needsReplacement
        ? "需先选择一张已有卡牌替换，才能领取。"
        : "";
  detail(action.card, false, {
    id,
    label:
      labels[verb] ||
      (action.needsReplacement ? "选择要替换的卡牌" : "确认领取"),
    note,
  });
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
function renderRoom(displayGame = room?.game, combatResolving = false) {
  if (!room) return;
  const focused = document.activeElement,
    focusPanel = focused?.closest(".field-panel summary")?.parentElement.id,
    focusHand = focused?.closest(".hand-card")?.dataset.itemIndex,
    focusCard = focused?.closest("[data-card-choice]")?.dataset.cardChoice,
    chatInput = $("#chat input"),
    textValue = chatInput?.value,
    focus = focused === chatInput,
    selection = chatInput?.selectionStart;
  const oldChat = $(".chat-msg"),
    chatAtEnd = atEnd(oldChat),
    scroll = oldChat?.scrollTop,
    logTop = $(".logbox")?.scrollTop,
    rewardTop = $(".reward-panel")?.scrollTop,
    handScroll = $(".item-hand")?.scrollLeft,
    openPanels = [...app.querySelectorAll(".field-panel[open]")].map(
      (panel) => panel.id,
    );
  app.innerHTML = displayGame
    ? game(
        { ...room, game: displayGame },
        !!soloState,
        combatResolving,
        handSelection,
      )
    : lobby(room);
  if (controlsLocked()) {
    $(".action-row")?.setAttribute("inert", "");
    $(".exit-dock .surrender-button")?.setAttribute("inert", "");
    $(".reward-panel")?.setAttribute("inert", "");
  }
  tickGameClock();
  updateOfflineVote();
  zoomMovementPreview();
  diceAnimation?.position();
  for (const id of openPanels) {
    const panel = document.getElementById(id);
    if (panel) panel.open = true;
  }
  if (handScroll && $(".item-hand")) $(".item-hand").scrollLeft = handScroll;
  if (rewardTop && $(".reward-card[data-card-choice]"))
    $(".reward-panel").scrollTop = rewardTop;
  document.body.classList.toggle("playing", !!room.game);
  const input = $("#chat input");
  if (input && textValue) input.value = textValue;
  if (focus && input) {
    input.focus({ preventScroll: true });
    input.setSelectionRange(selection, selection);
  } else if (focusPanel) {
    document
      .getElementById(focusPanel)
      ?.querySelector("summary")
      ?.focus({ preventScroll: true });
  } else if (focusHand !== undefined) {
    $('.hand-card[data-item-index="' + focusHand + '"]')?.focus({
      preventScroll: true,
    });
  } else if (focusCard) {
    $('[data-card-choice="' + CSS.escape(focusCard) + '"]')?.focus({
      preventScroll: true,
    });
  }
  const next = $(".chat-msg");
  if (next) next.scrollTop = chatAtEnd ? next.scrollHeight : scroll;
  if ($(".logbox") && logTop) $(".logbox").scrollTop = logTop;
}
function atEnd(el) {
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 10;
}
function renderLiveRoom() {
  renderRoom();
  const winner = room?.game?.winner;
  if (winner && winner !== shownWinner) {
    shownWinner = winner;
    sparks(innerWidth / 2, innerHeight * 0.4, 60);
    tone(880);
  }
}
function cancelPlayback() {
  playback?.abort();
  playback = null;
  visualQueue.length = 0;
  diceAnimation?.close();
  reviewedDice = null;
  handSelection = null;
  combatSequence = 0;
  battleEffectSequence = 0;
  clearTimeout(clockTimer);
  gameClock = null;
  resetAnnouncements();
  shownWinner = null;
  app.classList.remove("moving-board");
}
function controlsLocked() {
  return !!playback;
}

function tickGameClock() {
  clearTimeout(clockTimer);
  if (!gameClock) return;
  const { elapsed, receivedAt, frozen, lastSecond } = gameClock;
  const current = elapsed + (frozen ? 0 : performance.now() - receivedAt);
  const second = frozen
    ? Math.floor(current / 1000)
    : Math.max(lastSecond, Math.floor(current / 1000));
  gameClock.lastSecond = second;
  const timer = $(".elapsed-timer");
  const duration = "PT" + second + "S";
  if (timer && timer.dateTime !== duration) {
    timer.dateTime = duration;
    timer.textContent = formatElapsed(second * 1000);
  }
  if (!frozen)
    clockTimer = setTimeout(
      tickGameClock,
      Math.max(20, (second + 1) * 1000 - current),
    );
}

function syncGameClock(g, receivedAt, sameGame) {
  gameClock = g
    ? {
        elapsed: Math.max(0, g.elapsedMs || 0),
        receivedAt,
        frozen: !!g.winner,
        lastSecond: sameGame ? (gameClock?.lastSecond ?? 0) : 0,
      }
    : null;
  tickGameClock();
}

function updateOfflineVote() {
  const target = $(".offline-vote-region");
  if (!target) return;
  const html = offlineVotePrompt(room?.game, !controlsLocked());
  if (target.innerHTML !== html) target.innerHTML = html;
}

function resetAnnouncements() {
  clearTimeout(announcementTimer);
  announcementTimer = null;
  announcementSequence = 0;
  announcementQueue.length = 0;
  $(".game-announcement")?.remove();
  announcementLive.textContent = "";
}

function playAnnouncement() {
  if (announcementTimer || !announcementQueue.length) return;
  const { kind, text } = announcementQueue.shift();
  const layer = document.createElement("div");
  layer.className = "game-announcement";
  layer.dataset.kind = kind;
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML =
    '<p class="announcement-banner">' +
    icon(kind === "rebirth" ? "fire" : "flag") +
    "</p>";
  layer.firstElementChild.append(document.createTextNode(text));
  const duration = 2800;
  layer.style.setProperty("--announcement-duration", duration + "ms");
  document.body.append(layer);
  announcementLive.textContent = text;
  announcementTimer = setTimeout(() => {
    layer.remove();
    announcementLive.textContent = "";
    announcementTimer = null;
    playAnnouncement();
  }, duration);
}

function syncAnnouncements(events, sameGame) {
  if (sameGame) {
    for (const event of events)
      if (event.seq > announcementSequence) announcementQueue.push(event);
  }
  announcementSequence = Math.max(
    announcementSequence,
    events.at(-1)?.seq ?? 0,
  );
  playAnnouncement();
}

function sameDiceResult(previous, next) {
  return (
    previous?.values?.length === next.values.length &&
    previous.label === next.label &&
    previous.total === next.total &&
    previous.parity === next.parity &&
    previous.review?.result === next.review?.result &&
    previous.values.every((value, index) => value === next.values[index])
  );
}

function nextDiceReview(previous, next, sameGame, resumedVote) {
  if (!next?.review?.key || !next.values?.length) return null;
  if (!sameGame || resumedVote || next.rollId !== previous?.rollId) return next;
  if (next.review.key !== previous?.review?.key) return null;
  return reviewedDice || !sameDiceResult(previous, next) ? next : null;
}

function renderDiceReview() {
  if (!reviewedDice) diceAnimation?.close();
  else if (diceAnimation) diceAnimation.update(reviewedDice);
  else createDicePanel(reviewedDice);
}

function setRoom(next) {
  const receivedAt = performance.now();
  const signature = JSON.stringify(next, (key, value) =>
    key === "elapsedMs" ? undefined : value,
  );
  lastPoll = Date.now();
  const old = room;
  room = next;
  const sameGame =
    old?.id === next.id &&
    old?.game &&
    next.game &&
    old.game.matchId === next.game.matchId;
  if (snapshot === signature) {
    syncGameClock(next.game, receivedAt, sameGame);
    return;
  }
  snapshot = signature;
  const events = next.game?.combatEvents || [];
  const effectEvents = next.game?.battleEffectEvents || [];
  if (!sameGame) {
    cancelPlayback();
    combatSequence = events.at(-1)?.seq ?? 0;
    battleEffectSequence = effectEvents.at(-1)?.seq ?? 0;
    if (next.game) travel();
  }
  syncGameClock(next.game, receivedAt, sameGame);
  syncAnnouncements(next.game?.announcements || [], sameGame);
  const strikes = events.filter((event) => event.seq > combatSequence);
  combatSequence = Math.max(combatSequence, events.at(-1)?.seq ?? 0);
  const effects = effectEvents.filter(
    (event) => event.seq > battleEffectSequence,
  );
  battleEffectSequence = Math.max(
    battleEffectSequence,
    effectEvents.at(-1)?.seq ?? 0,
  );
  const moves =
    sameGame && next.game.movementSequence > old.game.movementSequence
      ? next.game.movements
      : [];
  const dice = next.game?.dice;
  const resumedVote = old?.game?.offlineVote && !next.game?.offlineVote;
  reviewedDice = nextDiceReview(old?.game?.dice, dice, sameGame, resumedVote);
  if (
    sameGame &&
    !reduced &&
    dice?.values?.length &&
    dice.rollId !== old.game.dice?.rollId
  ) {
    visualQueue.push({
      dice,
      game: strikes.length ? old.game : next.game,
      resolving: strikes.length > 0,
    });
  }
  for (const strike of strikes) {
    if (strike.frame?.battle)
      visualQueue.push({ strike, game: next.game, log: old.game.log });
  }
  for (const effect of effects) {
    if (next.game.battle) visualQueue.push({ effect, game: next.game });
  }
  if (moves.length && !reduced) visualQueue.push({ game: next.game, moves });
  const alreadyPlaying = controlsLocked();
  if (alreadyPlaying) {
    updateOfflineVote();
    const messages = $(".chat-msg");
    if (messages && JSON.stringify(old.chat) !== JSON.stringify(next.chat)) {
      const scrollToEnd = atEnd(messages);
      messages.innerHTML = chatMessages(next.chat);
      if (scrollToEnd) messages.scrollTop = messages.scrollHeight;
    }
  } else if (visualQueue.length) {
    void playVisuals();
  } else {
    renderLiveRoom();
    renderDiceReview();
  }
  scheduleTurnReminder(next);
  if (strikes.length || effects.length || alreadyPlaying) return;
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

function scheduleTurnReminder(next) {
  const actor = next?.game?.actor;
  const key =
    actor &&
    !next.game.winner &&
    next.game.players.some((p) => p.id === actor && p.online)
      ? next.id + ":" + next.revision + ":" + actor
      : "";
  if (reminderKey === key) return;
  reminderKey = key;
  clearTimeout(reminderTimer);
  app.querySelector(".turn-reminder")?.classList.remove("turn-reminder");
  if (!key) return;
  const remind = () => {
    if (controlsLocked() || busy) {
      reminderTimer = setTimeout(remind, 500);
      return;
    }
    const card = [...app.querySelectorAll("[data-player]")].find(
      (el) => el.dataset.player === actor,
    );
    if (card) card.classList.add("turn-reminder");
  };
  reminderTimer = setTimeout(remind, 5000);
}

function pauseVisual(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => finish(true), ms);
    const abort = () => finish(false);
    function finish(completed) {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      resolve(completed);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function playVisuals() {
  const controller = new AbortController();
  const { signal } = controller;
  playback = controller;
  let focusDice = false;
  try {
    while (visualQueue.length && !signal.aborted) {
      const job = visualQueue.shift();
      if (job.dice) {
        renderRoom(job.game, job.resolving);
        await animateDice(job.dice, signal);
        focusDice = true;
      } else if (job.strike) {
        diceAnimation?.close();
        await animateStrike(job, signal);
        focusDice = false;
      } else if (job.effect) {
        diceAnimation?.close();
        await animateBattleEffect(job, signal);
        focusDice = false;
      } else {
        diceAnimation?.close();
        app.classList.add("moving-board");
        renderRoom(job.game);
        await cameraMove(job.game, job.moves, signal);
        if (playback === controller) app.classList.remove("moving-board");
        focusDice = false;
      }
    }
  } finally {
    if (playback === controller) {
      playback = null;
      app.classList.remove("moving-board");
      renderLiveRoom();
      renderDiceReview();
      if (
        focusDice &&
        reviewedDice &&
        room?.game?.actor === room?.you &&
        document.activeElement === document.body
      )
        $(
          ".actions :is([data-action='confirm'], [data-action='confirmAttack'], [data-action='confirmEquipment'], [data-action='check:accept'])",
        )?.focus({ preventScroll: true });
    }
  }
}

function createDicePanel(dice, rolling = false) {
  diceAnimation?.close();
  const panel = document.createElement("div");
  panel.className = "dice-animation";
  panel.innerHTML =
    '<div class="rolling-faces" aria-hidden="true"></div><b role="status"></b>' +
    '<div class="dice-pager" hidden><button type="button" aria-label="上一页骰子">‹</button>' +
    '<span></span><button type="button" aria-label="下一页骰子">›</button></div>';
  const heading = panel.querySelector("b");
  const faces = panel.querySelector(".rolling-faces");
  const pager = panel.querySelector(".dice-pager");
  const [previous, next] = pager.querySelectorAll("button");
  const pageNumber = pager.querySelector("span");
  let pageSize = 1,
    page = 0,
    tick = 0,
    revealed = !rolling;
  const pageCount = () => Math.ceil(dice.values.length / pageSize);
  function describe() {
    const result = dice.review?.result;
    heading.textContent = revealed
      ? dice.label +
        " · " +
        dice.total +
        parityLabel(dice.parity) +
        (result ? " · " + result : "")
      : dice.label + " · 掷骰中";
  }
  const show = () => {
    for (let i = 0; i < faces.children.length; i++) {
      const n = revealed
        ? dice.values[page * pageSize + i]
        : 1 + ((tick + i) % 6);
      faces.children[i].dataset.face = n;
    }
  };
  function drawPage() {
    const length = Math.min(pageSize, dice.values.length - page * pageSize);
    if (faces.childElementCount !== length)
      faces.innerHTML = dieCube.repeat(length);
    pager.hidden = !revealed || pageCount() < 2;
    previous.disabled = page === 0;
    next.disabled = page >= pageCount() - 1;
    pageNumber.textContent = page + 1 + " / " + pageCount();
    show();
  }
  function position() {
    const anchor = $(".actions") || $(".hand-dock") || $(".stage");
    if (!anchor) return;
    const { left, top, width } = anchor.getBoundingClientRect();
    const { width: panelWidth, height } = panel.getBoundingClientRect();
    const margin = 8;
    const center = Math.max(
      panelWidth / 2 + margin,
      Math.min(innerWidth - panelWidth / 2 - margin, left + width / 2),
    );
    panel.style.left = center + "px";
    panel.style.top =
      Math.max(margin, Math.min(top, innerHeight) - height - margin) + "px";
  }
  function fit() {
    const anchor = $(".actions") || $(".hand-dock");
    const rect = anchor?.getBoundingClientRect();
    const space = rect ? Math.min(rect.top, innerHeight) : innerHeight;
    const {
      columns,
      size,
      pageSize: capacity,
    } = diceLayout(
      dice.values.length,
      Math.max(1, Math.floor(innerWidth * 0.94) - 40),
      Math.max(
        18,
        Math.min(Math.floor(innerHeight * 0.49), Math.floor(space - 66)),
      ),
    );
    page = Math.min(
      Math.floor((page * pageSize) / capacity),
      Math.ceil(dice.values.length / capacity) - 1,
    );
    pageSize = capacity;
    faces.style.setProperty("--die-size", size + "px");
    faces.style.inlineSize = columns * size + "px";
    drawPage();
    position();
  }
  previous.onclick = () => {
    page--;
    drawPage();
    position();
  };
  next.onclick = () => {
    page++;
    drawPage();
    position();
  };
  describe();
  panel.classList.toggle("revealed", revealed);
  app.classList.toggle("rolling-dice", rolling);
  document.body.append(panel);
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("scroll", fit, { passive: true });
  const tumbling = rolling
    ? setInterval(() => {
        tick++;
        show();
      }, 75)
    : null;
  const animation = {
    reveal() {
      clearInterval(tumbling);
      revealed = true;
      drawPage();
      describe();
      panel.classList.add("revealed");
      app.classList.remove("rolling-dice");
      position();
    },
    update(nextDice) {
      const newRoll = dice.rollId !== nextDice.rollId;
      if (!newRoll && sameDiceResult(dice, nextDice)) return;
      if (newRoll) page = 0;
      dice = nextDice;
      fit();
      describe();
      position();
    },
    position: fit,
    close() {
      clearInterval(tumbling);
      window.removeEventListener("resize", fit);
      window.removeEventListener("scroll", fit);
      panel.remove();
      app.classList.remove("rolling-dice");
      diceAnimation = null;
    },
  };
  diceAnimation = animation;
  return animation;
}

async function animateDice(dice, signal) {
  const animation = createDicePanel(dice, true);
  if (!(await pauseVisual(740, signal))) return;
  animation.reveal();
  if (!dice.review) await pauseVisual(160, signal);
}

function effectAt(layer, className, bounds, content = "") {
  const effect = document.createElement("div");
  effect.className = className;
  effect.style.left = bounds.x + "px";
  effect.style.top = bounds.y + "px";
  effect.innerHTML = content;
  layer.append(effect);
  return effect;
}

async function animateStrike({ strike, game: next, log }, signal) {
  const { attacker, defender, hit, fallen, frame } = strike;
  const players = next.players.map((p) => ({
    ...p,
    ...frame.players.find((fighter) => fighter.id === p.id),
  }));
  renderRoom(
    {
      ...next,
      battle: frame.battle,
      actor: attacker ?? defender ?? frame.battle.actorId,
      players,
      winner: null,
      log,
    },
    true,
  );

  const layer = $(".combat-effects");
  const area = layer.getBoundingClientRect();
  const fighters = new Map(
    [...app.querySelectorAll("[data-combatant]")].map((el) => [
      el.dataset.combatant,
      el.querySelector("[data-combat-focus]") || el,
    ]),
  );
  const positions = new Map(
    [...fighters].map(([id, el]) => {
      const { left, top, width, height } = el.getBoundingClientRect();
      const x = left - area.left,
        y = top - area.top;
      return [
        id,
        {
          x,
          y,
          width,
          height,
          center: { x: x + width / 2, y: y + height / 2 },
        },
      ];
    }),
  );
  const source = fighters.get(attacker),
    target = fighters.get(defender);
  const origin = positions.get(attacker)?.center;
  const contact = positions.get(defender)?.center;
  if (!reduced && source && target) {
    const dx = contact.x - origin.x,
      dy = contact.y - origin.y;
    source.style.setProperty("--lunge-x", dx * 0.68 + "px");
    source.style.setProperty("--lunge-y", dy * 0.68 + "px");
    source.classList.add("combat-lunging");
    const trail = effectAt(layer, "combat-trail", origin);
    trail.setAttribute("aria-hidden", "true");
    trail.style.width = Math.hypot(dx, dy) + "px";
    trail.style.setProperty("--trail-angle", Math.atan2(dy, dx) + "rad");
    tone(360);
    if (!(await pauseVisual(365, signal))) return;
    target.style.setProperty("--recoil", Math.sign(dx) * 20 + "px");
  }
  if (target) {
    const reaction = hit ? "hit" : "guard";
    target.classList.add("combat-" + reaction);
    effectAt(
      layer,
      "combat-result " + reaction,
      contact,
      icon(hit ? "sword" : "shield") +
        "<b>" +
        (hit ? "成功攻击" : "成功防御") +
        "</b>",
    );
    tone(hit ? 155 : 535);
    if (!reduced && hit) navigator.vibrate?.(45);
  }
  if (!fallen.length) {
    await pauseVisual(reduced ? 580 : 560, signal);
    return;
  }
  if (target && !(await pauseVisual(reduced ? 350 : 405, signal))) return;
  for (const id of fallen) {
    const el = fighters.get(id),
      bounds = positions.get(id);
    if (!el) continue;
    if (reduced) {
      el.classList.add("combat-fallen");
    } else {
      const pieces = effectAt(layer, "combat-fracture", bounds);
      pieces.setAttribute("aria-hidden", "true");
      pieces.style.width = bounds.width + "px";
      pieces.style.height = bounds.height + "px";
      for (let i = 0; i < 4; i++) {
        const shard = document.createElement("div");
        shard.className = "combat-shard";
        const copy = el.cloneNode(true);
        copy.classList.remove("combat-lunging", "combat-hit", "combat-guard");
        copy.removeAttribute("data-combatant");
        copy.removeAttribute("data-combat-focus");
        copy
          .querySelector("[data-combat-focus]")
          ?.removeAttribute("data-combat-focus");
        shard.append(copy);
        pieces.append(shard);
      }
      el.classList.add("combat-broken");
    }
    effectAt(
      layer,
      "combat-result fallen",
      bounds.center,
      icon("skull") + "<b>击败</b>",
    );
  }
  tone(105);
  await pauseVisual(reduced ? 620 : 950, signal);
}

async function animateBattleEffect({ effect, game: next }, signal) {
  renderRoom(next, true);
  const { kind, target, changes } = effect;
  const labels = { lock: "装备封锁", disable: "效果封印", cleanse: "状态净化" };
  const layer = $(".combat-effects");
  const fighter =
    $('[data-combatant="' + CSS.escape(target) + '"]') ||
    (target === "$monster" ? $(".enemy-line") : null);
  const sidebar = $(".passives");
  const focus = fighter || sidebar;
  const rect = focus.getBoundingClientRect();
  const area = layer.getBoundingClientRect();
  if (kind === "lock") {
    for (const { id } of changes) {
      $(
        '[data-player="' +
          CSS.escape(target) +
          '"] [data-gear-slot="' +
          CSS.escape(id) +
          '"]',
      )?.classList.add("gear-effect-locked");
    }
  }
  focus.classList.add("combat-effect-" + kind);
  sidebar.classList.add("effect-sidebar-pulse");
  const result = effectAt(
    layer,
    "combat-result status-result status-" + kind,
    {
      x: rect.left + rect.width / 2 - area.left,
      y: rect.top + rect.height / 2 - area.top,
    },
    icon(kind === "lock" ? "lock" : kind === "cleanse" ? "plus" : "key") +
      "<b>" +
      labels[kind] +
      "</b><small>" +
      changes.map((change) => textLines(change.label)).join("、") +
      "</small>",
  );
  result.setAttribute("role", "status");
  tone(kind === "cleanse" ? 665 : 260);
  await pauseVisual(reduced ? 680 : 1120, signal);
}

function zoomMovementPreview() {
  const world = $(".stage > .board[data-movement-preview]");
  if (!world) return;
  const tiles = [...world.querySelectorAll("[data-preview]")];
  if (!tiles.length) return;
  const left = Math.min(...tiles.map((tile) => tile.offsetLeft));
  const top = Math.min(...tiles.map((tile) => tile.offsetTop));
  const right = Math.max(
    ...tiles.map((tile) => tile.offsetLeft + tile.offsetWidth),
  );
  const bottom = Math.max(
    ...tiles.map((tile) => tile.offsetTop + tile.offsetHeight),
  );
  const width = world.clientWidth;
  const height = world.clientHeight;
  const scale = Math.max(
    1,
    Math.min(2.35, width / (right - left + 16), height / (bottom - top + 16)),
  );
  const x = Math.min(
    0,
    Math.max(width * (1 - scale), width / 2 - ((left + right) * scale) / 2),
  );
  const y = Math.min(
    0,
    Math.max(height * (1 - scale), height / 2 - ((top + bottom) * scale) / 2),
  );
  world.style.transform =
    "translate(" + x + "px," + y + "px) scale(" + scale + ")";
}
window.addEventListener("resize", zoomMovementPreview);

async function cameraMove(g, moves, signal) {
  const stage = $(".stage");
  if (!stage) return;
  const drawPlayers = g.players.map((p) => ({
    ...p,
    pos: moves.find(({ id }) => id === p.id)?.from ?? p.pos,
  }));
  stage.innerHTML = board({
    ...g,
    players: drawPlayers,
    movementPreview: null,
  });
  const world = stage.firstElementChild;
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
  if (!(await pauseVisual(340, signal))) return;
  for (const { id, from, to, stepwise } of moves) {
    const p = drawPlayers.find((player) => player.id === id);
    const steps = stepwise ? Math.min(12, Math.abs(to - from)) : 1;
    for (let i = 1; i <= steps; i++) {
      const old = p.pos;
      p.pos = from + Math.round(((to - from) * i) / steps);
      for (const n of [old, p.pos]) {
        const cell = world.querySelector('[data-tile="' + n + '"]'),
          on = drawPlayers.filter((x) => x.pos === n);
        cell.querySelector(".pawns").outerHTML = pawns(on);
        cell.classList.toggle("occupied", !!on.length);
      }
      aim(p.pos);
      if (!(await pauseVisual(stepwise ? 345 : 500, signal))) return;
    }
  }
  world.style.transform = "none";
  await pauseVisual(330, signal);
}
function returnMenu(clear = false) {
  version++;
  cancelPlayback();
  scheduleTurnReminder(null);
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
  if (busy || (route === "action" && controlsLocked())) return;
  busy = true;
  version++;
  try {
    if (soloState) {
      if (route === "restart") {
        soloStart(true);
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
async function submitAction(actionId) {
  if (
    busy ||
    controlsLocked() ||
    !room?.game?.actions.some((a) => a.id === actionId)
  )
    return;
  handSelection = null;
  tone(495);
  close();
  await request("action", { actionId, revision: room.revision });
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
    if (d.cardChoice) {
      confirmCardChoice(d.cardChoice);
      return;
    }
    if (d.handItem) {
      if (controlsLocked() || busy) return;
      const card = d.handItem;
      const index = Number(d.itemIndex);
      const g = room?.game;
      const menu = g?.itemMenu || g?.battle?.itemMenu;
      const options = (g?.actions || []).filter((a) => actionItem(a) === card);
      if (menu || !options.length) {
        detail(card);
      } else if (options.length === 1 && options[0].opensItemMenu) {
        await submitAction(options[0].id);
        (
          $(".equipment-targets [data-action], .passives [data-action]") ||
          $(".actions [data-action]")
        )?.focus({ preventScroll: true });
      } else {
        handSelection = handSelection?.index === index ? null : { card, index };
        renderRoom();
        const focus = handSelection
          ? $(".actions [data-action]")
          : $('.hand-card[data-item-index="' + index + '"]');
        focus?.focus({ preventScroll: true });
      }
      return;
    }
    if (d.detail) {
      detail(d.detail, modalName === "atlas");
      return;
    }
    if (d.tile) {
      if (controlsLocked()) return;
      const t = room.game.board[Number(d.tile) - 1],
        r = regions.find((x) => x[0] === t.biome);
      modal(
        "第 " + t.pos + " 格 · " + tiles[t.type][0],
        "<p>" +
          esc(r[1]) +
          (t.terrain !== "plain" ? " · 触发特殊地形" : "") +
          (t.to ? " · 通往第 " + t.to + " 格" : "") +
          "</p>" +
          (t.banana
            ? "<p>这里放置了香蕉皮。经过的玩家会停在此格，可用净化清除并继续移动。</p>"
            : "") +
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
    if (d.action && controlsLocked()) return;
    if (
      d.action?.startsWith("discard:") &&
      room?.game?.phase === "deathDiscard" &&
      !overlay.firstChild
    ) {
      confirmCardChoice(d.action);
      return;
    }
    if (d.action) {
      const targetChoice = b.closest(".equipment-targets, .passives");
      await submitAction(d.action);
      if (targetChoice)
        $(".actions [data-action='confirmItem']")?.focus({
          preventScroll: true,
        });
      return;
    }
    const k = d.do;
    if (!k) return;
    if (!["sound", "close"].includes(k)) tone();
    if (k === "close") {
      close();
      return;
    }
    if (k === "inspectHand") {
      detail(d.card);
      return;
    }
    if (k === "cancelHand") {
      const index = handSelection?.index;
      handSelection = null;
      renderRoom();
      $('.hand-card[data-item-index="' + index + '"]')?.focus({
        preventScroll: true,
      });
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
          "</div><p>路线按数字从 1 到 100 蛇形前进，每 25 格更换环境，各区域内的格子随机排列。每种地形效果每回合最多生效一次。平原无额外效果。抵达沙漠先后退 1 格，再结算落点。从雨林主动移动前须判定，3 点及以上才可移动。抵达火山失去 1 点生命。踩到香蕉皮停下时直接结算该格，免于沙漠后退。使用净化可清除香蕉皮并继续移动。</p>",
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
app.addEventListener(
  "toggle",
  (e) => {
    const panel = e.target;
    if (!panel.matches(".field-tools .field-panel[open]")) return;
    for (const other of app.querySelectorAll(
      ".field-tools .field-panel[open]",
    )) {
      if (other !== panel) other.open = false;
    }
  },
  true,
);
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
