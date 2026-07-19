import typesJson from "../data/types.json";

const data = typesJson as {
  colors: Record<string, string>;
  species: Record<string, string[]>;
  abilities: Record<string, string[]>;
};

/** RR ability set (regular + hidden) for a docs species name */
export function abilitiesFor(species: string): string[] {
  return data.abilities[species] ?? [];
}

export function typesFor(species: string): string[] {
  return data.species[species] ?? [];
}

/** every species name known to the RR dex data, for pickers */
export const ALL_SPECIES: string[] = Object.keys(data.species).sort();

export function TypeBadges({ species, small }: { species: string; small?: boolean }) {
  const types = typesFor(species);
  if (types.length === 0) return null;
  return (
    <span className={small ? "type-badges small" : "type-badges"}>
      {types.map((t) => (
        <span key={t} className="type-badge" style={{ background: data.colors[t] }}>
          {t}
        </span>
      ))}
    </span>
  );
}
