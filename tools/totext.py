import re, sys, html
# Strip a cached source page down to readable text with links kept, for inspection.
src, dst = sys.argv[1], sys.argv[2]
h = open(src, encoding='utf-8').read()
h = re.sub(r'<(script|style|head).*?</\1>', '', h, flags=re.S)
i = h.find('<main'); h = h[i:] if i >= 0 else h
h = re.sub(r'<a [^>]*href="([^"]*)"[^>]*>', r'[\1]', h)
h = re.sub(r'</(tr|p|div|h\d|li)>', '\n', h)
h = re.sub(r'<(td|th)[^>]*>', ' | ', h)
h = re.sub(r'<[^>]+>', '', h)
h = html.unescape(h)
h = re.sub(r'[ \t]+', ' ', h); h = re.sub(r'\n\s*\n+', '\n', h)
open(dst, 'w', encoding='utf-8').write(h)
