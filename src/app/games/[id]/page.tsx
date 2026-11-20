import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EVENT } from "@/lib/event";
import type { SoloGameId } from "@/lib/game/types";
import { SoloGameScreen } from "./solo-game";

export function generateStaticParams() {
  return EVENT.games.map((g) => ({ id: g.id }));
}

export async function generateMetadata({ params }: PageProps<"/games/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: EVENT.games.find((g) => g.id === id)?.name ?? "Game" };
}

export default function Page({ params }: PageProps<"/games/[id]">) {
  // Reading the URL inside Suspense keeps navigation between games instant.
  return (
    <Suspense fallback={<main className="party-stage flex-1" />}>
      <Game params={params} />
    </Suspense>
  );
}

async function Game({ params }: { params: PageProps<"/games/[id]">["params"] }) {
  const { id } = await params;
  if (!EVENT.games.some((g) => g.id === id)) notFound();
  return <SoloGameScreen id={id as SoloGameId} />;
}
