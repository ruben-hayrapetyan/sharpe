"""Segment the OCR'd Green Book into problems (question span + solution span).

Everything here works on layout only: (page, y) coordinates. Text is used just to
recognise headings and "Solution:" markers; the app itself shows cropped page images.
"""
import json, re, csv
import numpy as np
from PIL import Image
from lines import load

BODY_FIRST, BODY_LAST = 19, 208          # chapter 2 starts p19; index starts ~p209
TOP_LIMIT, BOT_LIMIT = 85, 1750          # running header / page-number bands
PARA_GAP = 22                            # px gap that separates paragraphs

WORD = re.compile(r"^[A-Za-z0-9’'\-\.&/,()]+$")
CH_PAGES = {2: 19, 3: 49, 4: 75, 5: 121, 6: 153, 7: 187}

secs = json.load(open('sections.json'))
CONCEPT_SECTIONS = {'3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '5.4', '6.1', '6.2', '6.3', '6.4', '7.3'}


def page_img(p):
    return np.asarray(Image.open(f"img/p-{p:03d}.png").convert('L'))


def footnote_rule_y(im):
    if im.shape[1] != 1262:
        return None
    for y in range(1000, BOT_LIMIT - 20):
        row = im[y] < 130
        if row[20:470].sum() >= 330 and row[470:1240].sum() <= 4:
            return y
    return None


def classify(p, l, im):
    t = l['text'].strip()
    if re.match(r'^Solutions?\b', t) and l['h'] < 30:
        return 'S'
    box = im[l['T']:l['B'], l['L']:l['R']]
    ink = float((box < 140).mean()) if box.size else 0
    words = t.split()
    if (l['h'] >= 26.5 and ink >= (0.24 if l['h'] >= 29.5 else 0.30) and l['L'] <= 50 and (l['R'] - l['L']) < 800
            and not re.search(r'[.,;:!”"]$', t) and 1 <= len(words) <= 8
            and all(WORD.match(w) for w in words) and re.match(r"^[A-Z0-9]", t)
            and sum(c.isalpha() for c in t) >= len(t.replace(' ', '')) * 0.55):
        return 'H'
    return 'txt'


def build_items():
    items, fnitems = [], []
    for p in range(BODY_FIRST, BODY_LAST + 1):
        im = page_img(p)
        rule = footnote_rule_y(im)
        for l in load(p):
            if l['T'] < TOP_LIMIT or l['B'] > BOT_LIMIT + 5:
                continue
            d = dict(p=p, T=l['T'], B=l['B'], L=l['L'], R=l['R'], h=l['h'], text=l['text'].strip())
            if rule and l['T'] > rule:
                fnitems.append(dict(d, kind='fn'))
                continue
            items.append(dict(d, kind=classify(p, l, im)))
    # fragments of inline math that OCR split off a "Solution:" line are not text above it
    sol = [it for it in items if it['kind'] == 'S']
    def frag(it):
        return it['kind'] != 'S' and any(
            it['p'] == s_['p'] and it['B'] > s_['T'] + 4 and it['T'] < s_['B'] and it['T'] >= s_['T'] - 25
            for s_ in sol)
    items = [it for it in items if not frag(it)]
    # synthetic section / chapter anchors
    for s in secs.values():
        items.append(dict(p=s['page'], T=s['T'] - 6, B=s['T'] + 45, L=0, R=0, h=0,
                          text=s['num'] + ' ' + s['name'], kind='SEC'))
    for c, p in CH_PAGES.items():
        items.append(dict(p=p, T=TOP_LIMIT, B=TOP_LIMIT + 1, L=0, R=0, h=0, text=f'Chapter {c}', kind='CH'))
    items.sort(key=lambda x: (x['p'], x['T']))
    # drop 'txt'/'H' lines that are actually the synthetic section heading's own words
    out = []
    for it in items:
        if it['kind'] in ('H', 'txt') and any(
                s['kind'] == 'SEC' and s['p'] == it['p'] and abs(it['T'] - (s['T'] + 6)) < 40 for s in items):
            continue
        out.append(it)
    return out, fnitems


def looks_like_title(line, below):
    t = line['text']
    return (line['h'] >= 27 and line['L'] <= 50 and len(t.split()) <= 8 and not re.search(r'[.,;:!”"]$', t)
            and t[:1].isupper() and below['T'] - line['B'] < 60 and line['p'] == below['p'] if 'p' in line else False)


def paragraph_start(items, si, min_idx):
    """Index of the first line of the paragraph block that ends right above items[si]."""
    j = si - 1
    if j < min_idx or items[j]['kind'] != 'txt':
        return None
    start = j
    while start - 1 >= min_idx and items[start - 1]['kind'] == 'txt':
        a, b = items[start - 1], items[start]
        if a['p'] != b['p']:
            # continue across a page break only if the block began mid-sentence
            if items[start]['text'][:1].islower():
                start -= 1
                continue
            break
        if b['T'] - a['B'] >= PARA_GAP:
            break
        start -= 1
    return start


def segment(items):
    sidx = [i for i, it in enumerate(items) if it['kind'] == 'S']
    problems = []
    for n, si in enumerate(sidx):
        # nearest previous structural anchor
        k = si - 1
        while k >= 0 and items[k]['kind'] == 'txt':
            k -= 1
        anchor = items[k] if k >= 0 else None
        nlines = si - k - 1
        span_px = None
        if anchor:
            span_px = (items[si]['p'] - anchor['p']) * 1700 + items[si]['T'] - anchor['B']
        section = None
        for s_ in secs.values():
            if (s_['page'], s_['T']) <= (items[si]['p'], items[si]['T']):
                section = s_
        titled = bool(anchor and anchor['kind'] == 'H' and nlines <= 16 and span_px < 900
                      and section['num'] not in CONCEPT_SECTIONS)
        subtopic = None
        if titled:
            q_from = (anchor['p'], anchor['B'] + 4)
            qi = k + 1
            title = anchor['text']
        else:
            ps = paragraph_start(items, si, k + 1)
            if ps is None:            # nothing but structure above: empty question
                q_from = (items[si]['p'], items[si]['T'])
                qi = si
            else:
                q_from = (items[ps]['p'], items[ps]['T'] - 4)
                qi = ps
            title = None
            up = ps - 1 if ps is not None else None
            if up is not None and up > k and items[up]['kind'] == 'txt' and looks_like_title(items[up], items[ps]):
                title = items[up]['text']
                q_from = (items[ps]['p'], items[ps]['T'] - 4)
            if section['num'] in CONCEPT_SECTIONS or title is None:
                j = k
                while j >= 0 and items[j]['kind'] != 'H' and items[j]['kind'] != 'SEC':
                    j -= 1
                subtopic = items[j]['text'] if j >= 0 and items[j]['kind'] == 'H' else None
        # the anchor heading when untitled = concept heading, kept as a hint of context
        q_to = (items[si]['p'], items[si]['T'] - 2)
        if items[si]['T'] < 140 and items[si]['p'] > BODY_FIRST:
            q_to = (items[si]['p'] - 1, BOT_LIMIT)
        problems.append(dict(si=si, qi=qi, q_from=q_from, q_to=q_to,
                             title=title, titled=titled, anchor=(anchor or {}).get('text'), subtopic=subtopic,
                             section=section['num'], sec_name=section['name'], chapter=section['chapter']))
    # solution end = the earliest of: next H/SEC/CH after S, or next problem's question start
    for n, pr in enumerate(problems):
        si = pr['si']
        end_item = None
        for j in range(si + 1, len(items)):
            if items[j]['kind'] in ('H', 'SEC', 'CH'):
                end_item = j
                break
        cands = []
        if end_item is not None:
            cands.append((items[end_item]['p'], items[end_item]['T'] - 2))
        if n + 1 < len(problems):
            cands.append(problems[n + 1]['q_from'])
        end = min(cands) if cands else (BODY_LAST, BOT_LIMIT)
        pr['s_from'] = (items[si]['p'], items[si]['T'] - 4)
        pr['s_to'] = end
    return problems


def text_between(items, a, b):
    out = []
    for it in items:
        if it['kind'] in ('SEC', 'CH'):
            continue
        if (it['p'], it['T']) >= a and (it['p'], it['T']) < b:
            out.append(it['text'])
    return ' '.join(out)


if __name__ == '__main__':
    items, fnitems = build_items()
    probs = segment(items)
    json.dump(dict(items=items, fn=fnitems, problems=probs), open('segments.json', 'w'))
    print(len(probs), 'problems')
    for i, pr in enumerate(probs):
        q = text_between(items, pr['q_from'], pr['q_to'])
        print(f"{i:>3} {pr['section']} {'T' if pr['titled'] else 'u'} {str(pr['title'] or pr['anchor'])[:26]:<26} "
              f"p{pr['q_from'][0]}-{pr['q_to'][0]}  {q[:110]}")
