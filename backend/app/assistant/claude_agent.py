"""Agente com tool use (Claude) — portado de `assistente/agente.py` do projeto original.

O LLM decide O QUE pedir; preço, taxa, prazo e regras vêm de `rules.planejar`.
`finalizar_sacola` passa pela validação determinística e é REJEITADA se houver problema;
o motivo volta para o modelo corrigir. Limite de passos para custo previsível.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

from ..catalog import PADRAO, Catalogo
from ..validation import Restricoes, validar

MAX_PASSOS = 10

SYSTEM = """Você é o assistente de pedido de um app de delivery cuja sacola aceita itens de até 4 lojas.
Transforme o pedido do cliente numa sacola pronta para revisão.

Regras:
- Use SOMENTE itens retornados por buscar_itens. Nunca invente item, preço ou loja.
- Nunca calcule preço, taxa ou prazo você mesmo: use simular_sacola.
- O orçamento vale para o TOTAL (itens + entrega). Se o cliente der um orçamento, passe-o sempre em orcamento.
- "Para N pessoas" numa refeição significa pelo menos N porções de prato (campo serve). Sobremesa para N pessoas: N sobremesas.
- "Sem carne" ou "vegetariano": só itens com vegetariano=true.
- Itens com disponivel=false ou de lojas fechadas não podem entrar.
- Prefira lojas próximas (a entrega combinada é mais barata) e não exceda o necessário.
- Quando simular_sacola não apontar problemas, chame finalizar_sacola com um resumo curto em português.
- Se o pedido for impossível com este cardápio (item que não existe, orçamento insuficiente), NÃO finalize:
  responda em texto explicando o motivo e sugira a alternativa mais próxima."""

ITENS_SCHEMA = {
    "type": "array",
    "description": "Itens da sacola: id do cardápio e quantidade.",
    "items": {
        "type": "object",
        "properties": {"id": {"type": "string"}, "qtd": {"type": "integer", "minimum": 1}},
        "required": ["id", "qtd"],
    },
}

FERRAMENTAS = [
    {"name": "listar_lojas",
     "description": "Lista as lojas com categoria, taxa, prazo, pedido mínimo, se está aberta e a distância até o cliente.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "buscar_itens",
     "description": "Busca itens do cardápio. Todos os filtros são opcionais; sem filtros, devolve o cardápio inteiro.",
     "input_schema": {"type": "object", "properties": {
         "termo": {"type": "string", "description": "Palavra no nome ou descrição, ex.: 'poke', 'batata'."},
         "tipo": {"type": "string", "enum": ["prato", "acompanhamento", "sobremesa", "bebida", "farmacia", "mercado"]},
         "vegetariano": {"type": "boolean"},
         "loja": {"type": "string", "description": "id da loja"}}}},
    {"name": "simular_sacola",
     "description": "Calcula subtotais, entrega combinada, total, prazo e lista os problemas da sacola. Não finaliza nada.",
     "input_schema": {"type": "object", "properties": {
         "itens": ITENS_SCHEMA,
         "orcamento": {"type": "number", "description": "Orçamento total do cliente em reais, se houver."}},
         "required": ["itens"]}},
    {"name": "finalizar_sacola",
     "description": "Entrega a sacola ao cliente para revisão. É rejeitada se houver qualquer problema.",
     "input_schema": {"type": "object", "properties": {
         "itens": ITENS_SCHEMA,
         "orcamento": {"type": "number"},
         "resumo": {"type": "string", "description": "1 a 2 frases para o cliente explicando a escolha."}},
         "required": ["itens", "resumo"]}},
]


@dataclass
class ResultadoAgente:
    pedido: str
    sacola: dict[str, int] | None = None
    resumo: str = ""
    resposta_texto: str = ""
    passos: int = 0
    rejeicoes: int = 0
    ferramentas_usadas: list[str] = field(default_factory=list)
    tokens_entrada: int = 0
    tokens_saida: int = 0


def itens_para_dict(itens: list[dict] | None) -> dict[str, int]:
    sacola: dict[str, int] = {}
    for it in itens or []:
        sacola[str(it.get("id"))] = sacola.get(str(it.get("id")), 0) + int(it.get("qtd", 0))
    return sacola


def executar_ferramenta(nome: str, entrada: dict, cat: Catalogo = PADRAO,
                        restricoes: Restricoes | None = None) -> tuple[dict, bool]:
    """Executa uma ferramenta e devolve (resultado, erro?)."""
    if nome == "listar_lojas":
        return {"lojas": [
            {k: l[k] for k in ("id", "nome", "categoria", "taxa", "prazo", "minimo")}
            | {"aberta": l.get("aberta", True), "distancia_km": round(cat.dist_cliente(l["id"]), 1)}
            for l in cat.lojas.values()]}, False

    if nome == "buscar_itens":
        termo = (entrada.get("termo") or "").lower()
        achados = [
            {k: i[k] for k in ("id", "nome", "descricao", "preco", "tipo", "vegetariano")}
            | {"loja": i["loja"], "serve": i.get("serve", 1), "disponivel": cat.disponivel(i["id"])}
            for i in cat.itens.values()
            if (not termo or termo in f"{i['nome']} {i['descricao']} {' '.join(i.get('tags', []))}".lower())
            and entrada.get("tipo") in (None, i["tipo"])
            and (entrada.get("vegetariano") is None or i["vegetariano"] == entrada["vegetariano"])
            and entrada.get("loja") in (None, i["loja"])
        ]
        return {"itens": achados, "quantidade": len(achados)}, False

    r = restricoes or Restricoes()
    orcamento = entrada.get("orcamento", r.orcamento)
    if r.orcamento is not None:  # o orçamento entendido do texto vale mesmo se o modelo esquecer
        orcamento = min(orcamento, r.orcamento) if orcamento is not None else r.orcamento
    rr = Restricoes(**{**r.__dict__, "orcamento": orcamento})
    sacola = itens_para_dict(entrada.get("itens"))

    if nome == "simular_sacola":
        v = validar(rr, sacola, cat)
        resumo = v.plano.resumo()
        resumo["pendencias_do_pedido"] = next(c["detalhes"] for c in v.checks if c["id"] == "pedido")
        return resumo, False

    if nome == "finalizar_sacola":
        v = validar(rr, sacola, cat)
        if not v.aprovada:
            problemas = [d for c in v.checks if not c["ok"] for d in c["detalhes"]]
            return {"aceita": False, "problemas": problemas,
                    "instrucao": "Corrija a sacola com simular_sacola antes de finalizar de novo."}, True
        return {"aceita": True, "total": v.plano.total, "prazo_min": v.plano.prazo}, False

    return {"erro": f"Ferramenta desconhecida: {nome}"}, True


def montar_sacola(pedido: str, cliente, modelo: str, cat: Catalogo = PADRAO,
                  restricoes: Restricoes | None = None, max_passos: int = MAX_PASSOS) -> ResultadoAgente:
    r = ResultadoAgente(pedido=pedido)
    mensagens: list[dict] = [{"role": "user", "content": pedido}]

    while r.passos < max_passos:
        r.passos += 1
        resp = cliente.messages.create(model=modelo, max_tokens=1500, system=SYSTEM,
                                       tools=FERRAMENTAS, messages=mensagens)
        r.tokens_entrada += getattr(resp.usage, "input_tokens", 0)
        r.tokens_saida += getattr(resp.usage, "output_tokens", 0)
        mensagens.append({"role": "assistant", "content": resp.content})

        chamadas = [b for b in resp.content if b.type == "tool_use"]
        if not chamadas:
            r.resposta_texto = "".join(b.text for b in resp.content if b.type == "text")
            return r

        resultados = []
        for c in chamadas:
            r.ferramentas_usadas.append(c.name)
            saida, erro = executar_ferramenta(c.name, c.input, cat, restricoes)
            if c.name == "finalizar_sacola":
                if erro:
                    r.rejeicoes += 1
                else:
                    r.sacola = itens_para_dict(c.input.get("itens"))
                    r.resumo = c.input.get("resumo", "")
                    return r
            resultados.append({"type": "tool_result", "tool_use_id": c.id,
                               "content": json.dumps(saida, ensure_ascii=False), "is_error": erro})
        mensagens.append({"role": "user", "content": resultados})

    r.resposta_texto = f"Parei após {max_passos} passos sem uma sacola válida."
    return r
