# RepTrain

**Put money on your training. Show up — or fund the people who do.**

RepTrain turns a training streak into an on-chain pact. You stake USDC, commit to a number of
sessions inside a window, and log one a day. Finish and you pull your stake back — plus a slice of
everyone who quit. Miss your window and your stake *becomes* that slice.

**Live → https://reptrain-arc.vercel.app** · ARC Testnet

## The house rules

1. **Stake to enter.** No stake, no pact. Skin in the game or the streak doesn't mean anything.
2. **One a day.** A session a day keeps the chain alive. Log it on-chain — miss a day and the streak resets.
3. **Finish, get paid.** Hit your number before the window closes and claim your stake, plus up to half again from the pot.
4. **Flake, fund it.** Let the window close short and your stake drops into the pot for the people who don't quit.

## How a pact works

- `start(goal, days)` locks your USDC and opens the pact.
- `checkIn()` logs one session per UTC day — growing your streak and lighting up your on-chain calendar.
- `claim()` pays you out once you've hit the goal: your stake plus a comeback bonus from the pot.
- `forfeit(addr)` settles an expired, unfinished pact. **Anyone** can call it — a keeper, a bot — and the stake feeds the pot.

Your streaks, sessions and wins live on-chain. That record is your **Rep**.

## Why ARC

A few dollars only work as a stake if moving the money is instant and basically free. ARC settles in
**native USDC** — plain dollars, no token to buy, no approval to sign, in your wallet the same second
you claim. And because a forfeit is one open call, the pot keeps itself swept with no admin in the loop.

## Built with

Next.js · ethers v6 · one Solidity contract · EIP-6963 wallets · no backend — it reads straight from
the chain.

Contract
[`0x21d74586c0d9d8526aD4EF60Cf153Cf3D2394F07`](https://testnet.arcscan.app/address/0x21d74586c0d9d8526aD4EF60Cf153Cf3D2394F07)
on ARC Testnet.
