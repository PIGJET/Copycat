import type { ButtonHTMLAttributes, ReactNode } from "react";

export function ArcadeButton({ children, secondary = false, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return <button className={`${secondary ? "ui-secondary" : "ui-primary"} ${className}`.trim()} {...props}>{children}</button>;
}

export function GameHeader({ title, label, round, rounds = 1, mode = "QUICK GAME", onMenu }: { title: string; label?: string; round?: number; rounds?: number; mode?: string; onMenu?: () => void }) {
  return <><div className="game-nav"><ArcadeButton secondary onClick={onMenu}>MENU</ArcadeButton><div className="round-meta"><span>{mode}</span><span>ROUND {round ?? 1} / {rounds}</span><span className="demo-tag">UI DEMO</span></div></div><header className="game-heading">{label && <div className="phase-label">{label}</div>}<h2 tabIndex={-1}>{title}</h2></header></>;
}

export function PosePlaceholder({ className = "pose-outline" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 180 240" aria-hidden="true"><path d="M70 22h40v40H70zM60 82h60v65H60zM60 89l-33 44-15-11 31-50zM120 89l33 44 15-11-31-50zM65 146h22l-13 72H48zM93 146h22l17 72h-26z" fill="currentColor"/><path d="M6 30V6h26m116 0h26v24M6 210v24h26m116 0h26v-24" fill="none" stroke="currentColor" strokeWidth="3"/></svg>;
}

export function PlayerAvatar({ player, className = "identity-avatar" }: { player: { avatar?: string }; className?: string }) {
  const color = player.avatar === "frog" ? "#81ce45" : player.avatar === "robot" ? "#73d9e9" : player.avatar === "rabbit" ? "#f9e9f6" : "#ffcb65";
  return <span className={className}><svg viewBox="0 -12 72 88" aria-hidden="true" shapeRendering="crispEdges"><path d="M10 22V4h12l10 14h8L50 4h12v26M14 22h44v6h6v28h-6v8H14v-8H8V28z" fill={color}/><path d="M21 33h6v8h-6zm24 0h6v8h-6zm-12 11h6v5h-6zm-6 9h18v4H27z" fill="#251b31"/></svg></span>;
}

export function PageFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`arcade ${className}`}><div className="stars" aria-hidden="true"/><div className="game-screen">{children}</div><div className="floor" aria-hidden="true"/></main>;
}
