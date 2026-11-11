"""Assistente de pedido — transforma um pedido em linguagem natural numa sacola multi-loja válida.

Exemplo:
    python agente.py "jantar para 3 com sobremesa, até R$ 130"

Como funciona (agente com tool use):
  1. O Claude lê o pedido e consulta o cardápio pelas ferramentas (não inventa itens).
  2. Monta uma sacola e chama `simular_sacola`: o código calcula preço, taxa, prazo e problemas.
  3. Ajusta até não haver problemas e chama `finalizar_sacola`.
  4. `finalizar_sacola` valida de novo. Se algo estiver errado (orçamento, pedido mínimo,
     item inexistente, mais de 4 lojas), a sacola é REJEITADA e o modelo precisa corrigir.
  5. Se o pedido for impossível com o cardápio, o modelo explica e não monta sacola.

O LLM decide o que pedir; as regras de negócio ficam no código (regras.py).
"""
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field

from regras import ITENS, LOJAS, Plano, planejar

MODELO = os.getenv("MODELO_CLAUDE", "claude-sonnet-5-5")
MAX_PASSOS = 10  # limite de idas e voltas com o modelo, para custo e tempo previsíveis

SYSTEM = """Você é o assistente de pedido de um app de delivery cuja sacola aceita itens de até 4 lojas.
Transforme o pedido do cliente numa sacola pronta para revisão.

Regras:
- Use SOMENTE itens retornados por buscar_itens. Nunca invente item, preço ou loja.
- Nunca calcule preço, taxa ou prazo você mesmo: use simular_sacola.
- O orçamento vale para o TOTAL (itens + entrega). Se o cliente der um orçamento, passe-o sempre em orcamento.
- "Para N pessoas" numa refeição significa pelo menos N pratos (tipo "prato"). Sobremesa para N pessoas: N sobremesas.
- "Sem carne" ou "vegetariano": só itens com vegetariano=true.
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
    {
        "name": "listar_lojas",
        "description": "Lista as lojas disponíveis com categoria, taxa de entrega, prazo e pedido mínimo.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "buscar_itens",
        "description": "Busca itens do cardápio. Todos os filtros são opcionais; sem filtros, devolve o cardápio inteiro.",
        "input_schema": {
            "type": "object",
            "properties": {
                "termo": {"type": "string", "description": "Palavra no nome ou descrição, ex.: 'poke', 'batata'."},
                "tipo": {"type": "string", "enum": ["prato", "acompanhamento", "sobremesa", "farmacia"]},
                "vegetariano": {"type": "boolean"},
                "loja": {"type": "string", "description": "id da loja"},
            },
        },
    },
    {
        "name": "simular_sacola",
        "description": "Calcula subtotais, entrega combinada, total, prazo e lista os problemas da sacola. Não finaliza nada.",
        "input_schema": {
            "type": "object",
            "properties": {
                "itens": ITENS_SCHEMA,
                "orcamento": {"type": "number", "description": "Orçamento total do cliente em reais, se houver."},
            },
            "required": ["itens"],
        },
    },
    {
        "name": "finalizar_sacola",
        "description": "Entrega a sacola ao cliente para revisão. É rejeitada se houver qualquer problema.",
        "input_schema": {
            "type": "object",
            "properties": {
                "itens": ITENS_SCHEMA,
                "orcamento": {"type": "number"},
                "resumo": {"type": "string", "description": "1 a 2 frases para o cliente explicando a escolha."},
            },
            "required": ["itens", "resumo"],
        },
    },
]


@dataclass
class Resultado:
    pedido: str
    sacola: dict[str, int] | None = None
    plano: Plano | None = None
    resumo: str = ""
    resposta_texto: str = ""
    passos: int = 0
    rejeicoes: int = 0
    ferramentas_usadas: list[str] = field(default_factory=list)
    tokens_entrada: int = 0
    tokens_saida: int = 0


def _itens_para_dict(itens: list[dict]) -> dict[str, int]:
    sacola: dict[str, int] = {}
    for it in itens or []:
        sacola[str(it.get("id"))] = sacola.get(str(it.get("id")), 0) + it.get("qtd", 0)
    return sacola


def executar_ferramenta(nome: str, entrada: dict) -> tuple[dict, bool]:
    """Executa uma ferramenta e devolve (resultado, erro?)."""
    if nome == "listar_lojas":
        return {"lojas": [{k: l[k] for k in ("id", "nome", "categoria", "taxa", "prazo", "minimo")}
                          for l in LOJAS.values()]}, False

    if nome == "buscar_itens":
        termo = (entrada.get("termo") or "").lower()
        achados = [
            {k: i[k] for k in ("id", "nome", "descricao", "preco", "tipo", "vegetariano")} | {"loja": i["loja"]}
            for i in ITENS.values()
            if (not termo or termo in f"{i['nome']} {i['descricao']}".lower())
            and (entrada.get("tipo") in (None, i["tipo"]))
            and (entrada.get("vegetariano") is None or i["vegetariano"] == entrada["vegetariano"])
            and (entrada.get("loja") in (None, i["loja"]))
        ]
        return {"itens": achados, "quantidade": len(achados)}, False

    if nome == "simular_sacola":
        return planejar(_itens_para_dict(entrada.get("itens")), entrada.get("orcamento")).resumo(), False

    if nome == "finalizar_sacola":
        plano = planejar(_itens_para_dict(entrada.get("itens")), entrada.get("orcamento"))
        if plano.problemas:
            return {"aceita": False, "problemas": plano.problemas,
                    "instrucao": "Corrija a sacola com simular_sacola antes de finalizar de novo."}, True
        return {"aceita": True, "total": plano.total, "prazo_min": plano.prazo}, False

    return {"erro": f"Ferramenta desconhecida: {nome}"}, True


def montar_sacola(pedido: str, cliente=None, modelo: str = MODELO, max_passos: int = MAX_PASSOS) -> Resultado:
    if cliente is None:
        import anthropic
        cliente = anthropic.Anthropic()  # lê ANTHROPIC_API_KEY do ambiente

    r = Resultado(pedido=pedido)
    mensagens = [{"role": "user", "content": pedido}]

    while r.passos < max_passos:
        r.passos += 1
        resp = cliente.messages.create(
            model=modelo, max_tokens=1500, system=SYSTEM, tools=FERRAMENTAS, messages=mensagens,
        )
        r.tokens_entrada += getattr(resp.usage, "input_tokens", 0)
        r.tokens_saida += getattr(resp.usage, "output_tokens", 0)
        mensagens.append({"role": "assistant", "content": resp.content})

        chamadas = [b for b in resp.content if b.type == "tool_use"]
        if not chamadas:  # o modelo respondeu em texto: pedido impossível ou pergunta ao cliente
            r.resposta_texto = "".join(b.text for b in resp.content if b.type == "text")
            return r

        resultados = []
        for c in chamadas:
            r.ferramentas_usadas.append(c.name)
            saida, erro = executar_ferramenta(c.name, c.input)
            if c.name == "finalizar_sacola":
                if erro:
                    r.rejeicoes += 1
                else:
                    r.sacola = _itens_para_dict(c.input.get("itens"))
                    r.plano = planejar(r.sacola, c.input.get("orcamento"))
                    r.resumo = c.input.get("resumo", "")
                    return r
            resultados.append({"type": "tool_result", "tool_use_id": c.id,
                               "content": json.dumps(saida, ensure_ascii=False), "is_error": erro})
        mensagens.append({"role": "user", "content": resultados})

    r.resposta_texto = f"Parei após {max_passos} passos sem uma sacola válida."
    return r


def imprimir(r: Resultado) -> None:
    if r.sacola is None:
        print(r.resposta_texto)
    else:
        print(r.resumo, "\n")
        for it in r.plano.resumo()["itens"]:
            print(f"  {it['qtd']}× {it['nome']:24} {it['loja']:20} R$ {it['preco_unitario'] * it['qtd']:7.2f}")
        for e in r.plano.resumo()["entregas"]:
            tipo = "combinada" if e["combinada"] else "separada"
            print(f"  Entrega {tipo} ({' + '.join(e['lojas'])}): R$ {e['taxa']:.2f} · {e['prazo_min']} min")
        print(f"\n  Total: R$ {r.plano.total:.2f}")
    print(f"\n[{r.passos} chamadas ao modelo · {r.rejeicoes} sacola(s) rejeitada(s) pela validação · "
          f"{r.tokens_entrada} tokens de entrada / {r.tokens_saida} de saída]")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit('Uso: python agente.py "jantar para 3 com sobremesa, até R$ 130"')
    imprimir(montar_sacola(" ".join(sys.argv[1:])))
