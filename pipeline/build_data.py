"""Assemble data.js for the app from rendered.json (+ context links)."""
import json, sys, re
CONCEPT = {'3.1','3.2','3.3','3.4','3.5','3.6','5.4','6.1','6.2','6.3','6.4','7.3'}
PAGE_OFFSET = 16          # printed page = PDF page - 16
rend = json.load(open('rendered.json'))
ctx = json.load(open('context.json')) if len(sys.argv) < 3 else json.load(open(sys.argv[2]))
secs = json.load(open('sections.json'))
chapters = []
for s in secs.values():
    if s['chapter'] not in chapters: chapters.append(s['chapter'])
topics = [dict(id=s['num'], name=s['name'], chapter=chapters.index(s['chapter'])) for s in secs.values()]
problems = []
for r in rend:
    title = r['title'] or (r['subtopic'] if r['section'] in CONCEPT else None)
    if title:
        title = re.sub(r'\s+', ' ', title).strip()
    p = dict(id=r['id'], topic=r['section'], title=title, page=r['page'] - PAGE_OFFSET,
             q=r['q'], s=r['s'], hint=r['hint'])
    if str(r['idx']) in ctx:
        p['ctx'] = rend[ctx[str(r['idx'])]]['id']
    problems.append(p)
data = dict(chapters=chapters, topics=topics, problems=problems)
open(sys.argv[1], 'w').write('window.GB = ' + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n')
print(len(problems), 'problems,', len(topics), 'topics,', len(chapters), 'chapters')
per = {}
for p in problems: per[p['topic']] = per.get(p['topic'], 0) + 1
print(per)
