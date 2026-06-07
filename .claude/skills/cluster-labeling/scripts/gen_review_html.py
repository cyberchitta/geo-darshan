#!/usr/bin/env python3
"""Self-contained HTML review page for a labeling run: one card per cluster with
exemplar crops, a locator map, the voted label + agreement, and (optionally) a
cross-tab against a prior/old label raster. Filters + click-to-zoom lightbox.

Generic engine script (cluster-labeling skill).

Usage:
  gen_review_html.py RUN_DIR [--seg SEG.tif --old OLD.tif --mapping pixel-mapping.json]

Reads RUN_DIR/{results.jsonl,cluster_to_label.json,crops/}. The --old crosstab is
optional; without it, cards just show the voted label + exemplar agreement.
Writes RUN_DIR/review.html (relative image links — open via file:// is fine).
"""
import argparse
import json
from collections import Counter
from pathlib import Path


def old_crosstab(seg, old, mapping):
    import numpy as np, rasterio
    from rasterio.warp import reproject, Resampling
    k = rasterio.open(seg)
    o = rasterio.open(old)
    a_k = k.read(1)
    a_o = o.read(1)
    if a_o.shape != a_k.shape:
        dst = np.zeros(a_k.shape, a_o.dtype)
        reproject(a_o, dst, src_transform=o.transform, src_crs=o.crs,
                  dst_transform=k.transform, dst_crs=k.crs, resampling=Resampling.nearest)
        a_o = dst
    m = json.loads(Path(mapping).read_text()) if mapping else {}
    table = {}
    for cid in sorted(set(a_k[a_k >= 0].tolist())):
        sel = a_o[a_k == cid]
        sel = sel[sel > 0]
        if not len(sel):
            table[cid] = []
            continue
        table[cid] = [{"label": m.get(str(v), "unlabeled" if v == 255 else f"v{v}"),
                       "pct": round(100 * c / len(sel), 1)}
                      for v, c in Counter(sel.tolist()).most_common(3)]
    return table


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--seg", type=Path)
    ap.add_argument("--old", type=Path)
    ap.add_argument("--mapping", type=Path)
    a = ap.parse_args()

    rows = [json.loads(l) for l in (a.run_dir / "results.jsonl").read_text().splitlines() if l.strip()]
    agg = json.loads((a.run_dir / "cluster_to_label.json").read_text())
    old = old_crosstab(a.seg, a.old, a.mapping) if (a.seg and a.old) else {}

    clusters = []
    for cid in sorted({r["cluster"] for r in rows}):
        c = agg[str(cid)]
        ot = old.get(cid, [])
        cl = c["label"]
        agrees = None
        if ot:
            ol = ot[0]["label"]
            agrees = cl == ol or cl.startswith(ol + ".") or ol.startswith(cl + ".")
        clusters.append({
            "id": cid, "label": cl, "confidence": c["confidence"],
            "agreement": c["agreement"], "old": ot, "oldAgrees": agrees,
            "exemplars": [{"i": r["exemplar"], "sizePx": r["size_px"],
                           "img": f"crops/{Path(r['crop']).name}", **r["result"]}
                          for r in rows if r["cluster"] == cid],
        })

    html = TEMPLATE.replace("__DATA__", json.dumps({"clusters": clusters, "hasOld": bool(old)}))
    (a.run_dir / "review.html").write_text(html)
    print(f"wrote {a.run_dir / 'review.html'} ({len(clusters)} clusters)")


TEMPLATE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>cluster labeling review</title><style>
  :root{--bg:#14161a;--card:#1d2026;--ink:#d8dce3;--dim:#8a909b;--ok:#4caf7d;
        --warn:#e0a93e;--bad:#e06c5a;--acc:#7aa2f7;}
  *{box-sizing:border-box;}body{margin:0;background:var(--bg);color:var(--ink);
    font:14px/1.5 -apple-system,"Segoe UI",sans-serif;}
  header{padding:20px 28px 10px;}h1{margin:0 0 4px;font-size:19px;}
  .sub{color:var(--dim);font-size:12.5px;}
  .filters{padding:8px 28px 14px;display:flex;gap:8px;flex-wrap:wrap;}
  .filters button{background:var(--card);color:var(--ink);border:1px solid #333a45;
    border-radius:16px;padding:5px 14px;cursor:pointer;font-size:13px;}
  .filters button.on{border-color:var(--acc);color:var(--acc);}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));
    gap:14px;padding:0 28px 28px;}
  .card{background:var(--card);border-radius:10px;padding:14px;border:1px solid #2a2f38;}
  .card.hidden{display:none;}
  .head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}
  .cid{font-weight:700;color:var(--acc);font-size:15px;}.lbl{font-weight:600;font-size:15px;}
  .badge{font-size:11px;padding:2px 8px;border-radius:10px;white-space:nowrap;}
  .b-ok{background:#1d3a2c;color:var(--ok);}.b-warn{background:#3a311d;color:var(--warn);}
  .b-bad{background:#3a221d;color:var(--bad);}
  .old{margin:6px 0 10px;font-size:12.5px;color:var(--dim);}.old b{color:var(--ink);}
  .thumbs{display:flex;gap:8px;}.thumb{flex:1;min-width:0;cursor:zoom-in;}
  .thumb img{width:100%;border-radius:6px;display:block;}
  .cap{font-size:11px;color:var(--dim);margin-top:3px;overflow:hidden;text-overflow:ellipsis;}
  .cap b{color:var(--ink);}
  details{margin-top:8px;}summary{cursor:pointer;color:var(--dim);font-size:12px;}
  .reasons{font-size:12px;color:var(--dim);margin:6px 0 0;padding-left:18px;}.reasons b{color:var(--ink);}
  #lightbox{position:fixed;inset:0;background:rgba(0,0,0,.88);display:none;
    align-items:center;justify-content:center;cursor:zoom-out;z-index:9;}
  #lightbox img{max-width:94vw;max-height:88vh;}
  #lightbox .lbcap{position:fixed;bottom:18px;left:0;right:0;text-align:center;font-size:13px;}
</style></head><body>
<header><h1>cluster labeling review</h1>
<div class="sub">Light tint + magenta outline = cluster patch. "🗺 where" = locator
(cluster extent cyan + exemplars). Click any image to enlarge.</div></header>
<div class="filters" id="filters">
  <button data-f="all" class="on">all</button>
  <button data-f="lowagree">low exemplar agreement</button>
  <button data-f="disagree">disagrees with old</button>
  <button data-f="agree">agrees with old</button>
</div>
<div class="grid" id="grid"></div>
<div id="lightbox"><img alt=""><div class="lbcap"></div></div>
<script>
const DATA=__DATA__;const grid=document.getElementById('grid');const fmt=n=>(n*100).toFixed(0)+'%';
function badges(c){const o=[];o.push(c.agreement>=0.67?`<span class="badge b-ok">agree ${fmt(c.agreement)}</span>`:`<span class="badge b-warn">&#9888; exemplars ${fmt(c.agreement)}</span>`);
  if(c.oldAgrees!==null)o.push(c.oldAgrees?`<span class="badge b-ok">matches old</span>`:`<span class="badge b-bad">disagrees with old</span>`);return o.join(' ');}
for(const c of DATA.clusters){const card=document.createElement('div');card.className='card';
  card.dataset.disagree=(c.oldAgrees===false);card.dataset.lowagree=(c.agreement<0.67);
  const pad=String(c.id).padStart(3,'0');
  const oldStr=c.old.length?('old: '+c.old.map(o=>`<b>${o.label}</b> ${o.pct}%`).join(' &middot; ')):'';
  card.innerHTML=`<div class="head"><span class="cid">c${c.id}</span><span class="lbl">${c.label}</span>
    <span class="badge" style="background:#23272f;color:var(--dim)">conf ${c.confidence.toFixed(2)}</span>${badges(c)}</div>
    ${oldStr?`<div class="old">${oldStr}</div>`:'<div class="old"></div>'}
    <div class="thumbs">${c.exemplars.map(e=>`<div class="thumb" data-img="${e.img}"
        data-cap="c${c.id} e${e.i} — ${e.label} (${e.confidence}) — ${e.reasoning||''}">
        <img loading="lazy" src="${e.img}"><div class="cap"><b>${e.label.split('.').pop()}</b> ${e.confidence}</div></div>`).join('')}
      <div class="thumb" data-img="crops/c${pad}_locator.jpg" data-cap="c${c.id} — cluster extent + exemplar locations">
        <img loading="lazy" src="crops/c${pad}_locator.jpg"><div class="cap">&#128506; where</div></div></div>
    <details><summary>per-exemplar reasoning</summary><ul class="reasons">${c.exemplars.map(e=>
      `<li><b>e${e.i}</b> (${e.sizePx}px): ${e.label} (${e.confidence}${e.alternative?', alt '+e.alternative:''}) — ${e.reasoning||''}</li>`).join('')}</ul></details>`;
  grid.appendChild(card);}
document.getElementById('filters').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  document.querySelectorAll('.filters button').forEach(x=>x.classList.toggle('on',x===b));const f=b.dataset.f;
  document.querySelectorAll('.card').forEach(card=>{const show=f==='all'||(f==='disagree'&&card.dataset.disagree==='true')||
    (f==='lowagree'&&card.dataset.lowagree==='true')||(f==='agree'&&card.dataset.disagree==='false'&&card.dataset.lowagree==='false');
    card.classList.toggle('hidden',!show);});});
const lb=document.getElementById('lightbox');
document.body.addEventListener('click',e=>{const t=e.target.closest('.thumb');
  if(t){lb.querySelector('img').src=t.dataset.img;lb.querySelector('.lbcap').textContent=t.dataset.cap||'';lb.style.display='flex';}
  else if(e.target.closest('#lightbox'))lb.style.display='none';});
document.addEventListener('keydown',e=>{if(e.key==='Escape')lb.style.display='none';});
</script></body></html>
"""

if __name__ == "__main__":
    main()
