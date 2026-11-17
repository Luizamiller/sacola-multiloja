"""Regras de negócio da sacola multi-loja — fonte única de verdade para preço, taxa e prazo.

Mesma lógica do `plan()` do protótipo original e do antigo `assistente/regras.py`:

- até 4 lojas por sacola;
- pedido mínimo vale por loja;
- lojas a até 2 km entre si formam um grupo de entrega (componentes conectados, BFS);
- taxa combinada  = max(taxas) + 1,99 × (n − 1);
- prazo combinado = max(prazos) + 5 min × (n − 1);
- o cliente pode separar uma loja do grupo (ela volta a pagar a própria taxa).

Novidades da reconstrução: disponibilidade do item, loja fechada e área de entrega.
O assistente de IA nunca calcula nada disso: ele chama estas funções.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from .catalog import PADRAO, Catalogo

MAX_LOJAS = 4
RAIO_COMBINADO_KM = 2.0
ADICIONAL_TAXA = 1.99
ADICIONAL_PRAZO = 5
MAX_QTD_ITEM = 10


def agrupar(lojas: list[str], cat: Catalogo = PADRAO) -> list[list[str]]:
    """Lojas a até 2 km entre si saem juntas (componentes conectados, busca em largura)."""
    vistos: set[str] = set()
    grupos: list[list[str]] = []
    for inicio in lojas:
        if inicio in vistos:
            continue
        grupo, fila = [], [inicio]
        vistos.add(inicio)
        while fila:
            a = fila.pop(0)
            grupo.append(a)
            for b in lojas:
                if b not in vistos and cat.dist(a, b) <= RAIO_COMBINADO_KM:
                    vistos.add(b)
                    fila.append(b)
        grupos.append(grupo)
    return grupos


@dataclass
class Ocorrencia:
    codigo: str  # item_inexistente | quantidade | indisponivel | loja_fechada | fora_da_area | limite_lojas | pedido_minimo | orcamento | vazia
    mensagem: str
    loja: str | None = None
    item: str | None = None


@dataclass
class Plano:
    itens: dict[str, int]
    subtotal_por_loja: dict[str, float] = field(default_factory=dict)
    grupos: list[dict] = field(default_factory=list)
    total_itens: float = 0.0
    total_taxas: float = 0.0
    economia: float = 0.0
    ocorrencias: list[Ocorrencia] = field(default_factory=list)
    cat: Catalogo = field(default=PADRAO, repr=False)

    @property
    def problemas(self) -> list[str]:
        return [o.mensagem for o in self.ocorrencias]

    @property
    def total(self) -> float:
        return round(self.total_itens + self.total_taxas, 2)

    @property
    def prazo(self) -> int:
        return max((g["prazo"] for g in self.grupos), default=0)

    def resumo(self) -> dict:
        """Versão compacta, enviada ao modelo como resultado de ferramenta."""
        L, I = self.cat.lojas, self.cat.itens
        return {
            "itens": [
                {"id": i, "nome": I[i]["nome"], "loja": L[I[i]["loja"]]["nome"], "qtd": q,
                 "preco_unitario": I[i]["preco"]}
                for i, q in self.itens.items() if i in I
            ],
            "subtotal_por_loja": {L[l]["nome"]: round(v, 2) for l, v in self.subtotal_por_loja.items()},
            "entregas": [
                {"lojas": [L[l]["nome"] for l in g["lojas"]], "combinada": g["combinada"],
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

    def to_api(self) -> dict:
        """Versão completa para o frontend (ids + nomes)."""
        L, I = self.cat.lojas, self.cat.itens
        return {
            "lojas": [
                {"id": l, "nome": L[l]["nome"], "subtotal": round(v, 2), "minimo": L[l]["minimo"],
                 "abaixo_do_minimo": v < L[l]["minimo"] - 1e-9}
                for l, v in self.subtotal_por_loja.items()
            ],
            "entregas": [
                {"lojas": g["lojas"], "combinada": g["combinada"], "taxa": round(g["taxa"], 2),
                 "taxa_separada": round(g["taxa_separada"], 2), "prazo": g["prazo"],
                 "separada_pelo_cliente": g.get("separada_pelo_cliente", False)}
                for g in self.grupos
            ],
            "total_itens": round(self.total_itens, 2),
            "total_taxas": round(self.total_taxas, 2),
            "economia": round(self.economia, 2),
            "total": self.total,
            "prazo": self.prazo,
            "problemas": [o.__dict__ for o in self.ocorrencias],
            "pode_finalizar": not self.ocorrencias,
        }


def planejar(
    itens: dict[str, int],
    orcamento: float | None = None,
    separadas: Iterable[str] = (),
    cat: Catalogo = PADRAO,
    acrescimos: dict[str, float] | None = None,
) -> Plano:
    """Calcula subtotais, taxas e prazos e lista tudo o que impede o pedido de ser finalizado."""
    p = Plano(itens=dict(itens), cat=cat)
    oc = p.ocorrencias.append
    validos: dict[str, int] = {}
    for item_id, qtd in itens.items():
        if item_id not in cat.itens:
            oc(Ocorrencia("item_inexistente", f"Item '{item_id}' não existe no cardápio.", item=item_id))
        elif not isinstance(qtd, int) or isinstance(qtd, bool) or not 1 <= qtd <= MAX_QTD_ITEM:
            oc(Ocorrencia("quantidade",
                          f"Quantidade de '{cat.itens[item_id]['nome']}' deve ser um inteiro entre 1 e {MAX_QTD_ITEM}.",
                          item=item_id))
        else:
            validos[item_id] = qtd

    if not validos:
        if not p.ocorrencias:
            oc(Ocorrencia("vazia", "A sacola está vazia."))
        return p

    for item_id, qtd in validos.items():
        it = cat.itens[item_id]
        if not it.get("disponivel", True):
            oc(Ocorrencia("indisponivel", f"{it['nome']} está indisponível no momento.", loja=it["loja"], item=item_id))
        p.subtotal_por_loja[it["loja"]] = p.subtotal_por_loja.get(it["loja"], 0) + it["preco"] * qtd
    for loja, extra in (acrescimos or {}).items():  # adicionais escolhidos nos itens (ex.: bacon, borda recheada)
        if loja in p.subtotal_por_loja:
            p.subtotal_por_loja[loja] += extra
    lojas = list(p.subtotal_por_loja)

    for loja in lojas:
        L = cat.lojas[loja]
        if not L.get("aberta", True):
            abre = f" (abre às {L['abre_as']})" if L.get("abre_as") else ""
            oc(Ocorrencia("loja_fechada", f"{L['nome']} está fechada agora{abre}.", loja=loja))
        if not cat.na_area(loja):
            oc(Ocorrencia("fora_da_area",
                          f"{L['nome']} fica a {cat.dist_cliente(loja):.1f} km, fora da área de entrega "
                          f"({cat.raio_entrega_km:g} km).", loja=loja))

    if len(lojas) > MAX_LOJAS:
        oc(Ocorrencia("limite_lojas", f"A sacola aceita até {MAX_LOJAS} lojas (tem {len(lojas)})."))

    for loja, subtotal in p.subtotal_por_loja.items():
        minimo = cat.lojas[loja]["minimo"]
        if subtotal < minimo - 1e-9:
            oc(Ocorrencia("pedido_minimo",
                          f"{cat.lojas[loja]['nome']}: subtotal R$ {subtotal:.2f} abaixo do pedido mínimo de R$ {minimo:.2f}.",
                          loja=loja))

    separadas = [l for l in separadas if l in p.subtotal_por_loja]
    juntas = [l for l in lojas if l not in separadas]
    grupos = agrupar(juntas, cat) + [[l] for l in separadas]
    separado_total = 0.0
    for g in grupos:
        taxa_sep = sum(cat.lojas[l]["taxa"] for l in g)
        combinada = len(g) > 1
        taxa = max(cat.lojas[l]["taxa"] for l in g) + ADICIONAL_TAXA * (len(g) - 1) if combinada else taxa_sep
        prazo = max(cat.lojas[l]["prazo"] for l in g) + (ADICIONAL_PRAZO * (len(g) - 1) if combinada else 0)
        p.grupos.append({"lojas": g, "combinada": combinada, "taxa": taxa, "taxa_separada": taxa_sep,
                         "prazo": prazo, "separada_pelo_cliente": g[0] in separadas})
        separado_total += taxa_sep

    p.total_itens = sum(p.subtotal_por_loja.values())
    p.total_taxas = sum(g["taxa"] for g in p.grupos)
    p.economia = separado_total - p.total_taxas

    if orcamento is not None and p.total > orcamento + 1e-9:
        oc(Ocorrencia("orcamento", f"Total R$ {p.total:.2f} (itens + entrega) passa do orçamento de R$ {orcamento:.2f}."))
    return p
