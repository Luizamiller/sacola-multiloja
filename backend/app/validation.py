"""Camada determinística de validação das sugestões do assistente.

Nenhuma sacola proposta por IA chega ao cliente sem passar por `validar()`, que confere
orçamento, disponibilidade, quantidades, limite de lojas, pedido mínimo, área de entrega e
se a sacola atende de fato ao que foi pedido (pratos, sobremesas, vegetariano, itens citados).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

from .catalog import PADRAO, Catalogo
from .rules import Plano, planejar


@dataclass
class Grupo:
    """'Pelo menos `minimo` unidades somando qualquer um destes itens' (ex.: um poke = salmão OU tofu)."""
    termo: str
    ids: list[str]
    minimo: int = 1


@dataclass
class Restricoes:
    pessoas: int | None = None
    pratos_min: int = 0
    sobremesas_min: int = 0
    bebidas_min: int = 0
    orcamento: float | None = None
    vegetariano: bool = False
    grupos: list[Grupo] = field(default_factory=list)
    item_inexistente: str | None = None
    prioridade: str = "preco"  # preco | prazo

    @classmethod
    def from_caso(cls, caso: dict) -> "Restricoes":
        """Converte um caso do gabarito (formato original de casos.json)."""
        grupos = [Grupo(i, [i]) for i in caso.get("deve_conter", [])]
        grupos += [Grupo("/".join(g), list(g)) for g in caso.get("um_de", [])]
        return cls(
            pratos_min=caso.get("pratos_min", 0),
            sobremesas_min=caso.get("sobremesas_min", 0),
            bebidas_min=caso.get("bebidas_min", 0),
            orcamento=caso.get("orcamento"),
            vegetariano=bool(caso.get("vegetariano")),
            grupos=grupos,
            item_inexistente=caso.get("item_inexistente"),
        )

    def rotulos(self) -> list[str]:
        """Como o sistema entendeu o pedido, em chips legíveis para o cliente."""
        out = []
        if self.pessoas:
            out.append(f"{self.pessoas} {'pessoa' if self.pessoas == 1 else 'pessoas'}")
        if self.pratos_min:
            out.append(f"≥ {self.pratos_min} {'prato' if self.pratos_min == 1 else 'pratos'}")
        if self.sobremesas_min:
            out.append(f"≥ {self.sobremesas_min} {'sobremesa' if self.sobremesas_min == 1 else 'sobremesas'}")
        if self.bebidas_min:
            out.append(f"≥ {self.bebidas_min} {'bebida' if self.bebidas_min == 1 else 'bebidas'}")
        if self.vegetariano:
            out.append("vegetariano")
        if self.orcamento is not None:
            out.append(f"até R$ {self.orcamento:.2f}".replace(".", ","))
        for g in self.grupos:
            out.append(g.termo if g.minimo == 1 else f"{g.minimo}× {g.termo}")
        if self.prioridade == "prazo":
            out.append("mais rápido")
        return out

    def to_api(self) -> dict:
        d = asdict(self)
        d["rotulos"] = self.rotulos()
        return d


def porcoes(item_id: str, qtd: int, cat: Catalogo = PADRAO) -> int:
    """Uma pizza média serve 2: conta como 2 porções. Itens sem `serve` contam 1."""
    return qtd * cat.itens[item_id].get("serve", 1)


def contar(sacola: dict[str, int], tipo: str, cat: Catalogo = PADRAO) -> int:
    return sum(porcoes(i, q, cat) for i, q in sacola.items() if i in cat.itens and cat.itens[i]["tipo"] == tipo)


def falhas_do_pedido(r: Restricoes, sacola: dict[str, int], cat: Catalogo = PADRAO) -> list[str]:
    """O que a sacola deixa de atender do pedido (independe das regras de negócio)."""
    I = cat.itens
    falhas = []
    if contar(sacola, "prato", cat) < r.pratos_min:
        falhas.append(f"menos de {r.pratos_min} prato(s)")
    if contar(sacola, "sobremesa", cat) < r.sobremesas_min:
        falhas.append(f"menos de {r.sobremesas_min} sobremesa(s)")
    if contar(sacola, "bebida", cat) < r.bebidas_min:
        falhas.append(f"menos de {r.bebidas_min} bebida(s)")
    if r.vegetariano and any(I[i]["vegetariano"] is False for i in sacola if i in I):
        falhas.append("item não vegetariano")
    for g in r.grupos:
        if sum(porcoes(i, q, cat) for i, q in sacola.items() if i in g.ids and i in I) < g.minimo:
            nomes = ", ".join(I[i]["nome"] for i in g.ids if i in I)
            falhas.append(f"faltou {nomes}" if len(g.ids) == 1 else f"faltou um de: {nomes}")
    return falhas


def checar_sacola(caso: dict | Restricoes, sacola: dict[str, int], cat: Catalogo = PADRAO) -> list[str]:
    """Restrições descumpridas (regras de negócio + pedido). Lista vazia = sacola válida."""
    r = caso if isinstance(caso, Restricoes) else Restricoes.from_caso(caso)
    return list(planejar(sacola, r.orcamento, cat=cat).problemas) + falhas_do_pedido(r, sacola, cat)


CHECKS = [
    ("cardapio", "Itens existem no cardápio", {"item_inexistente", "vazia"}),
    ("quantidades", "Quantidades entre 1 e 10", {"quantidade"}),
    ("disponibilidade", "Itens disponíveis e lojas abertas", {"indisponivel", "loja_fechada"}),
    ("area", "Lojas dentro da área de entrega", {"fora_da_area"}),
    ("limite_lojas", "Até 4 lojas na sacola", {"limite_lojas"}),
    ("minimo", "Pedido mínimo de cada loja", {"pedido_minimo"}),
    ("orcamento", "Total com entrega dentro do orçamento", {"orcamento"}),
]


@dataclass
class Validacao:
    aprovada: bool
    checks: list[dict]
    plano: Plano

    def to_api(self) -> dict:
        return {"aprovada": self.aprovada, "checks": self.checks}


def validar(r: Restricoes, sacola: dict[str, int], cat: Catalogo = PADRAO) -> Validacao:
    plano = planejar(sacola, r.orcamento, cat=cat)
    checks = []
    for cid, rotulo, codigos in CHECKS:
        msgs = [o.mensagem for o in plano.ocorrencias if o.codigo in codigos]
        if cid == "orcamento" and r.orcamento is None:
            checks.append({"id": cid, "rotulo": "Sem limite de orçamento informado", "ok": True, "detalhes": []})
            continue
        checks.append({"id": cid, "rotulo": rotulo, "ok": not msgs, "detalhes": msgs})
    pedido = falhas_do_pedido(r, sacola, cat)
    checks.append({"id": "pedido", "rotulo": "Atende ao que foi pedido", "ok": not pedido, "detalhes": pedido})
    return Validacao(all(c["ok"] for c in checks), checks, plano)
