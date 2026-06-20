"use client";

import { ethers } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";
import { ensureDiscovered, pickDetail, pickProvider, setChosenRdns, type Eip1193Provider } from "./wallet";
import { ARC_CHAIN_HEX, ARC_RPC, switchToArc } from "./arcNetwork";

// Flag we set when the user explicitly walks away from the session. Stored under
// the same "reptrain/v1" namespace the wallet module uses for its pinned choice,
// so a wipe of one matching prefix clears both.
const SESSION_NS = "reptrain/v1";
const SEVERED_FLAG = `${SESSION_NS}:session-severed`;
const SEVERED_ON = "1";

/**
 * Single source of truth for wallet state. Discovers wallets via EIP-6963
 * (Rabby first), pins the chosen one, and binds account/chain listeners to the
 * exact provider in use — re-subscribing whenever connect() picks a (possibly
 * different) wallet. Supports an explicit disconnect that survives reloads.
 */
export function useWallet() {
  const [account, setAccount] = useState("");
  const [balance, setBalance] = useState("");
  const [chainOk, setChainOk] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const disconnectedRef = useRef(false);
  const subRef = useRef<{ provider: Eip1193Provider; cleanup: () => void } | null>(null);

  const refreshBalance = useCallback(async (addr: string) => {
    try {
      const p = new ethers.JsonRpcProvider(ARC_RPC);
      const b = await p.getBalance(addr);
      setBalance(parseFloat(ethers.formatEther(b)).toFixed(3));
    } catch {
      setBalance("—");
    }
  }, []);

  // Bind events to a specific provider, idempotently (detach any previous one).
  const subscribe = useCallback(
    (inj: Eip1193Provider) => {
      if (!inj?.on) return;
      if (subRef.current?.provider === inj) return;
      subRef.current?.cleanup();
      const onAcc = (a: unknown) => {
        if (disconnectedRef.current) return;
        const list = a as string[];
        if (list.length) {
          setAccount(list[0]);
          refreshBalance(list[0]);
        } else {
          setAccount("");
          setBalance("");
          setChainOk(false);
        }
      };
      const onChain = (c: unknown) =>
        setChainOk((c as string).toLowerCase() === ARC_CHAIN_HEX.toLowerCase());
      inj.on("accountsChanged", onAcc);
      inj.on("chainChanged", onChain);
      subRef.current = {
        provider: inj,
        cleanup: () => {
          inj.removeListener?.("accountsChanged", onAcc);
          inj.removeListener?.("chainChanged", onChain);
        },
      };
    },
    [refreshBalance]
  );

  const connect = useCallback(async () => {
    disconnectedRef.current = false;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(SEVERED_FLAG);
      } catch {
        /* ignore */
      }
    }
    await ensureDiscovered();
    const detail = pickDetail();
    const inj = detail?.provider;
    if (!inj) return;
    setChosenRdns(detail.rdns);
    setConnecting(true);
    try {
      const accs = (await inj.request({ method: "eth_requestAccounts" })) as string[];
      if (!accs?.length) return;
      setAccount(accs[0]);
      subscribe(inj); // listen to the wallet we actually connected to
      try {
        await switchToArc(inj);
      } catch {
        /* user declined the network switch — still finish connecting */
      }
      try {
        const id = (await inj.request({ method: "eth_chainId" })) as string;
        setChainOk(id.toLowerCase() === ARC_CHAIN_HEX.toLowerCase());
      } catch {
        setChainOk(false);
      }
      refreshBalance(accs[0]);
    } catch {
      /* user rejected the connection */
    } finally {
      setConnecting(false);
    }
  }, [refreshBalance, subscribe]);

  const disconnect = useCallback(() => {
    disconnectedRef.current = true;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(SEVERED_FLAG, SEVERED_ON);
      } catch {
        /* ignore */
      }
    }
    setAccount("");
    setBalance("");
    setChainOk(false);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(SEVERED_FLAG) === SEVERED_ON) {
      disconnectedRef.current = true;
    }
    (async () => {
      await ensureDiscovered();
      const inj = pickProvider();
      if (!inj) return;
      if (!disconnectedRef.current) {
        try {
          const accs = (await inj.request({ method: "eth_accounts" })) as string[];
          if (accs.length) {
            setAccount(accs[0]);
            refreshBalance(accs[0]);
            inj
              .request({ method: "eth_chainId" })
              .then((id) => setChainOk((id as string).toLowerCase() === ARC_CHAIN_HEX.toLowerCase()))
              .catch(() => {});
          }
        } catch {
          /* ignore */
        }
      }
      subscribe(inj);
    })();
    return () => {
      subRef.current?.cleanup();
      subRef.current = null;
    };
  }, [refreshBalance, subscribe]);

  return { account, balance, chainOk, connecting, connect, disconnect, refreshBalance };
}
