"""Render question / solution / hint crops from the page scans into the app's image folder."""
import json, sys, os, re
import numpy as np
from PIL import Image
from segment import TOP_LIMIT, BOT_LIMIT

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out/img'
os.makedirs(OUT, exist_ok=True)
seg = json.load(open('segments.json'))
items, problems, fnitems = seg['items'], seg['problems'], seg['fn']
overrides = json.load(open('overrides.json')) if os.path.exists('overrides.json') else {}

_cache = {}


def page(p):
    if p not in _cache:
        _cache[p] = np.asarray(Image.open(f"img/p-{p:03d}.png").convert('L'))
    return _cache[p]


_rule = {}


def is_std(p):
    return page(p).shape[1] == 1262


def footnote_rule(p):
    """y of the footnote separator rule on page p, or None."""
    if p in _rule:
        return _rule[p]
    im = page(p)
    y_found = None
    for y in range(1000, BOT_LIMIT - 20 if is_std(p) else 0):
        row = im[y] < 130
        left, right = row[20:470].sum(), row[470:1240].sum()
        if left >= 330 and right <= 4:
            y_found = y
            break
    _rule[p] = y_found
    return y_found


def body_bottom(p):
    r = footnote_rule(p)
    if not is_std(p):
        return page(p).shape[0] - 4
    return (r - 4) if r else BOT_LIMIT


def bands(a, b):
    """Vertical bands (page, y0, y1) for the span a=(p,y) .. b=(p,y)."""
    out = []
    for p in range(a[0], b[0] + 1):
        top = TOP_LIMIT if is_std(p) else 0
        y0 = a[1] if p == a[0] else top
        y1 = b[1] if p == b[0] else body_bottom(p)
        y1 = min(y1, body_bottom(p)) if p != b[0] else min(y1, BOT_LIMIT if is_std(p) else page(p).shape[0])
        if y1 - y0 > 6:
            out.append((p, max(y0, top - 10), y1))
    return out


def crop_band(p, y0, y1):
    im = page(p)
    sub = im[max(y0, 0):y1, :]
    dark = sub < 150
    rows = np.where(dark.sum(axis=1) > 0)[0]
    if len(rows) == 0:
        return None
    cols = np.where(dark.sum(axis=0) > 0)[0]
    r0, r1 = rows[0], rows[-1]
    sub = sub[max(r0 - 8, 0):r1 + 9]
    return sub, cols[0], cols[-1]


def stitch(band_list, name, pad=12, gap=14):
    crops = [crop_band(*b) for b in band_list]
    crops = [c for c in crops if c is not None]
    if not crops:
        return None
    left = max(min(c[1] for c in crops) - pad, 0)
    right = max(c[2] for c in crops) + pad
    w = right - left + 1
    total_h = sum(c[0].shape[0] for c in crops) + gap * (len(crops) - 1)
    canvas = np.full((total_h, w), 255, dtype=np.uint8)
    y = 0
    for sub, _, _ in crops:
        piece = sub[:, left:right + 1]
        canvas[y:y + sub.shape[0], :piece.shape[1]] = piece
        y += sub.shape[0] + gap
    # levels: pure white paper, solid ink
    f = np.clip((canvas.astype(np.float32) - 70) * (255.0 / (215 - 70)), 0, 255).astype(np.uint8)
    img = Image.fromarray(f, 'L')
    path = f"{OUT}/{name}.webp"
    img.save(path, 'WEBP', quality=86, method=6)
    return dict(src=f"img/{name}.webp", w=img.width, h=img.height)


def footnote_band(p):
    r = footnote_rule(p)
    if not r:
        return None
    return (p, r + 2, BOT_LIMIT)


def footnote_is_hint(p):
    r = footnote_rule(p)
    if not r:
        return False
    for it in fnitems:
        if it['p'] == p and it['T'] > r:
            t = re.sub(r'^[^A-Za-z]{0,4}', '', it['text']).lower()
            return t.startswith('hint')
    return False


def main():
    out = []
    hint_taken = set()
    # decide which problem owns each Hint footnote: the last problem whose question touches that page
    owner = {}
    for i, pr in enumerate(problems):
        for p in range(pr['q_from'][0], pr['q_to'][0] + 1):
            if footnote_rule(p) and footnote_is_hint(p):
                owner[p] = i
    for i, pr in enumerate(problems):
        ov = overrides.get(str(i), {})
        q_from = tuple(ov.get('q_from', pr['q_from']))
        q_to = tuple(ov.get('q_to', pr['q_to']))
        s_from = tuple(ov.get('s_from', pr['s_from']))
        s_to = tuple(ov.get('s_to', pr['s_to']))
        pid = f"q{i:03d}"
        q = stitch(bands(q_from, q_to), pid + 'q')
        sb = bands(s_from, s_to)
        # add non-hint footnotes for pages where the solution runs down to the body bottom
        withfn = []
        for (p, y0, y1) in sb:
            withfn.append((p, y0, y1))
            fb = footnote_band(p)
            if fb and not footnote_is_hint(p) and y1 >= body_bottom(p) - 2 and p != s_to[0]:
                withfn.append(fb)
            elif fb and not footnote_is_hint(p) and p == s_to[0] and s_to[1] >= body_bottom(p) - 2:
                withfn.append(fb)
        s = stitch(withfn, pid + 's')
        hint = None
        for p in range(q_from[0], q_to[0] + 1):
            if owner.get(p) == i:
                hint = stitch([footnote_band(p)], pid + 'h')
        out.append(dict(id=pid, idx=i, section=pr['section'], sectionName=pr['sec_name'], chapter=pr['chapter'],
                        title=ov.get('title', pr['title']), subtopic=pr.get('subtopic'),
                        page=q_from[0], q=q, s=s, hint=hint))
    json.dump(out, open('rendered.json', 'w'), indent=1)
    print('rendered', len(out))


if __name__ == '__main__':
    main()
