"""Download the exact Google Fonts subsets used by the two local concepts."""
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

for site, family, filename, japanese in [
    ('gpt-nagi', 'Manrope:wght@200..800', 'manrope.woff2', False),
    ('gpt-nagi', 'Zen+Old+Mincho', 'zen.woff2', True),
    ('gpt-umi', 'Space+Grotesk:wght@300..700', 'space.woff2', False),
    ('gpt-umi', 'Noto+Sans+JP:wght@100..900', 'noto.woff2', True),
]:
    parser = Text(); parser.feed((ROOT / site / 'index.html').read_text())
    all_text = ''.join(parser.parts) + (ROOT / site / 'app.js').read_text()
    text = ''.join(sorted(set(all_text))) if japanese else ''.join(chr(i) for i in range(32, 127)) + '°′→↑↓↗®¥×Ⅱ✳'
    url = 'https://fonts.googleapis.com/css2?family=' + family + '&display=swap&text=' + quote(text)
    request = Request(url, headers={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'})
    css = urlopen(request, timeout=30).read().decode()
    font_url = re.search(r'url\((https:[^)]+)\)', css).group(1)
    data = urlopen(font_url, timeout=30).read()
    path = ROOT / site / 'assets' / filename; path.write_bytes(data)
    print(f'{path.relative_to(ROOT)}: {len(data):,} bytes')
