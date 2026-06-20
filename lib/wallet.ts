// ---------------------------------------------------------------------------
// EIP-6963 provider discovery for RepTrain.
//
// With a stack of injected wallets installed (Rabby, MetaMask, OKX, Phantom…)
// every one of them grabs at window.ethereum, and whichever lands last wins —
// so requests silently go to the wrong place. EIP-6963 flips that around: each
// wallet *announces* itself on an event, and we keep a roster. From the roster
// we pin one provider (Rabby leads) and route every read, write and event
// subscription through that exact instance.
// ---------------------------------------------------------------------------

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isRabby?: boolean;
  isMetaMask?: boolean;
}

interface ProviderDetail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
}

// Wallets we reach for first, in order, when nothing is pinned yet.
const PREFERENCE = ["io.rabby", "io.metamask"];

// Persisted-selection key. Built from a namespace + slot so the two RepTrain
// localStorage entries share one derivation rule instead of being typed out.
const NS = "reptrain/v1";
const slotKey = (slot: string) => `${NS}:${slot}`;
const PINNED_WALLET_SLOT = slotKey("pinned-rdns");

// The live roster of announced providers.
const roster: ProviderDetail[] = [];

function upsert(detail?: ProviderDetail) {
  if (!detail?.info?.rdns || !detail.provider) return;
  const at = roster.findIndex((d) => d.info.rdns === detail.info.rdns);
  if (at === -1) roster.push(detail);
  else roster[at] = detail;
}

// Kick off discovery as soon as this module loads in the browser.
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e: Event) => {
    upsert((e as CustomEvent<ProviderDetail>).detail);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

// --- pinned-choice persistence ---------------------------------------------

export function setChosenRdns(rdns: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PINNED_WALLET_SLOT, rdns);
  } catch {
    /* ignore */
  }
}

export function getChosenRdns(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(PINNED_WALLET_SLOT) || "";
  } catch {
    return "";
  }
}

// --- re-announce helpers ----------------------------------------------------

export function refreshWallets() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function listWallets() {
  refreshWallets();
  return roster.map((d) => ({ name: d.info.name, rdns: d.info.rdns, icon: d.info.icon }));
}

/** Resolve once at least one wallet has announced (or a short timeout). */
export function ensureDiscovered(timeoutMs = 250): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (roster.length) {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve();
    };
    const onAnnounce = () => finish();
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(finish, timeoutMs);
  });
}

// --- provider selection -----------------------------------------------------

/** Best matching provider detail — pinned choice, then preference, then any. */
export function pickDetail(rdns?: string): { provider: Eip1193Provider; rdns: string } | undefined {
  refreshWallets();
  const want = rdns ?? getChosenRdns();
  if (want) {
    const hit = roster.find((d) => d.info.rdns === want);
    if (hit) return { provider: hit.provider, rdns: hit.info.rdns };
  }
  for (const pref of PREFERENCE) {
    const hit = roster.find((d) => d.info.rdns === pref);
    if (hit) return { provider: hit.provider, rdns: hit.info.rdns };
  }
  if (roster[0]) return { provider: roster[0].provider, rdns: roster[0].info.rdns };
  return undefined;
}

/** Best injected provider. Defaults to the pinned wallet, then Rabby/MetaMask. */
export function pickProvider(rdns?: string): Eip1193Provider | undefined {
  const d = pickDetail(rdns);
  if (d) return d.provider;
  return typeof window !== "undefined" ? (window.ethereum as Eip1193Provider | undefined) : undefined;
}
