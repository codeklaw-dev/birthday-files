import type { StaticImageData } from "next/image";
import courtroom from "@/assets/party/courtroom.png";
import detectiveBrain from "@/assets/party/detective-brain.png";
import mysteryBox from "@/assets/party/mystery-box.png";
import opinionBubble from "@/assets/party/opinion-bubble.png";

/** Illustration for each game in EVENT.games, keyed by game id. */
export const GAME_ART: Record<string, { src: StaticImageData; alt: string }> = {
  imposter: { src: detectiveBrain, alt: "A detective brain with a magnifying glass" },
  trial: { src: courtroom, alt: "A judge's bench with a gavel and scales" },
  survey: { src: opinionBubble, alt: "A speech bubble that says Your opinion matters" },
  mystery: { src: mysteryBox, alt: "An open box with a question mark" },
};
