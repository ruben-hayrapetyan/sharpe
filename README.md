# Sharpe

Three practice modes in one app.

- **Mental Math** – Zetamac-style sprint. Toggle +, −, ×, ÷, set the ranges, pick 30s–5m.
  Type the answer (it advances the instant it's right), Enter skips. High score per exact settings.
- **Number Sense** – same engine: squares, cubes, powers of 2 / log₂, 1/n as %, percent-of, 12–25 × 12–25.
- **Green Book** – 182 interview problems from *A Practical Guide to Quantitative Finance Interviews*
  across 32 topics. Each round takes ONE problem per topic (no repeats), interleaved across chapters.
  Space reveals · 1/2/3 grades · H hint · S skip · +/- text size. Problem titles can be switched off.

## Run
- **App:** double-click `Sharpe.app` (drag it to /Applications if you like). Rebuild with `native/build.sh`.
- **Browser:** open `index.html`.

## Ask Claude (side panel)
On a Green Book or Fermi question, press **⌘K** (or "Ask Claude") to chat about the problem you're on.
Each message includes that problem: for the book, the scanned question (plus the follow-up's original problem and
the hint if you opened it); for Fermi, the question text and source. The book's solution / the Fermi reference answer
are only shared once you've revealed or answered, so hints stay spoiler-free. The panel lists what Claude can see.
It runs through your local Claude Code login (`claude` CLI on Sonnet at medium effort, no tools; the scans are sent inline and each reply shows its token count), so it works in **Sharpe.app**, not in a plain browser tab.

Progress (scores, streak, book history, settings) is saved on this device.
The Green Book questions/solutions are crops of your own scan; the folder contains book pages, so don't redistribute it.

## Green Book data
This repo does not include `img/` (the page crops) or `data.js` (titles/structure derived from
the book) — see `NOTICE.md`. `pipeline/` has the scripts that turn your own scan into both,
starting from page images + OCR.
