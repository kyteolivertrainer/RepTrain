"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import Header from "@/components/Header";
import Ring from "@/components/Ring";
import Heatmap from "@/components/Heatmap";
import Ribbon from "@/components/Ribbon";
import { useWallet } from "@/lib/useWallet";
import { ARCSCAN, switchToArc } from "@/lib/arcNetwork";
import { pickProvider } from "@/lib/wallet";
import {
  CONTRACT_ADDRESS,
  REPTRAIN_ABI,
  hasContract,
  readContract,
  fetchGlobal,
  fetchPact,
  fetchStats,
  fetchHistory,
  fetchLeaderboard,
  fmtUsdc,
  shortAddr,
  timeLeft,
  daysLeft,
  loggedToday,
  ACTIVE,
  EMPTY_PACT,
  EMPTY_STATS,
  EMPTY_GLOBAL,
  type Pact,
  type Stats,
  type Global,
  type Athlete,
} from "@/lib/reptrain";

const PRESETS = [
  { name: "Starter", goal: 12, days: 30, stake: "2" },
  { name: "Committed", goal: 20, days: 30, stake: "10" },
  { name: "Beast", goal: 24, days: 30, stake: "25" },
];

export default function Home() {
  const { account, balance, chainOk, connecting, connect, disconnect, refreshBalance } = useWallet();

  const [global, setGlobal] = useState<Global>(EMPTY_GLOBAL);
  const [pact, setPact] = useState<Pact>(EMPTY_PACT);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [history, setHistory] = useState<number[]>([]);
  const [board, setBoard] = useState<Athlete[]>([]);

  // start form
  const [goal, setGoal] = useState("12");
  const [days, setDays] = useState("30");
  const [stake, setStake] = useState("2");

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<"" | "start" | "log" | "claim" | "settle">("");

  const loadEpoch = useRef(0);
  const accountRef = useRef(account);
  const inFlight = useRef(false);

  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  const load = useCallback(async () => {
    if (!hasContract()) return;
    const epoch = ++loadEpoch.current;
    try {
      const c = readContract();
      const [g, lb] = await Promise.all([fetchGlobal(c), fetchLeaderboard(account, c)]);
      if (epoch !== loadEpoch.current) return;
      setGlobal(g);
      setBoard(lb);
      if (account) {
        const [p, s, h] = await Promise.all([fetchPact(account, c), fetchStats(account, c), fetchHistory(account, c)]);
        if (epoch !== loadEpoch.current) return;
        setPact(p);
        setStats(s);
        setHistory(h);
      } else {
        setPact(EMPTY_PACT);
        setStats(EMPTY_STATS);
        setHistory([]);
      }
    } catch {
      /* keep last good state */
    }
  }, [account]);

  useEffect(() => {
    load();
  }, [load]);

  async function writeContract() {
    const inj = pickProvider();
    if (!inj) throw new Error("No wallet found");
    await switchToArc(inj);
    const provider = new ethers.BrowserProvider(inj);
    const signer = await provider.getSigner(account);
    return new ethers.Contract(CONTRACT_ADDRESS, REPTRAIN_ABI, signer);
  }

  function reason(e: unknown): string {
    const err = e as { code?: string | number; reason?: string; shortMessage?: string; message?: string };
    if (err?.code === "ACTION_REJECTED" || err?.code === 4001) return "Cancelled";
    return (err?.reason || err?.shortMessage || err?.message || "Failed").slice(0, 80);
  }

  async function run(kind: "start" | "log" | "claim" | "settle", fn: (c: ethers.Contract) => Promise<ethers.ContractTransactionResponse>, pending: string, done: string) {
    if (!account) {
      if (!pickProvider()) return setMsg("✗ No wallet detected — install Rabby or MetaMask");
      connect();
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    const captured = account;
    setBusy(kind);
    setMsg(pending);
    try {
      const c = await writeContract();
      const tx = await fn(c);
      setMsg("Confirming on ARC…");
      await tx.wait();
      if (accountRef.current !== captured) return;
      setMsg(done);
      await load();
      await refreshBalance(captured);
    } catch (e) {
      setMsg("✗ " + reason(e));
    } finally {
      inFlight.current = false;
      setBusy("");
    }
  }

  function startPact() {
    const g = Number(goal);
    const d = Number(days);
    const s = stake.trim();
    if (!Number.isInteger(g) || g < 1 || g > 366) return setMsg("✗ Goal must be 1–366 sessions");
    if (!Number.isInteger(d) || d < 1 || d > 366) return setMsg("✗ Duration must be 1–366 days");
    if (g > d) return setMsg("✗ You can log one session a day — goal can't exceed the days");
    if (!/^\d+(\.\d{1,6})?$/.test(s) || Number(s) <= 0) return setMsg("✗ Stake a positive USDC amount");
    const stakeWei = ethers.parseEther(s);
    run("start", (c) => c.start(g, d, { value: stakeWei }), "Opening your pact… confirm in your wallet", "✓ Pact is live — go train");
  }

  function logSession() {
    run("log", (c) => c.checkIn(), "Logging your session… confirm in your wallet", "✓ Session logged — chain alive");
  }
  function claimStake() {
    run("claim", (c) => c.claim(), "Claiming your stake… confirm in your wallet", "✓ Paid out — stake + comeback bonus");
  }
  function settlePact() {
    run("settle", (c) => c.forfeit(account), "Settling the expired pact…", "Pact settled — stake moved to the pot");
  }

  // ── derived pact view ──────────────────────────────────
  const isActive = pact.status === ACTIVE;
  const expired = isActive && Math.floor(Date.now() / 1000) > pact.deadline;
  const reached = pact.done >= pact.goal && pact.goal > 0;
  const progress = pact.goal > 0 ? pact.done / pact.goal : 0;
  const did = loggedToday(pact);
  const bonusPreview = (() => {
    if (!reached) return 0n;
    const half = pact.stake / 2n;
    return half > global.pool ? global.pool : half;
  })();

  const wrap: React.CSSProperties = { maxWidth: 1120, margin: "0 auto", padding: "0 22px" };

  function applyPreset(p: (typeof PRESETS)[number]) {
    setGoal(String(p.goal));
    setDays(String(p.days));
    setStake(p.stake);
  }

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 80 }}>
      <Header account={account} balance={balance} chainOk={chainOk} connecting={connecting} onConnect={connect} onDisconnect={disconnect} />

      {/* ── HERO ── */}
      <section style={{ ...wrap, paddingTop: "clamp(36px, 5vw, 60px)" }}>
        <div className="grid-main rise" style={{ alignItems: "center" }}>
          <div>
            <span className="tape" style={{ fontSize: 12, marginBottom: 26 }}>On-chain training pact · ARC</span>
            <h1 className="display" style={{ fontSize: "clamp(46px, 8.5vw, 104px)", marginTop: 22 }}>
              Don&apos;t break
              <br />
              the <span className="stroke">chain.</span>
            </h1>
            <p style={{ fontSize: 17, color: "var(--muted)", maxWidth: 470, lineHeight: 1.55, marginTop: 22 }}>
              Put real money on your training. Show up every day, log it on-chain, and pull your stake back —
              plus a slice of everyone who flaked. Miss your window and you <i>become</i> the slice.
            </p>
            <div style={{ display: "flex", gap: 11, marginTop: 28, flexWrap: "wrap", alignItems: "center" }}>
              <a href="#pact" className="btn btn--primary btn--huge">Start a pact →</a>
              <a href="#rules" className="btn btn--lg">The house rules</a>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, color: "var(--faint)" }}>
              <svg width="34" height="20" viewBox="0 0 34 20" fill="none" style={{ flexShrink: 0 }}>
                <path d="M2 2C9 2 17 4 22 16" stroke="var(--ember)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                <path d="M16 14l6 3 1-6" stroke="var(--ember)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <span style={{ fontStyle: "italic", fontSize: 13.5 }}>put your money where your reps are</span>
            </div>
          </div>

          {/* the pot — looks like a stuck-on betting slip */}
          <div className="panel" style={{ padding: 0, overflow: "visible", position: "relative" }}>
            <div style={{ position: "absolute", top: -14, left: 22, zIndex: 3 }}>
              <span className="tape tape--ember" style={{ fontSize: 11 }}>The pot, right now</span>
            </div>
            <div style={{ padding: "38px 26px 26px", textAlign: "center" }}>
              <div className="num" style={{ fontSize: "clamp(48px, 8vw, 72px)", color: "var(--ember)", lineHeight: 1 }}>
                ${fmtUsdc(global.pool)}
              </div>
              <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 12, lineHeight: 1.55, maxWidth: 280, marginInline: "auto" }}>
                Dropped here by people who quit (${fmtUsdc(global.forfeited)} so far). Finish your pact and a
                chunk of it is yours.
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
                <span className="chip">{global.active.toString()} pacts live</span>
                <span className="chip">{global.athletes} in the game</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── RIBBON ── */}
      <div style={{ marginTop: "clamp(28px, 4vw, 44px)" }}>
        <Ribbon />
      </div>

      {/* ── SCOREBOARD ── */}
      <section style={{ ...wrap, marginTop: 26 }}>
        <div className="scoreboard">
          {[
            { k: "USDC staked", v: "$" + fmtUsdc(global.staked) },
            { k: "Paid back", v: "$" + fmtUsdc(global.returned) },
            { k: "Sessions", v: global.sessions.toString() },
            { k: "Athletes", v: global.athletes.toString() },
          ].map((s) => (
            <div key={s.k} className="score">
              <div className="num" style={{ fontSize: "clamp(20px, 5vw, 28px)", overflowWrap: "anywhere" }}>{s.v}</div>
              <div className="label" style={{ marginTop: 6 }}>{s.k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── MAIN ── */}
      <section id="pact" style={{ ...wrap, marginTop: 26 }}>
        <div className="grid-main">
          {/* left: the board */}
          <div className="panel ruled" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
              <h2 className="head" style={{ fontSize: 22 }}>{isActive ? "Today" : "Your pact"}</h2>
              {isActive && (
                <span className={expired && !reached ? "chip chip--ember" : "chip chip--volt"}>
                  {reached ? "Goal reached" : expired ? "Window closed" : timeLeft(pact.deadline) + " left"}
                </span>
              )}
            </div>

            {!account ? (
              <div style={{ padding: "26px 0", textAlign: "center" }}>
                <p style={{ color: "var(--muted)", fontSize: 14.5, marginBottom: 16, lineHeight: 1.5 }}>Hook up a wallet to open a pact and start logging sessions.</p>
                <button onClick={connect} className="btn btn--primary btn--lg">Connect wallet</button>
              </div>
            ) : !isActive ? (
              /* start form */
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                  {PRESETS.map((p) => (
                    <button key={p.name} onClick={() => applyPreset(p)} className="chip" style={{ cursor: "pointer", color: "var(--ink)" }}>
                      <b style={{ fontWeight: 700 }}>{p.name}</b>
                      <span style={{ color: "var(--faint)" }}>·</span>
                      <span style={{ color: "var(--muted)" }}>{p.goal} in {p.days}d · {p.stake} USDC</span>
                    </button>
                  ))}
                </div>
                <div className="form-row" style={{ marginBottom: 12 }}>
                  <Field label="Goal — sessions">
                    <input value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="numeric" className="input" placeholder="12" />
                  </Field>
                  <Field label="Window — days">
                    <input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" className="input" placeholder="30" />
                  </Field>
                </div>
                <Field label="Stake — USDC">
                  <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" className="input" placeholder="2" />
                </Field>
                <p style={{ fontSize: 13, color: "var(--faint)", margin: "12px 2px 16px", lineHeight: 1.5 }}>
                  One session per day counts. Land {goal || "—"} of them inside {days || "—"} days and your{" "}
                  {stake && Number(stake) > 0 ? `${stake} USDC` : "stake"} comes back — plus up to half again from the pot.
                </p>
                <button onClick={startPact} disabled={busy === "start"} className="btn btn--primary btn--huge btn--block">
                  {busy === "start" ? "Opening…" : "Open pact & stake"}
                </button>
              </div>
            ) : (
              /* active pact */
              <div>
                <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                  <Ring value={progress} color={expired && !reached ? "var(--ember)" : "var(--volt)"}>
                    <div className="ring-num" style={{ fontSize: 48, lineHeight: 1 }}>{pact.done}</div>
                    <div className="label" style={{ marginTop: 2 }}>of {pact.goal}</div>
                    <div style={{ fontSize: 12.5, color: "var(--ember-2)", fontWeight: 600, marginTop: 8 }}>🔥 {stats.currentStreak} day streak</div>
                  </Ring>
                  <div style={{ flex: 1, minWidth: 200, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Mini k="Staked" v={"$" + fmtUsdc(pact.stake)} />
                    <Mini k="Sessions left" v={String(Math.max(0, pact.goal - pact.done))} />
                    <Mini k={expired ? "Window" : "Time left"} v={expired ? "ended" : timeLeft(pact.deadline)} />
                    <Mini k="Days remaining" v={String(daysLeft(pact.deadline))} />
                  </div>
                </div>

                <div style={{ marginTop: 22 }}>
                  {reached ? (
                    <button onClick={claimStake} disabled={busy === "claim"} className="btn btn--primary btn--huge btn--block">
                      {busy === "claim" ? "Claiming…" : `Claim $${fmtUsdc(pact.stake + bonusPreview)}${bonusPreview > 0n ? `  · +$${fmtUsdc(bonusPreview)} pot` : ""}`}
                    </button>
                  ) : expired ? (
                    <div>
                      <p style={{ fontSize: 13.5, color: "var(--ember-2)", marginBottom: 12, lineHeight: 1.5 }}>
                        Window closed at {pact.done}/{pact.goal}. Settle to release the pact — your stake drops into the pot, and you can start a new one.
                      </p>
                      <button onClick={settlePact} disabled={busy === "settle"} className="btn btn--ember btn--huge btn--block">
                        {busy === "settle" ? "Settling…" : "Settle & let it go"}
                      </button>
                    </div>
                  ) : (
                    <button onClick={logSession} disabled={busy === "log" || did} className="btn btn--primary btn--huge btn--block">
                      {busy === "log" ? "Logging…" : did ? "Done for today ✓ — back tomorrow" : "Log today's session"}
                    </button>
                  )}
                </div>

                <div style={{ marginTop: 26 }}>
                  <div className="label" style={{ marginBottom: 12 }}>The chain</div>
                  <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                    <Heatmap days={history} />
                  </div>
                </div>
              </div>
            )}

            {account && (
              <div className="grid-4" style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid var(--line)" }}>
                <Mini k="🔥 Best streak" v={String(stats.bestStreak)} />
                <Mini k="Sessions" v={String(stats.totalSessions)} />
                <Mini k="Pacts won" v={String(stats.pactsWon)} />
                <Mini k="Flaked" v={String(stats.pactsLost)} />
              </div>
            )}

            {msg && (
              <div className="num" style={{ marginTop: 16, fontSize: 13, color: msg.startsWith("✓") ? "var(--volt)" : msg.startsWith("✗") ? "var(--bad)" : "var(--muted)" }}>
                {msg}
              </div>
            )}
          </div>

          {/* right: standings */}
          <div className="panel" style={{ padding: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
              <h2 className="head" style={{ fontSize: 20 }}>Standings</h2>
              <span className="label" style={{ fontSize: 10 }}>by streak</span>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--faint)", marginBottom: 16 }}>Longest chains on RepTrain.</p>
            {board.length === 0 ? (
              <p style={{ fontSize: 13.5, color: "var(--muted)" }}>Empty board. Be the first name on it.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {board.slice(0, 10).map((a, i) => {
                  const me = account && a.addr.toLowerCase() === account.toLowerCase();
                  return (
                    <div key={a.addr} className={me ? "standing me" : "standing"}>
                      <span className={i < 3 ? "rank medal" : "rank"}>{i + 1}</span>
                      <a href={`${ARCSCAN}/address/${a.addr}`} target="_blank" rel="noopener noreferrer" className="num" style={{ flex: 1, fontSize: 13.5, textDecoration: "none", color: me ? "var(--volt)" : "var(--ink)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {me ? "You" : shortAddr(a.addr, 6, 4)}
                      </a>
                      <span style={{ fontSize: 12.5, color: "var(--ember-2)", fontWeight: 600, flexShrink: 0 }}>🔥 {a.stats.bestStreak}</span>
                      <span className="num" style={{ fontSize: 12.5, color: "var(--muted)", width: 58, textAlign: "right", flexShrink: 0 }}>{a.stats.totalSessions} ses</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── HOUSE RULES ── */}
      <section id="rules" style={{ ...wrap, marginTop: "clamp(48px, 7vw, 80px)" }}>
        <span className="tape" style={{ fontSize: 12 }}>The house rules</span>
        <h2 className="display" style={{ fontSize: "clamp(30px, 5vw, 52px)", marginTop: 20, maxWidth: 760 }}>
          Four rules. No fine print.
        </h2>
        <div style={{ marginTop: 24 }}>
          {[
            ["01", "Stake to enter", "No stake, no pact. Skin in the game or the streak doesn't mean anything."],
            ["02", "One a day", "A session a day keeps the chain alive. Log it on-chain — miss a day and the streak resets to one."],
            ["03", "Finish, get paid", "Hit your number before the window closes and pull your stake back, plus up to half again from the pot."],
            ["04", "Flake, fund it", "Let the window close short and your stake drops into the pot — fuel for the people who don't quit."],
          ].map(([n, t, d]) => (
            <div key={n} className="rule">
              <div className="rule-n">{n}</div>
              <div>
                <div className="head" style={{ fontSize: 19, marginBottom: 5 }}>{t}</div>
                <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.55, maxWidth: 620 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── WHY ARC ── */}
      <section style={{ ...wrap, marginTop: "clamp(44px, 6vw, 64px)" }}>
        <span className="label">Why it runs on ARC</span>
        <h2 className="head" style={{ fontSize: "clamp(22px, 3.2vw, 32px)", marginTop: 14, maxWidth: 680, lineHeight: 1.2 }}>
          A few dollars only work as stakes if the money moves like a text message.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, marginTop: 28 }}>
          {[
            ["Real USDC, no token", "Stakes and payouts are plain dollars on ARC — nothing to swap, no gas coin to keep topped up, no approval to sign."],
            ["Paid out instantly", "Claim and the USDC is in your wallet the same second. A reward that shows up tomorrow isn't a reward."],
            ["Forfeits sweep themselves", "An expired pact is settled by one open call — a keeper or a bot can clear it and feed the pot, no admin needed."],
          ].map(([t, d]) => (
            <div key={t}>
              <div className="dot" style={{ background: "var(--volt)", marginBottom: 12 }} />
              <div className="head" style={{ fontSize: 16, marginBottom: 7 }}>{t}</div>
              <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ ...wrap, marginTop: "clamp(44px, 6vw, 64px)" }}>
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <span className="head" style={{ fontSize: 15 }}>
            Rep<span style={{ color: "var(--volt)" }}>Train</span>
            <span style={{ color: "var(--faint)", fontWeight: 400, fontFamily: "'Space Grotesk'", marginLeft: 10, fontSize: 12.5 }}>— keep the chain · built in Valencia</span>
          </span>
          <a href={`${ARCSCAN}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="num" style={{ fontSize: 12.5, color: "var(--muted)", textDecoration: "none" }}>
            Contract {shortAddr(CONTRACT_ADDRESS, 8, 6)} ↗
          </a>
        </div>
      </footer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="panel-2" style={{ padding: "12px 14px", minWidth: 0 }}>
      <div className="num" style={{ fontSize: 18, overflowWrap: "anywhere" }}>{v}</div>
      <div className="label" style={{ marginTop: 4, fontSize: 10 }}>{k}</div>
    </div>
  );
}
