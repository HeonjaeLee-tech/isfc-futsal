# -*- coding: utf-8 -*-
"""index.html + css + js 를 미리보기용 단일 페이지(dist/preview.html)로 합친다. 이미지는 assets/img 그대로 참조."""
import re, pathlib, sys
root = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "assets/css/style.css").read_text(encoding="utf-8")
js = lambda p: (root / p).read_text(encoding="utf-8").replace("</script", "<\\/script")

title = re.search(r"<title>.*?</title>", html, re.S).group(0)
fonts = re.search(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]+>', html).group(0)
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = body.replace('<script src="assets/js/icons.js"></script>', "<script>\n" + js("assets/js/icons.js") + "</script>")
tail = "".join("<script>\n" + js(p) + "</script>\n" for p in ("assets/js/config.js", "assets/js/demo.js", "assets/js/app.js"))
body = re.sub(r'<script src="assets/js/(config|demo|app)\.js"></script>\s*', "", body)
page = "\n".join([
    title,
    '<meta name="claude:viewport-fit-sides" content="cover">',
    fonts,
    "<style>\n" + css + "\n</style>",
    body.strip(),
    tail,
])
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(page, encoding="utf-8")
print("preview bytes", len(page.encode("utf-8")))
