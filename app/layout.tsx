import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepTrain — stake your streak, on ARC",
  description:
    "Put USDC behind your training. Open a pact, log a session a day on-chain, and reclaim your stake plus a bonus when you hit the goal. Miss it and your stake funds the people who finish. Built on ARC.",
  keywords: "RepTrain, ARC, USDC, fitness, streak, staking, accountability, web3, on-chain, training",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
