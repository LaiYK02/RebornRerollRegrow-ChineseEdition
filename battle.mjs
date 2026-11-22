import { cards } from "./cards.mjs";

const MONSTER = "$monster";
const statNames = { atk: "攻击", def: "防御", act: "行动" };
const statusNames = {
  envy: "嫉妒诅咒",
  sloth: "怠惰削弱",
  disarm: "缴械",
  stun: "晕眩",
  knight: "骑士精神",
  oil: "淬刃油",
  extra: "借运骰",
  rage: "暴怒蓄力",
  growth: "逐轮增强",
  erosion: "防御衰减",
  snare: "缚足",
  slipped: "滑倒",
  atk: "临时攻击",
  def: "临时防御",
  act: "临时行动",
};
const pick = (rng, length) => Math.min(length - 1, Math.floor(rng() * length));
function log(s, message) {
  s.log.push(message);
  if (s.log.length > 120) s.log.splice(0, s.log.length - 120);
}
const player = (s, id) => s.players.find((p) => p.id === id);
const name = (s, id) =>
  id === MONSTER ? cards[s.battle.form].name : player(s, id).name;
const effect = (s, id) => s.battle.active.includes(id);
const rival = (b, id) => (id === b.first ? b.second : b.first);
const hp = (s, id) => (id === MONSTER ? s.battle.hp : player(s, id).hp);
const status = (s, id) => s.battle.fighters[id].status;
const cardName = (id) => cards[id]?.name || id;

function gearCount(s, id, card) {
  if (id === MONSTER || effect(s, "b02.3")) return 0;
  const p = player(s, id);
  if (
    (p.locked || []).includes(card) ||
    s.battle.fighters[id].locked.includes(card)
  )
    return 0;
  return p.gear.filter((entry) => entry === card).length;
}

function changeHP(s, id, delta) {
  if (id === MONSTER)
    s.battle.hp = Math.min(s.battle.maxHp, Math.max(0, s.battle.hp + delta));
  else {
    const p = player(s, id);
    p.hp = Math.min(10, Math.max(0, p.hp + delta));
  }
}

function applyDamage(s, id, amount) {
  if (amount <= 0 || hp(s, id) <= 0) return 0;
  const before = hp(s, id);
  const f = s.battle.fighters[id];
  if (amount >= before && gearCount(s, id, "l15") && !f.survived) {
    f.survived = true;
    log(s, `${name(s, id)}的名刀司命挡下了致命伤害。`);
    return 0;
  }
  changeHP(s, id, -amount);
  const lost = before - hp(s, id);
  if (!hp(s, id) && gearCount(s, id, "l04")) {
    const p = player(s, id);
    p.gear.splice(p.gear.indexOf("l04"), 1);
    p.hp = 10;
    log(s, `${p.name}消耗凤凰之泪，满血复活。`);
  }
  return lost;
}

function effectText(key) {
  const [id, number] = key.split(".");
  return cards[id].effects[Number(number) - 1];
}

function monsterEffects(id, rng) {
  if (id === "final")
    return Array.from(
      { length: 7 },
      (_, i) => `b0${i + 1}.${1 + pick(rng, 3)}`,
    );
  return (cards[id].effects || []).map((_, index) => `${id}.${index + 1}`);
}

function removeEffect(s, key) {
  const b = s.battle;
  b.active = b.active.filter((entry) => entry !== key);
  if (key === "e05.1") {
    b.maxHp = cards.e05.hp;
    b.hp = Math.min(b.hp, b.maxHp);
  }
  if (key === "b02.1") delete status(s, b.first).envy;
  if (key === "b04.2") delete status(s, b.first).sloth;
  if (key === "b03.1") delete status(s, MONSTER).growth;
  if (key === "b03.2") delete status(s, MONSTER).rage;
  if (key === "b06.1") delete status(s, MONSTER).erosion;
  log(s, `封印了${name(s, MONSTER)}的效果「${effectText(key)}」。`);
}

function playerStats(s, id) {
  const p = player(s, id),
    v = status(s, id);
  if (v.knight) return { atk: 2, def: 2, act: 1 };
  const act = p.act + (v.act || 0);
  let atk = p.atk;
  let def = p.def;
  if (gearCount(s, id, "l14")) atk = def = act;
  atk += (v.atk || 0) + (p.hp >= 6 ? gearCount(s, id, "l07") : 0);
  def += (v.def || 0) + (p.hp <= 5 ? gearCount(s, id, "l07") : 0);
  if (effect(s, "b04.1")) [atk, def] = [def, atk];
  return { atk, def, act };
}

function debuffed(s, id) {
  const v = status(s, id),
    p = player(s, id);
  return !!(
    v.disarm ||
    v.stun ||
    v.envy ||
    v.sloth ||
    v.knight ||
    p?.movePenalty ||
    p?.locked?.length ||
    p?.statuses?.some((x) => x.type === "slipped")
  );
}

function monsterStats(s) {
  const b = s.battle,
    v = status(s, MONSTER),
    target = player(s, b.first);
  let { atk, def } = b.base;
  if (effect(s, "e01.1") && b.hp === 1) atk *= 2;
  if (effect(s, "e05.1")) atk += 5;
  if (effect(s, "b02.2") && debuffed(s, b.first)) atk += 2;
  if (effect(s, "b06.3")) {
    atk += target.gear.length;
    def += target.gear.length;
  }
  atk += (v.growth || 0) + (v.rage || 0);
  def -= v.erosion || 0;
  return { atk: Math.max(0, atk), def: Math.max(0, def), act: 1 };
}

function stats(s, id) {
  return id === MONSTER ? monsterStats(s) : playerStats(s, id);
}

function sync(s) {
  const b = s.battle;
  if (b.monster)
    Object.assign(b, { atk: monsterStats(s).atk, def: monsterStats(s).def });
  b.effects = b.active.map(effectText);
  b.detail =
    b.phase === "done"
      ? "战斗已结束"
      : {
          binding: "选择要封印的怪物效果",
          attack: "选择攻击或使用道具",
          attackReview: "确认攻击骰点，或使用道具调整",
          defend: "进行防御判定",
          reaction: "确认本次判定，或使用道具调整",
          optional: "选择是否发动装备效果",
          equipmentCheck: "查看并确认装备判定",
        }[b.phase] || "战斗结算中";
  b.statuses = Object.fromEntries(
    Object.keys(b.fighters).map((id) => [
      id,
      statusKeys(s, id, true).map(statusName),
    ]),
  );
}

export function startBattle(
  s,
  { attackerId, defenderId, monsterId, monsterHp, monsterState },
  rng = Math.random,
) {
  const form = monsterState?.form || monsterId;
  const b = (s.battle = {
    monster: monsterId || null,
    form: form || null,
    first: attackerId,
    second: defenderId || MONSTER,
    actors: defenderId ? [attackerId, defenderId] : [attackerId],
    side: attackerId,
    actorId: attackerId,
    phase: "start",
    round: 1,
    remaining: 0,
    active: [],
    fighters: {},
    slimes: monsterState?.slimes || 0,
    shield: 20,
    optional: [],
    outcome: null,
    attackRoll: null,
    defenseRoll: null,
    effects: [],
  });
  for (const id of [b.first, b.second])
    b.fighters[id] = {
      status: {},
      locked: [],
      turns: 0,
      survived: false,
      chalice: 0,
    };
  if (monsterId) {
    const card = cards[form];
    const p = playerStats(s, attackerId);
    b.base =
      form === "final"
        ? { atk: 3 * p.def, def: 3 * p.atk }
        : { atk: card.atk, def: card.def };
    b.active = monsterEffects(form, rng);
    b.maxHp = form === "final" ? 15 : card.hp + (effect(s, "e05.1") ? 5 : 0);
    b.hp = Math.min(b.maxHp, monsterState?.hp ?? monsterHp ?? b.maxHp);
    if (effect(s, "b02.1")) status(s, b.first).envy = 2;
    if (
      b.active.length &&
      player(s, attackerId).gear.includes("l01") &&
      !player(s, attackerId).locked?.includes("l01")
    )
      b.phase = "binding";
  }
  log(
    s,
    `${name(s, b.first)}与${name(s, b.second)}开始${monsterId ? "战斗" : "决斗"}。`,
  );
  if (b.phase === "start") beginTurn(s);
  drive(s, rng);
  return b;
}

function beginTurn(s) {
  const b = s.battle,
    id = b.side,
    f = b.fighters[id];
  f.turns++;
  if (id === b.first && b.monster) {
    const v = status(s, MONSTER);
    if (effect(s, "b03.1")) v.growth = (v.growth || 0) + 1;
    if (effect(s, "b06.1")) v.erosion = (v.erosion || 0) + 2;
  }
  b.remaining = Math.max(
    stats(s, id).act,
    f.turns === 1 && gearCount(s, id, "c09") ? 2 : 1,
  );
  b.spent = 0;
  b.phase = "attack";
  b.actorId = id;
}

function setOutcome(s, result) {
  s.battle.outcome = result;
  s.battle.phase = "done";
  s.battle.actorId = null;
}

function checkEnd(s) {
  const b = s.battle;
  if (!b.monster) {
    const loserId = [b.side, rival(b, b.side)].find((id) => hp(s, id) <= 0);
    if (loserId)
      setOutcome(s, { type: "pvpWin", winnerId: rival(b, loserId), loserId });
    return !!b.outcome;
  }
  if (b.hp <= 0 && effect(s, "b03.3") && !b.deathBurst) {
    b.deathBurst = true;
    applyDamage(s, b.first, 3 + gearCount(s, b.first, "c17"));
    log(s, `${name(s, MONSTER)}死亡时引发了暴怒反击。`);
  }
  const common = { monsterId: b.monster, playerId: b.first };
  if (hp(s, b.first) <= 0)
    setOutcome(s, {
      ...common,
      type: "monsterLoss",
      loserId: b.first,
      monsterHp: null,
    });
  else if (b.hp <= 0) {
    if (effect(s, "e03.1") || b.slimes > 1) {
      b.slimes = b.slimes ? b.slimes - 1 : 2;
      b.form = "n01";
      b.base = { atk: cards.n01.atk, def: cards.n01.def };
      b.active = [];
      b.maxHp = b.hp = cards.n01.hp;
      b.fighters[MONSTER].status = {};
      log(s, `分裂的普通史莱姆登场，剩余 ${b.slimes} 只。`);
    } else
      setOutcome(s, {
        ...common,
        type: b.monster === "final" ? "victory" : "monsterWin",
        winnerId: b.first,
        monsterHp: 0,
      });
  }
  return !!b.outcome;
}

function endTurn(s) {
  const b = s.battle,
    f = b.fighters[b.side];
  for (const k of ["stun", "disarm"])
    if (f.status[k] <= f.turns) delete f.status[k];
  b.side = rival(b, b.side);
  if (b.side === b.first) {
    if (effect(s, "b06.2") && b.round === 10) {
      log(s, `${name(s, MONSTER)}在第 10 轮结束时自爆！`);
      b.hp = 0;
      applyDamage(s, b.first, 8 + gearCount(s, b.first, "c17"));
      if (checkEnd(s)) return;
    }
    b.round++;
  }
  beginTurn(s);
}

function cantAttack(s, id) {
  const f = s.battle.fighters[id];
  return !!(f.status.stun || (f.status.disarm && f.turns >= f.status.disarm));
}

function adjusted(s, id, dice, type) {
  const value = dice.reduce((sum, d) => sum + d, 0);
  const v = status(s, id);
  let mod = gearCount(s, id, "c03");
  if (type === "atk" || type === "def") {
    mod -= (v.envy || 0) + (s.battle.monster ? 0 : 2 * gearCount(s, id, "l09"));
    const offset = 3 * (gearCount(s, id, "c04") - gearCount(s, id, "c05"));
    mod +=
      type === "atk"
        ? 2 * gearCount(s, id, "c01") + offset - (v.sloth || 0)
        : 2 * gearCount(s, id, "c02") + 3 * gearCount(s, id, "l05") - offset;
  }
  let result = value + mod;
  const needsEven = gearCount(s, id, "c07") && Math.abs(result % 2) === 1;
  const needsOdd = gearCount(s, id, "c08") && result % 2 === 0;
  if (needsEven || needsOdd) result++;
  return result;
}

export function recordDice(s, values, total, label, rolled = true) {
  if (rolled) s.rollSequence = (s.rollSequence ?? 0) + 1;
  s.dice = { values, total, label, rollId: s.rollSequence };
}

function makeRoll(s, id, type, count, rng, cannot = false) {
  const f = s.battle.fighters[id],
    v = f.status;
  const dice = [];
  if (!cannot) {
    for (let j = 0; j < count; j++) {
      dice.push(f.golden || 1 + pick(rng, 6));
      f.golden = 0;
    }
  }
  const result = {
    id,
    type,
    dice,
    total: cannot ? 0 : adjusted(s, id, dice, type),
    count,
    cannot,
  };
  result.failed =
    cannot ||
    (effect(s, "b04.3") && dice.length > 1 && dice.every((n) => n === dice[0]));
  delete v.extra;
  if (!cannot)
    recordDice(
      s,
      dice,
      result.total,
      `${name(s, id)} · ${statNames[type] || "装备"}判定`,
    );
  return result;
}

function rollFor(s, id, type, rng) {
  const cannot = type === "def" && !!status(s, id).stun;
  if (id === MONSTER) {
    return {
      id,
      type,
      dice: [],
      total: cannot ? 0 : monsterStats(s)[type],
      count: 0,
      cannot,
      failed: cannot,
    };
  }
  const count =
    (effect(s, "b07.1") ? 1 : playerStats(s, id)[type]) +
    (status(s, id).extra || 0);
  return makeRoll(s, id, type, count, rng, cannot);
}

function attackRoll(s, rng) {
  const b = s.battle;
  b.attackRoll = rollFor(s, b.side, "atk", rng);
  b.defenseRoll = null;
  b.actorId = b.monster ? rival(b, b.side) : b.side;
  b.phase = b.monster ? "defend" : "attackReview";
  b.flip = false;
  b.shock = false;
}

function defenseRoll(s, rng) {
  const b = s.battle;
  const defender = rival(b, b.side);
  b.defenseRoll = rollFor(s, defender, "def", rng);
  b.reactors = [b.side, defender].filter((id) => id !== MONSTER);
  b.phase = "reaction";
  b.actorId = b.reactors[0];
}

function checkStrikes(s) {
  const b = s.battle,
    a = b.attackRoll,
    d = b.defenseRoll;
  const shield =
    rival(b, b.side) === MONSTER && effect(s, "b05.3")
      ? Math.min(b.shield, Math.max(0, a.total))
      : 0;
  let defense = d.failed || b.shock ? 0 : d.total;
  if (b.side === MONSTER && effect(s, "b05.2"))
    defense -= Math.floor(defense / 2);
  const margin = a.total - shield - defense;
  let hit = margin > 0;
  if (effect(s, "b07.1"))
    hit = b.side === MONSTER ? d.failed || d.total < 4 : a.total >= 4;
  if (a.failed) hit = false;
  if (gearCount(s, b.side, "l03")) hit = true;
  if (b.flip) hit = !hit;
  if (b.side !== MONSTER && effect(s, "b05.1") && margin % 2 === 0) hit = false;
  return { hit, margin, shield };
}

function resolveStrike(s) {
  const b = s.battle,
    actor = b.side,
    target = rival(b, actor),
    a = b.attackRoll,
    d = b.defenseRoll;
  const { hit, margin, shield } = checkStrikes(s);
  b.shield -= shield;
  if (shield)
    log(s, `贪婪之盾抵挡 ${shield} 点攻击判定，剩余耐久 ${b.shield}。`);
  const av = status(s, actor),
    dv = status(s, target);
  if (b.shock && !dv.stun) dv.stun = b.fighters[target].turns + 1;
  if (actor !== MONSTER && effect(s, "b07.2") && Math.abs(a.total % 2) === 1)
    av.disarm = b.fighters[actor].turns + 1;
  if (target === MONSTER && effect(s, "b03.2")) dv.rage = (dv.rage || 0) + 2;
  if (actor === MONSTER && effect(s, "b03.2")) delete av.rage;
  let damage = 0;
  if (hit) {
    let amount =
      1 +
      (av.oil || 0) +
      gearCount(s, actor, "c17") +
      gearCount(s, actor, "l02") +
      gearCount(s, target, "c17");
    if (!b.monster) amount += gearCount(s, actor, "l09");
    if (actor === MONSTER && effect(s, "b01.1")) amount++;
    if (actor === MONSTER && effect(s, "b07.3") && dv.disarm) amount++;
    if (hp(s, target) <= 2 && gearCount(s, actor, "c10"))
      amount = Math.max(amount, hp(s, target));
    damage = applyDamage(s, target, amount);
    if (actor === MONSTER && effect(s, "e04.1")) changeHP(s, actor, 1);
    if (target === MONSTER && effect(s, "b04.2") && damage)
      av.sloth = (av.sloth || 0) + damage;
  }
  delete av.oil;
  log(
    s,
    `${name(s, actor)}攻击 ${a.total} 对 ${name(s, target)}防御 ${d.total}，${hit ? `命中，造成 ${damage} 点伤害` : "未造成伤害"}。`,
  );
  if (
    target === MONSTER &&
    effect(s, "e02.1") &&
    hp(s, target) > 0 &&
    !d.cannot &&
    !b.shock
  ) {
    changeHP(s, target, 1);
    log(s, "兽人防御后回复 1 点生命。");
  }
  let thornDamage = 0;
  if (gearCount(s, target, "l05") && !d.cannot && !b.shock) {
    const thorn =
      1 +
      Math.floor(Math.max(0, d.total) / 5) +
      gearCount(s, target, "l02") +
      gearCount(s, target, "c17") +
      gearCount(s, actor, "c17");
    thornDamage = applyDamage(s, actor, thorn);
    log(s, `${name(s, target)}的荆棘战甲反击，造成 ${thornDamage} 点伤害。`);
    if (actor === MONSTER && effect(s, "b04.2") && thornDamage)
      dv.sloth = (dv.sloth || 0) + thornDamage;
  }
  b.last = {
    attacker: actor,
    defender: target,
    attack: a.total,
    defense: d.total,
    margin,
    hit,
    damage,
  };
  b.lastDice = { attack: a.dice, defense: d.dice };
  b.spent++;
  b.remaining--;
  if (actor === MONSTER && hit && effect(s, "b01.2")) {
    b.remaining++;
    log(s, "傲慢获得一次追击。");
  }
  const ended = checkEnd(s);
  b.optional = [];
  if (!ended && !hit && !d.cannot && !b.shock && gearCount(s, target, "c12"))
    b.optional.push({ id: target, card: "c12" });
  for (const [id, dealt] of [
    [actor, damage],
    [target, thornDamage],
  ]) {
    if (
      dealt &&
      hp(s, id) > 0 &&
      gearCount(s, id, "l12") &&
      b.fighters[id].chalice !== b.round
    ) {
      b.optional.push({ id, card: "l12" });
    }
  }
  if (ended) {
    if (!b.optional.length) return;
    b.pendingOutcome = b.outcome;
    b.outcome = null;
  }
  afterStrike(s);
}

function afterStrike(s) {
  const b = s.battle;
  if (b.optional.length) {
    b.phase = "optional";
    b.actorId = b.optional[0].id;
    return;
  }
  if (b.pendingOutcome) {
    setOutcome(s, b.pendingOutcome);
    return;
  }
  if (b.remaining <= 0) endTurn(s);
  else {
    b.phase = "attack";
    b.actorId = b.side;
  }
}

function drive(s, rng) {
  const b = s.battle;
  while (b.phase !== "done") {
    if (b.phase === "attack" && b.actorId === MONSTER) {
      if (cantAttack(s, MONSTER)) {
        log(s, `${name(s, MONSTER)}无法攻击。`);
        endTurn(s);
      } else attackRoll(s, rng);
    } else if (b.phase === "defend" && b.actorId === MONSTER)
      defenseRoll(s, rng);
    else break;
  }
  sync(s);
}

const action = (id, label, card) =>
  card ? { id, label, card } : { id, label };
const itemChoice = (card, suffix = "", parameter = "") =>
  action(
    `use:${card}${parameter ? `:${parameter}` : ""}`,
    `${cardName(card)}${suffix ? ` · ${suffix}` : ""}`,
    card,
  );

function statusKeys(s, id, strong) {
  const p = player(s, id);
  const keys = Object.keys(status(s, id)).filter(
    (k) => k in statusNames && status(s, id)[k] && (strong || k !== "stun"),
  );
  if (p?.movePenalty) keys.push("snare");
  if (p?.statuses?.some((entry) => entry.type === "slipped"))
    keys.push("slipped");
  for (const card of p?.locked || []) keys.push(`lock-${card}`);
  return keys;
}

function statusName(key) {
  return key.startsWith("lock-")
    ? `装备封锁（${cardName(key.slice(5))}）`
    : statusNames[key];
}

function cleanse(s, id, key) {
  const p = player(s, id);
  if (key === "snare") p.movePenalty = 0;
  else if (key === "slipped")
    p.statuses = p.statuses.filter((entry) => entry.type !== "slipped");
  else if (key.startsWith("lock-"))
    p.locked = p.locked.filter((card) => card !== key.slice(5));
  else delete status(s, id)[key];
}

function updateRemaining(s) {
  const b = s.battle;
  if (b.side === MONSTER) return;
  const opening = b.fighters[b.side].turns === 1 && gearCount(s, b.side, "c09");
  const allowance = Math.max(stats(s, b.side).act, opening ? 2 : 1);
  b.remaining = Math.max(0, allowance - b.spent);
}

function reactionChoices(s, id) {
  const b = s.battle,
    choices = [];
  const items = player(s, id)?.items || [];
  const equipment = b.phase === "equipmentCheck";
  const roll = equipment
    ? b.equipmentRoll
    : b.side === id
      ? b.attackRoll
      : b.defenseRoll;
  if (!roll || roll.cannot) return choices;
  if (!equipment && b.side !== id && b.shock) return choices;
  const pvpAttack = !b.monster && b.side === id;
  if (pvpAttack && b.phase === "reaction")
    return items.includes("i01") ? [itemChoice("i01", "反转命中结果")] : [];
  if (items.includes("i01") && b.phase !== "attackReview")
    choices.push(
      itemChoice("i01", equipment ? "反转装备判定" : "反转命中结果"),
    );
  if (items.includes("i08")) choices.push(itemChoice("i08", "重掷我的判定"));
  if (items.includes("i19"))
    choices.push(
      itemChoice("i19", "判定 +2", "2"),
      itemChoice("i19", "判定 −2", "-2"),
    );
  if (
    !equipment &&
    b.side === id &&
    gearCount(s, id, "l06") &&
    !b.shock &&
    !status(s, rival(b, id)).stun &&
    roll.total % 2 === 0
  ) {
    choices.push(action("shock", "发动震魂锤", "l06"));
  }
  return choices;
}

function itemChoices(s, id) {
  const b = s.battle,
    p = player(s, id),
    other = rival(b, id),
    choices = [];
  for (const card of new Set(p.items)) {
    switch (card) {
      case "i02":
        if (p.hp < 10) choices.push(itemChoice(card, "回复 2 点生命"));
        break;
      case "i03":
        if (b.phase === "attack")
          choices.push(itemChoice(card, "下次攻击伤害 +1"));
        break;
      case "i04":
        if (b.monster && !effect(s, "b01.3"))
          choices.push(itemChoice(card, "逃离战斗"));
        break;
      case "i07":
        for (const [key, label] of Object.entries(statNames))
          choices.push(itemChoice(card, `本场${label} +1`, key));
        break;
      case "i09":
        choices.push(itemChoice(card, "本次多掷一枚骰子"));
        break;
      case "i12":
        if (other === MONSTER)
          for (const key of b.active)
            choices.push(itemChoice(card, effectText(key), key));
        else {
          for (const key of statusKeys(s, other, false))
            choices.push(
              itemChoice(card, `移除${statusName(key)}`, `status:${key}`),
            );
          for (const g of new Set(player(s, other).gear))
            if (gearCount(s, other, g))
              choices.push(
                itemChoice(card, `本场封印${cardName(g)}`, `gear:${g}`),
              );
        }
        break;
      case "i13":
        if (other !== MONSTER)
          for (const g of new Set(player(s, other).gear)) {
            if (g !== "l16" && !player(s, other).locked?.includes(g))
              choices.push(itemChoice(card, `锁定${cardName(g)}`, g));
          }
        break;
      case "i14":
      case "i15":
        for (const target of [id, other]) {
          const who = target === id ? "自己" : name(s, target);
          const side = target === id ? "self" : "other";
          const keys = statusKeys(s, target, card === "i15");
          if (card === "i15" && keys.length)
            choices.push(itemChoice(card, `净化${who}的全部状态`, side));
          if (card === "i14")
            for (const key of keys)
              choices.push(
                itemChoice(
                  card,
                  `解除${who}的${statusName(key)}`,
                  `${side}:${key}`,
                ),
              );
        }
        break;
      case "i16":
        if (!b.monster) choices.push(itemChoice(card, "双方展开骑士对决"));
        break;
      case "i18":
        if (!b.fighters[id].golden)
          for (let n = 1; n <= 6; n++)
            choices.push(itemChoice(card, `下枚骰子为 ${n}`, String(n)));
        break;
    }
  }
  return choices;
}

export function battleActions(s, id) {
  const b = s.battle;
  if (!b || b.phase === "done" || b.actorId !== id) return [];
  if (b.phase === "binding")
    return b.active.map((key) =>
      action(`bind:${key}`, `封印 · ${effectText(key)}`, "l01"),
    );
  if (b.phase === "optional") {
    const diceItems = itemChoices(s, id).filter(
      (a) => a.card === "i09" || a.card === "i18",
    );
    return [
      action(
        "equipment",
        `发动${cardName(b.optional[0].card)}`,
        b.optional[0].card,
      ),
      action("pass", "放弃发动"),
      ...diceItems,
    ];
  }
  if (b.phase === "equipmentCheck")
    return [
      action("confirmEquipment", "确认装备判定"),
      ...reactionChoices(s, id),
    ];
  if (b.phase === "attackReview")
    return [action("confirmAttack", "确认攻击判定"), ...reactionChoices(s, id)];
  if (b.phase === "reaction") {
    const { hit } = checkStrikes(s);
    return [
      action("confirm", `确认判定 · 当前${hit ? "命中" : "未命中"}`),
      ...reactionChoices(s, id),
    ];
  }
  let main;
  if (b.phase === "defend")
    main = action(
      "defend",
      status(s, id).stun ? "晕眩 · 承受攻击" : "掷骰防御",
    );
  else if (cantAttack(s, id)) main = action("skip", "无法攻击 · 跳过本轮");
  else main = action("attack", `掷骰攻击 · 剩余 ${b.remaining} 次`);
  const result = [main, ...itemChoices(s, id)];
  if (
    b.phase === "attack" &&
    b.spent &&
    b.fighters[id].turns === 1 &&
    gearCount(s, id, "c09") &&
    b.spent >= stats(s, id).act
  ) {
    result.push(action("passOpening", "放弃先声双刃的额外攻击", "c09"));
  }
  return result;
}

function useItem(s, id, card, arg, more, rng) {
  const b = s.battle,
    p = player(s, id),
    f = b.fighters[id],
    v = f.status,
    other = rival(b, id);
  const itemIndex = p.items.indexOf(card);
  p.items.splice(itemIndex, 1);
  log(s, `${p.name}使用了${cardName(card)}。`);
  const equipment = b.phase === "equipmentCheck";
  const roll = equipment
    ? b.equipmentRoll
    : id === b.side
      ? b.attackRoll
      : b.defenseRoll;
  switch (card) {
    case "i01":
      if (equipment) b.equipmentFlip = !b.equipmentFlip;
      else b.flip = !b.flip;
      break;
    case "i02":
      changeHP(s, id, 2);
      break;
    case "i03":
      v.oil = (v.oil || 0) + 1;
      break;
    case "i04":
      setOutcome(s, {
        type: "escape",
        playerId: id,
        monsterId: b.monster,
        monsterHp: b.hp,
        monsterState: { hp: b.hp, form: b.form, slimes: b.slimes },
      });
      break;
    case "i07":
      v[arg] = (v[arg] || 0) + 1;
      break;
    case "i08": {
      const rolled = makeRoll(s, id, roll.type, roll.count, rng);
      if (equipment) b.equipmentRoll = rolled;
      else if (id === b.side) {
        b.attackRoll = rolled;
        b.shock = false;
      } else b.defenseRoll = rolled;
      break;
    }
    case "i09":
      v.extra = (v.extra || 0) + 1;
      break;
    case "i12":
      if (arg === "gear") b.fighters[other].locked.push(more);
      else if (arg === "status") cleanse(s, other, more);
      else removeEffect(s, arg);
      break;
    case "i13":
      (player(s, other).locked ||= []).push(arg);
      break;
    case "i14":
      cleanse(s, arg === "self" ? id : other, more);
      break;
    case "i15": {
      const target = arg === "self" ? id : other;
      for (const k of statusKeys(s, target, true)) cleanse(s, target, k);
      break;
    }
    case "i16":
      status(s, id).knight = status(s, other).knight = 1;
      break;
    case "i18":
      f.golden = Number(arg);
      break;
    case "i19":
      roll.total += Number(arg);
      if (!equipment && id === b.side && roll.total % 2) b.shock = false;
      recordDice(s, roll.dice, roll.total, `${p.name} · 调运砝码`, false);
      break;
  }
  if (["i07", "i12", "i13", "i14", "i15", "i16"].includes(card)) {
    updateRemaining(s);
    if (b.phase === "attack" && !b.remaining) endTurn(s);
  }
}

function finishEquipment(s, apply) {
  const b = s.battle;
  const { id, card } = b.optional.shift();
  if (apply) {
    const roll = b.equipmentRoll;
    let success = !roll.failed && roll.total >= 4;
    if (b.equipmentFlip) success = !success;
    if (success) changeHP(s, id, 1);
    else if (card === "c12") applyDamage(s, id, 1);
    log(
      s,
      `${name(s, id)}发动${cardName(card)}，判定 ${roll.total}，${success ? "成功" : "失败"}。`,
    );
  }
  if (b.pendingOutcome || !checkEnd(s)) afterStrike(s);
}

export function actBattle(s, id, actionId, rng = Math.random) {
  const b = s.battle;
  if (!battleActions(s, id).some((a) => a.id === actionId))
    throw new Error("当前无法执行此战斗行动。");
  const [verb, card, arg, more] = actionId.split(":");
  if (verb === "use") {
    useItem(s, id, card, arg, more, rng);
  } else if (verb === "bind") {
    removeEffect(s, card);
    beginTurn(s);
  } else if (verb === "attack") attackRoll(s, rng);
  else if (verb === "confirmAttack") {
    b.phase = "defend";
    b.actorId = rival(b, id);
  } else if (verb === "defend") defenseRoll(s, rng);
  else if (verb === "skip" || verb === "passOpening") endTurn(s);
  else if (verb === "shock") {
    b.shock = true;
    log(s, `${name(s, id)}发动了震魂锤。`);
  } else if (verb === "confirm") {
    b.reactors.shift();
    if (b.reactors.length) b.actorId = b.reactors[0];
    else resolveStrike(s);
  } else if (verb === "equipment") {
    if (b.optional[0].card === "l12") b.fighters[id].chalice = b.round;
    b.equipmentFlip = false;
    b.equipmentRoll = makeRoll(
      s,
      id,
      "item",
      1 + (status(s, id).extra || 0),
      rng,
    );
    b.phase = "equipmentCheck";
  } else if (verb === "confirmEquipment") finishEquipment(s, true);
  else if (verb === "pass") finishEquipment(s, false);
  drive(s, rng);
  return b.outcome;
}
