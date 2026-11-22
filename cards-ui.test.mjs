import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { cards } from "./cards.mjs";
import { newGame, view } from "./game.mjs";
import { startBattle } from "./battle.mjs";
import { art, board, game as renderGame } from "./assets/ui.mjs";

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
  assert.equal([...first.matchAll(/class="grayheart"/g)].length, 4);
  state.players[0].hp = 8;
  assert.equal(
    [...renderGame(makeRoom(), false).matchAll(/class="grayheart"/g)].length,
    2,
  );
});

const roster = ["黎明", "正午", "黄昏", "夜游"].map((name, index) => ({
  id: String(index),
  name,
  color: "#348f98",
  online: true,
}));

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
