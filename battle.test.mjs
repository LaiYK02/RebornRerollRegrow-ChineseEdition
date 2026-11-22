import test from "node:test";
import assert from "node:assert/strict";
import { startBattle, actBattle, battleActions } from "./battle.mjs";

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
  while (
    choices(s).length === 1 &&
    ["confirm", "confirmAttack", "confirmEquipment"].includes(choices(s)[0])
  )
    outcome = choose(s, choices(s)[0], rng);
  return outcome;
}
const choices = (s) => battleActions(s, s.battle.actorId).map((a) => a.id);

test("怪物直接使用攻防值，玩家每次掷骰后都可确认", () => {
  const s = encounter("n02");
  choose(s, "attack", die(3));
  assert.deepEqual(s.battle.defenseRoll.dice, []);
  assert.equal(s.battle.defenseRoll.total, 2);
  assert.equal(s.battle.hp, 1);
  assert.deepEqual(choices(s), ["confirm"]);
  play(s, "confirm");
  assert.equal(s.battle.outcome.type, "monsterWin");

  const t = encounter("e01");
  choose(t, "attack", die(5));
  play(t, "confirm");
  assert.equal(t.battle.attackRoll.total, 3);
  assert.deepEqual(t.battle.attackRoll.dice, []);
  choose(t, "defend", die(2));
  assert.equal(t.players[0].hp, 10);
  assert.deepEqual(choices(t), ["confirm"]);
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

test("攻击骰与防御骰作差，成功仅扣 1 生命；攻击次数等于行动点", () => {
  const s = encounter("e01", { atk: 7, act: 3 });
  play(s, "attack");
  assert.equal(s.battle.hp, 2);
  assert.equal(s.battle.remaining, 2);
  assert.deepEqual(s.battle.last, {
    attacker: "甲",
    defender: "$monster",
    attack: 7,
    defense: 5,
    margin: 2,
    hit: true,
    damage: 1,
  });
  play(s, "attack");
  assert.equal(s.battle.atk, 6);
  assert.equal(play(s, "attack").type, "monsterWin");
  assert.deepEqual(choices(s), []);
});

test("平手无伤，未经授权的行动不改变对局", () => {
  const s = encounter("n01");
  assert.deepEqual(battleActions(s, "旁观者"), []);
  assert.throws(() => actBattle(s, "旁观者", "attack"));
  assert.equal(s.battle.hp, 1);
  play(s, "attack");
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
  assert.equal(play(s, "attack"), null);
  assert.equal(s.battle.form, "n01");
  assert.equal(s.battle.slimes, 2);
  play(s, "attack");
  assert.equal(s.battle.slimes, 1);
  const escaped = play(s, "use:i04");
  const next = encounter(
    "e03",
    { atk: 2 },
    { monsterState: escaped.monsterState },
  );
  assert.equal(play(next, "attack").monsterId, "e03");
});

test("兽人防御后回血，吸血鬼命中回血，狼人初始获五点生命攻击", () => {
  const orc = encounter("e02", { atk: 4 });
  play(orc, "attack");
  assert.equal(orc.battle.hp, 3);
  const vampire = encounter("e04", {}, { monsterHp: 1 });
  play(vampire, "attack");
  play(vampire, "defend");
  assert.equal(vampire.battle.hp, 2);
  const wolf = encounter("e05", { items: ["i12"] });
  assert.equal(wolf.battle.hp, 7);
  assert.equal(wolf.battle.atk, 7);
  play(wolf, "use:i12:e05.1");
  assert.equal(wolf.battle.maxHp, 2);
  assert.equal(wolf.battle.atk, 2);
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

test("嫉妒禁装备和施加可净化减益，破咒后装备恢复", () => {
  const s = encounter("b02", { gear: ["c01"], items: ["i14", "i12"] });
  assert.equal(s.battle.atk, 10);
  play(s, "use:i14:self:envy");
  assert.equal(s.battle.atk, 8);
  play(s, "use:i12:b02.3");
  play(s, "attack");
  assert.equal(s.battle.last.attack, 3);
});

test("暴怒受攻击蓄力，攻击后清零；死亡反击可导致玩家战败", () => {
  const s = encounter("b03");
  assert.equal(s.battle.atk, 7);
  play(s, "attack");
  assert.equal(s.battle.attackRoll.total, 9);
  play(s, "defend");
  assert.equal(s.battle.atk, 8);
  const mutual = encounter("b03", { hp: 3, atk: 4 }, { monsterHp: 1 });
  assert.equal(play(mutual, "attack").type, "monsterLoss");
});

test("怠惰交换属性，相同骰点不能成功，可驱散按失血叠加的减益", () => {
  const s = encounter("b04", { atk: 1, def: 9, act: 3, items: ["i12", "i14"] });
  play(s, "attack");
  assert.equal(s.battle.last.attack, 9);
  assert.equal(s.battle.last.hit, false);
  play(s, "use:i12:b04.3");
  play(s, "attack");
  assert.equal(s.battle.last.hit, true);
  assert.ok(choices(s).includes("use:i14:self:sloth"));
  play(s, "use:i14:self:sloth");
  assert.ok(!s.battle.statuses["甲"].length);
});

test("贪婪盾牌抵挡攻击，偶数伤害判定被免疫，攻击无视向下取整的一半防御", () => {
  const s = encounter("b05", { atk: 13, act: 3, def: 9 });
  play(s, "attack");
  assert.equal(s.battle.shield, 7);
  assert.equal(s.battle.last.hit, false);
  play(s, "attack");
  assert.equal(s.battle.shield, 0);
  assert.equal(s.battle.last.hit, false);
  play(s, "attack");
  assert.equal(s.battle.hp, 5);
  play(s, "defend");
  assert.equal(s.battle.last.margin, 1);
});

test("暴食按装备增幅、逐轮失去防御并于十轮后引爆", () => {
  const s = encounter("b06", { gear: ["c11"], def: 20 });
  assert.equal(s.battle.def, 19);
  assert.equal(s.battle.atk, 3);
  let outcome;
  for (let i = 0; i < 10; i++) {
    play(s, "attack");
    outcome = play(s, "defend");
  }
  assert.equal(outcome.type, "monsterWin");
  assert.equal(s.players[0].hp, 2);
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
  play(s, "use:i14:self:disarm");
  assert.ok(choices(s).includes("attack"));
});

test("最终头目从七位头目各选一项，15 HP，攻防分别为玩家防攻的三倍", () => {
  const s = encounter("final", { atk: 4, def: 2 }, {}, sixes);
  assert.equal(s.battle.active.length, 7);
  assert.equal(new Set(s.battle.active.map((e) => e.split(".")[0])).size, 7);
  assert.equal(s.battle.base.atk, 6);
  assert.equal(s.battle.base.def, 12);
  assert.equal(s.battle.maxHp, 15);
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
});

test("借运骰和黄金骰作用于一次判定，重掷与砝码只改变自己的结果，命数棱镜可反转", () => {
  const s = encounter("e03", { items: ["i18", "i09", "i08", "i19", "i01"] });
  play(s, "use:i18:6");
  play(s, "use:i09");
  play(s, "attack");
  assert.deepEqual(s.battle.attackRoll.dice, [6, 1]);
  play(s, "use:i08");
  assert.deepEqual(s.battle.attackRoll.dice, [1, 1]);
  play(s, "use:i19:2");
  assert.equal(s.battle.attackRoll.total, 4);
  play(s, "use:i01");
  assert.equal(s.battle.last.hit, false);
});

test("淬刃油、血契和裂魂刃叠加伤害，灵光一现不改变永久属性", () => {
  const s = encounter("b01", {
    atk: 13,
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

test("震魂锤令对方无法防御攻击，强驱散可在对方下一攻击轮解除", () => {
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
  assert.ok(!choices(s).includes("use:i14:self:stun"));
  play(s, "use:i15:self");
  assert.ok(choices(s).includes("attack"));
});

test("成功防御可选择赌命护腕，荆棘反击且汲血圣杯每轮只发动一次", () => {
  const bracer = encounter("e01", { def: 5, hp: 7, gear: ["c12", "l05"] });
  play(bracer, "attack");
  play(bracer, "defend");
  assert.equal(bracer.battle.hp, 1);
  assert.equal(bracer.battle.phase, "optional");
  play(bracer, "equipment", sixes);
  assert.equal(bracer.players[0].hp, 8);
  const chalice = encounter("e03", { atk: 4, act: 3, hp: 7, gear: ["l12"] });
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
  assert.deepEqual(s.players[1].locked, ["c02"]);
  play(s, "use:i16");
  assert.equal(s.battle.remaining, 1);
  play(s, "use:i12:status:knight");
  play(s, "attack");
  assert.equal(s.battle.attackRoll.count, 2);
  play(s, "defend");
  assert.equal(s.battle.last.defense, 5);
});

test("致命一击后可发动圣杯，装备判定也支持选择骰点、借骰、重掷和反转", () => {
  const s = encounter("n01", {
    atk: 2,
    hp: 8,
    gear: ["l12"],
    items: ["i09", "i18", "i08", "i01"],
  });
  play(s, "attack");
  play(s, "confirm");
  assert.equal(s.battle.phase, "optional");
  assert.equal(s.battle.outcome, null);
  play(s, "use:i18:6");
  play(s, "use:i09");
  play(s, "equipment");
  assert.deepEqual(s.battle.equipmentRoll.dice, [6, 1]);
  play(s, "use:i08");
  assert.deepEqual(s.battle.equipmentRoll.dice, [1, 1]);
  assert.equal(play(s, "use:i01").type, "monsterWin");
  assert.equal(s.players[0].hp, 9);
});

test("放弃圣杯仍可在同轮随后一次造成伤害后发动", () => {
  const s = encounter("e03", { atk: 3, act: 2, hp: 8, gear: ["l12"] });
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
  assert.equal(s.battle.last.attack, 4);
  assert.ok(choices(s).includes("passOpening"));
  play(s, "passOpening");
  assert.equal(s.battle.phase, "defend");
  const axe = encounter(
    "e01",
    { gear: ["c10", "c08", "c04"], atk: 3 },
    { monsterHp: 2 },
  );
  assert.equal(play(axe, "attack").type, "monsterWin");
  assert.equal(axe.battle.last.attack, 7);
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
  assert.deepEqual(s.battle.base, { atk: 15, def: 3 });
  // 奇数差值避开本次抽到的贪婪免疫。
  assert.equal(play(s, "attack", die(4)).type, "victory");
});
