"""Build the shop page from site-src/ into public/index.html.

    python3 site-src/build.py            -> public/index.html (the live site)
    python3 site-src/build.py --demo OUT -> an offline demo copy (Strava shows sample activities)
"""
import json, os, sys
D = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(D)
t = open(f'{D}/shop_template.html', encoding='utf-8').read()
ph = json.load(open(f'{D}/photos.json')); gal = json.load(open(f'{D}/gallery.json'))
demo = '--demo' in sys.argv
samples = json.load(open(f'{D}/samples.json', encoding='utf-8'))
# Live site: only the opening preview (EBC) is in the page; each other route is public/samples/<key>.json, fetched when picked.
INLINE = ('ebc',)
inline = samples if demo else {k: (v if k in INLINE else {a: b for a, b in v.items() if a not in ('grid', 'route', 'stops')}) for k, v in samples.items()}
if not demo:
    os.makedirs(f'{ROOT}/public/samples', exist_ok=True)
    for k, v in samples.items():
        if k not in INLINE:
            json.dump(v, open(f'{ROOT}/public/samples/{k}.json', 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
LOGO = open(f'{D}/logo_inline.svg', encoding='utf-8').read()
# real-print photos live in public/img/ now (hero, tiles, story) so the page stays light; photos.json is the source archive
sub = {'__LOGO__': LOGO, '__SAMPLES__': json.dumps(inline, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/'),
       '__G_EBC__': gal['g_ebc'], '__G_CHI__': gal['g_chi'], '__G_LAP__': gal.get('g_lap', gal['g_ebc']), '__LAPKM__': f"{gal['lap_km']:,}",
       '__G_TRAIL__': gal['g_trail']}
for k, v in sub.items():
    assert k in t, k
    t = t.replace(k, v)
WEB_HEAD = '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
if demo:
    out = sys.argv[sys.argv.index('--demo') + 1]
    open(out, 'w', encoding='utf-8').write('<meta charset="utf-8">\n' + t.replace('__API__', 'null'))
else:
    out = f'{ROOT}/public/index.html'
    open(out, 'w', encoding='utf-8').write(WEB_HEAD + t.replace('__API__', "''"))
print(out, os.path.getsize(out) // 1024, 'KB')

# Policy pages: site-src/pages/<name>.html fragments wrapped in a plain page with the logo and footer links.
PAGE = '''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · TrackMade</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
:root{{--bg:#f4f5f6;--card:#fff;--ink:#1f252b;--muted:#5d6872;--line:#dde1e5;--accent:#d42a22}}
@media (prefers-color-scheme:dark){{:root{{--bg:#111518;--card:#191f24;--ink:#e9ecef;--muted:#9aa5ae;--line:#2b333a;--accent:#ff4d44}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 "IBM Plex Sans",system-ui,sans-serif;padding:0 16px}}
header,main,footer{{max-width:760px;margin:0 auto}}header{{padding:14px 0}}header a{{color:var(--ink);display:inline-block;line-height:0}}header svg{{height:34px;width:auto}}
main{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:28px 22px 18px;margin-bottom:28px}}
h1{{font:700 clamp(26px,6vw,34px)/1.15 Sora,sans-serif;text-transform:uppercase;letter-spacing:.03em;margin:0}}
h2{{font:600 13px Sora,sans-serif;letter-spacing:.14em;text-transform:uppercase;margin:28px 0 6px}}
p,li{{color:var(--muted)}}a{{color:var(--ink)}}ul{{padding-left:20px}}.upd{{font-size:13px;margin-top:6px}}
footer{{font-size:13px;color:var(--muted);padding:0 0 40px;display:flex;flex-wrap:wrap;gap:6px 18px}}footer a{{color:var(--muted)}}
</style>
<header><a href="/" aria-label="TrackMade home">{logo}</a></header>
<main>
{body}
</main>
<footer><a href="/">Shop</a><a href="/#contact">Contact</a><a href="/shipping-returns.html">Shipping &amp; returns</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><span>© 2026 TrackMade</span></footer>
'''
if not demo:
    import re, glob
    for f in sorted(glob.glob(f'{D}/pages/*.html')):
        body = open(f, encoding='utf-8').read()
        title = re.search(r'<!--title: (.*?)-->', body).group(1)
        name = os.path.basename(f)
        open(f'{ROOT}/public/{name}', 'w', encoding='utf-8').write(PAGE.format(title=title, logo=LOGO, body=body))
        print('page', name)
