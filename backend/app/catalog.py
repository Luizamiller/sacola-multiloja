"""Catálogo de lojas e itens.

O catálogo é dado de produto, somente leitura, versionado em `data/catalogo.json`.
O estado do usuário (sacola, favoritos, pedidos) fica no banco.

`V1` é o recorte exato do protótipo original (4 lojas, 12 itens): é contra ele que os
12 casos originais da avaliação rodam, para que o gabarito continue válido.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


@dataclass(frozen=True)
class Catalogo:
    lojas: dict[str, dict]
    itens: dict[str, dict]
    cliente: tuple[float, float]
    endereco: str
    raio_entrega_km: float
    cupons: tuple = ()
    categorias: tuple = ()

    def dist(self, a: str, b: str) -> float:
        la, lb = self.lojas[a], self.lojas[b]
        return math.hypot(la["x"] - lb["x"], la["y"] - lb["y"])

    def dist_cliente(self, loja: str) -> float:
        l = self.lojas[loja]
        return math.hypot(l["x"] - self.cliente[0], l["y"] - self.cliente[1])

    def na_area(self, loja: str) -> bool:
        return self.dist_cliente(loja) <= self.raio_entrega_km + 1e-9

    def disponivel(self, item_id: str) -> bool:
        it = self.itens[item_id]
        loja = self.lojas[it["loja"]]
        return it.get("disponivel", True) and loja.get("aberta", True) and self.na_area(it["loja"])

    @cached_property
    def itens_por_loja(self) -> dict[str, list[dict]]:
        out: dict[str, list[dict]] = {l: [] for l in self.lojas}
        for it in self.itens.values():
            out[it["loja"]].append(it)
        return out

    def recorte(self, origem: str) -> "Catalogo":
        """Somente lojas e itens de uma origem (ex.: 'v1' = protótipo original)."""
        lojas = {k: v for k, v in self.lojas.items() if v.get("origem") == origem}
        itens = {
            k: v for k, v in self.itens.items()
            if v["loja"] in lojas and v.get("origem", lojas[v["loja"]].get("origem")) == origem
        }
        return Catalogo(lojas, itens, self.cliente, self.endereco, self.raio_entrega_km,
                        tuple(c for c in self.cupons if c.get("loja") in (None, *lojas)), ())


def carregar(caminho: Path = DATA_DIR / "catalogo.json") -> Catalogo:
    d = json.loads(caminho.read_text(encoding="utf-8"))
    return Catalogo(
        lojas={l["id"]: l for l in d["lojas"]},
        itens={i["id"]: i for i in d["itens"]},
        cliente=(d["cliente"]["x"], d["cliente"]["y"]),
        endereco=d["cliente"]["endereco"],
        raio_entrega_km=d["raio_entrega_km"],
        cupons=tuple(d.get("cupons", [])),
        categorias=tuple(d.get("categorias", [])),
    )


PADRAO = carregar()
V1 = PADRAO.recorte("v1")
