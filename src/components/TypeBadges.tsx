import typesJson from "../data/types.json";

const data = typesJson as { colors: Record<string, string>; species: Record<string, string[]> };

export function typesFor(species: string): string[] {
  return data.species[species] ?? [];
}

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
