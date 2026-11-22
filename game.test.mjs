import assert from "node:assert/strict";
import test from "node:test";
import { act, newGame, restoreGame, setOnline, view } from "./game.mjs";
import { cards } from "./cards.mjs";

const solo = () => newGame([{ id: "a", name: "甲" }]);
const pair = () =>
  newGame([
    { id: "a", name: "甲" },
    { id: "b", name: "乙" },
  ]);
const choose = (game, action, rng = () => 0) =>
  act(game, game.battle?.actorId || game.actor, action, rng);
function step(game, action, rng = () => 0) {
  choose(game, action, rng);
  const available = ids(game);
  if (
    available.length === 1 &&
    ["check:accept", "confirm"].includes(available[0])
  )
    choose(game, available[0], rng);
}
const die = (n) => () => (n - 0.5) / 6;
const ids = (g, id = g.battle?.actorId || g.actor) =>
  view(g, id).actions.map((a) => a.id);

test("the board has 100 positions, symmetric portals and 25 active tiles per terrain", () => {
  const g = pair();
  assert.deepEqual(
    g.board.map((t) => t.pos),
    Array.from({ length: 100 }, (_, i) => i + 1),
  );
  assert.equal(g.board[0].type, "start");
  assert.equal(g.board.at(-1).type, "finish");
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
    assert.equal(view(g, "a").actions.length, 3);
    assert.ok(
      view(g, "a").actions.every(({ card }) => card.startsWith(prefix)),
    );
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
  assert.ok(view(g, "a").actions.every(({ card }) => card.startsWith("l")));
});

test("确认移动后记录沙漠的逐格前进与后退，火山传送到达也计伤害", () => {
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
  assert.equal(q.hp, 8);
});

test("draws and unplayed items stay private and snapshots do not mutate authority", () => {
  const g = pair(),
    [, guest] = g.players;
  guest.items.push("i13");
  step(g, "roll", die(2));
  const a = view(g, "a"),
    b = view(g, "b");
  assert.equal(a.actions.length, 3);
  assert.equal(new Set(a.actions.map((a) => a.card)).size, 3);
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

test("movement die modifiers, golden die, reroll and fate prism resolve once", () => {
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
  assert.equal(g.dice.total, 8);
  step(g, "use:i08", die(1));
  assert.deepEqual(g.dice.values, [1, 1]);
  step(g, "use:i01");
  assert.deepEqual(g.dice.values, [6, 6]);
  step(g, "use:i19");
  choose(g, "target:-2");
  step(g, "check:accept");
  assert.equal(p.pos, 11);
  assert.equal(p.movePenalty, 0);
  assert.equal(p.items.length, 0);
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
  step(h, "roll", die(3));
  assert.equal(q.pos, 55);
  assert.equal(h.phase, "end");
  step(h, "end");
  step(h, "roll", die(2));
  assert.equal(h.phase, "move");
  step(h, "roll", die(3));
  assert.equal(q.pos, 58);
  step(h, "rest:def");
  assert.equal(q.def, 2);
  assert.equal(q.alloc.def, 1);
  step(h, "end");
  q.pos = 79;
  q.hp = 5;
  step(h, "roll", die(1));
  assert.equal(q.hp, 4);
  step(h, "end");
  q.pos = 79;
  q.gear.push("l10", "l11");
  step(h, "roll", die(1));
  assert.equal(q.hp, 5);
  step(h, "end");
  q.pos = 32;
  step(h, "roll", die(2));
  assert.equal(q.pos, 15);
  assert.equal(h.phase, "end");
  step(h, "end");
  q.pos = 1;
  h.board[1].banana = true;
  step(h, "roll", die(1));
  assert.ok(q.statuses.some((x) => x.type === "slipped"));
  step(h, "end");
  step(h, "roll", die(6));
  assert.equal(q.pos, 2);
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
  assert.equal(d.sp, 1);
  assert.equal(c.pos, 1);
  assert.equal(c.hp, 10);
  assert.deepEqual(c.gear, ["l15", "l07"]);
  assert.deepEqual(ids(j, "a"), []);
  assert.ok(!JSON.stringify(view(j, "b")).includes("i02"));
  assert.ok(ids(j).includes("loot-item:0"));
  step(j, "loot:l07");
  assert.ok(d.gear.includes("l07"));
  assert.deepEqual(c.gear, ["l15"]);
  step(j, "end");
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
  assert.equal(g.battle.hp, 2);
  step(g, "use:i04");
  assert.equal(g.board[18].hp, 2);
  assert.equal(p.sp, 0);
  step(g, "end");
  p.pos = 18;
  step(g, "roll", die(1));
  assert.equal(g.battle.hp, 2);
  p.hp = 1;
  p.atk = 1;
  p.act = 1;
  p.gear = ["l03", "l08"];
  p.locked = ["l03"];
  for (let i = 0; i < 12 && g.battle; i++) step(g, ids(g)[0], die(2));
  assert.equal(p.pos, 1);
  assert.equal(p.hp, 10);
  assert.equal(g.board[18].hp, 3);
  assert.equal(g.phase, "deathDiscard");
  step(g, "discard:l08");
  assert.deepEqual(p.gear, ["l03"]);
  for (const [pos, tier, prefix, sp] of [
    [4, "normal", "i", 0],
    [19, "elite", "c", 1],
    [32, "boss", "l", 1],
  ]) {
    const h = solo(),
      [q] = h.players;
    q.pos = pos - 1;
    q.gear = ["l03", "c10", "l02"];
    q.act = 12;
    step(h, "roll", die(pos > 25 ? 2 : 1));
    assert.equal(h.board[pos - 1].type, tier);
    for (let i = 0; i < 40 && h.battle; i++) step(h, ids(h)[0], die(2));
    assert.equal(h.phase, "offer");
    assert.equal(q.sp, sp);
    assert.ok(view(h, "a").actions[0].card.startsWith(prefix));
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
  assert.equal(p.sp, 1);
  step(g, "spend");
  step(g, "upgrade:atk");
  assert.equal(p.atk, 2);
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
  assert.deepEqual(p.items, []);
  p.items = ["i01", "i02", "i03", "i05", "i08"];
  offer("i18");
  assert.equal(g.phase, "replace");
  step(g, "replace:i08");
  assert.equal(p.items.length, 5);
  assert.ok(p.items.includes("i18"));
});

test("returning to Start, legendary sacrifice, lock immunity, cleanses and redistribution", () => {
  const g = pair(),
    [p, q] = g.players;
  q.gear = ["c01", "l16"];
  p.items = ["i13", "i15", "i17", "i06"];
  p.gear = ["l13"];
  step(g, "use:i13");
  assert.ok(!ids(g).some((id) => id.includes("l16")));
  step(g, "target:1:c01");
  assert.deepEqual(q.locked, ["c01"]);
  step(g, "use:i17");
  step(g, "target:1");
  assert.equal(q.movePenalty, -2);
  step(g, "use:i15");
  step(g, "target:1");
  assert.deepEqual(q.locked, []);
  assert.equal(q.movePenalty, 0);
  p.pos = 99;
  step(g, "roll", die(4));
  step(g, "return");
  assert.deepEqual([p.pos, p.atk, p.def, p.act, p.sp], [1, 2, 2, 2, 1]);
  step(g, "use:i06");
  assert.deepEqual([p.atk, p.def, p.act, p.sp], [1, 1, 1, 4]);
  const h = solo(),
    [b] = h.players;
  b.pos = 79;
  b.hp = 1;
  b.gear = ["c16", "l02"];
  step(h, "roll", die(1));
  assert.deepEqual(b.gear, ["l02"]);
  assert.equal(b.hp, 10);
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
  q.sp = 2;
  q.pos = 32;
  setOnline(g, "a", false);
  assert.equal(g.turn, "b");
  step(g, "roll", die(2));
  assert.equal(q.pos, 15);
  step(g, "end");
  assert.equal(g.turn, "b");
  setOnline(g, "a", true);
  step(g, "roll", die(1));
  step(g, "end");
  assert.equal(g.turn, "a");
  setOnline(g, "b", false);
  assert.deepEqual(q.items, ["i04"]);
  assert.deepEqual(q.gear, ["l03"]);
  assert.equal(q.sp, 2);
  setOnline(g, "a", false);
  assert.deepEqual(ids(g, "a"), []);
  setOnline(g, "b", true);
  assert.equal(g.turn, "b");
  assert.equal(q.online, true);
  assert.equal(p.online, false);
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
  step(g, "end");
  assert.deepEqual(ids(g), choices);
  step(g, choices[0]);
  step(g, "end");
  assert.equal(g.turn, "b");
  b.pos = 18;
  b.atk = 6;
  step(g, "roll", die(1));
  step(g, "attack", die(5));
  assert.equal(g.battle.hp, 2);
  setOnline(g, "b", false);
  assert.equal(g.turn, "a");
  assert.equal(g.board[18].hp, 2);
  setOnline(g, "b", true);
  a.pos = 1;
  step(g, "roll", die(1));
  if (g.phase === "landing") step(g, "resolve");
  step(g, "end");
  assert.equal(g.battle.hp, 2);
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
  if (g.phase === "replace") {
    const worst = options
      .filter((a) => a.id.startsWith("replace:"))
      .sort((a, b) => score(a) - score(b))[0];
    return (value[g.pending.card] || 0) > score(worst)
      ? worst
      : byId("decline");
  }
  if (g.phase === "offer" || g.phase === "loot")
    return [...options].sort((a, b) => score(b) - score(a))[0];
  const improve = p.act >= p.atk + 1 ? "atk" : "act";
  const priority = [
    "challenge",
    ...(p.hp < 9 ? ["heal", "use:i02"] : []),
    "spend",
    "upgrade:" + improve,
    "rest:" + improve,
    "use:i07:act",
    "use:i03",
    "attack",
    "defend",
    "confirm",
    "equipment",
    "end",
  ];
  return priority.map(byId).find(Boolean) || options[0];
}

for (const count of [1, 4]) {
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
      );
      const rng = generator(count === 4 ? 429 : 13244);
      let actionsTaken = 0;
      while (!g.winner && actionsTaken < 12000) {
        const id = g.battle?.actorId || g.actor;
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
