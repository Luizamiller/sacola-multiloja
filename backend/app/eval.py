"""Avaliação do assistente contra o gabarito — nota dada por código, não por outro LLM.

- `casos_v1.json`: os 12 casos originais, contra o catálogo original (recorte V1).
- `casos_v2.json`: 12 casos novos, contra o catálogo ampliado (pizza, loja fechada,
  item indisponível, loja fora da área, limite de 4 lojas…).

Um caso passa quando:
  - possível:   o assistente propõe uma sacola aprovada que cumpre todas as restrições do gabarito;
  - impossível: o assistente NÃO propõe sacola (e explica).

Uso:
    uv run python -m app.eval                       # planejador determinístico
    uv run python -m app.eval --motor claude        # exige ANTHROPIC_API_KEY no .env
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .catalog import DATA_DIR, PADRAO, V1, Catalogo
from .rules import planejar
from .validation import checar_sacola

CASOS_V1 = json.loads((DATA_DIR / "casos_v1.json").read_text(encoding="utf-8"))
CASOS_V2 = json.loads((DATA_DIR / "casos_v2.json").read_text(encoding="utf-8"))
SUITES: list[tuple[str, list[dict], Catalogo]] = [("v1", CASOS_V1, V1), ("v2", CASOS_V2, PADRAO)]


def viavel_forca_bruta(caso: dict, cat: Catalogo = V1) -> bool:
    """Força bruta (com poda pelo orçamento) — portada do original. Só para o catálogo pequeno (V1)."""
    if caso.get("item_inexistente"):
        return False
    ids = sorted(cat.itens)
    limite = max(caso.get("pratos_min", 0), caso.get("sobremesas_min", 0), 1)
    orc = caso.get("orcamento")

    def busca(k: int, sacola: dict[str, int], gasto: float) -> bool:
        if orc is not None and gasto > orc:
            return False
        if sacola and not checar_sacola(caso, sacola, cat):
            return True
        if k == len(ids):
            return False
        for q in range(limite, -1, -1):
            nova = dict(sacola)
            if q:
                nova[ids[k]] = q
            if busca(k + 1, nova, gasto + cat.itens[ids[k]]["preco"] * q):
                return True
        return False

    return busca(0, {}, 0.0)


def avaliar(motor: str = "deterministico", cliente=None, mostrar: bool = True) -> dict:
    from .assistant.service import montar

    linhas = []
    for suite, casos, cat in SUITES:
        for caso in casos:
            p = montar(caso["pedido"], cat, motor=motor, cliente=cliente)
            if caso["impossivel"]:
                falhas = ["propôs sacola para um pedido impossível"] if p.sacola is not None else []
            else:
                falhas = ["não propôs sacola"] if p.sacola is None else checar_sacola(caso, p.sacola, cat)
            linhas.append({
                "suite": suite, "pedido": caso["pedido"], "ok": not falhas, "falhas": falhas,
                "sacola": p.sacola, "total": planejar(p.sacola, cat=cat).total if p.sacola else None,
                "motivos": p.motivos, **{k: p.metricas.get(k, 0) for k in ("passos", "rejeicoes", "tokens_entrada", "tokens_saida", "ms")},
            })
            if mostrar:
                marca = "ok   " if not falhas else "FALHA"
                print(f"[{suite}] {marca} {caso['pedido'][:58]:58} {'; '.join(falhas)}")
    n = len(linhas)
    resumo = {
        "motor": motor, "casos": n, "acertos": sum(l["ok"] for l in linhas),
        "taxa_acerto": round(sum(l["ok"] for l in linhas) / n, 3),
        "por_suite": {s: f"{sum(l['ok'] for l in linhas if l['suite'] == s)}/{sum(1 for l in linhas if l['suite'] == s)}"
                      for s, _, _ in SUITES},
        "sacolas_rejeitadas_pela_validacao": sum(l["rejeicoes"] for l in linhas),
        "media_ms": round(sum(l["ms"] for l in linhas) / n),
        "media_tokens_entrada": round(sum(l["tokens_entrada"] for l in linhas) / n),
        "media_tokens_saida": round(sum(l["tokens_saida"] for l in linhas) / n),
    }
    if mostrar:
        print(f"\n{motor}: {resumo['acertos']}/{n} ({resumo['taxa_acerto']:.0%}) · por suíte {resumo['por_suite']}")
    return {"resumo": resumo, "casos": linhas}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--motor", default="deterministico", choices=["deterministico", "claude"])
    a = ap.parse_args()
    saida = avaliar(a.motor)
    destino = Path(__file__).resolve().parents[1] / "reports" / f"avaliacao-{a.motor}.json"
    destino.parent.mkdir(exist_ok=True)
    destino.write_text(json.dumps(saida, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Resultado salvo em {destino.name}")
