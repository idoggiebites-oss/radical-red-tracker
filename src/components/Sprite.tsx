import { useState } from "react";
import { spriteUrls } from "../lib/sprites";
import { knownSpriteIdx, rememberSpriteIdx } from "../lib/spriteResolve";

export function Sprite({ species, size = 40 }: { species: string; size?: number }) {
  const urls = spriteUrls(species);
  const start = knownSpriteIdx("s:" + species, urls.length);
  // track which species the fallback index belongs to, so a re-used
  // component slot retries from its remembered URL when the species changes
  const [state, setState] = useState({ species, srcIdx: start });
  const srcIdx = state.species === species ? state.srcIdx : start;
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
      onLoad={() => rememberSpriteIdx("s:" + species, srcIdx)}
      onError={() => setState({ species, srcIdx: srcIdx + 1 })}
    />
  );
}
