"""Empacota o backend para a demonstração online (Pyodide).

Uso: python web/scripts/empacotar_demo.py backend/app backend/data ...   (caminhos relativos à raiz do repositório)
Gera web/public/demo/backend.zip, com a mesma estrutura de pastas do repositório.
"""
import sys
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DESTINO = RAIZ / "web" / "public" / "demo" / "backend.zip"
IGNORAR = {"__pycache__", ".pytest_cache", "storage", "tests", ".venv"}
EXT_IGNORADAS = {".pyc", ".db", ".sqlite", ".sqlite3"}


def main(caminhos: list[str]) -> None:
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with zipfile.ZipFile(DESTINO, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for c in caminhos:
            base = RAIZ / c
            arquivos = [base] if base.is_file() else sorted(p for p in base.rglob("*") if p.is_file())
            for p in arquivos:
                rel = p.relative_to(RAIZ)
                if IGNORAR & set(rel.parts) or p.suffix in EXT_IGNORADAS or p.name.startswith(".env"):
                    continue
                z.write(p, rel.as_posix())
                n += 1
    print(f"{DESTINO.relative_to(RAIZ)}: {n} arquivos, {DESTINO.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main(sys.argv[1:])
