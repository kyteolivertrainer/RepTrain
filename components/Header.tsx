"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "./Logo";
import { ARCSCAN, switchToArc } from "@/lib/arcNetwork";

interface HeaderProps {
  account: string;
  balance: string;
  chainOk: boolean;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function Header({ account, balance, chainOk, connecting, onConnect, onDisconnect }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(10, 13, 11, 0.72)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "14px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <Logo size={26} />
          <span className="head" style={{ fontSize: 18 }}>
            Rep<span style={{ color: "var(--volt)" }}>Train</span>
          </span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
          {account ? (
            <>
              {!chainOk && (
                <button onClick={() => switchToArc().catch(() => {})} className="btn" style={{ borderRadius: 0, borderColor: "rgba(255,90,77,0.5)", color: "var(--bad)", padding: "9px 13px", fontSize: 13 }}>
                  Wrong network
                </button>
              )}
              <div style={{ position: "relative" }}>
                <button onClick={() => setOpen((o) => !o)} className="wallet-tag">
                  <span className="pin" style={{ background: chainOk ? "var(--volt)" : "var(--bad)" }} />
                  <span className="hdr-balance" style={{ color: "var(--muted)" }}>{balance || "0"} USDC</span>
                  <span className="hdr-div" style={{ width: 1, height: 13, background: "var(--line-2)" }} />
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{account.slice(0, 5)}…{account.slice(-4)}</span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease", opacity: 0.7 }}>
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" />
                  </svg>
                </button>

                {open && (
                  <>
                    <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
                    <div className="panel" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 61, minWidth: 232, overflow: "hidden", borderRadius: 0, boxShadow: "5px 6px 0 rgba(0,0,0,0.5)" }}>
                      <div style={{ padding: "13px 14px" }}>
                        <div className="label" style={{ marginBottom: 5 }}>Wallet</div>
                        <div className="num" style={{ fontSize: 13.5, color: "var(--ink)" }}>{account.slice(0, 13)}…{account.slice(-6)}</div>
                      </div>
                      <button className="menu-item" onClick={copy}>{copied ? "Copied ✓" : "Copy address"}</button>
                      <a className="menu-item" href={`${ARCSCAN}/address/${account}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>View on ArcScan ↗</a>
                      <button className="menu-item danger" onClick={() => { setOpen(false); onDisconnect(); }}>Disconnect</button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <button onClick={onConnect} disabled={connecting} className="btn btn--primary">
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
