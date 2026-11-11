"""Regras de negócio da sacola multi-loja — a mesma lógica do `plan()` do index.html.

O assistente nunca calcula preço, taxa ou prazo "de cabeça": ele chama estas funções.
Assim o LLM decide O QUE pedir, e o código garante que a conta e as regras estão certas.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path

CATALOGO = json.loads((Path(__file__).parent / "catalogo.json").read_text(encoding="utf-8"))
LOJAS = {l["id"]: l for l in CATALOGO["lojas"]}
ITENS = {i["id"]: i for i in CATALOGO["itens"]}

MAX_LOJAS = 4
RAIO_COMBINADO_KM = 2.0
ADICIONAL_TAXA = 1.99   # por loja extra num grupo combinado
ADICIONAL_PRAZO = 5     # minutos por loja extra num grupo combinado
MAX_QTD_ITEM = 10


def _dist(a: str, b: str) -> float:
    return math.hypot(LOJAS[a]["x"] - LOJAS[b]["x"], LOJAS[a]["y"] - LOJAS[b]["y"])


def agrupar(lojas: list[str]) -> list[list[str]]:
    """Lojas a até 2 km entre si saem juntas (componentes conectados, busca em largura)."""
    vistos, grupos = set(), []
    for inicio in lojas:
        if inicio in vistos:
            continue
        grupo, fila = [], [inicio]
        vistos.add(inicio)
        while fila:
            a = fila.pop(0)
            grupo.append(a)
            for b in lojas:
                if b not in vistos and _dist(a, b) <= RAIO_COMBINADO_KM:
                    vistos.add(b)
                    fila.append(b)
        grupos.append(grupo)
    return grupos


@dataclass
class Plano:
    itens: dict[str, int]
    subtotal_por_loja: dict[str, float] = field(default_factory=dict)
    grupos: list[dict] = field(default_factory=list)
    total_itens: float = 0.0
    total_taxas: float = 0.0
    economia: float = 0.0
    problemas: list[str] = field(default_factory=list)

    @property
    def total(self) -> float:
        return round(self.total_itens + self.total_taxas, 2)

    @property
    def prazo(self) -> int:
        return max((g["prazo"] for g in self.grupos), default=0)

    def resumo(self) -> dict:
        """Versão em dicionário, enviada ao modelo como resultado da ferramenta."""
        return {
            "itens": [
                {"id": i, "nome": ITENS[i]["nome"], "loja": LOJAS[ITENS[i]["loja"]]["nome"],
                 "qtd": q, "preco_unitario": ITENS[i]["preco"]}
                for i, q in self.itens.items() if i in ITENS
            ],
            "subtotal_por_loja": {LOJAS[l]["nome"]: round(v, 2) for l, v in self.subtotal_por_loja.items()},
            "entregas": [
                {"lojas": [LOJAS[l]["nome"] for l in g["lojas"]], "combinada": g["combinada"],
                 "taxa": round(g["taxa"], 2), "prazo_min": g["prazo"]}
                for g in self.grupos
            ],
            "total_itens": round(self.total_itens, 2),
            "total_taxas": round(self.total_taxas, 2),
            "total": self.total,
            "economia_entrega_combinada": round(self.economia, 2),
            "prazo_min": self.prazo,
            "problemas": self.problemas,
        }


def planejar(itens: dict[str, int], orcamento: float | None = None) -> Plano:
    """Calcula subtotais, taxas e prazos e lista tudo o que impede o pedido de ser finalizado."""
    p = Plano(itens=dict(itens))
    validos: dict[str, int] = {}
    for item_id, qtd in itens.items():
        if item_id not in ITENS:
            p.problemas.append(f"Item '{item_id}' não existe no cardápio.")
        elif not isinstance(qtd, int) or not 1 <= qtd <= MAX_QTD_ITEM:
            p.problemas.append(f"Quantidade de '{ITENS[item_id]['nome']}' deve ser um inteiro entre 1 e {MAX_QTD_ITEM}.")
        else:
            validos[item_id] = qtd

    if not validos:
        if not p.problemas:
            p.problemas.append("A sacola está vazia.")
        return p

    for item_id, qtd in validos.items():
        loja = ITENS[item_id]["loja"]
        p.subtotal_por_loja[loja] = p.subtotal_por_loja.get(loja, 0) + ITENS[item_id]["preco"] * qtd
    lojas = list(p.subtotal_por_loja)

    if len(lojas) > MAX_LOJAS:
        p.problemas.append(f"A sacola aceita até {MAX_LOJAS} lojas (tem {len(lojas)}).")

    for loja, subtotal in p.subtotal_por_loja.items():
        if subtotal < LOJAS[loja]["minimo"]:
            p.problemas.append(
                f"{LOJAS[loja]['nome']}: subtotal R$ {subtotal:.2f} abaixo do pedido mínimo de R$ {LOJAS[loja]['minimo']:.2f}."
            )

    separado = 0.0
    for g in agrupar(lojas):
        taxa_sep = sum(LOJAS[l]["taxa"] for l in g)
        combinada = len(g) > 1
        taxa = max(LOJAS[l]["taxa"] for l in g) + ADICIONAL_TAXA * (len(g) - 1) if combinada else taxa_sep
        prazo = max(LOJAS[l]["prazo"] for l in g) + (ADICIONAL_PRAZO * (len(g) - 1) if combinada else 0)
        p.grupos.append({"lojas": g, "combinada": combinada, "taxa": taxa, "prazo": prazo})
        separado += taxa_sep

    p.total_itens = sum(p.subtotal_por_loja.values())
    p.total_taxas = sum(g["taxa"] for g in p.grupos)
    p.economia = separado - p.total_taxas

    if orcamento is not None and p.total > orcamento + 1e-9:
        p.problemas.append(f"Total R$ {p.total:.2f} (itens + entrega) passa do orçamento de R$ {orcamento:.2f}.")
    return p
