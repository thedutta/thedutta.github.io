/* ============================================================
   Splitbaby — static configuration
   The single source of truth for who exists, which flat they
   belong to, and their UPI handle. Edit this file to add or
   retire a person; everything else derives from it.
   ============================================================ */

export const CURRENCY = "₹";          /* ₹ */
export const LOCALE    = "en-IN";
export const TZ_LABEL  = "IST";

export const FLATS = {
  b002: { id: "b002", label: "B002", name: "B002 Splitbaby" },
  b603: { id: "b603", label: "B603", name: "B603 Splitbaby" }
};

/* ------------------------------------------------------------
   PEOPLE — id is the Firestore document id, so it must never
   change once used. `kind` is "member" (lives in the flat) or
   "visitor" (a common guest of that flat).

   UPI: paste each person's VPA here. Empty string = no UPI
   button is offered for them; everything else still works.
   ------------------------------------------------------------ */
export const PEOPLE = [
  /* ---- B002 ---- */
  { id: "atharv", name: "Atharv", flat: "b002", kind: "member",  upi: "9027303467@kotakbank" },
  { id: "dutta",  name: "Dutta",  flat: "b002", kind: "member",  upi: "adityadutta2006@oksbi" },
  { id: "nikhil", name: "Nikhil", flat: "b002", kind: "member",  upi: "nikhil0608@icici" },
  { id: "zaid",   name: "Zaid",   flat: "b002", kind: "member",  upi: "zaidkhan250906-1@okhdfcbank" },
  { id: "jap",    name: "Jap",    flat: "b002", kind: "visitor", upi: "japneetk773@oksbi" },
  { id: "vagmi",  name: "Vagmi",  flat: "b002", kind: "visitor", upi: "vagmijain2006@okhdfcbank" },

  /* ---- B603 ---- */
  { id: "aryan",  name: "Aryan",  flat: "b603", kind: "member",  upi: "aryanjha.delhi@okhdfcbank" },
  { id: "kunsh",  name: "Kunsh",  flat: "b603", kind: "member",  upi: "kunshmhra@okhdfcbank" },
  { id: "vidip",  name: "Vidip",  flat: "b603", kind: "member",  upi: "gaur.vidip@okicici" },
  { id: "vidu",   name: "Vidu",   flat: "b603", kind: "member",  upi: "vidugaur07@okicici" },
  { id: "dipen",  name: "Dipen",  flat: "b603", kind: "visitor", upi: "sdipen208@okicici" }
];

/* ------------------------------------------------------------
   CATEGORIES — the icon is what makes a dense expense list
   readable at a glance, so every expense gets one.
   ------------------------------------------------------------ */
export const CATEGORIES = [
  { id: "groceries", label: "Groceries", icon: "\u{1F6D2}" },
  { id: "food",      label: "Food",      icon: "\u{1F354}" },
  { id: "water",     label: "Water can", icon: "\u{1F4A7}" },
  { id: "gas",       label: "Gas",       icon: "\u{1F525}" },
  { id: "rent",      label: "Rent",      icon: "\u{1F3E0}" },
  { id: "utilities", label: "Bills",     icon: "\u{1F4A1}" },
  { id: "internet",  label: "Internet",  icon: "\u{1F4F6}" },
  { id: "household", label: "Household", icon: "\u{1F9F9}" },
  { id: "travel",    label: "Travel",    icon: "\u{1F697}" },
  { id: "party",     label: "Party",     icon: "\u{1F389}" },
  { id: "medical",   label: "Medical",   icon: "\u{1F48A}" },
  { id: "other",     label: "Other",     icon: "\u{1F4E6}" }
];

export const DEFAULT_CATEGORY = "groceries";

/* Settlements are rendered with their own glyphs, not a category. */
export const SETTLE_ICON = "⇄";       /* ⇄ */
export const COVER_ICON  = "\u{1F91D}";    /* 🤝 */

/* Avatar tint per person — stable, derived from the id so a
   person keeps their colour everywhere (node, chip, bar). */
const SWATCHES = [
  "#4aa3ff", "#60f0b4", "#ffb86b", "#c792ea",
  "#ff8fa3", "#7ee3f5", "#f5e07e", "#9aa7ff",
  "#6be5a0", "#ff9f7e", "#b3a1ff"
];

/* ---- derived lookups ---------------------------------------- */

const BY_ID = new Map(PEOPLE.map(function (p) { return [p.id, p]; }));

PEOPLE.forEach(function (p, i) { p.color = SWATCHES[i % SWATCHES.length]; });

export function person(id) {
  return BY_ID.get(id) || null;
}

/* Never throws, never shows a raw id: unknown ids (a person
   deleted from config but still in old expenses) degrade to a
   readable placeholder so history stays legible. */
export function personName(id) {
  var p = BY_ID.get(id);
  return p ? p.name : (id ? "(" + id + ")" : "—");
}

export function personColor(id) {
  var p = BY_ID.get(id);
  return p ? p.color : "rgba(255,255,255,0.4)";
}

export function initial(id) {
  var p = BY_ID.get(id);
  return (p ? p.name : String(id || "?")).charAt(0).toUpperCase();
}

function sortByName(a, b) { return a.name.localeCompare(b.name, LOCALE); }

/* Alphabetical, as specified for the "acting as" selector. */
export function membersOf(flat) {
  return PEOPLE.filter(function (p) { return p.flat === flat && p.kind === "member"; }).sort(sortByName);
}

export function guestsOf(flat) {
  return PEOPLE.filter(function (p) { return p.flat === flat && p.kind === "visitor"; }).sort(sortByName);
}

export function peopleOf(flat) {
  return PEOPLE.filter(function (p) { return p.flat === flat; }).sort(sortByName);
}

export function otherFlat(flat) {
  return flat === "b002" ? "b603" : "b002";
}

export function category(id) {
  for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
  return { id: "other", label: "Other", icon: "\u{1F4E6}" };
}

/* ------------------------------------------------------------
   Runtime roster. Guests created from the add-expense screen
   live in Firestore, not in this file, but every lookup above
   must still resolve their name and colour — so data.js folds
   them into the same registry as it loads them.
   ------------------------------------------------------------ */
export function registerPerson(p) {
  if (!p || !p.id) return null;
  var existing = BY_ID.get(p.id);
  if (existing) {
    /* config wins on nothing: Firestore is the live truth for
       name/upi, so a later edit there shows up without a deploy */
    if (p.name) existing.name = p.name;
    if (p.flat) existing.flat = p.flat;
    if (p.kind) existing.kind = p.kind;
    if (typeof p.upi === "string") existing.upi = p.upi;
    if (typeof p.active === "boolean") existing.active = p.active;
    return existing;
  }
  var next = {
    id: p.id,
    name: p.name || p.id,
    flat: p.flat || "b002",
    kind: p.kind || "visitor",
    upi: p.upi || "",
    active: p.active !== false,
    color: SWATCHES[BY_ID.size % SWATCHES.length]
  };
  PEOPLE.push(next);
  BY_ID.set(next.id, next);
  return next;
}

/* Slug a typed-in guest name into a stable document id. */
export function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/* ------------------------------------------------------------
   Profile photos

   Square 480x480 JPEGs in splitbaby/avatars/<id>.jpg. PHOTOS
   lists who actually has one, so a missing face falls back to
   the tinted initial instead of firing off a 404 per render.
   Regenerated by the avatar build step.
   ------------------------------------------------------------ */
export const AVATAR_DIR = "../splitbaby/avatars/";

export const PHOTOS = ["atharv", "dutta", "jap", "kunsh", "nikhil", "vidu", "zaid"];

const PHOTO_SET = new Set(PHOTOS);

export function photoUrl(id) {
  return PHOTO_SET.has(id) ? AVATAR_DIR + id + ".jpg" : null;
}

export function isActive(id) {
  var p = BY_ID.get(id);
  return !p || p.active !== false;
}
