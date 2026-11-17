"""Orquestra o assistente: interpreta, escolhe o motor, valida e devolve uma proposta.

Fluxo:
  1. `parser.interpretar` entende o pedido (orçamento, pessoas, itens citados…).
  2. Motor: Claude com tool use (se houver chave) ou planejador determinístico.
  3. A sacola resultante passa SEMPRE por `validation.validar`, mesmo vinda do Claude.
     Só uma proposta aprovada pode ser adicionada à sacola do cliente.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

from ..catalog import PADRAO, Catalogo
from ..config import get_settings
from ..validation import Restricoes, validar
from . import claude_agent, planner
from .parser import interpretar

log = logging.getLogger("sacola.assistente")


@dataclass
class Proposta:
    pedido: str
    motor: str
    restricoes: Restricoes
    status: str  # pronta | impossivel
    sacola: dict[str, int] | None = None
    resumo: str = ""
    motivos: list[str] = field(default_factory=list)
    alternativa: dict[str, int] | None = None
    alternativa_descricao: str = ""
    validacao: dict | None = None
    metricas: dict = field(default_factory=dict)
    aviso: str | None = None


def _resumo_deterministico(sacola: dict[str, int], cat: Catalogo, r: Restricoes) -> str:
    v = validar(r, sacola, cat)
    lojas = [cat.lojas[l]["nome"] for l in v.plano.subtotal_por_loja]
    combinada = any(g["combinada"] for g in v.plano.grupos)
    partes = [f"{len(lojas)} {'loja' if len(lojas) == 1 else 'lojas'} ({', '.join(lojas)})"]
    if combinada:
        partes.append(f"entrega combinada economiza R$ {v.plano.economia:.2f}".replace(".", ","))
    alvo = "a opção mais rápida" if r.prioridade == "prazo" else "a combinação mais barata"
    return f"Escolhi {alvo} que atende ao pedido: " + "; ".join(partes) + "."


def _cliente_claude(api_key: str):
    import anthropic
    return anthropic.Anthropic(api_key=api_key)


def montar(pedido: str, cat: Catalogo = PADRAO, motor: str | None = None, cliente=None) -> Proposta:
    cfg = get_settings()
    r = interpretar(pedido, cat)
    motor = motor or cfg.motor_assistente
    if motor == "auto":
        motor = "claude" if (cliente is not None or cfg.anthropic_api_key) else "deterministico"
    inicio = time.perf_counter()

    if motor == "claude":
        try:
            res = claude_agent.montar_sacola(
                pedido, cliente or _cliente_claude(cfg.anthropic_api_key), cfg.modelo_claude, cat, r)
        except Exception as exc:  # rede, chave inválida, limite de uso…
            log.warning("Claude indisponível (%s); usando o planejador determinístico", type(exc).__name__)
            p = montar(pedido, cat, motor="deterministico")
            p.aviso = "O Claude não respondeu; esta proposta veio do planejador determinístico."
            return p
        metricas = {"passos": res.passos, "rejeicoes": res.rejeicoes, "tokens_entrada": res.tokens_entrada,
                    "tokens_saida": res.tokens_saida, "ferramentas": res.ferramentas_usadas}
        if res.sacola is None:
            return Proposta(pedido, "claude", r, "impossivel", motivos=[res.resposta_texto], metricas=metricas)
        v = validar(r, res.sacola, cat)
        if not v.aprovada:  # defesa em profundidade: nunca deveria acontecer
            log.error("Sacola do Claude reprovada na validação final: %s", v.checks)
            return Proposta(pedido, "claude", r, "impossivel",
                            motivos=["A sugestão do modelo não passou na validação final."],
                            validacao=v.to_api(), metricas=metricas)
        prop = Proposta(pedido, "claude", r, "pronta", res.sacola, res.resumo, validacao=v.to_api(), metricas=metricas)
    else:
        d = planner.diagnosticar(r, cat)
        if d.possivel:
            v = validar(r, d.sacola, cat)
            prop = Proposta(pedido, "deterministico", r, "pronta", d.sacola,
                            _resumo_deterministico(d.sacola, cat, r), validacao=v.to_api())
        else:
            prop = Proposta(pedido, "deterministico", r, "impossivel", motivos=d.motivos,
                            alternativa=d.alternativa, alternativa_descricao=d.alternativa_descricao)
    prop.metricas["ms"] = round((time.perf_counter() - inicio) * 1000)
    log.info("assistente motor=%s status=%s ms=%s", prop.motor, prop.status, prop.metricas["ms"])
    return prop
