import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { cards } from "./cards.mjs";
import { newGame, view } from "./game.mjs";
import { startBattle } from "./battle.mjs";
import * as ui from "./assets/ui.mjs";
const { art, battle, board, game: renderGame } = ui;

test("决斗中的两张角色卡高亮，损失与回复的生命反映在红灰心数量", () => {
  const state = newGame(roster);
  startBattle(state, { attackerId: "0", defenderId: "2" });
  state.phase = "battle";
  const makeRoom = () => ({
    you: "0",
    hostId: "0",
    players: roster,
    chat: [],
    game: view(state, "0"),
  });
  state.players[0].hp = 6;
  const first = renderGame(makeRoom(), false);
  assert.equal([...first.matchAll(/class="hud-card [^"]*dueling/g)].length, 2);
  const hudHearts = (html) =>
    [...html.split('<div class="own-hud">')[1].matchAll(/class="grayheart"/g)]
      .length;
  assert.equal(hudHearts(first), 4);
  state.players[0].hp = 8;
  assert.equal(hudHearts(renderGame(makeRoom(), false)), 2);
});

const roster = ["黎明", "正午", "黄昏", "夜游"].map((name, index) => ({
  id: String(index),
  name,
  color: "#348f98",
  online: true,
}));

function makeGameRoom(overrides = {}) {
  return {
    you: "0",
    hostId: "0",
    players: roster,
    chat: [],
    game: { ...view(newGame(roster), "0"), ...overrides },
  };
}

test("地图或战斗居中，其他骑士分列两侧，自己的面板在手牌前方", () => {
  const html = renderGame(makeGameRoom(), false);
  assert.match(
    html,
    /seat-left.*data-player="1".*data-player="3".*class="stage".*seat-right.*data-player="2"/,
  );
  assert.match(
    html,
    /id="adventure-log".*id="room-chat".*class="item-hand.*class="own-hud".*class="exit-dock"/,
  );
});

test("手牌显示自己的所有物品，只有合法物品发亮，选项留在手牌上方", () => {
  const room = makeGameRoom();
  room.game.players[0].items = ["i09", "i02", "i09"];
  room.game.actions = [
    { id: "attack", label: "掷骰攻击" },
    { id: "use:i09", label: "多掷一枚骰子", card: "i09" },
  ];
  const html = renderGame(room, false);
  assert.match(html, /attack-command.*data-action="attack"/);
  assert.equal([...html.matchAll(/class="hand-card is-usable/g)].length, 2);
  assert.equal(
    [...html.matchAll(/class="hand-card is-unavailable/g)].length,
    1,
  );
  assert.doesNotMatch(html, /data-action="use:i09"/);
  const selected = renderGame(room, false, false, { card: "i09", index: 2 });
  assert.match(
    selected,
    /data-action="use:i09".*class="item-hand.*data-item-index="2" aria-pressed="true"/,
  );
});

test("奖励牌在场中显示卡图、名称和完整效果，先打开确认", () => {
  const room = makeGameRoom({
    phase: "offer",
    actions: [
      { id: "take:i02", label: cards.i02.name, card: "i02" },
      { id: "take:l16", label: cards.l16.name, card: "l16" },
      { id: "passOffer", label: "放弃领取" },
    ],
  });
  const html = renderGame(room, false);
  assert.match(
    html,
    /class="stage".*class="reward-panel".*data-card-choice="take:i02".*i02\.jpg/,
  );
  assert.ok(html.includes(ui.esc(cards.i02.text)));
  assert.ok(html.includes(ui.esc(cards.l16.text)));
  assert.doesNotMatch(html, /data-action="take:/);
  assert.match(html, /data-action="passOffer"/);
});

test("替换道具时手牌只高亮合法目标，并保留现有道具说明", () => {
  const room = makeGameRoom({
    phase: "replace",
    actions: [
      { id: "replace:i02", label: "替换生命药水", card: "i02" },
      { id: "decline", label: "放弃净化", card: "i14" },
    ],
  });
  room.game.players[0].items = ["i02", "i09"];
  const html = renderGame(room, false);
  assert.match(
    html,
    /class="hand-card is-usable is-replaceable".*data-card-choice="replace:i02"/,
  );
  assert.match(html, /class="hand-card is-unavailable" data-hand-item="i09"/);
  assert.ok(html.includes(ui.esc(cards.i09.text)));
  assert.doesNotMatch(html, /data-action="replace:/);
});

test("装备冲突时只高亮允许替换的原装备栏", () => {
  const room = makeGameRoom({
    phase: "replace",
    actions: [
      { id: "replace:c07", label: "替换偶数符", card: "c07" },
      { id: "decline", label: "放弃奇数符", card: "c08" },
    ],
  });
  room.game.players[0].gear = ["c07", "l05"];
  const html = renderGame(room, false);
  assert.match(
    html,
    /class="slot is-replaceable" data-card-choice="replace:c07"/,
  );
  assert.match(html, /class="slot" data-detail="l05"/);
  assert.doesNotMatch(html, /data-action="replace:/);
});

test("神圣净化显示服务器列出的状态与确认按钮，放弃战斗在右侧", () => {
  const state = newGame(roster);
  startBattle(state, { attackerId: "0", monsterId: "n01" });
  const room = makeGameRoom({
    battle: view(state, "0").battle,
    itemMenu: {
      card: "i15",
      stage: "confirm",
      target: "黄昏",
      detail: ["中毒", "缴械"],
    },
    actions: [
      { id: "confirmCleanse", label: "确认净化", card: "i15" },
      { id: "cancelItem", label: "取消" },
      { id: "surrender", label: "放弃战斗" },
    ],
  });
  room.game.players[0].items = ["i15"];
  assert.match(
    renderGame(room, false),
    /黄昏.*中毒、缴械.*data-action="confirmCleanse".*class="item-hand.*class="exit-dock".*data-action="surrender"/,
  );
});

test("决斗的挑战者居左、原驻玩家居右，且高亮随行动者切换", () => {
  const state = newGame(roster);
  const duel = startBattle(state, { attackerId: "0", defenderId: "2" });
  state.phase = "battle";
  const stage = () => battle(view(state, "0"));
  assert.match(
    stage(),
    /data-combatant="2".*黄昏.*挑战者.*data-combatant="0" aria-current="true".*黎明.*擂主.*当前行动/,
  );
  duel.actorId = "2";
  assert.match(
    stage(),
    /data-combatant="2" aria-current="true".*黄昏.*挑战者.*当前行动.*data-combatant="0">.*黎明.*擂主/,
  );
});

test("野怪战中骑士居左，怪物和活跃分裂体有独立动画目标", () => {
  const state = newGame(roster);
  startBattle(state, {
    attackerId: "0",
    monsterId: "e03",
    monsterState: { form: "n01", slimes: 2 },
  });
  const html = battle(view(state, "0"));
  assert.match(
    html,
    /data-combatant="0".*data-combatant="\$monster".*data-combat-focus.*当前目标/,
  );
  assert.equal([...html.matchAll(/data-combat-focus/g)].length, 1);
});

test("骰子以完整格子排入可用空间，过多时保留剩余骰子的页", () => {
  for (const [count, width, height] of [
    [1, 255, 180],
    [80, 255, 180],
    [600, 255, 180],
  ]) {
    const { columns, size, pageSize } = ui.diceLayout(count, width, height);
    assert.ok(columns * size <= width);
    assert.ok(Math.ceil(pageSize / columns) * size <= height);
    assert.equal(pageSize < count, count === 600);
    assert.ok(size >= 18);
  }
});

test("贪婪护盾耐久与暴怒基础攻击和蓄力在战斗界面独立显示", () => {
  const state = newGame(roster);
  startBattle(state, { attackerId: "0", monsterId: "b05" });
  assert.match(battle(view(state, "0")), /额外护盾.*20 \/ 20/);
  startBattle(state, { attackerId: "0", monsterId: "b03" });
  state.battle.rageBonus = 4;
  assert.match(battle(view(state, "0")), /基础 8 · 蓄力 \+4/);
});

test("棋盘显示香蕉皮，两只分裂史莱姆同时显示并标出当前目标", () => {
  const state = newGame(roster);
  state.board[5].banana = true;
  assert.match(
    board(view(state, "0")),
    /class="banana-marker"[^>]*alt="香蕉皮"/,
  );
  startBattle(state, {
    attackerId: "0",
    monsterId: "e03",
    monsterState: { form: "n01", slimes: 2 },
  });
  assert.match(battle(view(state, "0")), /左侧 · 当前目标.*右侧 · 等待出战/);
  state.battle.slimes = 1;
  assert.match(battle(view(state, "0")), /左侧 · 已击败.*右侧 · 当前目标/);
});

test("全部卡图可读取，十九句彩蛋与中文版道具列表逐字相同", async () => {
  const text = await readFile(
    new URL("./assets/rules.txt", import.meta.url),
    "utf8",
  );
  const source = text.split("九、道具")[1];
  const records = [
    ...source.matchAll(
      /^(\d\d) (.+?)：[^\r\n]+\r?\n  (「[^\r\n]*」|“[^\r\n]*”)/gm,
    ),
  ];
  assert.equal(records.length, 19);
  for (const [, index, name, quote] of records) {
    const item = cards["i" + index];
    assert.equal(item.name, name);
    assert.equal(item.quote, quote);
  }
  assert.equal(Object.keys(cards).length, 70);
  for (const id of ["knight", ...Object.keys(cards)]) {
    const src = art(id).match(/src="([^"]+)"/)[1];
    await access(new URL(src, import.meta.url));
  }
});
test("百格棋盘的每种插图已打包，四名骑士可同站起点", async () => {
  const state = newGame(roster),
    html = board(view(state, "0"));
  assert.equal([...html.matchAll(/data-tile="/g)].length, 100);
  assert.match(html, /data-count="4"/);
  for (const name of roster.map((p) => p.name))
    assert.ok(html.includes("<b>" + name + "</b>"));
  const images = new Set(
    [...html.matchAll(/src="(\.\/assets\/tiles\/[^"]+)"/g)].map((m) => m[1]),
  );
  assert.ok(images.size >= 12);
  for (const image of images) await access(new URL(image, import.meta.url));
});
test("自己的物品可见，对手只显示数量；胜者和其余三名玩家的结果可见", () => {
  const state = newGame(roster);
  state.players[0].items = ["i01"];
  state.players[1].items = ["i18"];
  const room = {
    you: "0",
    hostId: "0",
    players: roster,
    chat: [],
    game: view(state, "0"),
  };
  const html = renderGame(room, false);
  assert.match(html, /命数棱镜/);
  assert.ok(!html.includes("黄金骰子"));
  state.winner = "1";
  state.phase = "won";
  room.game = view(state, "0");
  const end = renderGame(room, false);
  assert.match(end, /正午 胜利/);
  for (const name of ["黎明", "黄昏", "夜游"])
    assert.ok(end.includes(name + " · 失败"));
});
