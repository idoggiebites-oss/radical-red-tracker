import { useState } from "react";
import { spriteUrls } from "../lib/sprites";

export function Sprite({ species, size = 40 }: { species: string; size?: number }) {
  // track which species the fallback index belongs to, so a re-used
  // component slot retries from the first URL when its species changes
  const [state, setState] = useState({ species, srcIdx: 0 });
  const srcIdx = state.species === species ? state.srcIdx : 0;
  const urls = spriteUrls(species);
  if (srcIdx >= urls.length)
    return <span className="sprite-fallback" style={{ width: size, height: size }} />;
  return (
    <img
      className="sprite"
      src={urls[srcIdx]}
      alt={species}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setState({ species, srcIdx: srcIdx + 1 })}
    />
  );
}
