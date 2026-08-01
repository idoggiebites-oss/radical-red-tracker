import { useState } from "react";
import { spriteUrls } from "../lib/sprites";
import { knownSpriteIdx, rememberSpriteIdx } from "../lib/spriteResolve";

/** `loading` defaults to eager because these files average under a kilobyte:
 * deferring one buys nothing, and lazily fetching it only once it nears the
 * viewport is what makes sprites visibly pop in mid-scroll. Pass "lazy" on
 * screens that render sprites by the hundred (the boss list) — there the
 * off-screen ones do crowd out the ones being looked at. */
export function Sprite({
  species,
  size = 40,
  loading = "eager",
}: {
  species: string;
  size?: number;
  loading?: "eager" | "lazy";
}) {
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
      loading={loading}
      // the boss list paints 600+ of these at once; async decoding keeps that
      // burst off the main thread instead of stalling the frame
      decoding="async"
      onLoad={() => rememberSpriteIdx("s:" + species, srcIdx)}
      onError={() => setState({ species, srcIdx: srcIdx + 1 })}
    />
  );
}
