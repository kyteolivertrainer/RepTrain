# RepTrain

**Put money on it. Show up. Take it back.**

You already know what to do. You just don't do it — because skipping a free
streak costs you exactly nothing. So we make it cost something.

Stake your own USDC against a goal. Train your way through the window and you
walk away with every cent back, plus a cut skimmed off everyone who didn't.
Go quiet and let the clock run out, and that stake is no longer yours — it
goes to the people still grinding.

That's the whole sport. Read on.

---

## THE RULES

Four of them. Pin them above the bench.

1. **You don't get in for free.** Pick a number of sessions and a window of
   days, then back it with a USDC stake. `start(goal, durationDays)` takes the
   stake in the same call. No stake, no pact — and the goal can never be larger
   than the window, because you only get to log once a day.

2. **One check-in a day. No catching up.** `checkIn()` records a single session
   for the current UTC day and rolls your streak forward. Hit it two days in a
   row and the streak climbs; skip a day and it snaps back to one. You cannot
   bank Tuesday's session on Wednesday, and you cannot log twice — the day is
   counted across your whole account, so closing one pact and opening another
   the same afternoon buys you nothing.

3. **Reach the number, take the cash.** The moment `done` hits `goal`, call
   `claim()`. You get your full stake back, plus a bonus equal to half your
   stake — capped at whatever's actually sitting in the comeback pool. There is
   no clock on claiming: a finisher can collect whenever they want.

4. **The pool is built by quitters, paid to finishers.** Every forfeited stake
   lands in the comeback pool. Every winner draws their bonus out of it. You're
   not betting against the house. You're betting against the version of you that
   doesn't show up.

Pick a lane to start:

- **Starter** — 12 sessions in 30 days, 2 USDC on the line
- **Committed** — 20 in 30, 10 USDC
- **Beast** — 24 in 30, 25 USDC

Or set your own goal, window, and stake. Up to 366 days.

---

## WHAT HAPPENS IF YOU QUIT

Be honest about this part, because it's the engine.

Miss your deadline with the goal unmet and your pact is dead — but it doesn't
clean itself up out of politeness. `forfeit(address)` settles an expired,
unfinished pact, and **anyone at all can call it**: you, a rival on the board,
or an automated keeper sweeping the chain for stale pacts. Whoever pulls the
trigger, the result is the same — your staked USDC drops into the comeback pool
and becomes bonus money for the people who finished what you didn't.

You don't lose your record, just your stake. Your lifetime lines — best streak,
total sessions, pacts won, pacts flaked — stay carved into the chain. That
ledger is the only Rep that counts here.

---

## WHY THIS ONLY MAKES SENSE ON ARC

Look at the math of a single pact. A Starter stake is **2 USDC**. The bonus a
finisher pulls is **half of that — a dollar, sometimes a fistful of cents** when
the pool is thin. The entire mechanic is a swarm of tiny dollar-and-change
movements: dozens of stakes going in, dozens of small bonuses coming out, and a
steady drip of forfeits being raked from the quitters' side of the table to the
finishers'.

That only works if moving a couple of dollars doesn't cost a couple of dollars.

Arc settles in **native USDC** — the thing you stake is the same thing you pay
the chain in, so there's no separate gas coin to keep topped up and no swap
between "the money" and "the fee." A two-dollar stake stays a two-dollar stake.
Just as important: settling a dead pact has to be **cheap enough that a keeper
will bother**. `forfeit()` is a wide-open call by design — if sweeping an expired
pact ate more in fees than the cents of bonus it adds to the pool, nobody would
ever run it, the pool would stall, and finishers would stop getting paid. On a
chain where moving cents is itself nearly free, a keeper can rake the whole
board for a rounding error, and the redistribution actually happens.

Strip the micro-payments down to where they belong — pennies — and the
accountability loop closes. That's the bet this contract is built on.

---

## RUN IT

```bash
npm install
npm run dev
```

Connect a wallet on Arc testnet (chain `5042002`), fund it with test USDC, and
open a pact. The frontend is the only moving part outside the contract — it
reads pacts, streaks, the leaderboard, and the live pool size directly from
chain. There is no server, no bot of ours, and no off-chain account standing
between you and your stake. The open `forfeit()` call is the only door a keeper
would ever need, and it's wide open for anyone.

The contract source lives in `contracts/RepTrain.sol`; `scripts/compile.js`
reproduces the build.

---

**Tracked on-chain:** [`0x21d74586c0d9d8526aD4EF60Cf153Cf3D2394F07`](https://testnet.arcscan.app/address/0x21d74586c0d9d8526aD4EF60Cf153Cf3D2394F07) — Arc testnet, chain 5042002, source-verified.

Now stop reading and go log a session.
