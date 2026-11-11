"""Avaliação do assistente de pedido contra um gabarito de casos.

Cada caso traz o pedido em linguagem natural e as restrições REAIS que a sacola precisa cumprir
(orçamento, pratos, sobremesas, só vegetariano, itens obrigatórios ou "um destes") — ou que ele é impossível.
A checagem é feita por código, não por outro LLM: a nota é objetiva e reproduzível.

Um caso passa quando:
  - possível:   o assistente finaliza uma sacola sem problemas que cumpre todas as restrições;
  - impossível: o assistente NÃO finaliza sacola nenhuma (e explica em texto).

Uso:
    export ANTHROPIC_API_KEY=...
    python avaliar.py                          # todos os casos, modelo padrão
    python avaliar.py --modelo claude-haiku-5-5
Saída: tabela no terminal + reports/avaliacao-<modelo>.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from regras import ITENS, planejar

AQUI = Path(__file__).parent
CASOS = json.loads((AQUI / "casos.json").read_text(encoding="utf-8"))


def contar(sacola: dict[str, int], tipo: str) -> int:
    return sum(q for i, q in sacola.items() if i in ITENS and ITENS[i]["tipo"] == tipo)


def checar_sacola(caso: dict, sacola: dict[str, int]) -> list[str]:
    """Devolve a lista de restrições do caso que a sacola descumpre (vazia = cumpre tudo)."""
    falhas = list(planejar(sacola, caso.get("orcamento")).problemas)
    if contar(sacola, "prato") < caso.get("pratos_min", 0):
        falhas.append(f"menos de {caso['pratos_min']} prato(s)")
    if contar(sacola, "sobremesa") < caso.get("sobremesas_min", 0):
        falhas.append(f"menos de {caso['sobremesas_min']} sobremesa(s)")
    if caso.get("vegetariano") and any(ITENS[i]["vegetariano"] is False for i in sacola if i in ITENS):
        falhas.append("item não vegetariano")
    for obrigatorio in caso.get("deve_conter", []):
        if obrigatorio not in sacola:
            falhas.append(f"faltou {ITENS[obrigatorio]['nome']}")
    for opcoes in caso.get("um_de", []):  # ex.: "um poke" aceita poke de salmão OU de tofu
        if not any(i in sacola for i in opcoes):
            falhas.append("faltou um de: " + ", ".join(ITENS[i]["nome"] for i in opcoes))
    return falhas


def viavel(caso: dict) -> bool:
    """Força bruta (com poda pelo orçamento): existe ALGUMA sacola que cumpre o caso?

    Usada nos testes para garantir que o gabarito está certo: um caso marcado como
    impossível precisa ser impossível de verdade, e vice-versa.
    """
    if caso.get("item_inexistente"):
        return False
    ids = sorted(ITENS)
    limite = max(caso.get("pratos_min", 0), caso.get("sobremesas_min", 0), 1)
    orc = caso.get("orcamento")

    def busca(k: int, sacola: dict[str, int], gasto: float) -> bool:
        if orc is not None and gasto > orc:
            return False
        if sacola and not checar_sacola(caso, sacola):
            return True
        if k == len(ids):
            return False
        for q in range(limite, -1, -1):
            nova = dict(sacola)
            if q:
                nova[ids[k]] = q
            if busca(k + 1, nova, gasto + ITENS[ids[k]]["preco"] * q):
                return True
        return False

    return busca(0, {}, 0.0)


def avaliar(modelo: str | None = None, cliente=None) -> dict:
    from agente import MODELO, montar_sacola

    modelo = modelo or MODELO
    linhas = []
    for caso in CASOS:
        r = montar_sacola(caso["pedido"], cliente=cliente, modelo=modelo)
        if caso["impossivel"]:
            falhas = ["finalizou uma sacola para um pedido impossível"] if r.sacola is not None else []
        else:
            falhas = ["não finalizou a sacola"] if r.sacola is None else checar_sacola(caso, r.sacola)
        linhas.append({
            "pedido": caso["pedido"], "ok": not falhas, "falhas": falhas,
            "sacola": r.sacola, "total": r.plano.total if r.plano else None,
            "passos": r.passos, "rejeicoes": r.rejeicoes,
            "tokens_entrada": r.tokens_entrada, "tokens_saida": r.tokens_saida,
        })
        print(f"{'✅' if not falhas else '❌'} {caso['pedido'][:58]:58} "
              f"{'' if not falhas else '→ ' + '; '.join(falhas)}")

    n = len(linhas)
    resumo = {
        "modelo": modelo,
        "acertos": sum(l["ok"] for l in linhas), "casos": n,
        "taxa_acerto": round(sum(l["ok"] for l in linhas) / n, 3),
        "sacolas_rejeitadas_pela_validacao": sum(l["rejeicoes"] for l in linhas),
        "media_chamadas_ao_modelo": round(sum(l["passos"] for l in linhas) / n, 1),
        "media_tokens_entrada": round(sum(l["tokens_entrada"] for l in linhas) / n),
        "media_tokens_saida": round(sum(l["tokens_saida"] for l in linhas) / n),
    }
    print(f"\n{modelo}: {resumo['acertos']}/{n} casos ({resumo['taxa_acerto']:.0%}) · "
          f"{resumo['sacolas_rejeitadas_pela_validacao']} sacola(s) barrada(s) pela validação · "
          f"{resumo['media_chamadas_ao_modelo']} chamadas e "
          f"{resumo['media_tokens_entrada']}+{resumo['media_tokens_saida']} tokens por pedido, em média")
    return {"resumo": resumo, "casos": linhas}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--modelo")
    a = ap.parse_args()
    saida = avaliar(a.modelo)
    destino = AQUI / "reports" / f"avaliacao-{saida['resumo']['modelo']}.json"
    destino.parent.mkdir(exist_ok=True)
    destino.write_text(json.dumps(saida, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Resultado salvo em {destino.relative_to(AQUI)}")
