"""Gera ícones, favicon e imagens do mascote a partir da referência oficial.

Uso (na pasta web/):  uv run --with pillow python scripts/gerar_icones.py
Entrada: ../docs/umami/referencias/mascote-referencia.webp (dragão sobre quadrado arredondado, fundo preto)
Saída:   public/marca/*
"""
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).resolve().parent
ORIGEM = AQUI.parent.parent / "docs" / "umami" / "referencias" / "mascote-referencia.webp"
DESTINO = AQUI.parent / "public" / "marca"
DESTINO.mkdir(parents=True, exist_ok=True)

im = Image.open(ORIGEM).convert("RGBA")
# o quadrado arredondado ocupa ~x53–1201, y42–1211 na referência
quadro = im.crop((52, 52, 1202, 1202))
lado = quadro.width
RAIO = int(lado * 0.2)


def arredondado(img: Image.Image, raio_frac: float = 0.2) -> Image.Image:
    """Cantos transparentes com antisserrilhado (máscara desenhada em 4x)."""
    s = img.width * 4
    m = Image.new("L", (s, s), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * raio_frac), fill=255)
    out = img.copy()
    out.putalpha(m.resize(img.size, Image.LANCZOS))
    return out


icone = arredondado(quadro)
# recorte interno 100% opaco (sem os cantos pretos) para ícones que o sistema arredonda sozinho
d = int(RAIO * 0.32)
sangrado = quadro.crop((d, d, lado - d, lado - d))


def salvar(img: Image.Image, nome: str, tam: int, fmt: str = "PNG"):
    img.resize((tam, tam), Image.LANCZOS).save(DESTINO / nome, fmt, **({"quality": 86, "method": 6} if fmt == "WEBP" else {"optimize": True}))


for tam in (16, 32, 48):
    salvar(icone, f"favicon-{tam}.png", tam)
salvar(icone, "icone-192.png", 192)
salvar(icone, "icone-512.png", 512)
salvar(sangrado, "icone-maskable-512.png", 512)
salvar(sangrado, "apple-touch-icon.png", 180)
salvar(icone, "mascote-256.webp", 256, "WEBP")
salvar(icone, "mascote-512.webp", 512, "WEBP")
print("ícones gerados em", DESTINO)
