from datetime import UTC, datetime

from ..catalog import PADRAO, Catalogo
from ..models import Pedido

# Simulação acelerada do acompanhamento: 1 minuto de prazo = 2 segundos reais.
SEGUNDOS_POR_MINUTO = 2
ETAPAS = [(0.0, "confirmado", "Pedido confirmado"), (0.1, "preparando", "Em preparo"),
          (0.6, "a_caminho", "A caminho"), (1.0, "entregue", "Entregue")]


def loja_api(loja_id: str, cat: Catalogo = PADRAO) -> dict:
    l = cat.lojas[loja_id]
    return {
        "id": l["id"], "nome": l["nome"], "categoria": l["categoria"], "taxa": l["taxa"], "prazo": l["prazo"],
        "minimo": l["minimo"], "x": l["x"], "y": l["y"], "aberta": l.get("aberta", True),
        "abre_as": l.get("abre_as"), "nota": l.get("nota"), "cor": l.get("cor"),
        "distancia_km": round(cat.dist_cliente(loja_id), 2), "na_area": cat.na_area(loja_id),
        "imagem": l.get("imagem"), "prazo_max": l["prazo"] + 10,
        "cupons": [c["codigo"] for c in cat.cupons if c.get("loja") == loja_id],
    }


def item_api(item_id: str, cat: Catalogo = PADRAO) -> dict:
    i = cat.itens[item_id]
    return {
        "id": i["id"], "loja": i["loja"], "nome": i["nome"], "descricao": i["descricao"], "preco": i["preco"],
        "tipo": i["tipo"], "vegetariano": i["vegetariano"], "serve": i.get("serve", 1),
        "disponivel": cat.disponivel(item_id), "esgotado": not i.get("disponivel", True),
        "imagem": i.get("imagem"), "opcoes": i.get("opcoes", []),
    }


def etapa(pedido: Pedido, prazo: int, recusado: bool) -> dict:
    if recusado:
        return {"codigo": "recusado", "rotulo": "Recusado pela loja", "progresso": 0.0}
    criado = pedido.criado_em if pedido.criado_em.tzinfo else pedido.criado_em.replace(tzinfo=UTC)
    decorrido = (datetime.now(UTC) - criado).total_seconds()
    progresso = min(1.0, decorrido / max(1, prazo * SEGUNDOS_POR_MINUTO))
    atual = [e for e in ETAPAS if progresso >= e[0]][-1]
    return {"codigo": atual[1], "rotulo": atual[2], "progresso": round(progresso, 3)}


ENTREGADORES = ["Rafa", "Bia", "Joel", "Tati", "Caio", "Nina"]


def entregador(p: Pedido, loja_id: str) -> dict:
    """Entregador da demonstração (fictício e determinístico): a mesma entrega combinada tem o mesmo entregador."""
    grupo = next((i for i, g in enumerate(p.entregas) if loja_id in g["lojas"]), 0)
    nome = ENTREGADORES[(p.id * 7 + grupo) % len(ENTREGADORES)]
    return {"nome": nome, "veiculo": "Moto" if (p.id + grupo) % 3 else "Bicicleta", "simulado": True}


def pedido_api(p: Pedido) -> dict:
    lojas = []
    for pl in p.lojas:
        lojas.append({
            "loja_id": pl.loja_id, "loja_nome": pl.loja_nome, "subtotal": pl.subtotal, "prazo": pl.prazo,
            "recusado": pl.recusado, "valor_estorno": pl.valor_estorno, "motivo_recusa": pl.motivo_recusa,
            "etapa": etapa(p, pl.prazo, pl.recusado),
            "itens": [{"item_id": i.item_id, "nome": i.nome, "preco": i.preco, "qtd": i.qtd, "opcoes": i.opcoes,
                       "detalhes": i.detalhes, "observacao": i.observacao} for i in pl.itens],
            "entregador": entregador(p, pl.loja_id) if etapa(p, pl.prazo, pl.recusado)["codigo"] in ("a_caminho", "entregue") else None,
        })
    estornado = round(sum(pl.valor_estorno for pl in p.lojas), 2)
    return {
        "id": p.id, "criado_em": (p.criado_em if p.criado_em.tzinfo else p.criado_em.replace(tzinfo=UTC)).isoformat(), "endereco": p.endereco, "pagamento": p.pagamento,
        "total_itens": p.total_itens, "total_taxas": p.total_taxas, "economia": p.economia, "total": p.total,
        "estornado": estornado, "total_cobrado": round(p.total - estornado, 2), "prazo": p.prazo,
        "entregas": p.entregas, "origem": p.origem, "lojas": lojas, "cupom": p.cupom, "desconto": p.desconto,
        "etapas": [{"codigo": c, "rotulo": r} for _, c, r in ETAPAS],
    }
