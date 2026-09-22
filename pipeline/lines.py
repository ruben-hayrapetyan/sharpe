import csv, glob, os, statistics, json, sys
def load(page):
    rows=[]
    with open(f"tsv/p-{page:03d}.tsv", newline='', encoding='utf8') as f:
        r=csv.DictReader(f, delimiter='\t', quoting=csv.QUOTE_NONE)
        for d in r:
            if d['level']=='5' and d['text'].strip():
                rows.append({k:(int(float(d[k])) if k in('left','top','width','height','conf','block_num','par_num','line_num') else d[k]) for k in d})
    lines={}
    for w in rows:
        key=(w['block_num'],w['par_num'],w['line_num'])
        lines.setdefault(key,[]).append(w)
    out=[]
    for k,ws in lines.items():
        ws.sort(key=lambda w:w['left'])
        L=min(w['left'] for w in ws); T=min(w['top'] for w in ws)
        R=max(w['left']+w['width'] for w in ws); B=max(w['top']+w['height'] for w in ws)
        out.append(dict(text=' '.join(w['text'] for w in ws),L=L,T=T,R=R,B=B,h=statistics.median(w['height'] for w in ws),n=len(ws)))
    out.sort(key=lambda l:l['T'])
    return out
if __name__=='__main__':
    p=int(sys.argv[1])
    for l in load(p): print(l['T'],l['B'],l['L'],l['R'],round(l['h']),l['text'][:80])
