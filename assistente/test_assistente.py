"""Testes do assistente — rodam sem chave de API (o modelo é simulado).

    pytest -q
"""
from types import SimpleNamespace as NS

import pytest

from agente import FERRAMENTAS, executar_ferramenta, montar_sacola
from avaliar import CASOS, avaliar, checar_sacola, viavel
from regras import ITENS, LOJAS, agrupar, planejar


# ---------- regras de negócio: mesmos números do protótipo (index.html) ----------

def test_sacola_inicial_do_prototipo():
    # sacola que o index.html abre por padrão: Brasa + Mar & Arroz + Farmácia, todas a ≤ 2 km
    p = planejar({"b1": 1, "b2": 1, "m1": 1, "v2": 1, "v3": 1})
    assert len(p.grupos) == 1 and p.grupos[0]["combinada"]
    assert p.total_taxas == pytest.approx(6.99 + 1.99 * 2)   # maior taxa + 1,99 por loja extra
    assert p.economia == pytest.approx(6.99 + 4.99 + 3.99 - 10.97)
    assert p.prazo == 35 + 5 * 2                             # maior prazo + 5 min por loja extra
    assert p.problemas == []


def test_loja_distante_nao_entra_na_entrega_combinada():
    assert sorted(map(sorted, agrupar(["brasa", "acai"]))) == [["acai"], ["brasa"]]


def test_pedido_minimo_por_loja():
    p = planejar({"v3": 1})  # R$ 8,50 numa farmácia com mínimo de R$ 15
    assert any("pedido mínimo" in x for x in p.problemas)


def test_orcamento_vale_para_o_total_com_entrega():
    p = planejar({"b3": 1}, orcamento=30)  # 29,90 de item cabe, mas + 6,99 de entrega não
    assert any("orçamento" in x for x in p.problemas)


def test_item_inexistente_e_quantidade_invalida():
    p = planejar({"pizza": 1, "b1": 0})
    assert any("não existe" in x for x in p.problemas)
    assert any("Quantidade" in x for x in p.problemas)


# ---------- ferramentas ----------

def test_buscar_itens_filtra_vegetariano():
    saida, erro = executar_ferramenta("buscar_itens", {"tipo": "prato", "vegetariano": True})
    assert not erro and {i["id"] for i in saida["itens"]} == {"b3", "m2"}


def test_finalizar_rejeita_sacola_com_problema():
    saida, erro = executar_ferramenta("finalizar_sacola", {"itens": [{"id": "v3", "qtd": 1}], "resumo": "x"})
    assert erro and saida["aceita"] is False and saida["problemas"]


def test_ferramentas_tem_schema_valido():
    nomes = {f["name"] for f in FERRAMENTAS}
    assert nomes == {"listar_lojas", "buscar_itens", "simular_sacola", "finalizar_sacola"}
    assert all(f["input_schema"]["type"] == "object" for f in FERRAMENTAS)


# ---------- laço do agente, com o Claude simulado ----------

def uso(nome, entrada, i):
    return NS(type="tool_use", id=f"t{i}", name=nome, input=entrada)


def texto(t):
    return NS(type="text", text=t)


class ClienteRoteirizado:
    """Devolve respostas pré-definidas, na ordem, e guarda o que recebeu."""

    def __init__(self, roteiro):
        self.roteiro, self.recebido = list(roteiro), []
        self.messages = self

    def create(self, **kw):
        self.recebido.append(kw)
        return NS(content=self.roteiro.pop(0), usage=NS(input_tokens=100, output_tokens=20))


def test_validacao_barra_sacola_fora_do_orcamento_e_modelo_corrige():
    caro = [{"id": "m1", "qtd": 3}]                                  # 3 pokes de salmão: R$ 133,69
    certo = [{"id": "b3", "qtd": 2}, {"id": "m2", "qtd": 1}]          # cabe em R$ 110
    cliente = ClienteRoteirizado([
        [uso("buscar_itens", {"tipo": "prato"}, 1)],
        [uso("finalizar_sacola", {"itens": caro, "orcamento": 110, "resumo": "3 pokes"}, 2)],
        [uso("simular_sacola", {"itens": certo, "orcamento": 110}, 3)],
        [uso("finalizar_sacola", {"itens": certo, "orcamento": 110, "resumo": "2 veggies e 1 poke"}, 4)],
    ])
    r = montar_sacola("jantar para 3 até R$ 110", cliente=cliente)
    assert r.rejeicoes == 1
    assert r.sacola == {"b3": 2, "m2": 1} and r.plano.problemas == []
    # o modelo recebeu o motivo da rejeição para poder corrigir
    # mensagens: [pedido, busca, resultado, finalizar, REJEIÇÃO, ...]
    rejeicao = cliente.recebido[-1]["messages"][4]["content"][0]
    assert rejeicao["is_error"] and "orçamento" in rejeicao["content"]


def test_pedido_impossivel_termina_sem_sacola():
    cliente = ClienteRoteirizado([
        [uso("buscar_itens", {"termo": "pizza"}, 1)],
        [texto("Não temos pizza no cardápio. Posso montar 3 hambúrgueres veggie?")],
    ])
    r = montar_sacola("pizza para 3", cliente=cliente)
    assert r.sacola is None and "pizza" in r.resposta_texto.lower()


def test_limite_de_passos():
    cliente = ClienteRoteirizado([[uso("listar_lojas", {}, i)] for i in range(5)])
    r = montar_sacola("qualquer coisa", cliente=cliente, max_passos=5)
    assert r.sacola is None and r.passos == 5 and "5 passos" in r.resposta_texto


# ---------- o gabarito da avaliação está certo? ----------

@pytest.mark.parametrize("caso", CASOS, ids=[c["pedido"][:40] for c in CASOS])
def test_gabarito_confere_com_forca_bruta(caso):
    assert viavel(caso) != caso["impossivel"]


def test_ids_do_gabarito_existem():
    for c in CASOS:
        for i in c.get("deve_conter", []) + [x for g in c.get("um_de", []) for x in g]:
            assert i in ITENS


def test_checar_sacola_pega_item_com_carne_em_pedido_vegetariano():
    caso = {"pratos_min": 1, "vegetariano": True}
    assert checar_sacola(caso, {"b3": 1}) == []
    assert "item não vegetariano" in checar_sacola(caso, {"b1": 1})


def test_avaliacao_roda_ponta_a_ponta_com_modelo_que_nunca_finaliza():
    class SempreRecusa:
        messages = None
        def __init__(self): self.messages = self
        def create(self, **kw): return NS(content=[texto("Não consigo.")], usage=NS(input_tokens=1, output_tokens=1))

    saida = avaliar("simulado", cliente=SempreRecusa())
    impossiveis = sum(c["impossivel"] for c in CASOS)
    assert saida["resumo"]["acertos"] == impossiveis  # só acerta os casos impossíveis
