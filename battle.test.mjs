import test from "node:test";
import assert from "node:assert/strict";
import {
  startBattle,
  actBattle,
  battleActions,
  refreshAttackAllowance,
} from "./battle.mjs";

const ones = () => 0;
const sixes = () => 0.999;
const die = (n) => () => (n - 0.5) / 6;
const hero = (id, extra = {}) => ({
  id,
  name: id,
  hp: 10,
  atk: 1,
  def: 1,
  act: 1,
  gear: [],
  items: [],
  locked: [],
  statuses: [],
  movePenalty: 0,
  ...extra,
});
const state = (...players) => ({ players, log: [], dice: null });

function encounter(monsterId, properties = {}, options = {}, rng = ones) {
  const s = state(hero("甲", properties));
  startBattle(s, { attackerId: "甲", monsterId, ...options }, rng);
  return s;
}
function choose(s, id, rng = ones) {
  return actBattle(s, s.battle.actorId, id, rng);
}
function play(s, id, rng = ones) {
  let outcome = choose(s, id, rng);
  let available = choices(s).filter((id) => id !== "surrender");
  while (
    available.length === 1 &&
    ["confirm", "confirmAttack", "confirmEquipment"].includes(available[0])
  ) {
    outcome = choose(s, available[0], rng);
    available = choices(s).filter((id) => id !== "surrender");
  }
  return outcome;
}
const choices = (s) => battleActions(s, s.battle.actorId).map((a) => a.id);

function playCleanse(s, target) {
  const [, card] = target.split(":");
  choose(s, `use:${card}`);
  play(s, target);
  if (card === "i15") play(s, "confirmCleanse");
}

test("先声双刃让 3 行动点的玩家在首轮再攻击 3 次", () => {
  const s = encounter("b03", { act: 3, gear: ["c09"] });
  for (let i = 0; i < 3; i++) play(s, "attack");
  assert.ok(choices(s).includes("repeatOpening"));
  play(s, "repeatOpening");
  assert.equal(s.battle.remaining, 3);
  for (let i = 0; i < 3; i++) play(s, "attack");
  assert.equal(s.battle.phase, "defend");
  play(s, "defend");
  for (let i = 0; i < 3; i++) play(s, "attack");
  assert.equal(s.battle.phase, "defend");
});

test("最终头目效果不用其他头目名字，自爆致死仍判挑战失败", () => {
  const s = encounter("final", { hp: 5, atk: 1, def: 2 }, {}, () => 0.4);
  assert.ok(
    !s.battle.effects.some((text) =>
      /傲慢|嫉妒|暴怒|怠惰|贪婪|暴食|色欲/.test(text),
    ),
  );
  s.battle.active = ["b06.2"];
  s.battle.round = 10;
  play(s, "attack");
  assert.equal(play(s, "defend", sixes).type, "monsterLoss");
  assert.ok(s.battle.hp > 0);
});

test("在第十轮前击败会自爆的原初之王，需活过爆炸才能获胜", () => {
  for (const [hp, result] of [
    [8, "monsterLoss"],
    [9, "victory"],
  ]) {
    const s = encounter("final", { hp, atk: 4 }, {}, () => 0.4);
    s.battle.active = ["b06.2"];
    s.battle.hp = 1;
    assert.equal(play(s, "attack", sixes).type, result);
    assert.equal(s.players[0].hp, hp - 8);
    assert.equal(s.battle.hp, hp === 8 ? s.battle.maxHp : 0);
  }
});

test("吸血鬼的基础生命为 4，各高阶地形继续叠加", () => {
  for (const [biome, hp] of [
    ["plains", 4],
    ["desert", 4],
    ["rainforest", 5],
    ["volcano", 6],
  ]) {
    assert.equal(encounter("e04", {}, { biome }).battle.hp, hp);
  }
});

test("色欲使用原始单骰，必中刻印优先，行动次数与缴械额外伤害照常", () => {
  const s = encounter("b07", {
    atk: 5,
    def: 8,
    act: 3,
    gear: ["c01", "c17"],
    items: ["i09", "i18", "i19", "i01"],
  });
  assert.ok(
    !choices(s).some((id) => id === "use:i09" || id.startsWith("use:i18")),
  );
  choose(s, "attack", die(3));
  assert.deepEqual(s.battle.attackRoll.dice, [3]);
  assert.equal(s.battle.attackRoll.total, 3);
  assert.ok(
    !choices(s).some((id) => id === "use:i01" || id.startsWith("use:i19")),
  );
  play(s, "confirm");
  assert.equal(s.battle.last.hit, false);
  assert.equal(s.battle.remaining, 2);
  play(s, "attack", die(4));
  play(s, "attack", die(4));
  play(s, "defend", die(4));
  assert.equal(s.players[0].hp, 10);
  play(s, "skip");
  play(s, "defend", die(3));
  assert.equal(s.battle.last.damage, 3);

  const t = encounter("b07", { gear: ["l03"] });
  play(t, "attack", die(1));
  assert.equal(t.battle.last.hit, true);
});

test("59 防御对 52 攻击，荆棘战甲以溢出 7 计算 2 点反击", () => {
  const s = encounter("b03", { def: 10, gear: ["l05"] });
  s.battle.base.atk = 49;
  play(s, "attack", die(1));
  const rolls = Array(9).fill(6).concat(2);
  play(s, "defend", () => die(rolls.shift())());
  assert.equal(s.battle.last.attack, 52);
  assert.equal(s.battle.last.defense, 59);
  assert.equal(s.battle.hp, 8);
});

test("净化可以解除嫉妒装备诅咒，但暴食衰减只能移除对应效果", () => {
  const s = encounter("b02", { gear: ["c01"], items: ["i14"] });
  assert.ok(choices(s).includes("use:i14"));
  playCleanse(s, "use:i14:self:gearSeal");
  play(s, "attack", die(4));
  assert.equal(s.battle.last.attack, 4);
  const t = encounter("b06", { items: ["i14", "i15", "i12"] });
  assert.ok(!choices(t).some((id) => id === "use:i14" || id === "use:i15"));
  play(t, "use:i12:b06.1");
  assert.equal(t.battle.def, t.battle.base.def);
});

test("净化可选双方的增减益，大净化显示预览且取消不耗牌", () => {
  const s = state(
    hero("甲", { items: ["i13", "i16", "i14", "i15"] }),
    hero("乙", { gear: ["c01"] }),
  );
  startBattle(s, { attackerId: "甲", defenderId: "乙" });
  play(s, "use:i13:c01");
  play(s, "use:i16");
  assert.throws(() => choose(s, "use:i14:other:lock-c01"));
  choose(s, "use:i14");
  assert.equal(s.battle.itemMenu?.stage, "status");
  assert.ok(choices(s).includes("use:i14:self:knight"));
  assert.ok(choices(s).includes("use:i14:other:knight"));
  assert.ok(choices(s).includes("use:i14:other:lock-c01"));
  assert.ok(!choices(s).includes("attack"));
  choose(s, "cancelItem");
  assert.deepEqual(s.players[0].items, ["i14", "i15"]);
  choose(s, "use:i15");
  choose(s, "use:i15:other");
  assert.equal(s.battle.itemMenu.stage, "confirm");
  assert.equal(s.battle.itemMenu.target, "乙");
  assert.deepEqual(s.battle.itemMenu.detail, s.battle.statuses["乙"]);
  assert.deepEqual(s.players[0].items, ["i14", "i15"]);
  choose(s, "backItem");
  assert.ok(choices(s).includes("use:i15:self"));
  choose(s, "use:i15:other");
  choose(s, "confirmCleanse");
  assert.deepEqual(s.players[0].items, ["i14"]);
  assert.deepEqual(s.battle.statuses["乙"], []);
  assert.ok(s.battle.statuses["甲"].length);
});

test("精英数值随地形增长，普通怪全属性提高 1", () => {
  for (const [biome, bonus] of [
    ["plain", 0],
    ["desert", 0],
    ["rainforest", 1],
    ["volcano", 2],
  ]) {
    const b = encounter("e02", {}, { biome }).battle;
    assert.deepEqual([b.atk, b.def, b.hp], [6 + bonus, 5 + bonus, 3 + bonus]);
  }
  const b = encounter("n01").battle;
  assert.deepEqual([b.atk, b.def, b.hp], [3, 2, 2]);
});

test("怪物直接使用攻防值，玩家每次掷骰后都可确认", () => {
  const s = encounter("n02");
  choose(s, "attack", die(4));
  assert.deepEqual(s.battle.defenseRoll.dice, []);
  assert.equal(s.battle.defenseRoll.total, 3);
  assert.equal(s.battle.hp, 2);
  assert.deepEqual(choices(s), ["confirm", "surrender"]);
  play(s, "confirm");
  assert.equal(s.battle.hp, 1);

  const t = encounter("e01");
  choose(t, "attack", die(5));
  play(t, "confirm");
  assert.equal(t.battle.attackRoll.total, 5);
  assert.deepEqual(t.battle.attackRoll.dice, []);
  choose(t, "defend", die(2));
  assert.equal(t.players[0].hp, 10);
  assert.deepEqual(choices(t), ["confirm", "surrender"]);
  play(t, "confirm");
  assert.equal(t.players[0].hp, 9);
});

test("决斗攻击骰确认后才轮到对手，重掷播放新骰点", () => {
  const s = state(hero("甲", { items: ["i08"] }), hero("乙"));
  startBattle(s, { attackerId: "甲", defenderId: "乙" });
  choose(s, "attack", die(1));
  const firstRoll = s.dice.rollId;
  assert.deepEqual(choices(s), ["confirmAttack", "use:i08"]);
  assert.deepEqual(battleActions(s, "乙"), []);
  choose(s, "use:i08", die(5));
  assert.equal(s.dice.rollId, firstRoll + 1);
  assert.deepEqual(s.dice.values, [5]);
  choose(s, "confirmAttack");
  assert.equal(s.battle.actorId, "乙");
  choose(s, "defend", die(3));
  assert.equal(s.players[1].hp, 10);
  choose(s, "confirm");
  assert.equal(s.battle.actorId, "乙");
  choose(s, "confirm");
  assert.equal(s.players[1].hp, 9);
});

test("决斗仅在双方确认后记录攻击，并能记录反向攻击和未命中", () => {
  const s = state(hero("甲", { items: ["i02"] }), hero("乙"));
  startBattle(s, { attackerId: "甲", defenderId: "乙" });
  choose(s, "attack", sixes);
  choose(s, "confirmAttack");
  choose(s, "defend");
  choose(s, "confirm");
  assert.equal(s.combatEvents?.length ?? 0, 0);
  choose(s, "confirm");
  play(s, "attack");
  play(s, "defend", sixes);
  assert.deepEqual(
    s.combatEvents?.map(({ seq, attacker, defender, hit, fallen }) => [
      seq,
      attacker,
      defender,
      hit,
      fallen,
    ]),
    [
      [1, "甲", "乙", true, []],
      [2, "乙", "甲", false, []],
    ],
  );
  const { frame } = s.combatEvents[0];
  assert.equal(frame.players.find((p) => p.id === "乙").hp, 10);
  assert.equal(frame.battle.attackRoll.total, 6);
  assert.equal(frame.battle.defenseRoll.total, 1);
  assert.ok(!("items" in frame.players[0]));
  assert.ok(!("gear" in frame.players[0]));
});

test("荆棘反击击败进攻方时会记录其倒下", () => {
  const s = encounter("n01", { def: 2, gear: ["l05"] }, { monsterHp: 1 });
  play(s, "attack");
  assert.equal(play(s, "defend", sixes).type, "monsterWin");
  const event = s.combatEvents?.at(-1);
  assert.equal(event?.attacker, "$monster");
  assert.equal(event?.defender, "甲");
  assert.equal(event?.hit, false);
  assert.deepEqual(event?.fallen, ["$monster"]);
  assert.equal(event.frame.battle.hp, 1);
});

test("确认放弃才会记录骑士倒下", () => {
  const s = encounter("n01");
  choose(s, "surrender");
  choose(s, "cancelSurrender");
  assert.equal(s.combatEvents?.length ?? 0, 0);
  choose(s, "surrender");
  assert.equal(choose(s, "confirmSurrender").type, "monsterLoss");
  const event = s.combatEvents?.at(-1);
  assert.equal(event?.attacker, null);
  assert.equal(event?.defender, null);
  assert.deepEqual(event?.fallen, ["甲"]);
  assert.equal(event.frame.players[0].hp, 10);
});

test("在史莱姆分裂后的装备选择阶段放弃时，只记录骑士倒下", () => {
  const s = encounter("e03", { atk: 3, gear: ["l12"] }, { monsterHp: 1 });
  play(s, "attack", die(2));
  assert.equal(s.battle.phase, "optional");
  choose(s, "surrender");
  choose(s, "confirmSurrender");
  assert.deepEqual(
    s.combatEvents.map(({ fallen }) => fallen),
    [["$monster"], ["甲"]],
  );
});

test("赌命护腕导致骑士倒下时记录独立的受击事件", () => {
  const s = encounter("n01", { hp: 1, def: 4, gear: ["c12"] });
  play(s, "attack");
  play(s, "defend");
  assert.equal(play(s, "equipment").type, "monsterLoss");
  const event = s.combatEvents.at(-1);
  assert.equal(event.attacker, null);
  assert.equal(event.defender, "甲");
  assert.equal(event.hit, true);
  assert.deepEqual(event.fallen, ["甲"]);
  assert.equal(event.frame.players[0].hp, 1);
});

test("战斗动画只保留最近 24 项且换场后序号继续递增", () => {
  const s = encounter("n01", { def: 4 });
  for (let turn = 0; turn < 13; turn++) {
    play(s, "attack");
    play(s, "defend");
  }
  assert.equal(s.combatEvents?.length, 24);
  assert.equal(s.combatEvents[0].seq, 3);
  assert.equal(s.combatEvents.at(-1).seq, 26);
  startBattle(s, { attackerId: "甲", monsterId: "n01" }, ones);
  play(s, "attack");
  assert.equal(s.combatEvents.at(-1).seq, 27);
});

test("攻击骰与防御骰作差，成功仅扣 1 生命；攻击次数等于行动点", () => {
  const s = encounter("e01", { atk: 9, act: 3 });
  play(s, "attack");
  assert.equal(s.battle.hp, 2);
  assert.equal(s.battle.remaining, 2);
  assert.deepEqual(s.battle.last, {
    attacker: "甲",
    defender: "$monster",
    attack: 9,
    defense: 7,
    margin: 2,
    hit: true,
    damage: 1,
  });
  play(s, "attack");
  assert.equal(s.battle.atk, 10);
  assert.equal(play(s, "attack").type, "monsterWin");
  assert.deepEqual(choices(s), []);
  const wounded = encounter("e01", {}, { monsterHp: 1 });
  play(wounded, "attack");
  play(wounded, "defend");
  assert.equal(wounded.battle.last.attack, 10);
  assert.equal(wounded.battle.last.damage, 2);
});

test("平手无伤，未经授权的行动不改变对局", () => {
  const s = encounter("n01");
  assert.deepEqual(battleActions(s, "旁观者"), []);
  assert.throws(() => actBattle(s, "旁观者", "attack"));
  assert.equal(s.battle.hp, 2);
  play(s, "attack", die(2));
  assert.equal(s.battle.phase, "defend");
  assert.equal(s.battle.last.hit, false);
  play(s, "defend");
  assert.equal(s.players[0].hp, 9);
  assert.equal(s.battle.round, 2);
});

test("精英史莱姆须打倒两个分裂体，逃走后能原样恢复", () => {
  const s = encounter(
    "e03",
    { atk: 3, act: 5, items: ["i04"] },
    { monsterHp: 1 },
  );
  assert.equal(play(s, "attack", die(2)), null);
  assert.equal(s.battle.form, "n01");
  assert.equal(s.battle.slimes, 2);
  assert.equal(s.battle.remaining, 4);
  const split = s.combatEvents?.at(-1);
  assert.deepEqual(split?.fallen, ["$monster"]);
  assert.equal(split.frame.battle.form, "e03");
  assert.equal(split.frame.battle.hp, 1);
  play(s, "attack");
  play(s, "attack");
  assert.equal(s.battle.slimes, 1);
  assert.equal(s.battle.remaining, 2);
  assert.equal(s.battle.hp, 2);
  assert.deepEqual(s.combatEvents.at(-1).fallen, ["$monster"]);
  assert.equal(s.combatEvents.at(-1).frame.battle.slimes, 2);
  const escaped = play(s, "use:i04");
  const next = encounter(
    "e03",
    { atk: 2 },
    { monsterState: escaped.monsterState },
  );
  play(next, "attack", die(3));
  play(next, "defend");
  assert.equal(play(next, "attack", die(3)).monsterId, "e03");
});

test("兽人只在防御成功后回血，吸血鬼命中回血，狼人初始获五点生命攻击", () => {
  const orc = encounter("e02", { act: 2 });
  play(orc, "attack", die(6));
  assert.equal(orc.battle.hp, 2);
  play(orc, "attack", die(5));
  assert.equal(orc.battle.hp, 3);
  const vampire = encounter("e04", {}, { monsterHp: 1 });
  play(vampire, "attack");
  play(vampire, "defend");
  assert.equal(vampire.battle.hp, 2);
  const wolf = encounter("e05", { items: ["i12"] });
  assert.equal(wolf.battle.hp, 9);
  assert.equal(wolf.battle.atk, 10);
  assert.equal(wolf.battle.def, 7);
  play(wolf, "use:i12:e05.1");
  assert.equal(wolf.battle.maxHp, 4);
  assert.equal(wolf.battle.atk, 5);
});

test("傲慢禁止逃走并可追击；封魔枷锁能移除禁止逃走效果", () => {
  const pride = encounter("b01", { items: ["i04"] });
  assert.ok(!choices(pride).includes("use:i04"));
  play(pride, "attack");
  play(pride, "defend");
  assert.equal(pride.players[0].hp, 8);
  assert.equal(pride.battle.round, 1);
  assert.equal(pride.battle.phase, "defend");
  const bound = encounter("b01", { items: ["i04"], gear: ["l01"] });
  play(bound, "bind:b01.3");
  assert.equal(play(bound, "use:i04").type, "escape");
});

test("封魔枷锁在嫉妒封住装备前仍可选择一项实际效果", () => {
  const s = encounter("b02", { gear: ["l01", "c01"] });
  assert.deepEqual(choices(s), [
    "bind:b02.1",
    "bind:b02.2",
    "bind:b02.3",
    "surrender",
  ]);
  choose(s, "bind:b02.1");
  assert.ok(s.battle.active.includes("b02.3"));
  assert.ok(!s.battle.active.includes("b02.1"));
  assert.ok(!choices(s).some((id) => id.startsWith("bind:")));
});

test("嫉妒禁装备和施加可净化减益，破咒后装备恢复", () => {
  const s = encounter("b02", { gear: ["c01"], items: ["i14", "i12"] });
  assert.equal(s.battle.atk, 12);
  playCleanse(s, "use:i14:self:envy");
  assert.equal(s.battle.atk, 12);
  play(s, "use:i12:b02.3");
  play(s, "attack");
  assert.equal(s.battle.last.attack, 3);
});

test("暴怒受攻击蓄力，攻击后清零；死亡反击可导致玩家战败", () => {
  const s = encounter("b03");
  assert.equal(s.battle.atk, 9);
  play(s, "attack");
  assert.equal(s.battle.attackRoll.total, 11);
  assert.equal(s.battle.baseAtk, 8);
  assert.equal(s.battle.rageBonus, 2);
  play(s, "defend");
  assert.equal(s.battle.atk, 10);
  assert.equal(s.battle.rageBonus, 0);
  const mutual = encounter("b03", { hp: 3, atk: 7 }, { monsterHp: 1 });
  assert.equal(play(mutual, "attack").type, "monsterLoss");
});

test("怠惰交换属性，相同骰点不能成功，可驱散按失血叠加的减益", () => {
  const s = encounter("b04", { atk: 1, def: 9, act: 3, items: ["i12", "i14"] });
  play(s, "attack");
  assert.equal(s.battle.last.attack, 9);
  assert.equal(s.battle.last.hit, false);
  play(s, "use:i12:b04.3");
  play(s, "attack", die(2));
  assert.equal(s.battle.last.hit, true);
  playCleanse(s, "use:i14:self:sloth");
  assert.ok(!s.battle.statuses["甲"].length);
});

test("贪婪盾牌抵挡攻击，偶数伤害判定被免疫，攻击无视向下取整的一半防御", () => {
  const s = encounter("b05", { atk: 14, act: 3, def: 9 });
  play(s, "attack");
  assert.equal(s.battle.shield, 6);
  assert.equal(s.battle.last.hit, false);
  play(s, "attack");
  assert.equal(s.battle.shield, 0);
  assert.equal(s.battle.last.hit, false);
  play(s, "attack");
  assert.equal(s.battle.hp, 5);
  play(s, "defend");
  assert.equal(s.battle.last.margin, 3);
});

test("暴食按装备增幅、逐轮失去防御并于第十轮后引爆", () => {
  const s = encounter("b06", { gear: ["c11"], def: 20 });
  assert.equal(s.battle.def, 22);
  assert.equal(s.battle.atk, 5);
  let outcome;
  for (let i = 0; i < 10; i++) {
    play(s, "attack");
    outcome = play(s, "defend");
    if (i < 9) assert.equal(outcome, null);
  }
  assert.equal(outcome.type, "monsterWin");
  assert.equal(s.players[0].hp, 2);
  const [strike, blast] = s.combatEvents?.slice(-2) ?? [];
  assert.equal(strike?.attacker, "$monster");
  assert.equal(blast?.attacker, null);
  assert.equal(blast?.defender, "甲");
  assert.deepEqual(blast?.fallen, ["$monster"]);
  assert.equal(blast.frame.players[0].hp, 10);
});

test("色欲改为单骰成败，奇数攻击本轮仍可行动，下轮缴械并能以净化解除", () => {
  const s = encounter("b07", { atk: 5, act: 2, items: ["i14"] });
  play(s, "attack", die(5));
  assert.equal(s.battle.last.attack, 5);
  assert.equal(s.battle.hp, 4);
  assert.ok(choices(s).includes("attack"));
  play(s, "attack", die(5));
  play(s, "defend", ones);
  assert.equal(s.players[0].hp, 8);
  assert.ok(choices(s).includes("skip"));
  playCleanse(s, "use:i14:self:disarm");
  assert.ok(choices(s).includes("attack"));
});

test("最终头目从七位头目各选一项，15 HP，攻防分别为玩家防攻的四倍", () => {
  const s = encounter("final", { atk: 4, def: 2 }, {}, sixes);
  assert.equal(s.battle.active.length, 7);
  assert.equal(new Set(s.battle.active.map((e) => e.split(".")[0])).size, 7);
  assert.equal(s.battle.base.atk, 8);
  assert.equal(s.battle.base.def, 16);
  assert.equal(s.battle.maxHp, 15);
});

test("决斗者的血刃保留判定减二并额外造成两点伤害", () => {
  const s = state(hero("甲", { gear: ["l09"] }), hero("乙"));
  startBattle(s, { attackerId: "甲", defenderId: "乙" });
  play(s, "attack", sixes);
  play(s, "defend");
  assert.equal(s.battle.last.attack, 4);
  assert.equal(s.battle.last.damage, 3);
  assert.equal(s.players[1].hp, 7);
});

test("命数棱镜仅在决斗双方掷骰后反转结果，保持骰点和判定值", () => {
  const s = state(hero("甲", { items: ["i01"] }), hero("乙"));
  startBattle(s, { attackerId: "甲", defenderId: "乙" });
  choose(s, "attack", sixes);
  assert.ok(!choices(s).includes("use:i01"));
  choose(s, "confirmAttack");
  choose(s, "defend", die(3));
  const before = structuredClone([
    s.dice,
    s.battle.attackRoll,
    s.battle.defenseRoll,
  ]);
  choose(s, "use:i01");
  assert.deepEqual([s.dice, s.battle.attackRoll, s.battle.defenseRoll], before);
  play(s, "confirm");
  assert.equal(s.battle.last.attack, 6);
  assert.equal(s.battle.last.defense, 3);
  assert.equal(s.battle.last.hit, false);
});

test("命数棱镜反转贪婪免疫结算后的未命中", () => {
  const s = encounter("b05", { atk: 11, items: ["i01", "i12"] });
  play(s, "use:i12:b05.3");
  play(s, "attack");
  assert.match(battleActions(s, "甲")[0].label, /未命中/);
  play(s, "use:i01");
  assert.equal(s.battle.last.attack, 11);
  assert.equal(s.battle.last.defense, 9);
  assert.equal(s.battle.last.hit, true);
});

test("色欲单骰规则阻止反转攻防结果，但装备判定仍可反转", () => {
  const s = encounter("b07", { hp: 8, gear: ["c12"], items: ["i01"] });
  choose(s, "attack");
  assert.ok(!choices(s).includes("use:i01"));
  play(s, "confirm");
  play(s, "defend", sixes);
  choose(s, "equipment");
  const before = structuredClone([s.dice, s.battle.equipmentRoll]);
  assert.match(battleActions(s, "甲")[0].label, /失败/);
  choose(s, "use:i01");
  assert.deepEqual([s.dice, s.battle.equipmentRoll], before);
  assert.match(battleActions(s, "甲")[0].label, /成功/);
  play(s, "confirmEquipment");
  assert.equal(s.players[0].hp, 9);
});

test("战斗重置卡在掷骰前发起分配，并按重分配后的行动次数结束攻击轮", () => {
  const s = encounter("n01", { act: 2, alloc: { act: 1 }, items: ["i06"] });
  play(s, "attack");
  assert.ok(choices(s).includes("use:i06"));
  const previousRoll = structuredClone(s.dice);
  choose(s, "use:i06");
  assert.equal(s.battle.redistribute, "甲");
  assert.deepEqual(s.players[0].items, []);
  assert.deepEqual(s.players[0].alloc, { act: 1 });
  assert.deepEqual(s.dice, previousRoll);
  delete s.battle.redistribute;
  s.players[0].act = 1;
  refreshAttackAllowance(s, "甲");
  assert.ok(!choices(s).includes("attack"));
  choose(s, "skip");
  assert.equal(s.battle.phase, "defend");
  const none = encounter("n01", { items: ["i06"] });
  assert.ok(!choices(none).includes("use:i06"));
});

test("玩家决斗擂主先攻，行动和反应均由对应玩家执行，击败对方返回战利品结算", () => {
  const s = state(
    hero("擂主", { atk: 4, gear: ["l09", "c01"] }),
    hero("挑战者", { hp: 2 }),
  );
  startBattle(s, { attackerId: "擂主", defenderId: "挑战者" });
  assert.equal(s.battle.actorId, "擂主");
  play(s, "attack");
  assert.equal(s.battle.actorId, "挑战者");
  assert.deepEqual(play(s, "defend"), {
    type: "pvpWin",
    winnerId: "擂主",
    loserId: "挑战者",
  });
  assert.deepEqual(s.combatEvents.at(-1).fallen, ["挑战者"]);
});

test("借运骰和黄金骰作用于一次判定，重掷与砝码只改变自己的结果，命数棱镜可反转", () => {
  const s = encounter("e03", { items: ["i18", "i09", "i08", "i19", "i01"] });
  play(s, "use:i18:6");
  play(s, "use:i09");
  play(s, "attack");
  assert.deepEqual(s.battle.attackRoll.dice, [6, 1]);
  play(s, "use:i08", die(2));
  assert.deepEqual(s.battle.attackRoll.dice, [2, 2]);
  play(s, "use:i19:2");
  assert.equal(s.battle.attackRoll.total, 6);
  play(s, "use:i01");
  assert.equal(s.battle.last.hit, false);
});

test("淬刃油、血契和裂魂刃叠加伤害，灵光一现不改变永久属性", () => {
  const s = encounter("b01", {
    atk: 16,
    items: ["i03", "i07"],
    gear: ["c17", "l02"],
  });
  play(s, "use:i03");
  play(s, "use:i07:act");
  assert.equal(s.players[0].act, 1);
  play(s, "attack");
  assert.equal(s.battle.hp, 4);
  assert.equal(s.battle.remaining, 1);
  play(s, "attack");
  assert.equal(s.battle.hp, 1);
});

test("名刀司命每战挡一次致命伤，凤凰之泪满血复活后弃置", () => {
  const s = encounter("b01", { hp: 1, gear: ["l15", "l04"] });
  play(s, "attack");
  play(s, "defend");
  assert.equal(s.players[0].hp, 1);
  play(s, "defend");
  assert.equal(s.players[0].hp, 10);
  assert.deepEqual(s.players[0].gear, ["l15"]);
});

test("震魂锤令对方无法防御攻击，净化可在对方下一攻击轮解除", () => {
  const s = state(
    hero("甲", { atk: 2, gear: ["l06"] }),
    hero("乙", { def: 5, items: ["i14", "i15"] }),
  );
  startBattle(s, { attackerId: "甲", defenderId: "乙" });
  play(s, "attack");
  play(s, "shock");
  play(s, "defend");
  assert.equal(s.players[1].hp, 9);
  assert.ok(choices(s).includes("skip"));
  playCleanse(s, "use:i14:self:stun");
  assert.ok(choices(s).includes("attack"));
});

test("成功防御可选择赌命护腕，荆棘反击且汲血圣杯每轮只发动一次", () => {
  const bracer = encounter("e01", { def: 5, hp: 7, gear: ["c12", "l05"] });
  play(bracer, "attack");
  play(bracer, "defend");
  assert.equal(bracer.battle.hp, 2);
  assert.equal(bracer.battle.phase, "optional");
  play(bracer, "equipment", sixes);
  assert.equal(bracer.players[0].hp, 8);
  const chalice = encounter("e03", { atk: 5, act: 3, hp: 7, gear: ["l12"] });
  play(chalice, "attack");
  assert.equal(chalice.battle.phase, "optional");
  play(chalice, "equipment", sixes);
  play(chalice, "attack");
  assert.equal(chalice.battle.phase, "attack");
  assert.equal(chalice.players[0].hp, 8);
});

test("骑士精神、锁具咒与破咒钉在决斗中可指定目标，百宝袋不受锁具咒影响", () => {
  const s = state(
    hero("甲", { items: ["i13", "i16", "i12"], act: 4 }),
    hero("乙", { def: 5, gear: ["c02", "l16"], items: ["i15"] }),
  );
  startBattle(s, { attackerId: "甲", defenderId: "乙" });
  assert.ok(!choices(s).includes("use:i13:l16"));
  play(s, "use:i13:c02");
  assert.deepEqual(s.players[1].locked, []);
  assert.ok(
    s.battle.statuses["乙"].some((status) => status.includes("装备封锁")),
  );
  play(s, "use:i16");
  assert.equal(s.battle.remaining, 1);
  play(s, "use:i12:status:knight");
  play(s, "attack");
  assert.equal(s.battle.attackRoll.count, 2);
  play(s, "defend");
  assert.equal(s.battle.last.defense, 5);
});

test("锁具咒只在决斗中使用，徽章属性可通过净化或下一场决斗恢复", () => {
  for (const cleanse of ["use:i14:self:lock-c13", "use:i15:self", null]) {
    const s = state(
      hero("甲", { act: 2, items: ["i13", "i13"] }),
      hero("乙", {
        def: 2,
        gear: ["c13"],
        items: cleanse ? [cleanse.split(":")[1]] : [],
        badgeStat: "def",
        alloc: { atk: 0, def: 1, act: 0 },
      }),
    );
    startBattle(s, { attackerId: "甲", defenderId: "乙" });
    play(s, "use:i13:c13");
    assert.ok(!choices(s).includes("use:i13:c13"));
    play(s, "attack");
    if (cleanse) playCleanse(s, cleanse);
    play(s, "defend");
    assert.equal(s.battle.last.defense, cleanse ? 2 : 1);
    assert.equal(s.players[1].def, 2);
    assert.deepEqual(s.players[1].alloc, { atk: 0, def: 1, act: 0 });
    assert.deepEqual(s.players[1].locked, []);
    startBattle(s, { attackerId: "甲", defenderId: "乙" });
    play(s, "attack");
    play(s, "defend");
    assert.equal(s.battle.last.defense, 2);
  }
  const s = encounter("n01", { items: ["i13"] });
  assert.ok(!choices(s).some((id) => id.startsWith("use:i13")));
});

test("致命一击后可发动圣杯，装备判定也支持选择骰点、借骰、重掷和反转", () => {
  const s = encounter(
    "n01",
    {
      atk: 2,
      hp: 8,
      gear: ["l12"],
      items: ["i09", "i18", "i08", "i01"],
    },
    { monsterHp: 1 },
  );
  play(s, "attack", die(2));
  play(s, "confirm");
  assert.equal(s.battle.phase, "optional");
  assert.equal(s.battle.outcome, null);
  play(s, "use:i18:6");
  play(s, "use:i09");
  play(s, "equipment");
  assert.deepEqual(s.battle.equipmentRoll.dice, [6, 1]);
  play(s, "use:i08");
  assert.deepEqual(s.battle.equipmentRoll.dice, [1, 1]);
  const before = structuredClone([s.dice, s.battle.equipmentRoll]);
  assert.match(battleActions(s, "甲")[0].label, /失败/);
  choose(s, "use:i01");
  assert.deepEqual([s.dice, s.battle.equipmentRoll], before);
  assert.match(battleActions(s, "甲")[0].label, /成功/);
  assert.equal(play(s, "confirmEquipment").type, "monsterWin");
  assert.equal(s.players[0].hp, 9);
  assert.equal(s.combatEvents?.length, 1);
  assert.deepEqual(s.combatEvents[0].fallen, ["$monster"]);
});

test("放弃圣杯仍可在同轮随后一次造成伤害后发动", () => {
  const s = encounter("e03", { atk: 5, act: 2, hp: 8, gear: ["l12"] });
  play(s, "attack");
  play(s, "pass");
  play(s, "attack");
  assert.equal(s.battle.phase, "optional");
  play(s, "equipment", sixes);
  assert.equal(s.players[0].hp, 9);
});

test("先声双刃的额外攻击可放弃，断命斧斩杀、奇偶符和属性装备参与实际判定", () => {
  const s = encounter("e03", { gear: ["c09", "c07", "c01"] });
  play(s, "attack");
  assert.equal(s.battle.last.attack, 3);
  assert.equal(s.battle.attackRoll.parity, "even");
  assert.ok(choices(s).includes("passOpening"));
  play(s, "passOpening");
  assert.equal(s.battle.phase, "defend");
  const axe = encounter(
    "e01",
    { gear: ["c10", "c08", "c04"], atk: 5 },
    { monsterHp: 2 },
  );
  assert.equal(play(axe, "attack").type, "monsterWin");
  assert.equal(axe.battle.last.attack, 8);
  const sigil = encounter("b01", { gear: ["l14", "l07"], atk: 9, act: 3 });
  play(sigil, "attack");
  assert.equal(sigil.battle.last.attack, 4);
});

test("最终头目取值早于头目交换效果，并区分最终胜利与一般怪物奖励", () => {
  const s = encounter(
    "final",
    { atk: 1, def: 5, gear: ["l03", "l02"] },
    { monsterHp: 1 },
    ones,
  );
  assert.ok(s.battle.active.includes("b04.1"));
  assert.deepEqual(s.battle.base, { atk: 20, def: 4 });
  // 奇数差值避开本次抽到的贪婪免疫。
  assert.equal(play(s, "attack", die(5)).type, "victory");
});
