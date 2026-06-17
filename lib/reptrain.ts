import { ethers } from "ethers";
import { ARC_RPC } from "./arcNetwork";

// ─────────────────────────────────────────────────────────────
// RepTrain — stake USDC on a training streak. One deployed contract,
// the single source of truth for pacts, sessions and the comeback pool.
// ─────────────────────────────────────────────────────────────
export const CONTRACT_ADDRESS = "0x21d74586c0d9d8526aD4EF60Cf153Cf3D2394F07";

export const REPTRAIN_ABI = [
  "function start(uint32 goal, uint32 durationDays) payable",
  "function checkIn()",
  "function claim()",
  "function forfeit(address who)",
  "function getPact(address) view returns (tuple(uint256 stake, uint64 startAt, uint64 deadline, uint32 goal, uint32 done, uint32 lastDay, uint8 status))",
  "function getStats(address) view returns (tuple(uint32 totalSessions, uint32 currentStreak, uint32 bestStreak, uint32 lastDay, uint32 pactsWon, uint32 pactsLost, uint256 totalStaked, uint256 totalReturned))",
  "function historyOf(address) view returns (uint32[])",
  "function athletes() view returns (address[])",
  "function athletesCount() view returns (uint256)",
  "function comebackPool() view returns (uint256)",
  "function totalStakedAll() view returns (uint256)",
  "function totalReturnedAll() view returns (uint256)",
  "function totalForfeited() view returns (uint256)",
  "function sessionsLogged() view returns (uint256)",
  "function activePacts() view returns (uint256)",
  "event Started(address indexed who, uint256 stake, uint32 goal, uint64 deadline)",
  "event CheckedIn(address indexed who, uint32 day, uint32 done, uint32 streak)",
  "event Won(address indexed who, uint256 stake, uint256 bonus)",
  "event Lost(address indexed who, address indexed settledBy, uint256 stake)",
];

// pact status
export const NONE = 0;
export const ACTIVE = 1;
export const WON = 2;
export const LOST = 3;

export interface Pact {
  stake: bigint;
  startAt: number;
  deadline: number;
  goal: number;
  done: number;
  lastDay: number;
  status: number;
}

export interface Stats {
  totalSessions: number;
  currentStreak: number;
  bestStreak: number;
  lastDay: number;
  pactsWon: number;
  pactsLost: number;
  totalStaked: bigint;
  totalReturned: bigint;
}

export interface Global {
  pool: bigint;
  staked: bigint;
  returned: bigint;
  forfeited: bigint;
  sessions: bigint;
  active: bigint;
  athletes: number;
}

export interface Athlete {
  addr: string;
  stats: Stats;
}

export const EMPTY_PACT: Pact = { stake: 0n, startAt: 0, deadline: 0, goal: 0, done: 0, lastDay: 0, status: NONE };
export const EMPTY_STATS: Stats = {
  totalSessions: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastDay: 0,
  pactsWon: 0,
  pactsLost: 0,
  totalStaked: 0n,
  totalReturned: 0n,
};
export const EMPTY_GLOBAL: Global = { pool: 0n, staked: 0n, returned: 0n, forfeited: 0n, sessions: 0n, active: 0n, athletes: 0 };

// ── connection ───────────────────────────────────────────────
export function readProvider() {
  return new ethers.JsonRpcProvider(ARC_RPC);
}

export function readContract(provider?: ethers.Provider) {
  return new ethers.Contract(CONTRACT_ADDRESS, REPTRAIN_ABI, provider ?? readProvider());
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  const failed: T[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const settled = await Promise.allSettled(batch.map(fn));
    settled.forEach((s, j) => (s.status === "fulfilled" ? out.push(s.value) : failed.push(batch[j])));
  }
  const stillFailed: T[] = [];
  for (let i = 0; i < failed.length; i += limit) {
    const batch = failed.slice(i, i + limit);
    const settled = await Promise.allSettled(batch.map(fn));
    settled.forEach((s, j) => (s.status === "fulfilled" ? out.push(s.value) : stillFailed.push(batch[j])));
  }
  if (stillFailed.length) console.warn(`reptrain: ${stillFailed.length} read(s) failed after retry`);
  return out;
}

// ── shapers ──────────────────────────────────────────────────
type RawPact = { stake: bigint; startAt: bigint; deadline: bigint; goal: bigint; done: bigint; lastDay: bigint; status: bigint };
function toPact(p: RawPact): Pact {
  return {
    stake: p.stake,
    startAt: Number(p.startAt),
    deadline: Number(p.deadline),
    goal: Number(p.goal),
    done: Number(p.done),
    lastDay: Number(p.lastDay),
    status: Number(p.status),
  };
}

type RawStats = {
  totalSessions: bigint;
  currentStreak: bigint;
  bestStreak: bigint;
  lastDay: bigint;
  pactsWon: bigint;
  pactsLost: bigint;
  totalStaked: bigint;
  totalReturned: bigint;
};
function toStats(s: RawStats): Stats {
  return {
    totalSessions: Number(s.totalSessions),
    currentStreak: Number(s.currentStreak),
    bestStreak: Number(s.bestStreak),
    lastDay: Number(s.lastDay),
    pactsWon: Number(s.pactsWon),
    pactsLost: Number(s.pactsLost),
    totalStaked: s.totalStaked,
    totalReturned: s.totalReturned,
  };
}

// ── reads ────────────────────────────────────────────────────
export function hasContract(): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(CONTRACT_ADDRESS);
}

export async function fetchGlobal(contract?: ethers.Contract): Promise<Global> {
  const c = contract ?? readContract();
  const [pool, staked, returned, forfeited, sessions, active, athletes] = await Promise.all([
    c.comebackPool(),
    c.totalStakedAll(),
    c.totalReturnedAll(),
    c.totalForfeited(),
    c.sessionsLogged(),
    c.activePacts(),
    c.athletesCount(),
  ]);
  return { pool, staked, returned, forfeited, sessions, active, athletes: Number(athletes) };
}

export async function fetchPact(addr: string, contract?: ethers.Contract): Promise<Pact> {
  const c = contract ?? readContract();
  return toPact(await c.getPact(addr));
}

export async function fetchStats(addr: string, contract?: ethers.Contract): Promise<Stats> {
  const c = contract ?? readContract();
  return toStats(await c.getStats(addr));
}

export async function fetchHistory(addr: string, contract?: ethers.Contract): Promise<number[]> {
  const c = contract ?? readContract();
  const days: bigint[] = await c.historyOf(addr);
  return days.map(Number);
}

const LEADER_MAX = 100;

/** Top athletes by best streak, then lifetime sessions. Bounded to the most recent
 *  LEADER_MAX joiners, but the connected account is always included so its row never vanishes. */
export async function fetchLeaderboard(me?: string, contract?: ethers.Contract): Promise<Athlete[]> {
  const c = contract ?? readContract();
  const all: string[] = await c.athletes();
  const slice = all.length > LEADER_MAX ? all.slice(-LEADER_MAX) : [...all];
  if (me) {
    const lower = me.toLowerCase();
    const inAll = all.find((a) => a.toLowerCase() === lower);
    if (inAll && !slice.some((a) => a.toLowerCase() === lower)) slice.push(inAll);
  }
  const rows = await mapLimit(slice, 10, async (addr) => ({ addr, stats: await fetchStats(addr, c) }));
  rows.sort((a, b) => {
    if (b.stats.bestStreak !== a.stats.bestStreak) return b.stats.bestStreak - a.stats.bestStreak;
    if (b.stats.totalSessions !== a.stats.totalSessions) return b.stats.totalSessions - a.stats.totalSessions;
    return b.stats.pactsWon - a.stats.pactsWon;
  });
  return rows;
}

// ── formatting / time ────────────────────────────────────────
export const DAY = 86400; // seconds in a day (UTC day buckets, matching the contract)

export function shortAddr(addr: string, lead = 6, tail = 4): string {
  if (!addr) return "";
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

/** USDC amount, trimmed — never collapses a nonzero (charging) amount to "0". */
export function fmtUsdc(wei: bigint, dp = 2): string {
  const n = parseFloat(ethers.formatEther(wei));
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  if (n < 0.01) {
    const s = n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    return s === "0" ? "<0.0001" : s;
  }
  const s = n.toFixed(dp);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** Current UTC day index, matching the contract's block.timestamp / 1 days. */
export function todayIndex(): number {
  return Math.floor(Date.now() / 1000 / DAY);
}

/** Day index → a Date at UTC midnight of that day. */
export function dayToDate(day: number): Date {
  return new Date(day * DAY * 1000);
}

/** Whole days remaining until a unix-seconds deadline (0 when under a day, matching timeLeft). */
export function daysLeft(deadlineSec: number): number {
  const diff = deadlineSec - Math.floor(Date.now() / 1000);
  return diff <= 0 ? 0 : Math.floor(diff / DAY);
}

/** Human "5d 3h" / "4h 12m" / "expired" until a unix-seconds deadline. */
export function timeLeft(deadlineSec: number): string {
  let diff = deadlineSec - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "expired";
  const d = Math.floor(diff / DAY);
  diff -= d * DAY;
  const h = Math.floor(diff / 3600);
  diff -= h * 3600;
  const m = Math.floor(diff / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Has this address already logged a session for the current UTC day? */
export function loggedToday(pact: Pact): boolean {
  return pact.status === ACTIVE && pact.lastDay === todayIndex();
}

export function statusLabel(status: number): string {
  return status === ACTIVE ? "Active" : status === WON ? "Completed" : status === LOST ? "Forfeited" : "—";
}
