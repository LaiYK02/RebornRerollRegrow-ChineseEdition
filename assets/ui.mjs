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
  chest: ["宝箱", "chest", "#997122"],
  item: ["道具", "item", "#397e99"],
  portal: ["传送门", "portal", "#7259a8"],
  rest: ["休息", "rest", "#ac7837"],
  duel: ["决斗", "duel", "#a54755"],
  plain: ["路途", "step", "#78866a"],
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
function showcard(id, side, label, title, number, hp, def) {
  return (
    '<button class="showcard ' +
    side +
    '" data-detail="' +
    id +
    '" aria-label="查看' +
    title +
    '"><div class="card-inner"><div class="card-art">' +
    art(id) +
    '<span class="corner">' +
    icon("sword") +
    '</span><span class="corner defense">' +
    def +
    '</span></div><div class="card-info"><small>' +
    label +
    "</small><h3>" +
    title +
    '</h3><div class="card-meta">' +
    hearts(hp, hp) +
    "<small>" +
    number +
    "</small></div></div></div></button>"
  );
}
export function menu(profile, resume) {
  return (
    '<section class="menu"><div class="hero-title"><div class="pretitle">重生之我靠</div><h1>回城变强</h1><div class="subtitle"><em></em>区域网卡牌桌游 · 1–4 人<em></em></div></div><div class="camp">' +
    showcard(
      "knight",
      "left",
      "角色卡 · 骑士",
      "初始骑士",
      "HERO / 01",
      10,
      1,
    ) +
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
    showcard(
      "e03",
      "right",
      "怪物卡 · 精英",
      "精英史莱姆",
      "ELITE / 03",
      5,
      2,
    ) +
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
export function chat(room) {
  return (
    '<section class="chat"><h3>' +
    icon("chat") +
    '房间聊天</h3><div class="chat-msg" aria-live="polite">' +
    (room.chat.length
      ? room.chat
          .map((m) => "<p><b>" + esc(m.name) + "</b>　" + esc(m.text) + "</p>")
          .join("")
      : '<small class="muted">消息仅房内可见</small>') +
    '</div><form id="chat"><input maxlength="240" aria-label="聊天内容" placeholder="说点什么…" autocomplete="off"><button class="soft" aria-label="发送">' +
    icon("send") +
    "</button></form></section>"
  );
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
function hud(p, me, b) {
  return (
    '<section class="hud-card ' +
    (me ? "self " : "") +
    (b?.actors?.includes(p.id) && !b.monster ? "dueling " : "") +
    (!p.online ? "offline" : "") +
    '" style="--pc:' +
    colorsafe(p.color) +
    '"><div class="gearline">' +
    Array.from({ length: Math.max(3, p.gear.length) }, (_, i) =>
      slot(p.gear[i]),
    ).join("") +
    '</div><div class="hud-body">' +
    knight(p, "avatar") +
    "<div><b>" +
    esc(p.name) +
    "</b> " +
    (me ? "我" : "") +
    (p.online ? "" : " · 离线") +
    "<br>" +
    hearts(p.hp) +
    '</div></div><div class="hud-stats">' +
    icon("sword") +
    p.atk +
    icon("shield") +
    p.def +
    icon("step") +
    p.act +
    (me ? " · 技能点 " + p.sp : icon("item") + p.itemCount) +
    "</div></section>"
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
        const kind = tiles[t.type] || tiles.plain;
        const residents = g.players.filter((p) => p.pos === i + 1);
        const special = t.terrain && t.terrain !== "plain";
        const reverse = Math.floor(i / 10) % 2;
        const label =
          i +
          1 +
          " · " +
          region[1] +
          " · " +
          kind[0] +
          (special ? " · 特殊地形" : "") +
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
          '<button class="tile ' +
          (residents.length ? "occupied " : "") +
          (t.type === "plain" ? "road" : "site") +
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
          '.jpg">' +
          (t.type !== "plain" ? '<i class="type-dot"></i>' : "") +
          (special ? '<span class="terrain-dot">✦</span>' : "") +
          pawns(residents) +
          "</button>"
        );
      })
      .join("") +
    "</div>"
  );
}
function rollLine(r, label) {
  return r
    ? "<span><b>" +
        label +
        "</b> " +
        (r.dice?.length ? r.dice.join(" + ") + " → " : "") +
        "<strong>" +
        esc(r.total) +
        "</strong></span>"
    : "";
}
export function battle(g) {
  const b = g.battle,
    c = cards[b.form || b.monster],
    op = g.players.find((p) => p.id === b.actors?.[1]);
  const title =
    c?.name ||
    b.actors.map((id) => g.players.find((p) => p.id === id)?.name).join(" ⚔ ");
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
        esc(g.players.find((p) => p.id === id)?.name || c?.name || "对手") +
        " · " +
        esc(v.join("、")) +
        "</p>",
    )
    .join("");
  return (
    '<section class="battle"><small class="kicker">' +
    esc(c?.kind || "骑士决斗") +
    " · 第 " +
    b.round +
    ' 轮</small><div class="versus"><b>' +
    icon("sword") +
    " 攻击 " +
    esc(b.atk ?? op?.atk ?? "—") +
    "</b><h2>" +
    esc(title) +
    "</h2><b>" +
    icon("shield") +
    " 防御 " +
    esc(b.def ?? op?.def ?? "—") +
    "</b></div>" +
    hearts(b.hp ?? op?.hp ?? 10, b.maxHp || 10) +
    art(c?.id || "knight", "battle-art") +
    '<div class="battle-rolls">' +
    rollLine(b.attackRoll, "攻击判定") +
    rollLine(b.defenseRoll, "防御判定") +
    '</div><div class="passives">' +
    effects +
    activeStates +
    (c?.quote ? '<p class="quote">' + esc(c.quote) + "</p>" : "") +
    "</div></section>"
  );
}
export function game(r, solo) {
  const g = r.game,
    me = g.players.find((p) => p.id === r.you),
    current = g.players.find((p) => p.id === (g.actor || g.turn)),
    win = g.players.find((p) => p.id === g.winner);
  const actions = g.actions || [];
  return (
    '<section class="game"><div class="game-top"><span>' +
    icon("flag") +
    "　第 " +
    esc(g.round ?? 1) +
    " 轮　<b>" +
    esc(current?.name || "骑士") +
    '</b> 的回合</span><span class="toolbar">' +
    button("legend", "地图图例", "map", "mini") +
    button("roomOptions", "房间", "users", "mini") +
    '</span></div><div class="arena"><aside class="sidebar">' +
    (solo
      ? '<div><b>单人试炼</b><p class="muted">进度自动保存在此浏览器。</p></div>'
      : chat(r)) +
    '<div class="logbox"><h3>' +
    icon("log") +
    "冒险记录</h3>" +
    (g.log || [])
      .slice(-28)
      .reverse()
      .map((l) => "<p>" + esc(l) + "</p>")
      .join("") +
    '</div></aside><div class="middle"><div class="stage">' +
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
    '</div><div class="actions" ' +
    (win ? "hidden" : "") +
    "><p><b>" +
    esc(g.prompt || "选择行动") +
    '</b></p><div class="action-row">' +
    actions
      .map(
        (a) =>
          '<button class="mini" data-action="' +
          esc(a.id) +
          '">' +
          (a.card ? art(a.card) : "") +
          esc(a.label) +
          "</button>",
      )
      .join("") +
    "</div>" +
    (g.dice?.values?.length
      ? '<small class="dice-read">' +
        icon("dice") +
        " " +
        esc(g.dice.label) +
        "　" +
        g.dice.values.join(" + ") +
        " → " +
        esc(g.dice.total) +
        "</small>"
      : "") +
    '</div></div><aside class="inventory"><h3>' +
    icon("item") +
    '我的道具</h3><div class="bag-grid">' +
    Array.from({ length: Math.max(5, me.items.length) }, (_, i) =>
      me.items[i]
        ? '<button class="slot" data-detail="' +
          esc(me.items[i]) +
          '">' +
          art(me.items[i]) +
          "<span>" +
          esc(cards[me.items[i]].name) +
          "</span></button>"
        : slot(),
    ).join("") +
    '</div></aside></div><div class="hud"><div class="party">' +
    g.players
      .filter((p) => p.id !== r.you)
      .map((p) => hud(p, false, g.battle))
      .join("") +
    "</div>" +
    hud(me, true, g.battle) +
    "</div></section>"
  );
}
