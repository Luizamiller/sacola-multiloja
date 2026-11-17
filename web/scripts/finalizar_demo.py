"""Ajustes finais do build da demonstração para o GitHub Pages.

Uso: python web/scripts/finalizar_demo.py [origem:destino ...]
- 404.html = index.html (o GitHub Pages devolve o app em qualquer rota, e o React Router resolve)
- .nojekyll (serve pastas e arquivos que começam com _)
- copia pastas estáticas para dentro do dist (ex.: figures:api/figuras)
"""
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DIST = RAIZ / "web" / "dist"

shutil.copyfile(DIST / "index.html", DIST / "404.html")
(DIST / ".nojekyll").write_text("")
for par in sys.argv[1:]:
    origem, destino = par.split(":")
    shutil.copytree(RAIZ / origem, DIST / destino, dirs_exist_ok=True)
print("dist pronto para o GitHub Pages")
