"""Planejador determinístico: monta a sacola mais barata (ou mais rápida) que atende às restrições.

Funciona sem chave de API e serve de alternativa quando o Claude não está configurado.
Estratégia: enumera conjuntos de até 4 lojas elegíveis e, para cada um, constrói a sacola de
forma gulosa (mais barato por porção primeiro, com limite de repetição para dar variedade),
completa pedidos mínimos e só aceita o resultado se passar em `checar_sacola`.
Não é um otimizador exato, e isso está explícito: a garantia de correção vem da validação,
não do planejador.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from itertools import combinations

from ..catalog import PADRAO, Catalogo
from ..rules import MAX_LOJAS, planejar
from ..validation import Restricoes, checar_sacola, contar, porcoes


@dataclass
class Diagnostico:
    possivel: bool
    sacola: dict[str, int] | None = None
    motivos: list[str] = field(default_factory=list)
    alternativa: dict[str, int] | None = None
    alternativa_descricao: str = ""


def _usavel(cat: Catalogo, r: Restricoes, item_id: str) -> bool:
    it = cat.itens[item_id]
    return cat.disponivel(item_id) and not (r.vegetariano and it["vegetariano"] is False)


def _preencher(bag: dict[str, int], cands: list[str], faltam: int, cat: Catalogo) -> int:
    """Adiciona itens (mais barato por porção primeiro) até cobrir `faltam` porções."""
    if faltam <= 0 or not cands:
        return faltam
    cands = sorted(cands, key=lambda i: (cat.itens[i]["preco"] / cat.itens[i].get("serve", 1), i))
    teto = max(1, math.ceil(faltam / 2)) if len(cands) > 1 else faltam
    for rodada in (teto, faltam):  # 1ª rodada com variedade; 2ª sem limite
        adicionados = {i: 0 for i in cands}
        for i in cands:
            while faltam > 0 and adicionados[i] < rodada:
                bag[i] = bag.get(i, 0) + 1
                adicionados[i] += 1
                faltam -= cat.itens[i].get("serve", 1)
        if faltam <= 0:
            break
    return faltam


def _montar(r: Restricoes, lojas: tuple[str, ...], cat: Catalogo) -> dict[str, int] | None:
    usaveis = [it["id"] for l in lojas for it in cat.itens_por_loja[l] if _usavel(cat, r, it["id"])]
    bag: dict[str, int] = {}
    for g in r.grupos:
        cands = [i for i in g.ids if i in usaveis]
        if not cands:
            return None
        ja = sum(porcoes(i, q, cat) for i, q in bag.items() if i in g.ids)
        if _preencher(bag, cands, g.minimo - ja, cat) > 0:
            return None
    for tipo, minimo in (("prato", r.pratos_min), ("sobremesa", r.sobremesas_min), ("bebida", r.bebidas_min)):
        cands = [i for i in usaveis if cat.itens[i]["tipo"] == tipo]
        if _preencher(bag, cands, minimo - contar(bag, tipo, cat), cat) > 0:
            return None
    for loja in lojas:  # completa pedido mínimo com o item mais barato da própria loja
        da_loja = sorted((i for i in usaveis if cat.itens[i]["loja"] == loja), key=lambda i: cat.itens[i]["preco"])
        if not da_loja:
            return None
        sub = lambda: sum(cat.itens[i]["preco"] * q for i, q in bag.items() if cat.itens[i]["loja"] == loja)
        if sub() == 0:
            return None  # loja sem função no conjunto: o subconjunto menor já cobre esse caso
        tentativas = 0
        while sub() < cat.lojas[loja]["minimo"] - 1e-9 and tentativas < 10:
            falta = cat.lojas[loja]["minimo"] - sub()
            preco = lambda i: cat.itens[i]["preco"]
            # opção A: acrescentar o item mais barato da loja
            opcoes = [(preco(da_loja[0]), ("add", da_loja[0], None))]
            # opção B: trocar uma unidade por um item do mesmo tipo um pouco mais caro que fecha o mínimo
            protegidos = {x for g in r.grupos for x in g.ids}
            for i in [x for x in bag if cat.itens[x]["loja"] == loja and x not in protegidos]:
                for j in da_loja:
                    dif = preco(j) - preco(i)
                    if cat.itens[j]["tipo"] == cat.itens[i]["tipo"] and dif >= falta - 1e-9 \
                            and cat.itens[j].get("serve", 1) >= cat.itens[i].get("serve", 1):
                        opcoes.append((dif, ("troca", j, i)))
            _, (acao, novo, velho) = min(opcoes, key=lambda o: o[0])
            if acao == "troca":
                bag[velho] -= 1
                if not bag[velho]:
                    del bag[velho]
            bag[novo] = bag.get(novo, 0) + 1
            tentativas += 1
    return bag


def melhor_sacola(r: Restricoes, cat: Catalogo = PADRAO) -> dict[str, int] | None:
    if r.item_inexistente:
        return None
    elegiveis = sorted({cat.itens[i]["loja"] for i in cat.itens if _usavel(cat, r, i)})
    obrigatorias = set()
    for g in r.grupos:
        lojas_g = {cat.itens[i]["loja"] for i in g.ids if _usavel(cat, r, i)}
        if not lojas_g:
            return None
        if len(lojas_g) == 1:
            obrigatorias |= lojas_g
    melhor, chave_melhor = None, None
    for n in range(1, MAX_LOJAS + 1):
        for lojas in combinations(elegiveis, n):
            if not obrigatorias <= set(lojas):
                continue
            bag = _montar(r, lojas, cat)
            if bag is None or checar_sacola(r, bag, cat):
                continue
            p = planejar(bag, r.orcamento, cat=cat)
            chave = (p.prazo, p.total) if r.prioridade == "prazo" else (p.total, n, p.prazo)
            if chave_melhor is None or chave < chave_melhor:
                melhor, chave_melhor = bag, chave
    return melhor


def diagnosticar(r: Restricoes, cat: Catalogo = PADRAO) -> Diagnostico:
    """Tenta montar; se não der, explica por quê e sugere a alternativa mais próxima."""
    bag = melhor_sacola(r, cat)
    if bag is not None:
        return Diagnostico(True, bag)

    d = Diagnostico(False)
    if r.item_inexistente:
        d.motivos.append(f"Não há {r.item_inexistente} em nenhuma loja do cardápio.")
        semelhante = Restricoes(**{**r.__dict__, "item_inexistente": None,
                                   "grupos": [g for g in r.grupos if g.termo != r.item_inexistente]})
        alt = melhor_sacola(semelhante, cat)
        if alt:
            d.alternativa, d.alternativa_descricao = alt, "Mesmo pedido, sem o item que não existe no cardápio."
        return d

    for g in r.grupos:
        if not any(_usavel(cat, r, i) for i in g.ids):
            motivos = planejar({i: 1 for i in g.ids}, cat=cat).ocorrencias
            ligados = [o.mensagem for o in motivos if o.codigo in {"loja_fechada", "indisponivel", "fora_da_area"}]
            d.motivos.append(f"{g.termo.capitalize()}: " + (" ".join(dict.fromkeys(ligados)) or "sem opção disponível."))
    lojas_exigidas = {frozenset(cat.itens[i]["loja"] for i in g.ids) for g in r.grupos}
    unicas = {next(iter(s)) for s in lojas_exigidas if len(s) == 1}
    if len(unicas) > MAX_LOJAS:
        d.motivos.append(f"O pedido exige {len(unicas)} lojas diferentes; a sacola aceita até {MAX_LOJAS}.")

    if r.orcamento is not None and not d.motivos:
        sem_teto = Restricoes(**{**r.__dict__, "orcamento": None})
        alt = melhor_sacola(sem_teto, cat)
        if alt:
            total = planejar(alt, cat=cat).total
            d.motivos.append(
                f"A combinação mais barata que atende custa R$ {total:.2f} com entrega, "
                f"acima do orçamento de R$ {r.orcamento:.2f}.".replace(".", ",", 0)
            )
            d.alternativa, d.alternativa_descricao = alt, f"Atende ao pedido por R$ {total:.2f}."
    if not d.motivos:
        d.motivos.append("Não encontrei uma combinação que respeite todas as regras da sacola.")
    return d
