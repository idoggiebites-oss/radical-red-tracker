import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
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
  Run,
  TmEntry,
} from "../types";
import { Sprite } from "../components/Sprite";
import { ItemSprite } from "../components/ItemSprite";
import { TypeBadges } from "../components/TypeBadges";
import { SpeciesDefenses } from "../components/SpeciesDefenses";
import { STAT_KEYS, evolutionsFor } from "../lib/effectiveness";
import {
  DEX_ENTRIES,
  abilitiesFor,
  abilityRollFor,
  bossesFor,
  bossIndexReady,
  catchSpotsFor,
  dexCaveats,
  loadBossIndex,
  type DexEntry,
} from "../lib/dex";
import {
  learnsetFor,
  learnsetsReady,
  loadLearnsets,
} from "../lib/learnsets";

const items = itemsJson as unknown as ItemsData;
const data = encountersJson as unknown as EncountersData;

type RefTab =
  | "pokedex"
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
  { id: "pokedex", label: "Pokédex" },
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

export function ReferenceView({ run }: { run?: Run | null }) {
  const [tab, setTab] = useState<RefTab>("pokedex");
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

      {tab === "pokedex" && <Pokedex q={q} run={run ?? null} />}

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
/** every species, with what this run actually does to it. Abilities are the
 * whole point: with a save imported we replay the game's own ability hash, so
 * a randomized run sees its real abilities dex-wide rather than the defaults
 * (see lib/dex.ts). Rows expand in place, the same shape as the Team tab's
 * collapsed sections, so one Pokémon can be read without losing the list. */
function Pokedex({ q, run }: { q: string; run: Run | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const roll = useMemo(() => abilityRollFor(run), [run]);
  const caveats = useMemo(() => dexCaveats(run), [run]);

  // the boss index and the learnset table are big lazy chunks (602 kB and
  // 415 kB) and only the EXPANDED entry needs either, so they're fetched on
  // the first expand rather than on mount — otherwise every visit to
  // Reference pays for them just to read the Items list
  const [extrasReady, setExtrasReady] = useState(
    () => bossIndexReady() && learnsetsReady(),
  );
  const [extrasFailed, setExtrasFailed] = useState(false);
  useEffect(() => {
    if (extrasReady || !open) return;
    let live = true;
    Promise.all([loadBossIndex(), loadLearnsets()]).then(
      () => live && setExtrasReady(true),
      // only a reload recovers a failed chunk import (see learnsets.ts), so
      // say so instead of showing "Loading…" for ever
      () => live && setExtrasFailed(true),
    );
    return () => {
      live = false;
    };
  }, [extrasReady, open]);

  // matches the name, a type or an ability — so "Levitate" or "Ghost" find
  // everything that has it, which is the reverse lookup the docs can't do
  const rows = useMemo(() => {
    if (!q) return DEX_ENTRIES;
    return DEX_ENTRIES.filter(
      (e) =>
        e.species.toLowerCase().includes(q) ||
        e.types.some((t) => t.toLowerCase().includes(q)) ||
        abilitiesFor(e, roll).some(
          (a) =>
            a.actual.toLowerCase().includes(q) || a.base.toLowerCase().includes(q),
        ),
    );
  }, [q, roll]);

  return (
    <>
      <p className="muted dex-note">
        {roll
          ? "Abilities are this run's own — recomputed from your save's trainer ID, the same way the game does it."
          : "Abilities are the dex's defaults. Import a save on a run with the ability randomizer on to see that run's real ones."}
      </p>
      {caveats.map((c) => (
        <p key={c} className="muted dex-note">
          Note: {c}.
        </p>
      ))}
      {rows.length === 0 && <p className="muted">No Pokémon matches that.</p>}
      <Chunked items={rows} step={40} resetKey={q}>
        {(visible) => (
          <table className="ref-table dex-table">
            <tbody>
              {visible.map((e) => {
                const isOpen = open === e.species;
                return (
                  <Fragment key={e.species}>
                    <tr
                      className={isOpen ? "mini-row open" : "mini-row"}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : e.species)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          setOpen(isOpen ? null : e.species);
                        }
                      }}
                    >
                      <td className="cell-chev">{isOpen ? "▾" : "▸"}</td>
                      <td className="cell-sprite">
                        <Sprite species={e.species} size={36} />
                      </td>
                      <td className="cell-species">{e.species}</td>
                      <td className="cell-types">
                        <TypeBadges species={e.species} small />
                      </td>
                      <td className="cell-abils muted">
                        {abilitiesFor(e, roll)
                          .map((a) => a.actual)
                          .join(" · ")}
                      </td>
                      <td className="cell-bst muted">{e.bst || ""}</td>
                    </tr>
                    {isOpen && (
                      <tr className="mini-row-card">
                        <td colSpan={6}>
                          <DexDetail
                            entry={e}
                            roll={roll}
                            ready={extrasReady}
                            failed={extrasFailed}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </Chunked>
    </>
  );
}

const SLOT_LABELS = ["Ability 1", "Ability 2", "Hidden"];

function DexDetail({
  entry,
  roll,
  ready,
  failed,
}: {
  entry: DexEntry;
  roll: ReturnType<typeof abilityRollFor>;
  ready: boolean;
  /** the boss/learnset chunks didn't load; a reload is the only fix */
  failed: boolean;
}) {
  const abilities = abilitiesFor(entry, roll);
  const evolutions = evolutionsFor(entry.species);
  const spots = catchSpotsFor(entry.species);
  const bosses = ready ? bossesFor(entry.species) : [];
  const moves = ready ? learnsetFor(entry.species) : null;

  return (
    <div className="dex-detail">
      <section className="dex-block">
        <h4>Abilities</h4>
        <ul className="dex-abils">
          {abilities.map((a) => (
            <li key={a.slot}>
              <span className="dex-slot muted">{SLOT_LABELS[a.slot] ?? "Ability"}</span>
              {a.actual !== a.base ? (
                <>
                  <span className="dex-was muted">{a.base}</span>
                  <span className="dex-arrow muted">→</span>
                  <strong>{a.actual}</strong>
                </>
              ) : (
                <strong>{a.base}</strong>
              )}
            </li>
          ))}
          {abilities.length === 0 && <li className="muted">None recorded.</li>}
        </ul>
      </section>

      <section className="dex-block">
        <h4>Base stats</h4>
        {/* the row's own type column is hidden on a phone, so this is where
            the typing is readable there */}
        <TypeBadges species={entry.species} small />
        <table className="stat-table">
          <thead>
            <tr>
              {STAT_KEYS.map((s) => (
                <th key={s}>{s}</th>
              ))}
              <th>BST</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {STAT_KEYS.map((s) => (
                <td key={s}>{entry.stats[s] ?? "–"}</td>
              ))}
              <td>{entry.bst || "–"}</td>
            </tr>
          </tbody>
        </table>
        <SpeciesDefenses species={entry.species} />
      </section>

      {evolutions.length > 0 && (
        <section className="dex-block">
          <h4>Evolves</h4>
          <ul className="dex-list">
            {evolutions.map((ev) => (
              <li key={ev.to + ev.how}>
                <Sprite species={ev.to} size={24} /> {ev.to}{" "}
                <span className="muted">{ev.how}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="dex-block">
        <h4>
          Where to catch it <span className="count muted">({spots.length})</span>
        </h4>
        {spots.length === 0 ? (
          <p className="muted">Not obtainable in the wild — evolve or trade for it.</p>
        ) : (
          <ul className="dex-list">
            {spots.map((s, i) => (
              <li key={i}>
                <strong>{s.where}</strong> <span className="muted">{s.method}</span>{" "}
                <span className="muted">{s.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dex-block">
        <h4>
          Bosses running it{" "}
          {ready && <span className="count muted">({bosses.length})</span>}
        </h4>
        {!ready ? (
          <p className="muted">{failed ? "Couldn't load — reload the page." : "Loading…"}</p>
        ) : bosses.length === 0 ? (
          <p className="muted">No boss brings this one.</p>
        ) : (
          <ul className="dex-list">
            {bosses.map((b, i) => (
              <li key={i}>
                <strong>{b.title}</strong>{" "}
                <span className="muted">
                  {b.mode} · {b.category} · Lv {b.level}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dex-block dex-moves">
        <h4>Learnset</h4>
        {!moves ? (
          <p className="muted">{failed ? "Couldn't load — reload the page." : "Loading…"}</p>
        ) : (
          <div className="dex-move-groups">
            <div>
              <h5>By level</h5>
              <ul className="dex-list">
                {moves.level.map((m) => (
                  <li key={m.move}>
                    <span className="dex-lv muted">Lv {m.level}</span> {m.move}
                  </li>
                ))}
                {moves.level.length === 0 && <li className="muted">None.</li>}
              </ul>
            </div>
            <div>
              <h5>TMs &amp; HMs</h5>
              <ul className="dex-list">
                {moves.hm.map((m) => (
                  <li key={"hm" + m.move}>
                    <span className="dex-lv muted">
                      HM {String(m.num).padStart(2, "0")}
                    </span>{" "}
                    {m.move}
                  </li>
                ))}
                {moves.tm.map((m) => (
                  <li key={"tm" + m.move}>
                    <span className="dex-lv muted">
                      TM {String(m.num).padStart(3, "0")}
                    </span>{" "}
                    {m.move}
                  </li>
                ))}
                {moves.tm.length + moves.hm.length === 0 && (
                  <li className="muted">None.</li>
                )}
              </ul>
            </div>
            <div>
              <h5>Tutor</h5>
              <ul className="dex-list">
                {moves.tutor.map((m) => (
                  <li key={m}>{m}</li>
                ))}
                {moves.tutor.length === 0 && <li className="muted">None.</li>}
              </ul>
            </div>
            <div>
              <h5>Egg</h5>
              <ul className="dex-list">
                {moves.egg.map((m) => (
                  <li key={m}>{m}</li>
                ))}
                {moves.egg.length === 0 && <li className="muted">None.</li>}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

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
