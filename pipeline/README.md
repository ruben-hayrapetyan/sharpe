# Book-parsing pipeline

Turns page scans of *A Practical Guide to Quantitative Finance Interviews* (Xinfeng Zhou)
into `data.js` and the `img/` crops the app reads. Everything here works on layout only —
`(page, y)` coordinates from OCR word boxes — never on retyped book text. The app displays
cropped page images, not a transcription.

Not included: your own copy of the book, or a script to scan/OCR it. You provide those.

## What you need first

- Page images at `img/p-{page:03d}.png` (one PNG per page, from scanning your own copy).
- Word-level OCR TSVs at `tsv/p-{page:03d}.tsv`, e.g. via Tesseract:
  `tesseract img/p-019.png tsv/p-019 tsv --psm 6` (drop the `.tsv` tesseract appends, or adjust
  `lines.py`'s path).
- Python with `pillow` and `numpy`.

## Steps

1. **`lines.py`** — groups OCR words into lines with geometry (position, height, ink density).
   Used as a library by every step below (`load(page)`).
2. **`sections.py`** — locates each book section heading (e.g. "3.1 Limits and Derivatives") by
   matching a hardcoded table of contents against OCR'd lines in an expected page window.
   Writes `sections.json`. The `SECTIONS`/`WIN` tables encode the book's chapter/section
   numbering (short factual titles, not its problem text) — adjust the page windows (`WIN`) to
   your own scan if pages are shifted.
3. **`segment.py`** — the core segmentation. Classifies each OCR'd line as a heading, a
   "Solution:" marker, or body text using height + ink-density + text-shape heuristics, then
   groups lines into problems (question span + solution span) using paragraph gaps and section
   anchors. Writes `segments.json`. Tune `BODY_FIRST/BODY_LAST`, `TOP_LIMIT/BOT_LIMIT`,
   `CH_PAGES`, and the thresholds in `classify()` to your scan.
4. **`render.py`** — crops and stitches the page image regions for each problem's question,
   solution, and hint footnote into grayscale WebP files, using `segments.json`. Writes
   `rendered.json` + the crops (default `out/img/`). An `overrides.json` (not included; see
   format used in `render.py`) can hand-correct a problem's span, e.g.
   `{"111": {"q_from": [127, 1470], "q_to": [128, 251]}}`.
5. **`build_data.py`** — assembles `../data.js` from `rendered.json` (+ optional
   `context.json` linking follow-up problems to their parent, e.g. `{"30": 29}`):
   `python build_data.py ../data.js`

Expect to iterate: check `segments.json`'s printed problem list against the actual book and
adjust thresholds or add per-problem overrides where the heuristics misfire (title vs. no title,
multi-page questions, table pages, etc.).
