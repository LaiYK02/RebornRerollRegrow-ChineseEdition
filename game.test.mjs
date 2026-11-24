import assert from "node:assert/strict";
import test from "node:test";
import {
  act,
  MAX_PLAYERS,
  newGame,
  restoreGame,
  setOnline,
  view,
} from "./game.mjs";
import { cards } from "./cards.mjs";

const fixedLayout = () => 0.999999;
const solo = () => newGame([{ id: "a", name: "甲" }], fixedLayout);
const pair = () =>
  newGame(
    [
      { id: "a", name: "甲" },
      { id: "b", name: "乙" },
    ],
    fixedLayout,
  );
const actor = (game) => view(game, game.turn).actor;
const choose = (game, action, rng = () => 0) =>
  act(game, actor(game), action, rng);
function step(game, action, rng = () => 0) {
  choose(game, action, rng);
  const available = ids(game).filter((id) => id !== "surrender");
  if (
    available.length === 1 &&
    ["check:accept", "confirm"].includes(available[0])
  )
    choose(game, available[0], rng);
}
const die = (n) => () => (n - 0.5) / 6;
const ids = (g, id = actor(g)) => view(g, id).actions.map((a) => a.id);

test("五个独立座位有不同的默认棋色，第五位可行动并可重连", () => {
  const roster = Array.from({ length: MAX_PLAYERS }, (_, i) => ({
    id: String(i),
    name: "玩家" + i,
  }));
  assert.equal(MAX_PLAYERS, 5);
  assert.throws(() => newGame([...roster, { id: "6", name: "第六人" }]));
  const g = newGame(roster, fixedLayout);
  assert.equal(view(g, "4").maxPlayers, 5);
  assert.equal(new Set(g.players.map((p) => p.color)).size, 5);
  for (const p of roster.slice(0, 4)) setOnline(g, p.id, false);
  choose(g, "roll", die(1));
  assert.equal(g.turn, "4");
  choose(g, "check:accept");
  assert.equal(g.players[4].pos, 2);
  setOnline(g, "4", false);
  setOnline(g, "4", true);
  assert.equal(view(g, "4").phase, "rest");
});

test("确认移动前预览路线，随调整更新并停在首个香蕉皮，沙漠退格可预测", () => {
  const g = pair();
  const p = g.players[0];
  p.pos = 27;
  p.items = ["i19"];
  g.board[31].banana = true;
  choose(g, "roll", die(6));
  const trail = {
    id: p.id,
    from: 27,
    to: 32,
    path: [28, 29, 30, 31, 32],
    final: 32,
  };
  assert.deepEqual(view(g, p.id).movementPreview, trail);
  assert.deepEqual(view(g, "b").movementPreview.path, trail.path);
  assert.equal(p.pos, 27);
  assert.ok(g.board[31].banana);
  choose(g, "use:i19");
  choose(g, "target:-2");
  assert.deepEqual(view(g, p.id).movementPreview, {
    id: p.id,
    from: 27,
    to: 31,
    path: [28, 29, 30, 31],
    final: 30,
  });
  choose(g, "check:accept");
  assert.equal(p.pos, 30);
  assert.equal(view(g, p.id).movementPreview, null);
});

test("想家了成功返乡后回血三点，终点主动返乡保留原有血量", () => {
  for (const [before, after] of [
    [4, 7],
    [9, 10],
  ]) {
    const g = solo(),
      p = g.players[0];
    p.pos = 8;
    p.items = ["i11"];
    p.hp = before;
    choose(g, "use:i11");
    assert.equal(p.pos, 1);
    assert.equal(p.hp, after);
  }
  const g = solo(),
    p = g.players[0];
  p.pos = 100;
  p.hp = 3;
  g.phase = "finish";
  choose(g, "return");
  assert.equal(p.hp, 3);
});

test("旧版徽章加成与精英生命只升级一次，已受伤害和未选属性都保留", () => {
  const g = pair();
  const [p, q] = g.players;
  p.gear = ["c13"];
  p.badgeActive = true;
  p.badgeStat = "def";
  p.def = 4;
  p.alloc.def = 3;
  p.pos = 18;
  step(g, "roll", die(1));
  g.rulesVersion = 7;
  Object.assign(g.battle, { hp: 2, maxHp: 3 });
  Object.assign(g.board[18], {
    hp: 2,
    maxHp: 3,
    monsterState: { hp: 2, form: "e01" },
  });
  restoreGame(g);
  restoreGame(g);
  assert.equal(p.def, 5);
  assert.equal(p.alloc.def, 4);
  assert.equal(q.alloc.def, 0);
  assert.deepEqual(
    [g.battle.hp, g.battle.maxHp, g.board[18].monsterState.hp],
    [3, 4, 3],
  );
  assert.equal(g.rulesVersion, 8);
  assert.deepEqual(g.upgrades, []);
});

test("旧版随机棋盘升级后保留每个格子、怪物和传送门配对", () => {
  const g = newGame([{ id: "a", name: "甲" }], generator(8));
  g.rulesVersion = 7;
  const normal = g.board.find((tile) => tile.type === "normal");
  Object.assign(normal, { monster: "n03", hp: 1, maxHp: 2 });
  const before = structuredClone(g.board);
  restoreGame(g);
  assert.deepEqual(g.board, before);
});

test("三相战印在地图面板保留基础数值并按每五个行动点增加攻防", () => {
  const g = solo(),
    p = g.players[0];
  p.gear = ["l14"];
  p.act = 9;
  assert.deepEqual(view(g, p.id).players[0].effectiveStats, {
    atk: 2,
    def: 2,
    act: 9,
  });
  p.act = 10;
  assert.deepEqual(view(g, p.id).players[0].effectiveStats, {
    atk: 3,
    def: 3,
    act: 10,
  });
  assert.equal(p.atk, 1);
  assert.equal(p.def, 1);
});

test("两只哥布林的血量在逃跑、断线和存档后仍独立保留", () => {
  const g = pair();
  const [p, q] = g.players;
  p.pos = 3;
  p.atk = 4;
  p.act = 2;
  p.items = ["i04"];
  g.board[3].monster = "n04";
  step(g, "roll", die(1));
  const hp = (game) => view(game, p.id).battle.enemies.map((enemy) => enemy.hp);
  assert.deepEqual(hp(g), [2, 2]);
  step(g, "attack", die(6));
  assert.deepEqual(hp(g), [1, 2]);
  choose(g, "use:i04");
  assert.deepEqual(
    g.board[3].monsterState.enemies.map((enemy) => enemy.hp),
    [1, 2],
  );
  q.pos = 1;
  step(g, "roll", die(1));
  step(g, "heal");
  p.pos = 3;
  step(g, "roll", die(1));
  assert.deepEqual(hp(g), [1, 2]);
  setOnline(g, p.id, false);
  const saved = restoreGame(JSON.parse(JSON.stringify(g)));
  setOnline(saved, p.id, true);
  saved.players[1].pos = 1;
  step(saved, "roll", die(1));
  step(saved, "heal");
  assert.deepEqual(hp(saved), [1, 2]);
  assert.equal(
    saved.battle.fighters.$monster,
    saved.battle.enemyFighters[saved.battle.targetIndex],
  );
});

test("骰子确认标记跟随同一次判定，修改结果不换骰且确认后清空", () => {
  const g = solo(),
    [p] = g.players;
  g.phase = "rest";
  p.items = ["i01", "i19"];
  const dice = () => view(g, p.id).dice;
  choose(g, "rest", die(4));
  const initial = dice();
  assert.equal(initial.review.result, "失败");
  choose(g, "use:i01");
  assert.deepEqual(dice().values, initial.values);
  assert.equal(dice().rollId, initial.rollId);
  assert.deepEqual(dice().review, { key: initial.review.key, result: "成功" });
  choose(g, "use:i19");
  assert.deepEqual(dice().review, { key: initial.review.key, result: "成功" });
  choose(g, "cancel");
  choose(g, "check:accept");
  assert.equal(dice().review, null);
});

test("决斗骰子确认标记随攻防阶段和行动者切换", () => {
  const g = pair(),
    [challenger, defender] = g.players;
  challenger.pos = 6;
  defender.pos = 7;
  step(g, "roll", die(1));
  const dice = () => view(g, challenger.id).dice;
  choose(g, "attack", die(6));
  assert.equal(dice().review.key, "battle:attackReview:b");
  choose(g, "confirmAttack");
  assert.equal(dice().review, null);
  choose(g, "defend", die(1));
  const roll = dice();
  assert.deepEqual(roll.review, {
    key: "battle:reaction:b",
    result: "成功攻击",
  });
  choose(g, "confirm");
  assert.equal(dice().rollId, roll.rollId);
  assert.equal(dice().review.key, "battle:reaction:a");
  choose(g, "confirm");
  assert.equal(dice().review, null);
});

test("奖励卡标出现有物品空间和互斥装备需要替换的情况", () => {
  const g = solo(),
    [p] = g.players;
  g.phase = "offer";
  g.pending = { ids: ["i02", "c08", "l01"], canPass: true };
  p.items = ["i01", "i03", "i04", "i05", "i06"];
  p.gear = ["c07", "c01"];
  const deck = () => view(g, p.id).actions.filter((entry) => entry.card);
  assert.deepEqual(
    deck().map((entry) => Boolean(entry.needsReplacement)),
    [true, true, false],
  );
  p.gear.push("l16");
  assert.deepEqual(
    deck().map((entry) => Boolean(entry.needsReplacement)),
    [false, true, true],
  );
});

test("动作耗尽时自动交棒，但可使用的道具会保留手动结束选项", () => {
  const g = pair();
  g.phase = "rest";
  step(g, "heal");
  assert.equal(g.turn, "b");
  assert.equal(g.phase, "move");
  g.phase = "rest";
  g.players[1].items = ["i10"];
  step(g, "heal");
  assert.equal(g.turn, "b");
  assert.ok(ids(g).includes("end"));
  step(g, "use:i10");
  assert.equal(g.turn, "a");
});

test("同一个战斗格直接开战，沙漠先后退再确定交锋位置", () => {
  const g = pair(),
    [p, q] = g.players;
  p.pos = 6;
  q.pos = 7;
  step(g, "roll", die(1));
  assert.equal(g.phase, "battle");
  assert.equal(g.battle.first, "b");
  assert.equal(g.battle.second, "a");

  const h = pair(),
    [challenger, incumbent] = h.players;
  challenger.pos = 29;
  incumbent.pos = 29;
  step(h, "roll", die(1));
  assert.equal(h.phase, "skirmish");
  assert.equal(challenger.pos, 29);
  step(h, "clash", die(1));
  step(h, "clash", die(6));
  assert.equal(challenger.pos, 28);
  assert.equal(h.board[27].type, "normal");
  assert.equal(h.phase, "battle");
});

test("踩到沙漠香蕉皮原地结算，净化可用掉香蕉皮并继续原行程", () => {
  const g = solo(),
    [p] = g.players;
  p.pos = 28;
  g.board[28].banana = true;
  step(g, "roll", die(4));
  assert.equal(p.pos, 29);
  assert.equal(g.phase, "offer");
  assert.equal(g.board[28].banana, undefined);

  const h = solo(),
    [q] = h.players;
  q.pos = 28;
  q.items = ["i14"];
  h.board[28].banana = true;
  step(h, "roll", die(4));
  assert.equal(q.pos, 29);
  assert.ok(ids(h).includes("use:i14"));
  step(h, "use:i14");
  assert.deepEqual(q.items, ["i14"]);
  step(h, "target:0:banana");
  assert.equal(q.pos, 31);
  assert.equal(h.phase, "offer");
  assert.deepEqual(q.items, []);
  assert.equal(h.board[28].banana, undefined);
});

test("火山受伤后交锋落败，本回合不会再次受火山伤害", () => {
  const g = pair(),
    [p, q] = g.players;
  p.pos = 79;
  q.pos = 81;
  step(g, "roll", die(2));
  assert.equal(p.hp, 9);
  step(g, "clash", die(1));
  step(g, "clash", die(6));
  assert.equal(p.pos, 80);
  assert.equal(p.hp, 9);
  assert.equal(g.phase, "offer");
});

test("锁具咒只在当前 PvP 生效，决斗结束或中断后恢复装备", () => {
  for (const disconnect of [false, true]) {
    const g = pair();
    const [challenger, incumbent] = g.players;
    challenger.pos = 6;
    challenger.hp = 2;
    challenger.gear = ["c02"];
    incumbent.pos = 7;
    incumbent.atk = 8;
    incumbent.gear = ["c10"];
    incumbent.items = ["i13"];
    step(g, "roll", die(1));
    step(g, "use:i13");
    step(g, "use:i13:c02");
    step(g, "confirmItem");
    const gearState = () => view(g, "a").players[0].locked;
    assert.deepEqual(gearState(), ["c02"]);
    assert.equal(view(g, "a").battleEffectEvents.at(-1).card, "i13");
    if (disconnect) setOnline(g, "b", false);
    else
      for (const action of [
        "attack",
        "confirmAttack",
        "defend",
        "confirm",
        "confirm",
      ])
        choose(g, action, die(2));
    assert.equal(g.battle, null);
    assert.deepEqual(gearState(), []);
    assert.deepEqual(challenger.gear, ["c02"]);
  }
});

test("跨步符也须通过雨林判定，香蕉皮截停确认后的移动并结算落点", () => {
  const g = solo(),
    [p] = g.players;
  p.pos = 55;
  p.items = ["i05"];
  choose(g, "use:i05", die(2));
  assert.equal(p.pos, 55);
  choose(g, "check:accept");
  assert.equal(p.pos, 55);
  assert.deepEqual(p.items, ["i05"]);
  choose(g, "use:i05", die(3));
  assert.equal(p.pos, 55);
  choose(g, "check:accept");
  assert.equal(p.pos, 56);
  assert.equal(g.check, null);
  const h = solo(),
    [q] = h.players;
  q.pos = 2;
  h.board[5].banana = true;
  h.board[7].banana = true;
  choose(h, "roll", die(6));
  assert.equal(q.pos, 2);
  choose(h, "check:accept");
  assert.equal(q.pos, 6);
  assert.equal(h.phase, "offer");
  assert.equal(h.board[5].banana, undefined);
  assert.equal(h.board[7].banana, true);
  assert.deepEqual(q.statuses, []);
});

test("雨林回城道具要过判定，成功回城没有升级", () => {
  const g = solo(),
    [p] = g.players;
  p.pos = 57;
  p.items = ["i11"];
  step(g, "use:i11", die(1));
  assert.equal(p.pos, 57);
  assert.deepEqual(p.items, ["i11"]);
  step(g, "use:i11", die(6));
  assert.equal(p.pos, 1);
  assert.deepEqual(p.items, []);
  assert.equal(g.upgrades.length, 0);
});

test("命数棱镜只翻转成败，确认后结算，雨林通过后可直接回城", () => {
  const g = solo();
  const p = g.players[0];
  p.pos = 55;
  p.items = ["i01", "i11"];
  choose(g, "roll", die(1));
  const before = structuredClone(g.dice);
  assert.match(view(g, p.id).prompt, /失败/);
  choose(g, "use:i01");
  assert.deepEqual(g.dice, before);
  assert.match(view(g, p.id).prompt, /成功（已反转）/);
  assert.equal(p.pos, 55);
  choose(g, "check:accept");
  assert.ok(g.turnTerrain.includes("rainforest"));
  choose(g, "use:i11", () => {
    throw Error("already cleared rainforest");
  });
  assert.equal(p.pos, 1);
  assert.deepEqual(p.items, []);

  for (const [face, earns] of [
    [1, true],
    [5, false],
  ]) {
    const rest = solo();
    rest.phase = "rest";
    rest.players[0].items = ["i01"];
    choose(rest, "rest", die(face));
    choose(rest, "use:i01");
    assert.deepEqual(rest.dice.values, [face]);
    assert.equal(rest.dice.total, face);
    assert.equal(rest.upgrades.length, 0);
    choose(rest, "check:accept");
    assert.equal(rest.upgrades.length > 0, earns);
  }

  const clash = pair();
  clash.players[0].items = ["i01"];
  clash.players[1].pos = 2;
  step(clash, "roll", die(1));
  choose(clash, "clash", die(6));
  assert.deepEqual(ids(clash), ["check:accept"]);
});

test("避灾斗篷免疫雨林、沙漠与火山，仍须结算格子与香蕉皮", () => {
  const desert = solo();
  desert.players[0].pos = 28;
  desert.players[0].gear = ["l10"];
  step(desert, "roll", die(1));
  assert.equal(desert.players[0].pos, 29);
  assert.equal(desert.phase, "offer");

  const rain = solo();
  rain.players[0].gear = ["l10"];
  rain.players[0].pos = 55;
  choose(rain, "roll", die(1));
  assert.equal(rain.check.kind, "move");
  choose(rain, "check:accept");
  assert.equal(rain.players[0].pos, 56);
  const homesick = solo();
  homesick.players[0].pos = 55;
  homesick.players[0].items = ["i11"];
  homesick.players[0].gear = ["l10"];
  choose(homesick, "use:i11", () => {
    throw Error("immune to rainforest");
  });
  assert.equal(homesick.players[0].pos, 1);

  const volcano = solo();
  const p = volcano.players[0];
  p.pos = 77;
  p.gear = ["l10"];
  volcano.board[79].banana = true;
  step(volcano, "roll", die(6));
  assert.equal(p.hp, 10);
  assert.equal(p.pos, 80);
  assert.equal(volcano.board[79].banana, undefined);
  assert.equal(volcano.phase, "offer");
});

test("场外净化只在有目标时可用，大净化列出完整状态并等待确认", () => {
  const g = pair();
  const [p, q] = g.players;
  p.items = ["i14", "i15"];
  assert.ok(!ids(g).includes("use:i14"));
  assert.ok(!ids(g).includes("use:i15"));
  q.statuses = [{ type: "buff", label: "强化" }, { type: "stunned" }];
  q.movePenalty = -2;
  const bare = view(g, p.id).actions.find((a) => a.id === "use:i14");
  assert.equal(bare.opensItemMenu, true);
  choose(g, "use:i14");
  assert.ok(ids(g).includes("target:1:0"));
  assert.ok(ids(g).includes("target:1:1"));
  assert.equal(view(g, q.id).itemMenu, null);
  choose(g, "cancel");
  assert.equal(view(g, p.id).itemMenu, null);
  assert.deepEqual(p.items, ["i14", "i15"]);
  choose(g, "use:i15");
  assert.ok(ids(g).includes("target:1:buff"));
  choose(g, "target:1:debuff");
  const menu = view(g, p.id).itemMenu;
  assert.equal(menu.stage, "confirm");
  assert.deepEqual(menu.detail, ["晕眩", "移动判定 -2"]);
  assert.deepEqual(
    q.statuses.map((s) => s.type),
    ["buff", "stunned"],
  );
  assert.deepEqual(p.items, ["i14", "i15"]);
  const resumed = restoreGame(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(view(resumed, p.id).itemMenu, menu);
  choose(g, "target:1:confirm");
  assert.equal(view(g, p.id).itemMenu, null);
  assert.deepEqual(q.statuses, [{ type: "buff", label: "强化" }]);
  assert.equal(q.movePenalty, 0);
  assert.deepEqual(p.items, ["i14"]);
});

test("战斗重置卡逐点重分永久升级和徽章，保留基础点与本场临时点", () => {
  const g = solo();
  const p = g.players[0];
  p.pos = 3;
  p.gear = ["c13"];
  p.badgeActive = true;
  p.badgeStat = "act";
  Object.assign(p, {
    atk: 4,
    def: 1,
    act: 3,
    alloc: { atk: 2, def: 0, act: 2 },
  });
  p.items = ["i06", "i07"];
  step(g, "roll", die(1));
  choose(g, "use:i07:act");
  choose(g, "use:i06");
  assert.deepEqual([p.atk, p.def, p.act], [2, 1, 1]);
  assert.deepEqual(ids(g), ["upgrade:atk", "upgrade:def", "upgrade:act"]);
  assert.equal(view(g, p.id).battle.combatants.a.act, 2);
  choose(g, "upgrade:def");
  choose(g, "upgrade:act");
  choose(g, "upgrade:act");
  assert.deepEqual([p.atk, p.def, p.act], [2, 2, 4]);
  assert.equal(p.badgeStat, "act");
  assert.equal(g.battle.remaining, 5);
  assert.deepEqual(p.items, []);
  assert.ok(ids(g).includes("attack"));
});

test("当前与暂停的旧版最终战保留伤害和抽取效果，基础点只迁移一次", () => {
  const g = pair();
  g.phase = "finish";
  g.players[0].pos = 100;
  choose(g, "challenge");
  g.battle.hp = 9;
  g.battle.base = { atk: 6, def: 9 };
  const effects = [...g.battle.active];
  g.rulesVersion = 6;
  g.players[1].resume = {
    phase: "resumeMonster",
    pending: { battle: structuredClone(g.battle) },
  };
  restoreGame(g);
  restoreGame(g);
  for (const battle of [g.battle, g.players[1].resume.pending.battle]) {
    assert.deepEqual(battle.base, { atk: 8, def: 12 });
    assert.equal(battle.hp, 9);
    assert.deepEqual(battle.active, effects);
    assert.equal(battle.baseAtk, 8);
  }
});

test("重连时先完成重置卡升级，恢复暂停战斗后使用新的攻击次数", () => {
  const g = pair();
  const [p] = g.players;
  p.pos = 3;
  p.atk = 3;
  p.alloc.atk = 2;
  p.items = ["i06"];
  step(g, "roll", die(1));
  choose(g, "use:i06");
  setOnline(g, p.id, false);
  assert.equal(g.turn, "b");
  setOnline(g, p.id, true);
  choose(g, "upgrade:act");
  choose(g, "upgrade:act");
  assert.equal(p.act, 3);
  step(g, "roll", die(1));
  step(g, "heal");
  assert.equal(g.turn, p.id);
  assert.equal(g.battle.remaining, 3);
});

test("休息格掷出 4 时既不升级也不回血", () => {
  const g = solo(),
    [p] = g.players;
  p.hp = 4;
  g.phase = "rest";
  choose(g, "rest", die(4));
  assert.equal(g.check.total, 4);
  choose(g, "check:accept");
  assert.equal(g.phase, "move");
  assert.equal(g.upgrades.length, 0);
  assert.equal(p.hp, 4);
});

test("怪物战确认放弃才会死亡回城，保留弃牌流程且没有升级", () => {
  const g = solo(),
    [p] = g.players;
  p.pos = 3;
  p.gear = ["l02"];
  step(g, "roll", die(1));
  assert.throws(() => choose(g, "confirmSurrender"));
  choose(g, "surrender");
  assert.deepEqual(ids(g), ["confirmSurrender", "cancelSurrender"]);
  assert.equal(p.pos, 4);
  choose(g, "cancelSurrender");
  assert.equal(g.battle.phase, "attack");
  assert.equal(p.hp, 10);
  choose(g, "surrender");
  choose(g, "confirmSurrender");
  assert.equal(p.pos, 1);
  assert.equal(p.hp, 10);
  assert.equal(g.battle, null);
  assert.equal(view(g, p.id).phase, "deathDiscard");
  assert.equal(g.upgrades.length, 0);
  assert.deepEqual(p.alloc, { atk: 0, def: 0, act: 0 });
  step(g, "discard:l02");
  assert.deepEqual(p.gear, []);
});

test("旧存档的未分配升级必须逐次分配，保留原卡和已升属性", () => {
  const g = solo(),
    [p] = g.players;
  g.rulesVersion = 3;
  delete g.upgrades;
  p.sp = 2;
  p.atk = 2;
  p.alloc.atk = 1;
  p.items = ["i03"];
  restoreGame(g);
  assert.equal("sp" in p, false);
  assert.throws(() => choose(g, "roll"));
  step(g, "upgrade:def");
  step(g, "upgrade:act");
  assert.deepEqual([p.atk, p.def, p.act], [2, 2, 2]);
  assert.deepEqual(p.items, ["i03"]);
  assert.equal(view(g, p.id).phase, "move");
});

test("旧棋盘空格更新为功能格，未领取的精英和头目道具奖励改为一次随机升级", () => {
  const g = pair(),
    [p, q] = g.players;
  g.rulesVersion = 4;
  for (const pos of [2, 5, 10, 63, 80]) g.board[pos - 1].type = "plain";
  g.board[62].banana = true;
  p.pos = 19;
  g.phase = "offer";
  g.pending = { ids: ["l01", "l02", "l03"], canPass: true, followup: ["i01"] };
  q.pos = 32;
  q.resume = { phase: "replace", pending: { card: "i02" } };
  restoreGame(g, die(4));
  assert.deepEqual(
    [2, 5, 10, 63, 80].map((pos) => g.board[pos - 1].type),
    ["rest", "trap", "chest", "normal", "item"],
  );
  assert.equal(g.board[62].banana, true);
  assert.equal(p.def, 2);
  assert.equal(q.def, 2);
  assert.equal(q.resume.phase, "end");
  assert.deepEqual(ids(g), ["take:l01", "take:l02", "take:l03", "passOffer"]);
  restoreGame(g, die(6));
  assert.equal(p.act, 1);
  assert.equal(q.act, 1);
  step(g, "passOffer");
  assert.equal(g.turn, "a");
  assert.equal(g.phase, "move");
});

test("沙漠先处理后退，之后只有挑战者结算落点", () => {
  const g = pair(),
    [p, q] = g.players;
  p.pos = 29;
  q.pos = 30;
  step(g, "roll", die(2));
  assert.equal(g.phase, "skirmish");
  assert.deepEqual([p.pos, q.pos], [30, 30]);
  step(g, "clash", die(6));
  step(g, "clash", die(2));
  assert.deepEqual([p.pos, q.pos], [30, 29]);
  assert.equal(g.turn, q.id);
  assert.equal(g.actor, q.id);
  assert.equal(g.phase, "move");
});

test("奇偶符只替换判定奇偶，移动仍使用原点数", () => {
  const g = solo(),
    [p] = g.players;
  p.gear = ["c07"];
  choose(g, "roll", die(3));
  assert.equal(g.dice.total, 3);
  assert.equal(g.dice.parity, "even");
  choose(g, "check:accept");
  assert.equal(p.pos, 4);
});

test("挑战者交锋落败或被装备推开时，结算退到的格子", () => {
  const g = pair(),
    [entrant, incumbent] = g.players;
  entrant.pos = 6;
  incumbent.pos = 7;
  g.board[6].type = "rest";
  step(g, "roll", die(1));
  step(g, "clash", die(1));
  step(g, "clash", die(6));
  assert.equal(entrant.pos, 6);
  assert.equal(g.phase, "offer");
  assert.deepEqual(ids(g, incumbent.id), []);

  const h = pair(),
    [challenger, defender] = h.players;
  challenger.pos = 7;
  defender.pos = 8;
  defender.gear = ["c11"];
  step(h, "roll", die(1));
  assert.equal(challenger.pos, 6);
  assert.equal(defender.pos, 8);
  assert.equal(h.phase, "offer");
  assert.deepEqual(ids(h, defender.id), []);
});

test("the board has 100 positions, symmetric portals and 25 active tiles per terrain", () => {
  const g = pair();
  assert.deepEqual(
    g.board.map((t) => t.pos),
    Array.from({ length: 100 }, (_, i) => i + 1),
  );
  assert.equal(g.board[0].type, "start");
  assert.equal(g.board.at(-1).type, "finish");
  const assignedTypes = [
    "start",
    "finish",
    "normal",
    "elite",
    "boss",
    "chest",
    "legendaryChest",
    "item",
    "rest",
    "duel",
    "trap",
    "portal",
  ];
  assert.ok(g.board.every((tile) => assignedTypes.includes(tile.type)));
  assert.equal(g.board[6].type, "duel");
  assert.equal(g.board[15].type, "duel");
  const bosses = g.board.filter((t) => t.type === "boss");
  assert.deepEqual(bosses.map((t) => t.boss).sort(), [
    "b01",
    "b02",
    "b03",
    "b04",
    "b05",
    "b06",
    "b07",
  ]);
  assert.ok(bosses.every((t) => t.monster === t.boss));
  assert.ok(bosses[0].pos > 25);
  for (const tile of g.board.filter((t) => t.type === "portal"))
    assert.equal(g.board[tile.to - 1].to, tile.pos);
  for (const region of ["plain", "desert", "rainforest", "volcano"]) {
    assert.equal(g.board.filter((t) => t.biome === region).length, 25);
    assert.equal(
      g.board.filter((t) => t.biome === region && t.terrain === region).length,
      25,
    );
  }
  assert.deepEqual(
    g.players.map((p) => [p.pos, p.hp, p.atk, p.def, p.act]),
    [
      [1, 10, 1, 1, 1],
      [1, 10, 1, 1, 1],
    ],
  );
  assert.throws(() => act(g, "b", "roll"));
  assert.throws(() => act(g, "a", "not-an-action"));
  assert.doesNotThrow(() => structuredClone(JSON.parse(JSON.stringify(g))));
});

test("新对局按地区洗牌，保留难度、双向传送门和存档地图", () => {
  const roster = [{ id: "a", name: "甲" }];
  const reference = solo();
  const g = newGame(roster, generator(17));
  const other = newGame(roster, generator(38));
  assert.notDeepEqual(g.board, reference.board);
  assert.notDeepEqual(g.board, other.board);
  assert.equal(g.board[0].type, "start");
  assert.equal(g.board[99].type, "finish");
  assert.notEqual(g.matchId, other.matchId);
  for (let i = 0; i < 100; i += 25) {
    const kinds = (game) =>
      game.board
        .slice(i, i + 25)
        .map((t) => t.type)
        .sort();
    assert.deepEqual(kinds(g), kinds(reference));
  }
  for (const tile of g.board.filter((t) => t.type === "portal")) {
    assert.notEqual(tile.to, tile.pos);
    assert.equal(g.board[tile.to - 1].to, tile.pos);
  }
  assert.deepEqual(restoreGame(structuredClone(g)).board, g.board);
});

test("雨林每回合只判定一次，掷骰后使用跨步符可接着移动", () => {
  const g = solo(),
    [p] = g.players;
  p.pos = 51;
  p.items = ["i05"];
  step(g, "roll", die(3));
  step(g, "roll", die(2));
  assert.equal(p.pos, 53);
  assert.equal(g.phase, "landing");
  step(g, "use:i05");
  assert.equal(p.pos, 54);
  assert.equal(g.check, null);
  assert.equal(g.phase, "battle");
});

test("宝箱独立分级，确认掷骰后才移动或抽装备", () => {
  for (const [position, roll, type, prefix] of [
    [5, 1, "chest", "c"],
    [28, 2, "chest", "c"],
    [81, 1, "legendaryChest", "l"],
  ]) {
    const g = solo(),
      [p] = g.players;
    p.pos = position;
    choose(g, "roll", die(roll));
    assert.equal(p.pos, position);
    assert.ok(ids(g).includes("check:accept"));
    step(g, "check:accept", die(6));
    assert.equal(g.board[p.pos - 1].type, type);
    assert.equal(g.phase, "offer");
    const options = view(g, "a").actions;
    assert.equal(options.length, 4);
    assert.ok(options.some(({ id }) => id === "passOffer"));
    assert.ok(
      options
        .filter(({ card }) => card)
        .every(
          ({ card }) =>
            cards[card].kind === (prefix === "c" ? "普通装备" : "传说装备"),
        ),
    );
    step(g, "passOffer");
    assert.equal(g.phase, "move");
    assert.deepEqual(p.gear, []);
    assert.ok(
      g.board
        .filter((t) => t.type === "legendaryChest")
        .every((t) => t.biome === "volcano"),
    );
  }
});

test("旧单人存档保留进度，并升级火山宝箱和宝箱待选装备", () => {
  const g = solo();
  g.board[81].type = "chest";
  g.board[81].terrain = "plain";
  g.players[0].pos = 82;
  g.players[0].hp = 7;
  g.phase = "offer";
  g.pending = { ids: ["c01", "l01", "c02"] };
  restoreGame(g, die(3));
  assert.equal(g.players[0].pos, 82);
  assert.equal(g.players[0].hp, 7);
  assert.equal(g.board[81].type, "legendaryChest");
  assert.equal(g.board[81].terrain, "volcano");
  assert.ok(
    view(g, "a")
      .actions.filter(({ card }) => card)
      .every(({ card }) => cards[card].kind === "传说装备"),
  );
});

test("确认移动后记录沙漠的逐格前进与后退，火山传送不重复伤害", () => {
  const g = solo(),
    [p] = g.players;
  p.pos = 25;
  choose(g, "roll", die(1));
  assert.equal(p.pos, 25);
  choose(g, "check:accept");
  assert.deepEqual(
    view(g, "a").movements.map(({ from, to, stepwise }) => [
      from,
      to,
      stepwise,
    ]),
    [
      [25, 26, true],
      [26, 25, false],
    ],
  );
  const h = solo(),
    [q] = h.players;
  q.pos = 89;
  step(h, "roll", die(1));
  assert.equal(q.pos, 76);
  assert.equal(q.hp, 9);
});

test("draws and unplayed items stay private and snapshots do not mutate authority", () => {
  const g = pair(),
    [, guest] = g.players;
  guest.items.push("i13");
  step(g, "roll", die(2));
  const a = view(g, "a"),
    b = view(g, "b");
  assert.equal(a.actions.length, 4);
  assert.equal(
    new Set(a.actions.filter((a) => a.card).map((a) => a.card)).size,
    3,
  );
  assert.deepEqual(b.actions, []);
  assert.equal(a.players[1].items, undefined);
  assert.equal(a.players[1].itemCount, 1);
  assert.ok(!JSON.stringify(a).includes("i13"));
  const item = a.actions[0].card;
  step(g, a.actions[0].id);
  const observer = view(g, "b");
  assert.equal(observer.players[0].itemCount, 1);
  assert.ok(!observer.log.some((line) => line.includes(cards[item].name)));
  a.players[0].gear.push("l03");
  assert.deepEqual(g.players[0].gear, []);
});

test("movement die modifiers resolve once and a numeric movement cannot use a prism", () => {
  const g = solo(),
    [p] = g.players;
  p.gear = ["c03", "c06", "c07"];
  p.items = ["i18", "i09", "i08", "i01", "i19"];
  p.movePenalty = -2;
  step(g, "use:i09");
  step(g, "use:i18");
  step(g, "target:5");
  step(g, "roll", die(2));
  assert.deepEqual(g.dice.values, [5, 2]);
  assert.equal(g.dice.total, 7);
  step(g, "use:i08", die(1));
  assert.deepEqual(g.dice.values, [1, 1]);
  assert.ok(!ids(g).includes("use:i01"));
  assert.throws(() => choose(g, "use:i01"));
  step(g, "use:i19");
  choose(g, "target:-2");
  step(g, "check:accept");
  assert.equal(p.pos, 1);
  assert.equal(p.movePenalty, 0);
  assert.deepEqual(p.items, ["i01"]);
});

test("terrain, traps, portals, heals and rest upgrades resolve at their proper times", () => {
  const g = solo(),
    [p] = g.players;
  p.pos = 27;
  step(g, "roll", die(1));
  assert.equal(p.pos, 27);
  assert.equal(g.battle.monster, "n01");
  const h = solo(),
    [q] = h.players;
  q.pos = 55;
  step(h, "roll", die(2));
  assert.equal(q.pos, 55);
  assert.equal(h.phase, "move");
  step(h, "roll", die(3));
  assert.equal(h.phase, "move");
  step(h, "roll", die(3));
  assert.equal(q.pos, 58);
  step(h, "rest", die(5));
  assert.equal(q.def, 1);
  assert.deepEqual(ids(h), ["upgrade:atk", "upgrade:def", "upgrade:act"]);
  step(h, "upgrade:def");
  assert.equal(q.def, 2);
  assert.equal(q.alloc.def, 1);
  q.pos = 79;
  q.hp = 5;
  step(h, "roll", die(1));
  assert.equal(q.hp, 4);
  step(h, "passOffer");
  q.pos = 79;
  q.gear.push("l10", "l11");
  step(h, "roll", die(1));
  assert.equal(q.hp, 5);
  step(h, "passOffer");
  q.gear = ["l11"];
  q.pos = 32;
  step(h, "roll", die(2));
  assert.equal(q.pos, 15);
  assert.equal(h.phase, "move");
  q.pos = 1;
  h.board[1].banana = true;
  step(h, "roll", die(1));
  assert.equal(q.pos, 2);
  assert.equal(h.board[1].banana, undefined);
  step(h, "heal");
  step(h, "roll", die(6));
  assert.equal(q.pos, 8);
  assert.deepEqual(q.statuses, []);
});

test("barricades, ties in same-space clashes and duels at distant sites", () => {
  const g = pair(),
    [p, q] = g.players;
  q.pos = 2;
  step(g, "roll", die(1));
  assert.equal(g.phase, "skirmish");
  step(g, "clash", die(3));
  step(g, "clash", die(3));
  assert.equal(g.actor, "a");
  step(g, "clash", die(4));
  step(g, "clash", die(2));
  assert.deepEqual([p.pos, q.pos], [2, 1]);
  const h = pair(),
    [a, b] = h.players;
  a.pos = 4;
  b.pos = 5;
  b.gear = ["c11"];
  step(h, "roll", die(1));
  assert.equal(a.pos, 3);
  const j = pair(),
    [c, d] = j.players;
  c.pos = 10;
  d.pos = 24;
  d.gear = ["c10", "l03"];
  c.hp = 2;
  c.gear = ["l15", "l07"];
  c.items = ["i02"];
  step(j, "roll", die(1));
  assert.equal(j.battle.actorId, "b");
  for (let i = 0; i < 20 && j.battle; i++) step(j, ids(j)[0], die(3));
  assert.equal(j.phase, "loot");
  assert.equal(j.actor, "b");
  assert.deepEqual(c.alloc, { atk: 0, def: 0, act: 0 });
  assert.equal(actor(j), "b");
  step(j, "upgrade:atk");
  assert.equal(c.pos, 1);
  assert.equal(c.hp, 10);
  assert.deepEqual(c.gear, ["l15", "l07"]);
  assert.deepEqual(ids(j, "a"), []);
  assert.ok(!JSON.stringify(view(j, "b")).includes("i02"));
  assert.ok(ids(j).includes("loot-item:0"));
  step(j, "loot:l07");
  assert.ok(d.gear.includes("l07"));
  assert.deepEqual(c.gear, ["l15"]);
  assert.equal(j.turn, "b");
  const k = pair();
  k.players[0].pos = 10;
  k.players[1].pos = 24;
  k.players[1].gear = ["l08"];
  step(k, "roll", die(1));
  assert.equal(k.battle, null);
});

test("monster damage persists on escape, resets on death and grants all tier rewards", () => {
  const g = solo(),
    [p] = g.players;
  p.pos = 18;
  p.atk = 6;
  p.act = 2;
  p.items = ["i04"];
  step(g, "roll", die(1));
  assert.equal(g.battle.monster, "e01");
  step(g, "attack", die(4));
  assert.equal(g.battle.hp, 3);
  step(g, "use:i04");
  assert.equal(g.board[18].hp, 3);
  assert.equal(g.upgrades.length, 0);
  p.pos = 18;
  step(g, "roll", die(1));
  assert.equal(g.battle.hp, 3);
  p.hp = 1;
  p.atk = 1;
  p.act = 1;
  p.gear = ["l03", "l08"];
  p.locked = ["l03"];
  for (let i = 0; i < 12 && g.battle; i++) step(g, ids(g)[0], die(2));
  assert.equal(p.pos, 1);
  assert.equal(p.hp, 10);
  assert.equal(g.board[18].hp, 4);
  assert.equal(g.phase, "deathDiscard");
  assert.equal(g.upgrades.length, 0);
  step(g, "discard:l08");
  assert.deepEqual(p.gear, ["l03"]);
  for (const [pos, tier, rng, expected] of [
    [4, "normal", die(2), { atk: 0, def: 0, act: 0 }],
    [19, "elite", die(2), { atk: 1, def: 0, act: 0 }],
    [19, "elite", die(3), { atk: 0, def: 1, act: 0 }],
    [32, "boss", die(5), { atk: 0, def: 0, act: 1 }],
  ]) {
    const h = solo(),
      [q] = h.players;
    q.pos = pos - 1;
    q.gear = ["l03", "c10", "l02"];
    q.act = 12;
    step(h, "roll", die(pos > 25 ? 2 : 1));
    assert.equal(h.board[pos - 1].type, tier);
    for (let i = 0; i < 40 && h.battle; i++) step(h, ids(h)[0], rng);
    assert.equal(h.phase, "offer");
    assert.equal(h.upgrades.length, 0);
    assert.deepEqual(q.alloc, expected);
    const offered = () =>
      view(h, "a").actions.flatMap((a) => (a.card ? [a.card] : []));
    if (tier !== "normal") {
      assert.equal(offered().length, 3);
      assert.ok(offered().every((id) => cards[id].kind === "传说装备"));
      step(h, "passOffer");
      assert.equal(h.phase, "move");
      assert.equal(offered().length, 0);
      assert.deepEqual(q.items, []);
    } else {
      assert.equal(offered().length, 1);
      assert.ok(offered().every((id) => cards[id].kind === "道具"));
    }
    assert.equal(h.board[pos - 1].monster, h.board[pos - 1].boss);
  }
});

test("equipment replacement, badge withdrawal, bag loss, parity conflict and item cap", () => {
  const g = solo(),
    [p] = g.players;
  function offer(id) {
    g.phase = "offer";
    g.pending = { ids: [id] };
    step(g, "take:" + id);
  }
  offer("c13");
  assert.equal(view(g, p.id).phase, "upgrade");
  step(g, "upgrade:atk");
  assert.equal(p.atk, 3);
  offer("c07");
  offer("l16");
  offer("c08");
  assert.ok(ids(g).includes("replace:c07"));
  assert.ok(!ids(g).includes("replace:c13"));
  step(g, "replace:c07");
  offer("c04");
  step(g, "replace:c13");
  assert.equal(p.atk, 1);
  p.items = ["i01", "i02", "i03", "i05", "i08", "i09"];
  offer("i18");
  assert.equal(p.items.length, 7);
  offer("c13");
  step(g, "replace:l16");
  step(g, "upgrade:def");
  assert.deepEqual(p.items, []);
  p.items = ["i01", "i02", "i03", "i05", "i08"];
  offer("i18");
  assert.equal(g.phase, "replace");
  step(g, "replace:i08");
  assert.equal(p.items.length, 5);
  assert.ok(p.items.includes("i18"));
});

test("returning to Start, legendary sacrifice, board cleanses and redistribution", () => {
  const g = pair(),
    [p, q] = g.players;
  q.gear = ["c01", "l16"];
  p.items = ["i13", "i15", "i17", "i06"];
  p.gear = ["l13"];
  assert.ok(!ids(g).includes("use:i13"));
  assert.throws(() => choose(g, "use:i13"));
  step(g, "use:i17");
  step(g, "target:1");
  assert.equal(q.movePenalty, -2);
  step(g, "use:i15");
  step(g, "target:1:debuff");
  step(g, "target:1:confirm");
  assert.deepEqual(q.locked, []);
  assert.equal(q.movePenalty, 0);
  p.pos = 99;
  step(g, "roll", die(4));
  step(g, "return");
  assert.deepEqual([p.pos, p.atk, p.def, p.act], [1, 2, 2, 2]);
  step(g, "upgrade:atk");
  step(g, "use:i06");
  assert.deepEqual([p.atk, p.def, p.act], [1, 1, 1]);
  for (let i = 0; i < 4; i++) step(g, "upgrade:act");
  assert.equal(p.act, 5);
  assert.equal(g.upgrades.length, 0);
  const h = solo(),
    [b] = h.players;
  b.pos = 79;
  b.hp = 1;
  b.gear = ["c16", "l02"];
  step(h, "roll", die(1));
  assert.deepEqual(b.gear, ["l02"]);
  assert.equal(b.hp, 10);
  assert.deepEqual(b.alloc, { atk: 0, def: 0, act: 0 });
  const k = solo(),
    [c] = k.players;
  c.pos = 79;
  c.hp = 1;
  c.gear = ["l13", "l02"];
  step(k, "roll", die(1));
  assert.deepEqual(c.gear, ["l02"]);
  assert.deepEqual([c.atk, c.def, c.act], [2, 2, 2]);
});

test("offline seats retain progress, skip turns and can act after reconnecting", () => {
  const g = pair(),
    [p, q] = g.players;
  q.items = ["i04"];
  q.gear = ["l03"];
  q.atk = 3;
  q.pos = 32;
  setOnline(g, "a", false);
  assert.equal(g.turn, "b");
  step(g, "roll", die(2));
  assert.equal(q.pos, 15);
  assert.equal(g.turn, "b");
  setOnline(g, "a", true);
  step(g, "roll", die(5));
  assert.equal(g.turn, "a");
  setOnline(g, "b", false);
  assert.deepEqual(q.items, ["i04"]);
  assert.deepEqual(q.gear, ["l03"]);
  assert.equal(q.atk, 3);
  setOnline(g, "a", false);
  assert.deepEqual(ids(g, "a"), []);
  setOnline(g, "b", true);
  assert.equal(g.turn, "b");
  assert.equal(q.online, true);
  assert.equal(p.online, false);
});

test("陷阱降低一项已升级属性，从原初之王逃跑要弃装备且无升级", () => {
  const g = solo(),
    [p] = g.players;
  p.pos = 20;
  p.atk = 2;
  p.alloc.atk = 1;
  step(g, "roll", die(1));
  assert.equal(g.board[20].type, "trap");
  assert.deepEqual(ids(g), ["upgrade:atk"]);
  step(g, "upgrade:atk");
  assert.equal(p.atk, 1);
  assert.equal(g.phase, "move");

  p.pos = 100;
  p.gear = ["l03", "l02"];
  p.items = ["i04"];
  g.phase = "finish";
  step(g, "challenge");
  step(g, "use:i04");
  assert.equal(p.pos, 1);
  assert.equal(g.phase, "deathDiscard");
  assert.equal(g.upgrades.length, 0);
  assert.ok(ids(g).includes("discard:l03"));
  step(g, "discard:l03");
  assert.deepEqual(p.gear, ["l02"]);
  assert.equal(g.phase, "move");
});

test("悟技徽章进入传说宝箱，归途传承印存活返乡时也弃置", () => {
  const g = solo(),
    [p] = g.players;
  p.pos = 81;
  choose(g, "roll", die(1));
  step(g, "check:accept");
  assert.ok(ids(g).includes("take:c13"));
  step(g, "take:c13");
  step(g, "upgrade:atk");
  p.pos = 100;
  p.gear.push("l13");
  g.phase = "finish";
  step(g, "return");
  assert.equal(p.pos, 1);
  assert.deepEqual([p.atk, p.def, p.act], [4, 2, 2]);
  assert.deepEqual(p.gear, ["c13"]);
});

test("陷阱只降低永久升级，弃置悟技徽章才会移除徽章加成", () => {
  const g = solo(),
    [p] = g.players;
  p.pos = 81;
  choose(g, "roll", die(1));
  step(g, "check:accept");
  step(g, "take:c13");
  step(g, "upgrade:act");
  p.atk = 2;
  p.alloc.atk = 1;
  p.pos = 20;
  step(g, "roll", die(1));
  assert.deepEqual(ids(g), ["upgrade:atk"]);
  step(g, "upgrade:atk");
  assert.deepEqual([p.atk, p.act], [1, 3]);
  g.phase = "deathDiscard";
  step(g, "discard:c13");
  assert.equal(p.act, 1);
});

test("a disconnected player can resume a private choice or a wounded monster", () => {
  const g = pair(),
    [a, b] = g.players;
  step(g, "roll", die(2));
  assert.equal(g.phase, "offer");
  const choices = ids(g);
  setOnline(g, "a", false);
  assert.equal(g.turn, "b");
  assert.equal(view(g, "b").players[0].items, undefined);
  setOnline(g, "a", true);
  step(g, "roll", die(1));
  step(g, "heal");
  assert.deepEqual(ids(g), choices);
  step(g, choices[0]);
  assert.equal(g.turn, "b");
  b.pos = 18;
  b.atk = 6;
  step(g, "roll", die(1));
  step(g, "attack", die(5));
  assert.equal(g.battle.hp, 3);
  setOnline(g, "b", false);
  assert.equal(g.turn, "a");
  assert.equal(g.board[18].hp, 3);
  setOnline(g, "b", true);
  a.pos = 1;
  step(g, "roll", die(1));
  if (g.phase === "landing") step(g, "resolve");
  step(g, "heal");
  assert.equal(g.battle.hp, 3);
  assert.equal(g.battle.actors[0], "b");
});

function generator(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function chooseAdventureAction(g, snapshot) {
  const value = {
    l05: 100,
    l03: 90,
    c10: 80,
    l02: 70,
    c13: 65,
    c17: 28,
    c05: -8,
    l15: 58,
    l06: 52,
    l07: 44,
    c01: 38,
    c04: 37,
    i02: 40,
    i07: 14,
    i03: 15,
    i04: 9,
    i05: 6,
  };
  const options = snapshot.actions;
  const p = snapshot.players.find((p) => p.id === snapshot.actor);
  const byId = (id) => options.find((a) => a.id === id);
  const score = (a) => value[a.card] || 0;
  if (snapshot.phase !== "upgrade" && g.phase === "replace") {
    const worst = options
      .filter((a) => a.id.startsWith("replace:"))
      .sort((a, b) => score(a) - score(b))[0];
    return (value[g.pending.card] || 0) > score(worst)
      ? worst
      : byId("decline");
  }
  if (
    snapshot.phase !== "upgrade" &&
    (g.phase === "offer" || g.phase === "loot")
  )
    return [...options].sort((a, b) => score(b) - score(a))[0];
  const improve =
    p.atk < 3
      ? "atk"
      : p.def < Math.min(4, p.atk)
        ? "def"
        : p.act >= p.atk + 1
          ? "atk"
          : "act";
  const priority = [
    "challenge",
    ...(p.hp < 9 ? ["heal", "use:i02"] : []),
    "upgrade:" + improve,
    "rest",
    "use:i07:act",
    "use:i03",
    "attack",
    "defend",
    "confirm",
    "repeatOpening",
    "equipment",
    "end",
  ];
  return priority.map(byId).find(Boolean) || options[0];
}

for (const count of [1, 4, 5]) {
  test(
    "a full seeded adventure reaches final-boss victory with " +
      count +
      " player(s)",
    () => {
      const g = newGame(
        Array.from({ length: count }, (_, i) => ({
          id: "p" + i,
          name: "玩家" + i,
        })),
        generator(13244),
      );
      const rng = generator(13244);
      let actionsTaken = 0;
      while (!g.winner && actionsTaken < 12000) {
        const id = actor(g);
        const snapshot = view(g, id);
        const move = chooseAdventureAction(g, snapshot);
        assert.ok(move, "missing legal action during " + g.phase);
        act(g, id, move.id, rng);
        actionsTaken++;
      }
      assert.ok(
        g.winner,
        "failed to reach victory within the test budget: " +
          JSON.stringify({
            round: g.round,
            phase: g.phase,
            battle: g.battle?.monster,
            log: g.log.slice(-6),
          }),
      );
      assert.equal(g.players.find((p) => p.id === g.winner).pos, 100);
      for (const p of g.players) assert.deepEqual(view(g, p.id).actions, []);
    },
  );
}
