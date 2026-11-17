import type { ReactNode } from "react";

/**
 * The TV is designed for a 1920×1080 stage. Sizing the root font from the
 * 16:9 frame keeps every scene in proportion on a 720p TV, a 4K TV or the
 * dashboard's small preview.
 */
export default function DisplayLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{`html{font-size:max(9px,calc(min(1dvh,0.5625vw)*1.48))}`}</style>
      {children}
    </>
  );
}
