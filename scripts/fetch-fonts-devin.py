"""Download Google Fonts subsets used by the devin-* sites (dev-only utility)."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import quote
import re

ROOT = Path(__file__).resolve().parent.parent

class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []
    def handle_data(self, data):
        self.parts.append(data)

# (site, family, basename, japanese)
JOBS = [
    ('devin-meguru', 'Shippori+Antique+B1', 'antique', True),
    ('devin-meguru', 'EB+Garamond:wght@400..500', 'garamond', False),
    ('devin-tsumugiya', 'Shippori+Mincho:wght@500;800', 'mincho', True),
    ('devin-tsumugiya', 'Zen+Kaku+Gothic+New:wght@400;700', 'kaku', True),
]

UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'}

for site, family, basename, japanese in JOBS:
    parser = Text(); parser.feed((ROOT / site / 'index.html').read_text())
    js = (ROOT / site / 'app.js')
    all_text = ''.join(parser.parts) + (js.read_text() if js.exists() else '')
    text = ''.join(sorted(set(all_text))) if japanese else ''.join(chr(i) for i in range(32, 127)) + '°×¥–—…'
    url = 'https://fonts.googleapis.com/css2?family=' + family + '&display=swap&text=' + quote(text)
    css = urlopen(Request(url, headers=UA), timeout=30).read().decode()
    blocks = re.findall(r'font-weight:\s*(\d[\d\s]*);.*?url\((https:[^)]+)\)', css, re.S)
    assert blocks, f'no font url for {family}\n{css[:500]}'
    for i, (weight, font_url) in enumerate(blocks):
        data = urlopen(font_url, timeout=30).read()
        name = f'{basename}-{weight.strip()}.woff2' if len(blocks) > 1 else f'{basename}.woff2'
        path = ROOT / site / 'assets' / name
        path.write_bytes(data)
        print(f'{path.relative_to(ROOT)} ({weight}): {len(data):,} bytes')
