import type { ReactNode } from "react";

export type Player = { id: string | number; name: string; avatar?: string; color?: string };
export type Score = { total: number | null; arms?: number | null; legs?: number | null; torso?: number | null; timing?: number | null };
export type Ranking = { player: Player; average: number | null; attempts?: number };
export type PageFrameProps = { children: ReactNode; className?: string };
