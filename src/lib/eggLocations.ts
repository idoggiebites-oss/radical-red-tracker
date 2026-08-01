import type { RouteGroup } from "./routeGroups";

/** Places that hold an egg but no wild encounter, so the docs' Locations
 * sheet never lists them and they have no entry in encounters.json. They are
 * still real nuzlocke encounters, so the Routes list synthesises a row for
 * each — and the save importer has to know about them too, or a Pokémon
 * hatched at one reads as "nowhere we recognise".
 *
 * Lives here rather than in RoutesView so both consumers share one list.
 */
export const EGG_LOCATIONS: { id: string; name: string }[] = [
  // id stays "…-tunnel" though the place is the Underground PATH: it keys
  // the run's encounter record, so renaming it would orphan any catch
  // already logged there
  { id: "egg-underground-tunnel", name: "UNDERGROUND PATH" },
  { id: "egg-rocket-hideout", name: "ROCKET HIDEOUT" },
  { id: "egg-saffron-city", name: "SAFFRON CITY" },
  { id: "egg-silph-co", name: "SILPH CO." },
  { id: "egg-indigo-plateau", name: "INDIGO PLATEAU" },
  { id: "egg-lavender-town", name: "LAVENDER TOWN" },
];

export const EGG_GROUPS: RouteGroup[] = EGG_LOCATIONS.map((e) => ({
  id: e.id,
  name: `${e.name} · EGG`,
  postgame: false,
  sections: [
    {
      label: null,
      loc: { id: e.id, name: `${e.name} · EGG`, postgame: false, methods: {} },
    },
  ],
}));
