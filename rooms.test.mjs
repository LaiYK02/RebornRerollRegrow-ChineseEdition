import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createRoomServer, listAddresses } from "./server.mjs";

test("shareable addresses prefer physical LAN then active VPN, and exclude disconnected and host-only adapters", () => {
  const link = (address) => [{ address, family: "IPv4", internal: false }];
  const rows = listAddresses(4567, {
    "Radmin VPN": link("26.5.4.3"),
    "vEthernet (WSL)": link("172.29.16.1"),
    "VMware Network Adapter VMnet8": link("192.168.87.1"),
    "VPN disconnected": link("169.254.22.58"),
    Ethernet: link("192.168.1.62"),
    Duplicate: link("192.168.1.62"),
    Loopback: link("127.0.0.1"),
  });
  assert.deepEqual(
    rows.map((row) => row.address),
    ["192.168.1.62", "26.5.4.3"],
  );
  assert.equal(rows[1].url, "http://26.5.4.3:4567");
  assert.deepEqual(
    listAddresses(5000, {}).map((row) => row.address),
    ["127.0.0.1"],
  );
});

async function openServer(t, offlineMs = 10_000) {
  let now = 1_000;
  let nextClockRead;
  const server = createRoomServer({
    now: () => {
      nextClockRead?.();
      nextClockRead = null;
      return now;
    },
    offlineMs,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const origin = "http://127.0.0.1:" + server.address().port;
  async function request(path, { body, token, headers = {} } = {}) {
    const response = await fetch(origin + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined
          ? {}
          : { "Content-Type": "application/json", Origin: origin }),
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, ...(await response.json()) };
  }
  return {
    origin,
    request,
    advance: (time) => {
      now += time;
    },
    onNextClockRead: () =>
      new Promise((resolve) => {
        nextClockRead = resolve;
      }),
  };
}

test("five seats, private chat, authenticated controls and a fresh room after destruction", async (t) => {
  const { request } = await openServer(t);
  assert.equal(
    (await request("join", { body: { name: "Guest" } })).status,
    404,
  );
  const info = await request("info");
  assert.equal(info.canHost, true);
  const chosen = info.addresses.at(-1);
  const host = await request("create", {
    body: { name: "Host", color: "#22aacc", address: chosen.address },
  });
  assert.equal(host.status, 200);
  assert.equal(host.room.url, chosen.url);
  assert.equal(host.room.hostId, host.room.you);
  assert.equal(host.room.players[0].color, "#22aacc");
  assert.equal(
    (await request("create", { body: { name: "Duplicate" } })).status,
    409,
  );
  const guest = await request("join", { body: { name: "Mei" } });
  assert.notEqual(guest.token, host.token);
  assert.notEqual(guest.room.you, host.room.you);
  assert.deepEqual(guest.room.addresses, [chosen]);
  assert.equal(
    (
      await request("address", {
        token: guest.token,
        body: { address: chosen.address },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("join", { body: { name: " mei " } })).status,
    409,
  );
  await request("join", { body: { name: "Sam" } });
  await request("join", { body: { name: "Nia" } });
  const fifth = await request("join", { body: { name: "Fifth" } });
  assert.equal(fifth.status, 200);
  assert.equal(fifth.room.players.length, 5);
  assert.equal(
    (await request("join", { body: { name: "Sixth" } })).status,
    409,
  );
  assert.equal(
    (await request("start", { token: guest.token, body: {} })).status,
    403,
  );
  assert.equal(
    (await request("destroy", { token: guest.token, body: {} })).status,
    403,
  );
  assert.equal((await request("state")).status, 401);
  assert.equal(
    (await request("chat", { body: { text: "stranger" } })).status,
    401,
  );
  await request("chat", {
    token: guest.token,
    body: { text: "Hello room", name: "Host" },
  });
  const state = await request("state", { token: host.token });
  assert.equal(state.room.chat.at(-1).name, "Mei");
  assert.equal(state.room.chat.at(-1).text, "Hello room");
  assert.ok(!JSON.stringify(state.room).includes(guest.token));
  const started = await request("start", { token: host.token, body: {} });
  assert.equal(started.status, 200);
  assert.equal(started.room.game.players.length, 5);
  const rejoined = await request("state", { token: fifth.token });
  assert.equal(rejoined.status, 200);
  assert.equal(rejoined.room.you, fifth.room.you);
  assert.equal(
    rejoined.room.game.players.find((p) => p.id === fifth.room.you).pos,
    1,
  );
  assert.deepEqual(rejoined.room.game.board, started.room.game.board);
  await request("destroy", { token: host.token, body: {} });
  const fresh = await request("create", { body: { name: "Host" } });
  assert.notEqual(fresh.room.id, host.room.id);
  assert.equal(fresh.room.chat.length, 0);
  assert.equal((await request("state", { token: guest.token })).status, 401);
});

test("the host can start solo and a stale or illegal action cannot advance the game", async (t) => {
  const { request } = await openServer(t);
  const host = await request("create", { body: { name: "Host" } });
  const token = host.token;
  const started = await request("start", { token, body: {} });
  assert.equal(started.status, 200);
  assert.equal(started.room.phase, "game");
  assert.ok(started.room.game);
  assert.equal((await request("join", { body: { name: "Late" } })).status, 409);
  const revision = started.room.revision;
  assert.equal(
    (
      await request("action", {
        token,
        body: { actionId: "illegal", revision },
      })
    ).status,
    400,
  );
  assert.equal((await request("state", { token })).room.revision, revision);
  assert.equal(
    (
      await request("action", {
        token,
        body: { actionId: "illegal", revision: revision - 1 },
      })
    ).status,
    409,
  );
  const move = { actionId: started.room.game.actions[0].id, revision };
  const duplicate = await Promise.all([
    request("action", { token, body: move }),
    request("action", { token, body: move }),
  ]);
  assert.deepEqual(
    duplicate.map((response) => response.status).sort(),
    [200, 409],
  );
  assert.equal((await request("state", { token })).room.revision, revision + 1);
  const rolled = duplicate.find((response) => response.status === 200).room;
  assert.equal(rolled.game.players[0].pos, 1);
  assert.ok(rolled.game.dice.values.length);
  const confirmed = await request("action", {
    token,
    body: { actionId: "check:accept", revision: rolled.revision },
  });
  assert.ok(confirmed.room.game.players[0].pos > 1);
  const restarted = await request("restart", { token, body: {} });
  assert.ok(restarted.room.revision > revision);
});

test("a guest who reconnects can recover their in-game seat and the match continues", async (t) => {
  const { request, advance } = await openServer(t);
  const host = await request("create", { body: { name: "Host" } });
  const guest = await request("join", { body: { name: "Sam" } });
  await request("start", { token: host.token, body: {} });
  advance(6_000);
  await request("state", { token: host.token });
  advance(6_000);
  const snapshot = await request("state", { token: host.token });
  assert.equal(
    snapshot.room.players.find((p) => p.id === guest.room.you).online,
    false,
  );
  const recovered = await request("state", { token: guest.token });
  assert.equal(recovered.room.you, guest.room.you);
  assert.equal(
    recovered.room.players.find((p) => p.id === guest.room.you).online,
    true,
  );
  assert.equal(recovered.room.phase, "game");
  assert.equal(
    (await request("leave", { body: {}, token: guest.token })).status,
    200,
  );
  const left = await request("state", { token: host.token });
  assert.equal(
    left.room.players.find((p) => p.id === guest.room.you).online,
    false,
  );
});

test("a lobby departure frees a seat, and browser requests from foreign origins cannot change a room", async (t) => {
  const { request, origin } = await openServer(t);
  const hostile = await request("create", {
    body: { name: "Host" },
    headers: { Origin: "https://elsewhere.example" },
  });
  assert.equal(hostile.status, 403);
  assert.equal(
    (
      await request("create", {
        body: { name: "Host" },
        headers: { "Content-Type": "text/plain" },
      })
    ).status,
    415,
  );
  const host = await request("create", { body: { name: "Host" } });
  const guest = await request("join", { body: { name: "Sam" } });
  await request("leave", { body: {}, token: guest.token });
  assert.equal(
    (await request("state", { token: host.token })).room.players.length,
    1,
  );
  assert.equal((await request("state", { token: guest.token })).status, 401);
  assert.equal((await fetch(origin + "/server.mjs")).status, 404);
  assert.equal((await fetch(origin + "/connect?mode=join")).status, 200);
});

async function startGroup(t, names, offlineMs) {
  const connection = await openServer(t, offlineMs);
  const { request } = connection;
  const seats = [];
  for (const name of names) {
    const joined = await request(seats.length ? "join" : "create", {
      body: { name },
    });
    assert.equal(joined.status, 200);
    seats.push(joined);
  }
  const { room } = await request("start", { token: seats[0].token, body: {} });
  const state = async (seat) =>
    (await request("state", { token: seat.token })).room;
  const leave = async (seat) =>
    request("leave", { token: seat.token, body: {} });
  const vote = async (seat, revision) =>
    request("action", {
      token: seat.token,
      body: { revision, actionId: "skipOffline" },
    });
  return { ...connection, seats, room, state, leave, vote };
}

test("an explicit departure holds the active turn until every online seat approves once", async (t) => {
  const {
    seats: [host, first, second],
    state,
    leave,
    vote,
  } = await startGroup(t, ["Current", "First", "Second"]);
  assert.equal((await leave(host)).status, 200);
  const pending = await state(first);
  assert.equal(pending.game.turn, host.room.you);
  assert.equal(pending.game.phase, "offlineVote");
  assert.deepEqual(pending.game.offlineVote, {
    playerId: host.room.you,
    confirmed: 0,
    required: 2,
  });
  const offline = pending.game.announcements.find((event) =>
    event.text.includes("Current"),
  );
  assert.ok(offline?.seq > 0 && offline.kind);
  const one = await vote(first, pending.revision);
  assert.equal(one.status, 200);
  assert.equal(one.room.game.offlineVote.confirmed, 1);
  assert.equal(
    one.room.game.actions.some((action) => action.id === "skipOffline"),
    false,
  );
  assert.equal((await vote(first, one.room.revision)).status, 400);
  await leave(host);
  const unchanged = await state(second);
  assert.equal(unchanged.revision, one.room.revision);
  assert.deepEqual(unchanged.game.announcements, one.room.game.announcements);
  assert.equal(unchanged.game.offlineVote.confirmed, 1);
  const result = await vote(second, unchanged.revision);
  assert.equal(result.status, 200);
  assert.equal(result.room.game.offlineVote, null);
  assert.equal(result.room.game.turn, first.room.you);
});

test("a call on the heartbeat deadline stays online, and reconnecting cancels a pending skip", async (t) => {
  const {
    seats: [host, first, second],
    room,
    state,
    vote,
    advance,
  } = await startGroup(t, ["Expired", "On-time", "Witness"]);
  advance(6_000);
  await state(second);
  advance(4_000);
  const pending = await state(first);
  assert.equal(pending.revision, room.revision + 1);
  assert.equal(pending.game.elapsedMs, 10_000);
  assert.deepEqual(pending.game.offlineVote, {
    playerId: host.room.you,
    confirmed: 0,
    required: 2,
  });
  assert.ok(
    !pending.game.announcements.some((event) => event.text.includes("On-time")),
  );
  const partial = await vote(second, pending.revision);
  assert.equal(partial.room.game.offlineVote.confirmed, 1);
  advance(250);
  const recovered = await state(host);
  assert.equal(recovered.game.elapsedMs, 10_250);
  assert.equal(recovered.game.offlineVote, null);
  assert.equal(recovered.game.turn, host.room.you);
  assert.ok(recovered.game.actions.some((action) => action.id === "roll"));
  assert.equal((await vote(first, partial.room.revision)).status, 409);
});

test("one leave and simultaneous network expiries form one presence change", async (t) => {
  const {
    seats: [host, expired, exiting, witness],
    room,
    request,
    state,
    leave,
    advance,
  } = await startGroup(t, ["Host", "Expired", "Exit", "Witness"]);
  advance(6_000);
  await state(witness);
  advance(4_000);
  assert.equal((await request("state", { token: "obsolete" })).status, 401);
  assert.equal((await leave(exiting)).status, 200);
  const after = await state(witness);
  assert.equal(after.revision, room.revision + 1);
  assert.deepEqual(
    after.players.filter((p) => !p.online).map((p) => p.id),
    [host.room.you, expired.room.you, exiting.room.you],
  );
  assert.deepEqual(after.game.offlineVote, {
    playerId: host.room.you,
    confirmed: 0,
    required: 1,
  });
});

async function startDuel(t, offlineMs) {
  // Keep the board's original layout. Both sixes land the knights on duel space 7.
  t.mock.method(Math, "random", () => 0.999);
  const match = await startGroup(
    t,
    ["Champion", "Challenger", "Witness"],
    offlineMs,
  );
  const [champion, challenger] = match.seats;
  let room = match.room;
  for (const knight of [champion, challenger]) {
    for (const actionId of ["roll", "check:accept"]) {
      const result = await match.request("action", {
        token: knight.token,
        body: { actionId, revision: room.revision },
      });
      assert.equal(result.status, 200);
      room = result.room;
    }
  }
  assert.deepEqual(room.game.battle.actors, [
    champion.room.you,
    challenger.room.you,
  ]);
  return { ...match, room };
}

test("a duel forfeiture returns the disconnected knight to start and lets the winner choose an upgrade", async (t) => {
  const {
    seats: [champion, challenger],
    room,
    request,
    state,
    leave,
  } = await startDuel(t);
  await leave(challenger);
  const after = await state(champion);
  assert.equal(after.game.battle, null);
  assert.equal(after.game.offlineVote, null);
  const loser = after.game.players.find((p) => p.id === challenger.room.you);
  assert.equal(loser.pos, 1);
  assert.equal(loser.def, room.game.players.find((p) => p.id === loser.id).def);
  assert.deepEqual(after.game.actions.map((a) => a.id).sort(), [
    "upgrade:act",
    "upgrade:atk",
    "upgrade:def",
  ]);
  const award = await request("action", {
    token: champion.token,
    body: { actionId: "upgrade:atk", revision: after.revision },
  });
  assert.equal(award.status, 200);
  assert.equal(
    award.room.game.players.find((p) => p.id === champion.room.you).atk,
    2,
  );
  assert.ok(
    award.room.game.announcements.some(
      (event) => event.kind === "offline" && event.text.includes("Challenger"),
    ),
  );
});

test("both duelists returning to start together grants neither an offline win", async (t) => {
  const {
    seats: [champion, challenger, witness],
    room,
    state,
    leave,
    advance,
  } = await startDuel(t);
  advance(6_000);
  await state(witness);
  advance(4_000);
  // One heartbeat has expired when the opposing knight sends their leave request.
  await leave(challenger);
  const after = await state(witness);
  assert.equal(after.revision, room.revision + 1);
  assert.equal(after.game.battle, null);
  assert.equal(after.game.turn, witness.room.you);
  for (const knight of [champion, challenger]) {
    const p = after.game.players.find((p) => p.id === knight.room.you);
    const before = room.game.players.find((other) => other.id === p.id);
    assert.equal(p.pos, 1);
    assert.equal(p.def, before.def);
    assert.equal(p.online, false);
    const rejoined = await state(knight);
    assert.equal(
      rejoined.game.actions.some((a) => a.id.startsWith("upgrade:")),
      false,
    );
  }
});

test(
  "an unobserved room settles simultaneous network losses before the first duelist returns",
  { timeout: 2500 },
  async (t) => {
    const {
      seats: [champion, challenger],
      state,
      advance,
      onNextClockRead,
    } = await startDuel(t, 30);
    advance(100);
    // No client request runs until the room service has read its clock on its own.
    await onNextClockRead();
    const reconnected = await state(champion);
    assert.equal(reconnected.game.battle, null);
    assert.equal(
      reconnected.game.players.find((p) => p.id === champion.room.you).pos,
      1,
    );
    assert.equal(
      reconnected.game.players.find((p) => p.id === challenger.room.you).pos,
      1,
    );
    assert.ok(
      !reconnected.game.actions.some((a) => a.id.startsWith("upgrade:")),
    );
    assert.equal(
      reconnected.game.announcements.filter((e) => e.kind === "offline").length,
      3,
    );
  },
);
