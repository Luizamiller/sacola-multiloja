"""Interpretação determinística de pedidos em linguagem natural.

Transforma "jantar para 3 com sobremesa, até R$ 130" em `Restricoes`. É usada:
- pelo planejador determinístico (modo sem chave de API);
- como rede de segurança do agente Claude: o orçamento e os itens citados entendidos aqui
  são cobrados na validação final, mesmo que o modelo esqueça de passá-los.
"""
from __future__ import annotations

import re
import unicodedata

from ..catalog import PADRAO, Catalogo
from ..validation import Grupo, Restricoes

NUMEROS = {"um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4, "cinco": 5,
           "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10}
NUM = r"\d+|" + "|".join(NUMEROS)

# Comidas que alguém pode pedir e que talvez não existam no catálogo: servem para dizer
# "não temos pizza" em vez de montar qualquer coisa.
COMIDAS_CONHECIDAS = [
    "pizza", "sushi", "hamburguer", "taco", "lasanha", "churrasco", "esfiha", "pastel", "temaki",
    "yakisoba", "coxinha", "feijoada", "strogonoff", "salada", "sopa", "sorvete", "cerveja", "vinho",
    "refrigerante", "suco", "poke", "acai", "burrito", "brigadeiro", "bolo", "pao", "cafe", "leite",
]
SINONIMOS = {"hamburger": "hamburguer", "burguer": "hamburguer", "x-burguer": "hamburguer",
             "refri": "refrigerante", "acaí": "acai"}
TAGS_GENERICAS = {"lanche", "bebida", "doce", "vegano", "massa", "japonesa", "sopa"}
REFEICAO = r"\b(jantar|janta|almoco|almocar|lanche|refeicao|combo|marmita|comer|comida)\b"


def normalizar(txt: str) -> str:
    txt = unicodedata.normalize("NFKD", txt.lower())
    return "".join(c for c in txt if not unicodedata.combining(c))


def _num(s: str | None) -> int | None:
    if not s:
        return None
    return int(s) if s.isdigit() else NUMEROS.get(s)


def _vocabulario(cat: Catalogo) -> dict[str, list[str]]:
    voc: dict[str, list[str]] = {c: [] for c in COMIDAS_CONHECIDAS}
    for it in PADRAO.itens.values():  # termos do catálogo completo (para reconhecer o que falta num recorte)
        for t in it.get("tags", []):
            voc.setdefault(normalizar(t), [])
    for it in cat.itens.values():
        for t in it.get("tags", []):
            voc[normalizar(t)].append(it["id"])
    for t in TAGS_GENERICAS:
        voc.pop(t, None)
    return voc


def interpretar(pedido: str, cat: Catalogo = PADRAO) -> Restricoes:
    txt = " " + normalizar(pedido) + " "
    for a, b in SINONIMOS.items():
        txt = re.sub(rf"\b{re.escape(a)}\b", b, txt)
    r = Restricoes()

    m = re.search(r"(?:ate|no maximo|maximo de|gastando|limite de|orcamento de|por)\s*(?:r\$)?\s*(\d+(?:[.,]\d{1,2})?)", txt) \
        or re.search(r"r\$\s*(\d+(?:[.,]\d{1,2})?)", txt)
    if m:
        r.orcamento = float(m.group(1).replace(",", "."))
        txt = txt[: m.start()] + " " + txt[m.end():]

    if re.search(r"\b(pra|para) mim\b|\bso eu\b|\bsozinh[oa]\b", txt):
        r.pessoas = 1
    m = re.search(rf"\b(?:para|pra|p/)\s+({NUM})\b(?:\s+pessoas?)?", txt) or re.search(rf"\b({NUM})\s+pessoas?\b", txt)
    if m:
        r.pessoas = _num(m.group(1))

    r.vegetariano = bool(re.search(r"vegetarian|sem carne|vegan", txt))
    if re.search(r"rapido|pressa|urgente|o quanto antes|logo", txt):
        r.prioridade = "prazo"
    refeicao = bool(re.search(REFEICAO, txt))

    # Itens citados: termos mais longos primeiro ("poke de salmao" antes de "poke").
    voc = _vocabulario(cat)
    achados: list[tuple[str, list[str], int | None]] = []
    for termo in sorted(voc, key=len, reverse=True):
        padrao = rf"(?:\b({NUM})\s+(?:\w+\s+)?)?\b{re.escape(termo)}(?:e?s)?\b"
        m = re.search(padrao, txt)
        if not m:
            continue
        achados.append((termo, voc[termo], _num(m.group(1))))
        txt = txt[: m.start()] + " " * (m.end() - m.start()) + txt[m.end():]

    inexistentes = [t for t, ids, _ in achados if not ids]
    if inexistentes:
        r.item_inexistente = inexistentes[0]

    grupos_prato = [a for a in achados if a[1] and all(cat.itens[i]["tipo"] == "prato" for i in a[1])]
    for termo, ids, qtd in achados:
        if not ids:
            continue
        if r.vegetariano:
            veg = [i for i in ids if cat.itens[i]["vegetariano"] is not False]
            ids = veg or ids  # se nada for vegetariano, a validação vai apontar
        minimo = qtd or 1
        if qtd is None and r.pessoas and len(grupos_prato) == 1 and grupos_prato[0][0] == termo:
            minimo = r.pessoas  # "pizza para 3" = porções para 3
        r.grupos.append(Grupo(termo, ids, minimo))

    if refeicao or grupos_prato or (r.pessoas and not achados and "sobremesa" not in txt):
        r.pratos_min = r.pessoas or (1 if refeicao and not grupos_prato else 0)
    if "sobremesa" in txt:
        so_sobremesa = not refeicao and not grupos_prato
        r.sobremesas_min = (r.pessoas or 1) if so_sobremesa else 1
    m = re.search(rf"\b({NUM})?\s*bebidas?\b", txt)
    if m:
        r.bebidas_min = _num(m.group(1)) or r.pessoas or 1
    return r
