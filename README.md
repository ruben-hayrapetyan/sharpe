<p align="center">
  <img src="logo.svg" width="64" height="64" alt="Sharpe logo">
</p>

<h1 align="center">Sharpe</h1>
<p align="center">Four practice modes for quant interview prep, in one small app.</p>

<p align="center">
  <img src="docs/img/hub-dark.webp" width="700" alt="Sharpe home screen, dark theme, showing the four mode cards: Mental Math, Number Sense, Green Book, and Fermi">
</p>

## Modes

### Mental Math
Zetamac-style arithmetic sprint. Toggle +, −, ×, ÷ independently, set the number ranges for each,
and pick a duration from 30s to 5m. Type the answer — it advances the instant it's right, `Enter`
skips. High score is tracked per exact settings.

<table><tr>
<td><img src="docs/img/mental-math-setup.webp" width="420" alt="Mental Math settings: operator toggles, ranges, duration"></td>
<td><img src="docs/img/mental-math-play.webp" width="420" alt="Mental Math sprint in progress, score and countdown visible"></td>
</tr></table>

<p align="center"><img src="docs/img/mental-math-sprint.gif" width="600" alt="Typing answers during a Mental Math sprint"></p>

### Number Sense
The same sprint engine, retuned for recall drills: squares (11–35), cubes (2–15), powers of 2
and log₂, 1/n as a percent, percent-of, and mid-range multiplication (12–25 × 12–25). Pick which
drills to mix into a round.

<table><tr>
<td><img src="docs/img/number-sense-setup.webp" width="420" alt="Number Sense drill picker"></td>
<td><img src="docs/img/number-sense-play.webp" width="420" alt="Number Sense sprint in progress"></td>
</tr></table>

### Green Book
182 interview problems from *A Practical Guide to Quantitative Finance Interviews*, across 32
topics in 8 chapters. Each round pulls exactly one problem per topic (interleaved, no repeats)
until you've cycled the whole map. `Space` reveals the solution, `1`/`2`/`3` self-grade it,
`H` shows the book's hint (when there is one), `S` skips, and `+`/`-` resize the question text.
Problem titles can be switched off if they give away the trick.

<p align="center"><img src="docs/img/green-book-topics.webp" width="700" alt="Green Book topic map: chapters and topics, tap to include or skip"></p>

> The scanned problems and solutions themselves aren't pictured here — see
> [Green Book data](#green-book-data) for why.

### Fermi
Order-of-magnitude estimation from the [Fermi Questions](https://fermi-questions.andrechek.com/)
bank — collected from Science Olympiad and other Fermi tests. Answer with the power of ten
(400 is 4×10², so the answer is `2`); scoring is 5 for exact, 3 for one order off, 1 for two off.
Unseen questions come first so a round cycles through sources you haven't hit yet.

<table><tr>
<td><img src="docs/img/fermi-setup.webp" width="420" alt="Fermi setup: questions per round and source filters"></td>
<td><img src="docs/img/fermi-result.webp" width="420" alt="Fermi question answered dead-on for 5 points"></td>
</tr></table>

## Ask Claude (side panel)
On a Green Book or Fermi question, press **⌘K** (or "Ask Claude") to chat about the problem
you're on. Each message includes that problem: for the book, the scanned question (plus the
follow-up's original problem and the hint if you opened it); for Fermi, the question text and
source. The book's solution / the Fermi reference answer are only shared once you've revealed or
answered, so hints stay spoiler-free. The panel lists exactly what Claude can see for that
message.

It runs through your local Claude Code login (`claude` CLI on Sonnet at medium effort, no tools;
the scans are sent inline and each reply shows its token count), so it works in **Sharpe.app**,
not in a plain browser tab.

<p align="center"><img src="docs/img/ask-claude.webp" width="700" alt="Ask Claude side panel open next to a Fermi question, showing what Claude sees"></p>

## Appearance
Light and dark themes share one token set; toggle from the header. Progress (scores, streak,
book history, settings) is saved on-device only.

<p align="center"><img src="docs/img/theme-toggle.gif" width="600" alt="Toggling between dark and light theme"></p>

## Run
- **App:** double-click `Sharpe.app` (drag it to /Applications if you like). Rebuild with `native/build.sh`.
- **Browser:** open `index.html`.

The Green Book questions/solutions are crops of your own scan; the folder contains book pages, so don't redistribute it.

## Green Book data
This repo does not include `img/` (the page crops) or `data.js` (titles/structure derived from
the book) — see `NOTICE.md`. `pipeline/` has the scripts that turn your own scan into both,
starting from page images + OCR.
