"""Linhas de sacola com opções (adicionais, ponto da carne…) e cupons.

As regras de entrega e de pedido mínimo continuam em `rules.py`. Aqui:
- validamos as escolhas de cada linha contra os grupos de opções do item (mínimo, máximo, ids);
- calculamos o acréscimo das opções, que `planejar()` recebe por loja (`acrescimos`);
- aplicamos cupons sobre o plano já calculado, sem mexer nas regras de taxa e prazo.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from .catalog import PADRAO, Catalogo
from .rules import Plano


class OpcaoInvalida(ValueError):
    pass


def normalizar_opcoes(item: dict, escolhas: dict[str, list[str]] | None) -> dict[str, list[str]]:
    """Confere as escolhas contra os grupos do item; devolve-as ordenadas (para a chave da linha)."""
    escolhas = escolhas or {}
    grupos = {g["id"]: g for g in item.get("opcoes", [])}
    desconhecidos = set(escolhas) - set(grupos)
    if desconhecidos:
        raise OpcaoInvalida(f"Opção desconhecida para {item['nome']}.")
    final: dict[str, list[str]] = {}
    for gid, g in grupos.items():
        sel = list(dict.fromkeys(escolhas.get(gid, [])))
        validos = {o["id"] for o in g["itens"]}
        if any(s not in validos for s in sel):
            raise OpcaoInvalida(f"Escolha inválida em “{g['nome']}”.")
        if len(sel) < g["min"]:
            raise OpcaoInvalida(f"Escolha {'uma opção' if g['min'] == 1 else str(g['min']) + ' opções'} em “{g['nome']}”.")
        if len(sel) > g["max"]:
            raise OpcaoInvalida(f"Escolha no máximo {g['max']} em “{g['nome']}”.")
        if sel:
            final[gid] = sorted(sel)
    return final


def acrescimo(item: dict, opcoes: dict[str, list[str]]) -> float:
    total = 0.0
    for g in item.get("opcoes", []):
        precos = {o["id"]: o["preco"] for o in g["itens"]}
        total += sum(precos[o] for o in opcoes.get(g["id"], []))
    return round(total, 2)


def descrever(item: dict, opcoes: dict[str, list[str]]) -> list[str]:
    out = []
    for g in item.get("opcoes", []):
        nomes = {o["id"]: o["nome"] for o in g["itens"]}
        out += [nomes[o] for o in opcoes.get(g["id"], [])]
    return out


def chave_linha(item_id: str, opcoes: dict[str, list[str]], observacao: str) -> str:
    """Mesmo item, mesmas opções e mesma observação = mesma linha (soma a quantidade)."""
    if not opcoes and not observacao:
        return item_id  # compatível com as linhas antigas (uma por item)
    bruto = json.dumps([opcoes, observacao.strip().lower()], sort_keys=True, ensure_ascii=False)
    return f"{item_id}:{hashlib.sha1(bruto.encode()).hexdigest()[:10]}"


@dataclass
class Linha:
    id: int
    item_id: str
    qtd: int
    opcoes: dict[str, list[str]]
    observacao: str


def agregar(linhas: list[Linha], cat: Catalogo = PADRAO) -> tuple[dict[str, int], dict[str, float]]:
    """Linhas → (quantidade por item, acréscimo por loja) no formato que `planejar()` espera."""
    itens: dict[str, int] = {}
    extras: dict[str, float] = {}
    for l in linhas:
        if l.item_id not in cat.itens:
            continue
        it = cat.itens[l.item_id]
        itens[l.item_id] = itens.get(l.item_id, 0) + l.qtd
        extras[it["loja"]] = extras.get(it["loja"], 0) + acrescimo(it, l.opcoes) * l.qtd
    return itens, extras


# ------------------------------------------------------------------ cupons
def cupom(codigo: str | None, cat: Catalogo = PADRAO) -> dict | None:
    if not codigo:
        return None
    return next((c for c in cat.cupons if c["codigo"] == codigo.strip().upper()), None)


def aplicar_cupom(plano: Plano, codigo: str | None, cat: Catalogo = PADRAO) -> dict:
    """Devolve {codigo, valido, desconto, motivo}. Cupom de loja vale só sobre o subtotal dela."""
    c = cupom(codigo, cat)
    if not codigo:
        return {"codigo": None, "valido": False, "desconto": 0.0, "motivo": None}
    if c is None:
        return {"codigo": codigo.upper(), "valido": False, "desconto": 0.0, "motivo": "Cupom não encontrado."}
    base = plano.subtotal_por_loja.get(c["loja"], 0.0) if c["loja"] else plano.total_itens
    if c["loja"] and c["loja"] not in plano.subtotal_por_loja:
        return {"codigo": c["codigo"], "valido": False, "desconto": 0.0, "descricao": c["descricao"],
                "motivo": f"Vale só para {cat.lojas[c['loja']]['nome']}."}
    if base < c["minimo"] - 1e-9:
        falta = c["minimo"] - base
        return {"codigo": c["codigo"], "valido": False, "desconto": 0.0, "descricao": c["descricao"],
                "motivo": f"Faltam R$ {falta:.2f}".replace(".", ",") + " para usar este cupom."}
    if c["tipo"] == "valor":
        d = min(c["valor"], base)
    elif c["tipo"] == "percentual":
        d = min(base * c["valor"] / 100, c.get("maximo", float("inf")))
    else:  # entrega grátis
        d = plano.total_taxas
    return {"codigo": c["codigo"], "valido": True, "desconto": round(d, 2), "descricao": c["descricao"], "motivo": None}
