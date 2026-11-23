import { cards } from "../cards.mjs";
export const esc = (x = "") =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  cards:
    '<rect x="6" y="4" width="14" height="17" rx="2"/><path d="M4 17 2 5l11-3M10 13l3-4 3 4-3 4z"/>',
  book: '<path d="M3 4q5-2 9 1 4-3 9-1v15q-5-2-9 1-4-3-9-1zM12 5v15"/>',
  sound: '<path d="m3 9 4 0 5-5v16l-5-5H3zM15 8q4 4 0 8m3-11q7 7 0 14"/>',
  mute: '<path d="m3 9 4 0 5-5v16l-5-5H3zM16 9l5 6m0-6-5 6"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  knight:
    '<path d="M5 12a7 7 0 0 1 14 0v5l-7 5-7-5zM5 13l14-2M9 14v3m3-4v5m3-5v3M12 5l2-3 4 1-4 3"/>',
  sword: '<path d="m3 21 7-7m-5-2 7 7m-4-5L17 4l4-1-1 5-10 8"/>',
  shield: '<path d="m12 2 8 3v7q-1 6-8 10-7-4-8-10V5zM12 6v11"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  door: '<path d="M13 3h7v18h-7M3 12h12m-5-5 5 5-5 5"/>',
  pen: '<path d="m4 16 12-12 4 4L8 20l-5 1zM13 7l4 4"/>',
  users:
    '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m1 3q5 1 5 6"/>',
  leaf: '<path d="M3 20C7 16 10 12 16 7M5 16C1 5 12 5 21 3c-1 10-5 17-16 13z"/>',
  desert:
    '<path d="M2 19h20M5 18l6-11 6 11M13 17l3-6 5 7"/><circle cx="18" cy="5" r="2"/>',
  forest:
    '<path d="m7 2-5 9h3l-4 6h12l-4-6h3zM7 17v5m9-18-3 6 4 7h5l-3-6h2zM17 17v5"/>',
  fire: '<path d="M13 2c2 7-3 8 0 11l4-5c8 9 0 15-5 14S1 17 6 10l1 4c1-5 4-7 6-12z"/>',
  map: '<path d="m2 5 7-2 6 3 7-2v15l-7 2-6-3-7 2zM9 3v15m6-12v15"/>',
  key: '<circle cx="8" cy="9" r="5"/><path d="m12 12 9 9m-5-5 3-3m-1 5 3-3"/>',
  chest: '<path d="M3 11V8q0-4 4-4h10q4 0 4 4v3zm0 0v9h18v-9M10 11v4h4v-4"/>',
  item: '<path d="M8 3h8M9 3v5l-5 7q-2 6 4 6h8q6 0 4-6l-5-7V3M7 14h11"/>',
  portal:
    '<ellipse cx="12" cy="12" rx="8" ry="10"/><path d="M13 7c-7 1-6 12 0 9 3-2 3-7-1-6"/>',
  rest: '<path d="M3 20 20 16M4 16l16 5M12 2c1 5 9 8 3 12q-7 4-9-2-1-3 3-6l1 4z"/>',
  crown: '<path d="m2 6 5 4 5-7 5 7 5-4-3 12H5zM5 21h14"/>',
  skull:
    '<path d="M7 18v3h10v-3c8-4 4-15-5-15S0 14 7 18z"/><circle cx="8" cy="11" r="1.5"/><circle cx="16" cy="11" r="1.5"/><path d="m11 16 1-2 1 2"/>',
  flag: '<path d="M5 22V3m1 1c6-4 8 4 15 0v9c-7 4-10-4-15 0"/>',
  duel: '<path d="m3 3 4 1 13 15-2 2L5 7zM4 20l6-7m4-4 5-6 2 1-4 6m-3 10 6-6M3 14l7 7"/>',
  log: '<path d="M5 4h15v17H5zM8 8h9M8 12h9m-9 4h6"/>',
  chat: '<path d="M3 4h18v13H9l-6 4zM7 9h10m-10 4h6"/>',
  send: '<path d="m2 3 20 9-20 9 4-9zm4 9h16"/>',
  step: '<path d="m3 17 6-1 1-10 5 1 1 7 5 3v3H3z"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 7h.1m5 5h.1m5 5h.1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  copy: '<path d="M7 7V3h13v14h-4"/><rect x="3" y="7" width="13" height="14" rx="2"/>',
  heart: '<path d="M12 21 3 12C-2 3 9 0 12 8c3-8 14-5 9 4z"/>',
};
export const icon = (k) =>
  '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
  (paths[k] || paths.dice) +
  "</svg>";
export function art(id, cls = "") {
  return (
    '<img class="' +
    cls +
    '" alt="' +
    esc(cards[id]?.name || (id === "knight" ? "骑士" : "")) +
    '" src="./assets/cards/' +
    (cards[id] ||
    ["knight", "magicdie", "camp", "portal", "chest", "bag"].includes(id)
      ? id
      : "knight") +
    '.jpg">'
  );
}
export const palette = [
  "#348f98",
  "#4f83cc",
  "#d36755",
  "#8880b4",
  "#cb932d",
  "#648b51",
];
export const regions = [
  ["plain", "晨曦平原", "leaf", "#c9e3a4"],
  ["desert", "流金沙漠", "desert", "#f3d79b"],
  ["rainforest", "翡翠雨林", "forest", "#9fd3ae"],
  ["volcano", "余烬火山", "fire", "#e9b1a4"],
];
export const tiles = {
  start: ["起点", "flag", "#379566"],
  finish: ["终点", "crown", "#a74832"],
  normal: ["普通怪物", "skull", "#64774a"],
  elite: ["精英怪物", "skull", "#895c9b"],
  boss: ["七宗罪头目", "crown", "#ad4c44"],
  chest: ["普通宝箱", "chest", "#997122"],
  legendaryChest: ["传说宝箱", "chest", "#8d388c"],
  item: ["道具", "item", "#397e99"],
  portal: ["传送门", "portal", "#7259a8"],
  rest: ["休息", "rest", "#ac7837"],
  duel: ["决斗", "duel", "#a54755"],
  trap: ["陷阱 · 永久升级 −1", "skull", "#9b381e"],
};
export const hearts = (hp, max = 10) =>
  '<span class="hearts" aria-label="生命 ' +
  esc(hp) +
  " / " +
  esc(max) +
  '">' +
  Array.from(
    { length: Math.min(30, max) },
    (_, i) => '<span class="' + (i < hp ? "" : "grayheart") + '">♥</span>',
  ).join("") +
  "</span>";
export const colorsafe = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : palette[0]);
export const button = (cmd, label, ic = "", classes = "soft", extra = "") =>
  '<button type="button" class="' +
  classes +
  '" data-do="' +
  cmd +
  '" ' +
  extra +
  ">" +
  (ic ? icon(ic) : "") +
  label +
  "</button>";
function knightShowcard() {
  return (
    '<button type="button" class="showcard" data-detail="knight" aria-label="查看初始骑士"><div class="card-inner"><div class="card-art">' +
    art("knight") +
    '<span class="corner">' +
    icon("sword") +
    '</span><span class="corner defense">1</span></div><div class="card-info"><small>角色卡 · 骑士</small><h3>初始骑士</h3><div class="card-meta">' +
    hearts(10) +
    "<small>HERO / 01</small></div></div></div></button>"
  );
}
export function menu(profile, resume) {
  return (
    '<section class="menu"><div class="hero-title"><h1><span class="pretitle">重生之</span><span class="title-main">我靠回城变强</span></h1><div class="subtitle"><em></em>区域网卡牌桌游 · 1–4 人<em></em></div></div><div class="camp">' +
    '<section class="setup paper"><div class="setup-title"><h2>' +
    icon("knight") +
    '冒险者营地</h2><span class="lan-dot">LAN</span></div><label class="field-label" for="pname">骑士名字</label><div class="name-field"><input id="pname" maxlength="16" autocomplete="off" value="' +
    esc(profile.name) +
    '" placeholder="输入你的名字">' +
    icon("pen") +
    '</div><div class="colors-row"><span class="field-label">角色颜色</span><div class="swatches">' +
    palette
      .map(
        (c, i) =>
          '<button aria-label="' +
          ["青绿", "蓝", "珊瑚红", "紫", "金", "草绿"][i] +
          '" aria-pressed="' +
          (profile.color === c) +
          '" class="swatch ' +
          (profile.color === c ? "selected" : "") +
          '" data-color="' +
          c +
          '" style="--color:' +
          c +
          '"></button>',
      )
      .join("") +
    "</div></div>" +
    button("create", "创建房间", "plus", "cta primary") +
    button("join", "加入房间", "door", "cta join") +
    button("solo", resume ? "继续单人冒险" : "单人试炼", "", "sub-action") +
    "</section>" +
    knightShowcard() +
    '</div><footer class="trail"><div class="trail-label">' +
    icon("map") +
    "冒险路线</div>" +
    regions
      .map(
        (r, i) =>
          (i ? '<i class="route-line"></i>' : "") +
          '<div class="region"><i style="--region:' +
          r[3] +
          '">' +
          icon(r[2]) +
          "</i><div><strong>" +
          r[1] +
          "</strong><small>" +
          String(i * 25 + 1).padStart(2, "0") +
          " — " +
          (i + 1) * 25 +
          "</small></div></div>",
      )
      .join("") +
    "</footer></section>"
  );
}
export function chat(room, showHeading = true) {
  return (
    '<section class="chat">' +
    (showHeading ? "<h3>" + icon("chat") + "房间聊天</h3>" : "") +
    '<div class="chat-msg" aria-live="polite">' +
    chatMessages(room.chat) +
    '</div><form id="chat"><input maxlength="240" aria-label="聊天内容" placeholder="说点什么…" autocomplete="off"><button class="soft" aria-label="发送">' +
    icon("send") +
    "</button></form></section>"
  );
}
export function chatMessages(messages) {
  return messages.length
    ? messages
        .map((m) => "<p><b>" + esc(m.name) + "</b>　" + esc(m.text) + "</p>")
        .join("")
    : '<small class="muted">消息仅房内可见</small>';
}
export function lobby(r) {
  const host = r.hostId === r.you;
  return (
    '<section class="lobby paper"><div class="panel-heading"><h2>' +
    icon("users") +
    "冒险准备室</h2>" +
    button("leave", "离开房间", "door") +
    '</div><div class="lobby-content"><div><b>骑士席位　' +
    r.players.length +
    ' / 4</b><div class="seats">' +
    r.players
      .map(
        (p) =>
          '<div class="seat ' +
          (p.online ? "" : "offline") +
          '" style="--pc:' +
          colorsafe(p.color) +
          '">' +
          art("knight") +
          "<b>" +
          esc(p.name) +
          "</b><small>" +
          (p.id === r.hostId ? "房主" : "骑士") +
          (p.online ? "" : " · 离线") +
          "</small></div>",
      )
      .join("") +
    '</div><label class="field-label" for="address">邀请地址 · LAN / VPN</label><div class="share"><select id="address" ' +
    (host ? "" : "disabled") +
    ">" +
    r.addresses.map(
      (a) =>
        '<option value="' +
        esc(a.address) +
        '" ' +
        (a.address === r.address ? "selected" : "") +
        ">" +
        esc(a.name + " · " + new URL(a.url).host) +
        "</option>",
    ) +
    "</select>" +
    button("copy", "复制", "copy") +
    "</div>" +
    (host
      ? button("start", "开始游戏", "dice", "cta primary")
      : "<p>等待房主开始游戏。</p>") +
    (host ? button("destroy", "解散房间", "", "sub-action") : "") +
    '</div><div class="lobby-chat">' +
    chat(r) +
    "</div></div></section>"
  );
}
function slot(id) {
  return id
    ? '<button class="slot" data-detail="' +
        esc(id) +
        '" title="' +
        esc(cards[id]?.name) +
        '">' +
        art(id) +
        "</button>"
    : '<span class="slot empty">·</span>';
}
function hud(p, me, b, active) {
  const gear =
    '<div class="gearline" aria-label="装备">' +
    Array.from({ length: Math.max(3, p.gear.length) }, (_, i) =>
      slot(p.gear[i]),
    ).join("") +
    "</div>";
  const stat = (symbol, value, label) =>
    '<span title="' +
    label +
    '" aria-label="' +
    label +
    " " +
    esc(value) +
    '">' +
    icon(symbol) +
    esc(value) +
    "</span>";
  return (
    '<section class="hud-card ' +
    (me ? "self " : "") +
    (b?.actors?.includes(p.id) && !b.monster ? "dueling " : "") +
    (active ? "seat-active " : "") +
    (!p.online ? "offline" : "") +
    '" data-player="' +
    esc(p.id) +
    '" style="--pc:' +
    colorsafe(p.color) +
    '"><div class="hud-body">' +
    knight(p, "avatar") +
    '<div class="hud-identity"><b>' +
    esc(p.name) +
    "</b>" +
    (p.online ? "" : '<small class="seat-offline">离线</small>') +
    hearts(p.hp) +
    '</div></div><div class="hud-stats">' +
    stat("sword", p.atk, "攻击") +
    stat("shield", p.def, "防御") +
    stat("step", p.act, "行动") +
    (me ? "" : stat("item", p.itemCount, "道具")) +
    "</div>" +
    gear +
    "</section>"
  );
}
const hueByColor = [0, 40, 170, 98, 225, -55];
function knight(p, cls) {
  const angle = hueByColor[palette.indexOf(p.color)] ?? 0;
  return (
    '<img class="' +
    cls +
    '" src="./assets/cards/knight.jpg" alt="骑士" style="--hue:' +
    angle +
    'deg">'
  );
}
export function pawns(players) {
  return (
    '<div class="pawns" data-count="' +
    players.length +
    '">' +
    players
      .map(
        (p) =>
          '<span class="pawn" style="--pc:' +
          colorsafe(p.color) +
          '"><b>' +
          esc(p.name) +
          "</b>" +
          knight(p, "token-knight") +
          "</span>",
      )
      .join("") +
    "</div>"
  );
}
const tilePictures = {
  start: "start",
  finish: "citadel",
  normal: "den",
  elite: "elite",
  boss: "crown",
  chest: "chest",
  legendaryChest: "chest",
  item: "item",
  portal: "gate",
  rest: "camp",
  duel: "duel",
};
export function board(g) {
  return (
    '<div class="board">' +
    g.board
      .map((t, i) => {
        const region = regions.find((r) => r[0] === t.biome) || regions[0];
        const kind = tiles[t.type];
        const residents = g.players.filter((p) => p.pos === i + 1);
        const reverse = Math.floor(i / 10) % 2;
        const label =
          i +
          1 +
          " · " +
          region[1] +
          " · " +
          kind[0] +
          (t.banana ? " · 有香蕉皮" : "") +
          (t.boss ? " · " + cards[t.boss].name : "");
        const pic = tilePictures[t.type] || t.biome;
        const style =
          "--zone:" +
          region[3] +
          ";--mark:" +
          kind[2] +
          ";grid-row:" +
          Math.floor(i / 10 + 1) +
          ";grid-column:" +
          (reverse ? 10 - (i % 10) : (i % 10) + 1);
        return (
          '<button class="tile site' +
          (residents.length ? " occupied" : "") +
          (t.type === "legendaryChest" ? " legendary-chest" : "") +
          (t.type === "trap" ? " trap-space" : "") +
          '" data-tile="' +
          (i + 1) +
          '" style="' +
          style +
          '" aria-label="' +
          esc(label) +
          '" title="' +
          esc(label) +
          '"><small class="tile-num">' +
          (i + 1) +
          '</small><img class="terrain-art" alt="" src="./assets/tiles/' +
          pic +
          '.jpg"><i class="type-dot"></i>' +
          (t.type === "legendaryChest"
            ? '<span class="terrain-dot" aria-hidden="true">✦</span>'
            : "") +
          (t.type === "trap"
            ? '<span class="trap-marker">' + icon("skull") + " −1</span>"
            : "") +
          (t.banana
            ? '<img class="banana-marker" src="./assets/cards/i10.jpg" alt="香蕉皮">'
            : "") +
          pawns(residents) +
          "</button>"
        );
      })
      .join("") +
    "</div>"
  );
}
export function parityLabel(parity) {
  if (parity === "even") return "（视为偶数）";
  if (parity === "odd") return "（视为奇数）";
  return "";
}

export function diceLayout(count, width, height) {
  const minimum = Math.min(18, width, height);
  const maxColumns = Math.floor(width / minimum);
  const pageSize = Math.min(count, maxColumns * Math.floor(height / minimum));
  const idealRatio = Math.max(1, Math.min(2, width / height));
  let best = { columns: 1, size: minimum, balance: Infinity };
  for (let columns = 1; columns <= Math.min(pageSize, maxColumns); columns++) {
    const rows = Math.ceil(pageSize / columns);
    const size = Math.floor(Math.min(56, width / columns, height / rows));
    const balance = Math.abs(columns / rows - idealRatio);
    if (size > best.size || (size === best.size && balance < best.balance))
      best = { columns, size, balance };
  }
  return { columns: best.columns, size: best.size, pageSize };
}

export const dieCube =
  '<div class="dice-cell" data-face="1"><div class="dice-cube">' +
  Array.from(
    { length: 6 },
    (_, i) => '<i class="dice-face face-' + (i + 1) + '"></i>',
  ).join("") +
  "</div></div>";

function rollLine(r, label) {
  return r
    ? "<span><b>" +
        label +
        "</b> " +
        (r.dice?.length ? r.dice.join(" + ") + " → " : "") +
        "<strong>" +
        esc(r.total) +
        "</strong>" +
        parityLabel(r.parity) +
        "</span>"
    : "";
}
const monsterFighter = "$monster";
function monsterName(b) {
  return b.slimes ? "分裂史莱姆" : cards[b.form || b.monster]?.name || "怪物";
}

function combatCard(id, p, b, active, role = "") {
  const monster = id === monsterFighter;
  const name = monster ? monsterName(b) : p?.name || "骑士";
  const stats = monster ? b : b.combatants?.[id] || p;
  return (
    '<article class="combat-card' +
    (active ? " combat-current" : "") +
    (monster ? " combat-monster" : "") +
    '" data-combatant="' +
    esc(id) +
    '"' +
    (active ? ' aria-current="true"' : "") +
    '><header class="combat-name"><h3>' +
    esc(name) +
    "</h3>" +
    (active || role
      ? '<div class="combat-role">' +
        (role ? "<small>" + role + "</small>" : "") +
        (active ? '<small class="combat-turn">当前行动</small>' : "") +
        "</div>"
      : "") +
    "</header>" +
    (monster && b.slimes
      ? '<div class="slime-pair">' +
        ["左侧", "右侧"]
          .map((label, index) => {
            const target = index === 2 - b.slimes;
            const defeated = index === 0 && b.slimes === 1;
            const hp = defeated ? 0 : target ? b.hp : b.maxHp;
            return (
              '<div class="split-slime ' +
              (target
                ? 'target" data-combat-focus'
                : defeated
                  ? 'defeated"'
                  : '"') +
              ">" +
              art("n01", "battle-art") +
              hearts(hp, b.maxHp) +
              "<b>" +
              label +
              (target
                ? " · 当前目标"
                : defeated
                  ? " · 已击败"
                  : " · 等待出战") +
              "</b></div>"
            );
          })
          .join("") +
        "</div>"
      : (monster
          ? art(b.form || b.monster, "battle-art")
          : knight(p || {}, "battle-art token-knight")) +
        hearts(monster ? b.hp : (p?.hp ?? 10), monster ? b.maxHp : 10)) +
    '<div class="combat-stats"><span>' +
    icon("sword") +
    " 攻击 " +
    esc(stats?.atk ?? "—") +
    "</span><span>" +
    icon("shield") +
    " 防御 " +
    esc(stats?.def ?? "—") +
    "</span></div>" +
    (monster &&
    b.rageBonus !== undefined &&
    (b.rageBonus || b.atk !== b.baseAtk)
      ? '<small class="attack-breakdown">基础 ' +
        esc(b.baseAtk) +
        (b.rageBonus ? " · 蓄力 +" + esc(b.rageBonus) : "") +
        "</small>"
      : "") +
    (monster && b.shieldMax
      ? '<div class="boss-shield">' +
        icon("shield") +
        ' 额外护盾 <meter min="0" max="' +
        esc(b.shieldMax) +
        '" value="' +
        esc(b.shield) +
        '" aria-label="剩余护盾"></meter><b>' +
        esc(b.shield) +
        " / " +
        esc(b.shieldMax) +
        "</b></div>"
      : "") +
    "</article>"
  );
}

export function battle(g) {
  const b = g.battle,
    c = cards[b.form || b.monster],
    first = b.first ?? b.actors[0],
    second = b.second ?? (b.monster ? monsterFighter : b.actors[1]),
    current = [first, second].includes(g.actor) ? g.actor : b.actorId;
  const seats = b.monster
    ? [[first], [second]]
    : [
        [second, "挑战者"],
        [first, "擂主"],
      ];
  const effects = (b.effects || [])
    .map(
      (e, i) =>
        "<p><b>" + String(i + 1).padStart(2, "0") + "</b>　" + esc(e) + "</p>",
    )
    .join("");
  const activeStates = Object.entries(b.statuses || {})
    .filter(([, v]) => v.length)
    .map(
      ([id, v]) =>
        "<p>" +
        esc(g.players.find((p) => p.id === id)?.name || monsterName(b)) +
        " · " +
        esc(v.join("、")) +
        "</p>",
    )
    .join("");
  return (
    '<section class="battle"><h2 class="kicker">' +
    esc(b.monster ? cards[b.monster]?.kind || c?.kind : "骑士决斗") +
    " · 第 " +
    esc(b.round) +
    ' 轮</h2><div class="combat-line">' +
    seats
      .map(([id, role]) =>
        combatCard(
          id,
          g.players.find((p) => p.id === id),
          b,
          id === current,
          role,
        ),
      )
      .join('<span class="combat-divider">' + icon("duel") + "</span>") +
    '</div><div class="combat-effects" aria-live="polite"></div><div class="battle-rolls">' +
    rollLine(b.attackRoll, "攻击判定") +
    rollLine(b.defenseRoll, "防御判定") +
    '</div><div class="passives">' +
    effects +
    activeStates +
    (c?.quote ? '<p class="quote">' + esc(c.quote) + "</p>" : "") +
    "</div></section>"
  );
}
export function actionItem(action) {
  return /^use:(i\d{2})(?::|$)/.exec(action.id)?.[1];
}

function detailsText(detail) {
  return Array.isArray(detail) ? detail.join("、") : detail;
}

const commandIcons = {
  attack: "sword",
  defend: "shield",
  skip: "sword",
  roll: "dice",
  clash: "duel",
  heal: "heart",
  rest: "dice",
  end: "flag",
  return: "step",
  resolve: "map",
  confirm: "key",
  confirmAttack: "key",
  confirmEquipment: "key",
  "check:accept": "key",
};
function renderAction(a) {
  const glyph = commandIcons[a.id];
  const style =
    a.id === "attack"
      ? " attack-command"
      : a.id === "defend"
        ? " defense-command"
        : "";
  const details = detailsText(a.detail);
  return (
    '<button type="button" class="choice-action' +
    style +
    '" data-action="' +
    esc(a.id) +
    '">' +
    (glyph
      ? '<span class="command-sigil">' + icon(glyph) + "</span>"
      : a.card
        ? art(a.card)
        : "") +
    '<span class="choice-label">' +
    esc(a.label) +
    (details && !a.label.includes(details)
      ? "<small>" + esc(details) + "</small>"
      : "") +
    "</span></button>"
  );
}

function handCards(me, items, menu, selected) {
  return (
    '<div class="item-hand' +
    (me.items.length > 8 ? " many-cards" : "") +
    '" aria-label="道具手牌"' +
    (me.items.length ? "" : " hidden") +
    ">" +
    me.items
      .map((card, index) => {
        const usable = menu
          ? menu.card === card
          : items.some((option) => actionItem(option) === card);
        const active = menu
          ? card === menu.card && me.items.indexOf(card) === index
          : selected?.index === index;
        const offset = index - (me.items.length - 1) / 2;
        return (
          '<button type="button" class="hand-card ' +
          (usable ? "is-usable" : "is-unavailable") +
          '" data-hand-item="' +
          esc(card) +
          '" data-item-index="' +
          index +
          '" aria-pressed="' +
          active +
          '" aria-label="' +
          esc(cards[card]?.name) +
          (usable ? "" : " · 当前只可查看") +
          '" title="' +
          esc(cards[card]?.name) +
          '" style="--fan-angle:' +
          Math.max(-24, Math.min(24, offset * 6)) +
          "deg;--fan-drop:" +
          Math.min(19, offset * offset * 1.8) +
          'px">' +
          art(card) +
          "<span>" +
          esc(cards[card]?.name) +
          "</span></button>"
        );
      })
      .join("") +
    "</div>"
  );
}

function choiceControls(g, actions, menu, selected, combatResolving) {
  const card = menu?.card || selected?.card;
  const details = detailsText(menu?.detail);
  const heading = menu?.summary || menu?.target;
  const surrender = g.battle?.phase === "surrenderConfirm";
  const diceNote =
    !combatResolving && g.dice?.values?.length && !card && !surrender;
  if (!actions.length && !diceNote && !card) return "";
  return (
    '<div class="actions' +
    (card || surrender ? " options-open" : "") +
    '">' +
    (card
      ? '<div class="choice-header"><b>' +
        esc(cards[card]?.name) +
        "</b>" +
        (heading ? "<span>" + esc(heading) + "</span>" : "") +
        (details
          ? '<small class="choice-summary">' + esc(details) + "</small>"
          : "") +
        button(
          "inspectHand",
          "道具说明",
          "book",
          "dock-small",
          'data-card="' + esc(card) + '"',
        ) +
        "</div>"
      : surrender
        ? '<div class="choice-header"><b>放弃战斗将按死亡结算，返回起点。</b></div>'
        : "") +
    '<div class="action-row">' +
    actions.map(renderAction).join("") +
    (selected
      ? button("cancelHand", "取消", "close", "choice-action choice-cancel")
      : "") +
    "</div>" +
    (diceNote
      ? '<small class="dice-read" title="' +
        esc(g.dice.values.join(" + ")) +
        '">' +
        icon("dice") +
        " " +
        esc(g.dice.label) +
        " · " +
        (g.dice.values.length <= 8
          ? g.dice.values.join(" + ") + " → "
          : g.dice.values.length + " 枚 → ") +
        esc(g.dice.total) +
        parityLabel(g.dice.parity) +
        "</small>"
      : "") +
    "</div>"
  );
}

export function game(r, solo, combatResolving = false, handSelection = null) {
  const g = r.game,
    me = g.players.find((p) => p.id === r.you),
    current = g.players.find((p) => p.id === (g.actor || g.turn)),
    win = g.players.find((p) => p.id === g.winner);
  const actions = combatResolving ? [] : g.actions || [];
  const surrender = actions.find((a) => a.id === "surrender");
  const menu = combatResolving ? null : g.itemMenu || g.battle?.itemMenu;
  const items = actions.filter((a) => actionItem(a));
  const selected =
    handSelection &&
    !menu &&
    me.items[handSelection.index] === handSelection.card &&
    items.some((a) => actionItem(a) === handSelection.card)
      ? handSelection
      : null;
  const visibleActions = actions.filter(
    (a) =>
      a !== surrender &&
      (menu || (selected ? actionItem(a) === selected.card : !actionItem(a))),
  );
  const opponents = g.players.filter((p) => p.id !== r.you);
  const side = (right) =>
    opponents
      .filter((_, index) => index % 2 === Number(right))
      .map((p) => hud(p, false, g.battle, p.id === g.actor))
      .join("");
  const currentName =
    current?.name ||
    (g.actor === monsterFighter && g.battle ? monsterName(g.battle) : "骑士");
  const prompt = win
    ? win.name + " 胜利！"
    : combatResolving
      ? currentName + " · 战斗结算中…"
      : g.prompt || currentName + " · 选择行动";
  return (
    '<section class="game"><div class="game-top"><span class="round-indicator">' +
    icon("flag") +
    " 第 <strong>" +
    esc(g.round ?? 1) +
    "</strong> 轮" +
    '</span><p class="game-prompt" aria-live="polite">' +
    esc(prompt) +
    '</p><div class="game-nav">' +
    button("roomOptions", "房间", "users", "dock-small") +
    button("legend", "地图图例", "map", "dock-small") +
    '</div></div><div class="arena"><aside class="seat-rail seat-left" aria-label="其他骑士">' +
    side(false) +
    '</aside><div class="stage">' +
    (win
      ? '<div class="victory">' +
        art("knight") +
        "<h2>" +
        esc(win.name) +
        " 胜利！</h2><p>已击败原初之王</p>" +
        g.players
          .filter((p) => p.id !== g.winner)
          .map((p) => "<p>" + esc(p.name) + " · 失败</p>")
          .join("") +
        (r.you === r.hostId
          ? '<div class="toolbar">' +
            button("restart", "重新开始", "dice") +
            button("destroy", "解散房间", "close") +
            "</div>"
          : "") +
        "</div>"
      : g.battle
        ? battle(g)
        : board(g)) +
    '</div><aside class="seat-rail seat-right" aria-label="其他骑士">' +
    side(true) +
    '</aside></div><footer class="game-dock">' +
    '<div class="field-tools"><details id="adventure-log" class="field-panel"><summary>' +
    icon("log") +
    '冒险记录</summary><div class="field-panel-body logbox">' +
    (g.log || [])
      .slice(-28)
      .reverse()
      .map((l) => "<p>" + esc(l) + "</p>")
      .join("") +
    "</div></details>" +
    (solo
      ? ""
      : '<details id="room-chat" class="field-panel"><summary>' +
        icon("chat") +
        '房间聊天</summary><div class="field-panel-body">' +
        chat(r, false) +
        "</div></details>") +
    '</div><div class="hand-dock">' +
    (!win
      ? choiceControls(g, visibleActions, menu, selected, combatResolving)
      : "") +
    handCards(me, items, menu, selected) +
    '<div class="own-hud">' +
    hud(me, true, g.battle, me.id === g.actor) +
    "</div></div>" +
    '<div class="exit-dock">' +
    (g.battle?.monster && !win
      ? '<button type="button" class="surrender-button"' +
        (surrender ? ' data-action="surrender"' : " disabled") +
        ' aria-label="放弃战斗">' +
        icon("flag") +
        "放弃</button>"
      : "") +
    "</div></footer></section>"
  );
}
