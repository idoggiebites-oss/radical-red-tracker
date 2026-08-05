import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import encountersJson from "../data/encounters.json";
import itemsJson from "../data/items.json";
import type {
  EncountersData,
  ItemEntry,
  ItemsData,
  RaidLocation,
  TmEntry,
} from "../types";
import { Sprite } from "../components/Sprite";
import { ItemSprite } from "../components/ItemSprite";
import { TypeBadges } from "../components/TypeBadges";

const items = itemsJson as unknown as ItemsData;
const data = encountersJson as unknown as EncountersData;

type RefTab =
  | "statics"
  | "gifts"
  | "trades"
  | "fossils"
  | "eggs"
  | "raids"
  | "tms"
  | "items"
  | "mysterygift"
  | "cheats";

const TABS: { id: RefTab; label: string }[] = [
  { id: "statics", label: "Statics & Legendaries" },
  { id: "gifts", label: "Gifts" },
  { id: "trades", label: "Trades" },
  { id: "fossils", label: "Fossils" },
  { id: "eggs", label: "Egg Vendor" },
  { id: "raids", label: "Raid Dens" },
  { id: "tms", label: "TMs & HMs" },
  { id: "items", label: "Items" },
  { id: "mysterygift", label: "Mystery Gifts" },
  { id: "cheats", label: "Cheat Codes" },
];

/** in-game NES-console codes (Pallet Town bedroom), player-confirmed
 * working on 4.1. Case-sensitive as shown. Mystery Gift codes live in
 * their own tab now — they're in the official docs, so they're imported
 * rather than hand-kept (see MysteryGifts below). */
const CHEAT_CODES: { code: string; effect: string }[] = [
  { code: "Woyaopp", effect: "Infinite Rare Candies & Pomeg Berries from a Youngster in Viridian City" },
  { code: "SO2Toxic", effect: "Unlocks free-item care packages throughout the run" },
  { code: "DexAll", effect: "DexNav immediately shows every possible Pokémon on the current route" },
  { code: "TeamPreview", effect: "See the opponent's full team at the start of every battle" },
  { code: "EZCatch", effect: "Every Poké Ball gets a 100% catch rate" },
];

/** Renders a long list a chunk at a time, growing as its sentinel scrolls
 * into view. Real windowing would need per-row heights the section/table
 * markup here doesn't hand us cheaply, and capping the *initial* render is
 * what actually costs on a phone (Items alone is 530 rows). Rows past the
 * cap aren't in the DOM, so find-in-page can't see them — the Filter box is
 * the search path. Re-observing on every reveal is deliberate:
 * IntersectionObserver only reports transitions, so a sentinel still in view
 * after a chunk lands would otherwise never fire again. The unbounded *top*
 * rootMargin is load-bearing for the same reason: a list with more content
 * below it (the Items tab's Mega Stones) can have its sentinel jumped clean
 * over, and ratio 0 → ratio 0 crosses no threshold, so a plain "800px"
 * margin never fires again and those rows stay unreachable however far you
 * scroll. Extending the root upward instead makes "sentinel is at or above
 * the fold" an intersecting state, which does fire. */
const ABOVE_FOLD = 1e6; // px of upward root expansion — effectively "any distance"
function Chunked<T>({
  items,
  step,
  resetKey,
  children,
}: {
  items: T[];
  step: number;
  resetKey: string;
  children: (visible: T[]) => ReactNode;
}) {
  const [shown, setShown] = useState(step);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => setShown(step), [resetKey, step]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setShown((n) => n + step);
      },
      { rootMargin: `${ABOVE_FOLD}px 0px 800px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [step, shown, items.length]);
  const hidden = items.length - shown;
  return (
    <>
      {children(hidden > 0 ? items.slice(0, shown) : items)}
      {hidden > 0 && <div ref={sentinel} className="chunk-sentinel" aria-hidden />}
    </>
  );
}

export function ReferenceView() {
  const [tab, setTab] = useState<RefTab>("statics");
  const [filter, setFilter] = useState("");
  // the input keeps the live value so typing never waits on the list render
  const q = useDeferredValue(filter).trim().toLowerCase();

  return (
    <div className="reference">
      <div className="toolbar">
        <div className="segmented">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="search"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {tab === "statics" && (
        <Chunked
          items={data.statics.filter(
            (s) =>
              !q ||
              s.species.toLowerCase().includes(q) ||
              s.info.toLowerCase().includes(q),
          )}
          step={40}
          resetKey={q}
        >
          {(rows) => (
            <table className="ref-table cols-statics">
              <tbody>
                {rows.map((s, i) => (
                  <tr key={i}>
                    <td className="cell-sprite">
                      <Sprite species={s.species} size={36} />
                    </td>
                    <td className="cell-species">{s.species}</td>
                    <td>
                      <TypeBadges species={s.species} small />
                    </td>
                    <td>{s.info}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Chunked>
      )}

      {tab === "gifts" && (
        <table className="ref-table">
          <tbody>
            {data.gifts
              .filter(
                (g) =>
                  !q ||
                  g.species.toLowerCase().includes(q) ||
                  g.location.toLowerCase().includes(q),
              )
              .map((g, i) => (
                <tr key={i}>
                  <td className="cell-sprite">
                    <Sprite species={g.species} size={36} />
                  </td>
                  <td className="cell-species">{g.species}</td>
                  <td className="muted">{g.location}</td>
                  <td>
                    {g.requirements} {g.info && <span className="muted">({g.info})</span>}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {tab === "trades" && (
        <table className="ref-table">
          <tbody>
            {data.trades
              .filter(
                (t) =>
                  !q ||
                  t.give.toLowerCase().includes(q) ||
                  t.receive.toLowerCase().includes(q),
              )
              .map((t, i) => (
                <tr key={i}>
                  <td className="cell-sprite">
                    <Sprite species={t.give} size={36} />
                  </td>
                  <td>
                    Give <strong>{t.give}</strong>
                  </td>
                  <td className="cell-sprite">
                    <Sprite species={t.receive} size={36} />
                  </td>
                  <td>
                    Receive <strong>{t.receive}</strong>
                  </td>
                  <td className="muted">{t.location}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {tab === "fossils" && <SpeciesColumns groups={data.fossils} q={q} />}
      {tab === "eggs" && <SpeciesColumns groups={data.eggVendor} q={q} />}
      {tab === "raids" && <Raids raids={data.raids} q={q} />}
      {tab === "tms" && <TmList q={q} />}
      {tab === "items" && <ItemList q={q} />}
      {tab === "mysterygift" && <MysteryGifts q={q} />}
      {tab === "cheats" && <CheatCodes q={q} />}
    </div>
  );
}

/** New Game Plus Mystery Gift codes.
 *
 * Hand-kept, unlike the legendary codes above: these aren't on the docs'
 * Mystery Gifts tab (checked — that tab holds only the 19 legendaries), so
 * the importer has nothing to read. Supplied by the player from the game's
 * own listing. If they ever land in the sheet, move them to
 * scripts/import_data.py and delete this. */
const NG_PLUS_NOTE =
  "These require New Game Plus. Start a New Game from the title screen while " +
  "your previous save data has at least one Hall Of Fame entry. New Game Plus " +
  "won't be enabled in a new save file if the previous save had it enabled but " +
  "never entered the Hall Of Fame.";

const NG_PLUS_TYPES = [
  "Normal", "Fire", "Water", "Grass", "Electric", "Flying", "Fighting", "Bug",
  "Poison", "Rock", "Ground", "Psychic", "Ghost", "Ice", "Dragon", "Dark",
  "Steel", "Fairy",
];

const NG_PLUS_CODES: {
  code: string;
  text: string;
  /** rendered as chips under the description */
  list?: string[];
  listLabel?: string;
}[] = [
  {
    code: "Seviian",
    text: "One of each of these Pokémon's Sevii forms at Lv. 5.",
    listLabel: "Sevii forms of",
    list: ["Doduo", "Mantyke", "Teddiursa", "Feebas", "Carnivine", "Blitzle",
           "Clauncher", "Noibat", "Dhelmise", "Wishiwashi", "Sizzlipede", "Nymble"],
  },
  {
    code: "Random6",
    text: "Six random unevolved Pokémon to build a team with (Metapod and " +
      "Kakuna are an exception). No duplicates, except a regional form of " +
      "one you already rolled.",
  },
  {
    code: "<type>",
    text: "Type-specific Random6: six random unevolved or single-stage " +
      "Pokémon of that type. Only ONE of these 18 may be redeemed per save file.",
    listLabel: "one of",
    list: NG_PLUS_TYPES,
  },
  {
    code: "Puzzle",
    text: "Completes the Puzzle Battles in Viridian City's School (Pokévial), " +
      "Cerulean City (Move Relearner) and Fuchsia City (Egg Move Tutor).",
  },
  {
    code: "Mega",
    text: "One of each Mega Stone, plus the ability to Mega Evolve before " +
      "obtaining the Mega Ring. Needs the first three badges to redeem.",
  },
];

/** Mystery Gift codes from the docs' own tab — legendaries redeemed at the
 * red Nurse rather than caught, so they sit in Reference beside the cheat
 * codes instead of anywhere in a run's encounter list. */
function MysteryGifts({ q }: { q: string }) {
  const { notes, codes } = data.mysteryGift ?? { notes: [], codes: [] };
  const rows = codes.filter(
    (c) =>
      !q ||
      c.species.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.info.toLowerCase().includes(q),
  );
  const ngRows = NG_PLUS_CODES.filter(
    (c) =>
      !q ||
      c.code.toLowerCase().includes(q) ||
      c.text.toLowerCase().includes(q) ||
      (c.list ?? []).some((n) => n.toLowerCase().includes(q)),
  );
  return (
    <div className="mystery-gifts">
      {notes.length > 0 && (
        <ul className="raid-info mystery-gift-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <table className="ref-table">
        <tbody>
          {rows.map((c) => (
            <tr key={c.code}>
              <td className="cell-sprite">
                <Sprite species={c.species} size={36} />
              </td>
              <td className="cell-species">{c.species}</td>
              <td>
                <TypeBadges species={c.species} small />
              </td>
              <td className="mystery-gift-code">{c.code}</td>
              <td className="muted">{c.info}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">No Mystery Gifts match.</p>}

      <h3 className="ng-plus-head">New Game Plus codes</h3>
      <p className="muted mystery-gift-notes">{NG_PLUS_NOTE}</p>
      <table className="ref-table">
        <tbody>
          {ngRows.map((c) => (
            <tr key={c.code}>
              <td className="mystery-gift-code">{c.code}</td>
              <td>
                {c.text}
                {c.list && (
                  <div className="ng-plus-list">
                    <span className="muted">{c.listLabel}:</span>{" "}
                    {c.list.map((n) => (
                      <span key={n} className="ng-plus-chip">
                        {n}
                      </span>
                    ))}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ngRows.length === 0 && <p className="muted">No New Game Plus codes match.</p>}
    </div>
  );
}

function CheatCodes({ q }: { q: string }) {
  const rows = CHEAT_CODES.filter(
    (c) => c.code.toLowerCase().includes(q) || c.effect.toLowerCase().includes(q),
  );
  return (
    <div className="cheat-codes">
      <p className="muted cheat-codes-note">
        Talk to the NES console in your bedroom in Pallet Town and enter one
        of these — codes are case-sensitive, exactly as shown.
      </p>
      <table className="ref-table">
        <tbody>
          {rows.map((c) => (
            <tr key={c.code}>
              <td className="cheat-code">{c.code}</td>
              <td>{c.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TmList({ q }: { q: string }) {
  const match = (t: TmEntry) =>
    !q ||
    t.move.toLowerCase().includes(q) ||
    t.location.toLowerCase().includes(q) ||
    t.num.includes(q);
  const groups: { label: string; kind: string; list: TmEntry[] }[] = [
    { label: "TMs", kind: "TM", list: items.tms.filter(match) },
    { label: "HMs", kind: "HM", list: items.hms.filter(match) },
  ];
  return (
    <div className="tm-list">
      {groups.map(({ label, kind, list }) => (
        <section key={kind}>
          <h3>
            {label} <span className="count">({list.length})</span>
          </h3>
          <table className="ref-table">
            <tbody>
              {list.map((t) => (
                <tr key={kind + t.num}>
                  <td className="tm-num">
                    {kind}
                    {t.num}
                  </td>
                  <td className="tm-move">{t.move}</td>
                  <td>
                    {t.location}
                    {t.notes.map((n) => (
                      <div key={n} className="tm-note">
                        {n}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function ItemList({ q }: { q: string }) {
  const match = (i: ItemEntry) =>
    !q || i.name.toLowerCase().includes(q) || i.location.toLowerCase().includes(q);
  const specials: { label: string; list: ItemEntry[] }[] = [
    { label: "Mega Stones", list: items.megaStones.filter(match) },
    { label: "Z-Crystals", list: items.zCrystals.filter(match) },
  ];
  const areas = items.overworld
    .map((a) => ({
      area: a.area,
      items: a.items.filter(
        (i) => match(i) || a.area.toLowerCase().includes(q),
      ),
    }))
    .filter((a) => a.items.length > 0);
  return (
    <div className="item-list">
      {specials.map(
        ({ label, list }) =>
          list.length > 0 && (
            <section key={label}>
              <h3>
                {label} <span className="count">({list.length})</span>
              </h3>
              <Chunked items={list} step={24} resetKey={q}>
                {(rows) => (
                  <table className="ref-table cols-items">
                    <tbody>
                      {rows.map((i, idx) => (
                        <tr key={idx}>
                          <td className="cell-item-sprite">
                            <ItemSprite name={i.name} />
                          </td>
                          <td className="tm-move">{i.name}</td>
                          <td>{i.location}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Chunked>
            </section>
          ),
      )}
      <section>
        <h3>Overworld Items</h3>
        <Chunked items={areas} step={10} resetKey={q}>
          {(shownAreas) =>
            shownAreas.map((a) => (
              <div key={a.area} className="item-area">
                <h4>{a.area}</h4>
                <table className="ref-table">
                  <tbody>
                    {a.items.map((i, idx) => (
                      <tr key={idx}>
                        <td className="cell-item-sprite">
                          <ItemSprite name={i.name} />
                        </td>
                        <td className="tm-move">{i.name}</td>
                        <td>{i.location}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          }
        </Chunked>
        {areas.length === 0 && <p className="muted">No items match.</p>}
      </section>
    </div>
  );
}

function Raids({ raids, q }: { raids: EncountersData["raids"]; q: string }) {
  const [showInfo, setShowInfo] = useState(false);
  const locations = raids.locations.filter(
    (l) =>
      !q ||
      l.location.toLowerCase().includes(q) ||
      l.dens.some(
        (d) =>
          d.species.toLowerCase().includes(q) ||
          d.drops.some((dr) => dr.item.toLowerCase().includes(q)),
      ),
  );
  return (
    <div className="raids">
      <button className="raid-info-toggle" onClick={() => setShowInfo(!showInfo)}>
        {showInfo ? "▾" : "▸"} How raid difficulty scales with badges
      </button>
      {showInfo && (
        <ul className="raid-info">
          {raids.info.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <Chunked items={locations} step={10} resetKey={q}>
        {(shown) =>
          shown.map((loc, i) => <RaidLocationCard key={i} loc={loc} q={q} />)
        }
      </Chunked>
      {locations.length === 0 && <p className="muted">No raid dens match.</p>}
    </div>
  );
}

function RaidLocationCard({ loc, q }: { loc: RaidLocation; q: string }) {
  const [openDen, setOpenDen] = useState<number | null>(null);
  const den = openDen !== null ? loc.dens[openDen] : null;
  return (
    <div className="raid-card">
      <div className="raid-head">
        <span className="raid-loc">{loc.location}</span>
        <span className="raid-stars">{"★".repeat(loc.stars)}</span>
      </div>
      <div className="raid-dens">
        {loc.dens.map((d, i) => (
          <button
            key={i}
            className={
              "raid-den" +
              (openDen === i ? " active" : "") +
              (q && d.species.toLowerCase().includes(q) ? " hit" : "")
            }
            onClick={() => setOpenDen(openDen === i ? null : i)}
          >
            <Sprite species={d.species} size={32} />
            {d.species}
            <TypeBadges species={d.species} small />
          </button>
        ))}
      </div>
      {den && (
        <table className="raid-drops">
          <tbody>
            {den.drops.map((d, i) => (
              <tr key={i}>
                <td className="cell-item-sprite">
                  <ItemSprite name={d.item} />
                </td>
                <td>{d.item}</td>
                <td className="cell-rarity">{d.rarity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SpeciesColumns({ groups, q }: { groups: Record<string, string[]>; q: string }) {
  return (
    <div className="species-columns">
      {Object.entries(groups).map(([label, species]) => (
        <div key={label} className="species-column">
          <h4>{label}</h4>
          {species
            .filter((s) => !q || s.toLowerCase().includes(q))
            .map((s) => (
              <div key={s} className="species-line">
                <Sprite species={s} size={30} /> {s}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
