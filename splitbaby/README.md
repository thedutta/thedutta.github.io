# Splitbaby

Shared expense ledger for flats **B002** and **B603**, replacing Splitwise (whose
free tier caps how many expenses you can log a month). Two installable web apps,
**one** Firestore ledger, no build step.

```
/b002splitbaby/     Atharv, Dutta, Nikhil, Zaid   (+ guests Jap, Vagmi)
/b603splitbaby/     Aryan, Kunsh, Vidip, Vidu     (+ guest Dipen)
/splitbaby/         the shared engine both sites load
```

Neither site is linked from anywhere else on thedutta.github.io, and both carry
`robots: noindex`. They are reachable by URL only — the same treatment as `DoorThing/`.

## Why one ledger, not two

A B002 expense can include Aryan, so a debt can cross flats. Two databases would make
that debt invisible from one side. Instead there is a single `expenses` collection and
each site is a **lens** on it:

- Balances are always computed over the **whole** ledger — the only correct answer.
- The graph shows this flat's members individually, and the **other flat collapsed into
  one node**.
- The simplified list under the graph **expands** collapsed groups back into individuals.
- Rows where neither party belongs to this flat are hidden; they are the other site's
  business. Anything crossing the flats appears on both.

## Files

| File | Role |
|---|---|
| `config.js` | Who exists, which flat, UPI IDs, categories. **The one file you edit to add or retire a person.** |
| `ledger.js` | Pure integer-paise math: splits, balances, simplify, summaries, graph grouping. No DOM. |
| `graph.js` | The SVG flowchart: tiers, auto-compaction, lane-packed orthogonal connectors. |
| `data.js` | Firestore + a localStorage demo backend behind one API, plus the device mirror. |
| `app.js` | Hash router and every screen. |
| `app.css` | Compact scale and components, layered over `../assets/theme.css`. |
| `firebase-config.js` | Paste the project config here. Placeholders ⇒ demo mode. |
| `firestore.rules` | Reference copy of the deployed rules. |
| `test.html` / `tests.js` | Ledger unit suite (46 assertions). |
| `e2e.html?run=1` | Drives the real UI in an iframe (36 assertions). Wipes the demo ledger, hence the guard. |
| `demo.html?go=1` | Loads a sample ledger into this browser and opens the app in demo mode. Never touches Firestore. |

Styling reuses the main site's Liquid Glass system by reference, not by copy —
`theme.css` tokens, `.card`/`.option` glass, `.btn`, Geist, the background `<picture>`.
Editing `assets/theme.css` therefore restyles these apps too; that is intentional.

## Two things that look like details but are not

**Money is always an integer number of paise.** Floats drift, and a ledger whose
balances do not sum to exactly zero is a bug you chase forever. Rupees exist only at the
edges (`parseAmount` in, `formatMoney` out). Equal-split remainders are handed out one
paisa at a time starting with the payer, so a split always sums to the total exactly.

**A settlement is just an expense** whose `splits` map is `{ payee: amount }`. That one
idea makes all four settlement flows fall out of the same two-line balance formula:

| Flow | Recorded as | Reads as |
|---|---|---|
| Settle up | you → payee | "Dutta paid Zaid ₹420" |
| Settle all mine | every transfer you owe, one batch | one undo |
| Mark paid | debtor → creditor, logged by you | "Jap paid Dutta ₹90" |
| **Cover it** | debtor → **covering flatmate** | "Dutta covered Jap's ₹90" |

Cover is how a flatmate absorbs an outsider's debt: the guest clears to zero and the
covering member picks it up, which then re-simplifies against the real creditors on its
own. No special case anywhere.

## Firebase

Open access by deliberate choice — no sign-in, no passcode, because adding an expense
should take one tap. Three things keep an open door from becoming a lost ledger:

1. **Rules validate shape.** A malformed or oversized write is rejected, so no client
   can corrupt the app into not loading.
2. **`allow delete: if false`.** Deletion is a `deleted` flag and every change appends
   to the document's `history`. Nothing is ever destroyed.
3. **Device mirror.** Each browser keeps the last known ledger in `localStorage`, with
   *Restore from this device* in Settings.

Setup, once:

1. console.firebase.google.com → Add project → Firestore in **asia-south1**.
2. Project settings → Your apps → Web → copy the config into `firebase-config.js`.
   It is a public identifier, not a secret; the rules are the actual control.
3. Firestore → Rules → paste `firestore.rules` → Publish.

No Auth product is used. Offline comes from Firestore's `persistentLocalCache`: reads
work offline and writes queue until the connection returns.

Both sites also accept **`?demo=1`**, which forces the localStorage backend even on a
configured build. The test suites run on it, and it doubles as a safe sandbox for showing
someone the app without touching the real ledger. With no config pasted at all, demo mode
is the default.

Live project: `splitbaby-b002-b603`, Firestore in `asia-south1` (Mumbai, ~30 ms from
Bengaluru rather than ~250 ms from a US region).

## Scaling note

`data.js` subscribes to the entire `expenses` collection, because correct balances need
the full history. At a few hundred expenses a year that is a trivial payload. If it ever
passes ~5,000 documents, close the books: write one carry-forward balance document per
settled period and archive the expenses behind it.

## Verifying a change

```bash
python -m http.server 8000          # from the repo root
```

- `localhost:8000/splitbaby/test.html` — ledger math
- `localhost:8000/splitbaby/e2e.html?run=1` — the real UI, end to end
- `localhost:8000/b002splitbaby/` and `/b603splitbaby/` — both lenses

Bump `CACHE_VERSION` in **both** `sw.js` files after changing any shell asset, or
returning visitors keep the cached copy. This bites during local testing too: use a fresh
browser profile, or the service worker will hand you the previous build.

`node --check` does **not** reliably catch syntax errors in these modules — it passed a
file with a raw newline inside a string literal that the browser refused to parse. Trust
`e2e.html`, which loads the real page, over any static check.
