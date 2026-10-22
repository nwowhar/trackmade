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
sub = {'__LOGO__': open(f'{D}/logo_inline.svg', encoding='utf-8').read(), '__HERO__': ph['hero'], '__TOP__': ph['top'], '__SIDE__': ph['side'],
       '__FOURTH__': ph['fourth'], '__SAMPLES__': json.dumps(inline, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/'),
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
