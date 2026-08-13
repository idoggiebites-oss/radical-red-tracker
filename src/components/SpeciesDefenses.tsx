import { defensiveProfile, formatMult, typeColor } from "../lib/effectiveness";

/** weak/resist/immune type chips for a species (+ defensive ability).
 *
 * Its own file rather than MonCard's, which imports the damage calc: the
 * Pokédex needs these chips and nothing else from that module, and taking
 * them from MonCard pulled the whole 484 kB engine chunk into the Reference
 * tab. Same trap as itemNames vs damagecalc — see CLAUDE.md. */
export function SpeciesDefenses({
  species,
  ability,
}: {
  species: string;
  ability?: string;
}) {
  const profile = defensiveProfile(species, ability);
  const entries = Object.entries(profile);
  if (entries.length === 0) return null;
  const groups: { label: string; test: (m: number) => boolean }[] = [
    { label: "Weak", test: (m) => m > 1 },
    { label: "Resist", test: (m) => m > 0 && m < 1 },
    { label: "Immune", test: (m) => m === 0 },
  ];
  return (
    <div className="mon-defenses">
      {groups.map(({ label, test }) => {
        const items = entries
          .filter(([, m]) => test(m))
          .sort(([, a], [, b]) => b - a);
        if (items.length === 0) return null;
        return (
          <div key={label} className="def-row">
            <span className="k">{label}</span>
            <span className="def-chips">
              {items.map(([t, m]) => (
                <span key={t} className="type-badge" style={{ background: typeColor(t) }}>
                  {t} {formatMult(m)}
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
