"""Regras de negócio, validação, planejador e agente — rodam sem chave de API.

Os testes marcados como 'original' são portados de assistente/test_assistente.py do protótipo
e usam o catálogo original (V1), com os mesmos números.
"""
from types import SimpleNamespace as NS

import pytest

from app.assistant.claude_agent import FERRAMENTAS, executar_ferramenta, montar_sacola
from app.assistant.parser import interpretar
from app.assistant.planner import diagnosticar
from app.assistant.service import montar
from app.catalog import PADRAO, V1
from app.eval import CASOS_V1, CASOS_V2, avaliar, viavel_forca_bruta
from app.rules import agrupar, planejar
from app.validation import Restricoes, checar_sacola, validar

# ---------- regras (original) ----------

def test_sacola_inicial_do_prototipo():
    p = planejar({"b1": 1, "b2": 1, "m1": 1, "v2": 1, "v3": 1}, cat=V1)
    assert len(p.grupos) == 1 and p.grupos[0]["combinada"]
    assert p.total_taxas == pytest.approx(6.99 + 1.99 * 2)
    assert p.economia == pytest.approx(6.99 + 4.99 + 3.99 - 10.97)
    assert p.prazo == 35 + 5 * 2
    assert p.problemas == []


def test_loja_distante_nao_entra_na_entrega_combinada():
    assert sorted(map(sorted, agrupar(["brasa", "acai"], V1))) == [["acai"], ["brasa"]]


def test_pedido_minimo_por_loja():
    assert any("pedido mínimo" in x for x in planejar({"v3": 1}, cat=V1).problemas)


def test_orcamento_vale_para_o_total_com_entrega():
    assert any("orçamento" in x for x in planejar({"b3": 1}, orcamento=30, cat=V1).problemas)


def test_item_inexistente_e_quantidade_invalida():
    p = planejar({"pizza": 1, "b1": 0}, cat=V1)
    assert any("não existe" in x for x in p.problemas)
    assert any("Quantidade" in x for x in p.problemas)


# ---------- regras (novas) ----------

def test_cliente_pode_separar_uma_loja_do_grupo():
    junto = planejar({"b1": 1, "m1": 1}, cat=V1)
    separado = planejar({"b1": 1, "m1": 1}, separadas=["mar"], cat=V1)
    assert len(junto.grupos) == 1 and len(separado.grupos) == 2
    assert separado.total_taxas == pytest.approx(6.99 + 4.99)
    assert separado.prazo == 35 and junto.prazo == 40


def test_loja_fechada_item_esgotado_e_fora_da_area():
    codigos = {o.codigo for o in planejar({"l1": 1, "v4": 2, "v3": 1, "s1": 1}).ocorrencias}
    assert {"loja_fechada", "indisponivel", "fora_da_area"} <= codigos


def test_limite_de_quatro_lojas():
    p = planejar({"b1": 1, "m1": 1, "a1": 1, "n1": 1, "h1": 1})
    assert any(o.codigo == "limite_lojas" for o in p.ocorrencias)


def test_pizza_serve_duas_porcoes():
    r = Restricoes(pratos_min=3)
    assert checar_sacola(r, {"n1": 2}) == []
    assert "menos de 3 prato(s)" in checar_sacola(r, {"n1": 1})


def test_validacao_lista_cada_checagem():
    r = Restricoes(pratos_min=1, orcamento=20)
    v = validar(r, {"b1": 1})
    ids = {c["id"]: c["ok"] for c in v.checks}
    assert not v.aprovada and ids["orcamento"] is False and ids["pedido"] is True and ids["minimo"] is True


# ---------- interpretação do pedido ----------

@pytest.mark.parametrize("texto,esperado", [
    ("Jantar para 3 com sobremesa, até R$ 130", dict(pessoas=3, pratos_min=3, sobremesas_min=1, orcamento=130)),
    ("Sobremesa para 3 pessoas", dict(sobremesas_min=3, pratos_min=0)),
    ("Almoço vegetariano para 2 pessoas, até R$ 90", dict(vegetariano=True, pratos_min=2, orcamento=90)),
    ("jantar pra 4 sem carne no máximo 160,50", dict(vegetariano=True, pratos_min=4, orcamento=160.5)),
    ("Um poke de salmão e um missoshiro, o mais rápido possível", dict(prioridade="prazo")),
])
def test_interpretacao(texto, esperado):
    r = interpretar(texto, V1)
    for k, v in esperado.items():
        assert getattr(r, k) == v, k


def test_termo_mais_especifico_vence():
    r = interpretar("Um poke de salmão e um missoshiro", V1)
    assert [g.ids for g in r.grupos] == [["m1"], ["m3"]]


def test_item_que_nao_existe_no_recorte_original():
    assert interpretar("Pizza para 3 pessoas", V1).item_inexistente == "pizza"
    assert interpretar("Pizza para 3 pessoas", PADRAO).item_inexistente is None


# ---------- gabarito ----------

@pytest.mark.parametrize("caso", CASOS_V1, ids=[c["pedido"][:40] for c in CASOS_V1])
def test_gabarito_original_confere_com_forca_bruta(caso):
    assert viavel_forca_bruta(caso, V1) != caso["impossivel"]


@pytest.mark.parametrize("caso", [c for c in CASOS_V2 if c["impossivel"]], ids=lambda c: c["pedido"][:40])
def test_gabarito_v2_impossiveis_sao_impossiveis(caso):
    """Cada caso impossível do catálogo ampliado tem um motivo verificável de forma independente."""
    motivo = caso["motivo"]
    if motivo == "loja_fechada":
        assert not PADRAO.lojas[caso["loja"]]["aberta"]
        assert all(PADRAO.itens[i]["loja"] == caso["loja"] for i in interpretar(caso["pedido"]).grupos[0].ids)
    elif motivo == "fora_da_area":
        assert not PADRAO.na_area(caso["loja"])
    elif motivo == "indisponivel":
        assert PADRAO.itens[caso["item"]].get("disponivel") is False
    elif motivo == "limite_lojas":
        assert len(set(caso["lojas_exigidas"])) > 4
        for g in interpretar(caso["pedido"]).grupos:
            assert len({PADRAO.itens[i]["loja"] for i in g.ids}) == 1
    elif motivo == "orcamento":  # limite inferior: porções mais baratas + sobremesa mais barata + menor taxa
        pratos = sorted(i["preco"] / i.get("serve", 1) for i in PADRAO.itens.values() if i["tipo"] == "prato")
        sobremesa = min(i["preco"] for i in PADRAO.itens.values() if i["tipo"] == "sobremesa")
        taxa = min(l["taxa"] for l in PADRAO.lojas.values())
        assert sum(pratos[: caso["pratos_min"]]) + sobremesa + taxa > caso["orcamento"]


def test_planejador_acerta_os_24_casos():
    saida = avaliar("deterministico", mostrar=False)
    assert saida["resumo"]["acertos"] == 24, [c for c in saida["casos"] if not c["ok"]]


def test_impossivel_explica_e_sugere_alternativa():
    d = diagnosticar(interpretar("Jantar para 3 com sobremesa, gastando no máximo R$ 100", V1), V1)
    assert not d.possivel and "acima do orçamento" in d.motivos[0]
    assert d.alternativa and checar_sacola(Restricoes(pratos_min=3, sobremesas_min=1), d.alternativa, V1) == []


def test_limite_de_lojas_e_explicado():
    d = diagnosticar(interpretar("Hambúrguer, pizza, poke, açaí e salada"))
    assert any("5 lojas" in m for m in d.motivos)


# ---------- agente Claude (simulado) ----------

def uso(nome, entrada, i):
    return NS(type="tool_use", id=f"t{i}", name=nome, input=entrada)


def texto(t):
    return NS(type="text", text=t)


class ClienteRoteirizado:
    def __init__(self, roteiro):
        self.roteiro, self.recebido = list(roteiro), []
        self.messages = self

    def create(self, **kw):
        self.recebido.append(kw)
        return NS(content=self.roteiro.pop(0), usage=NS(input_tokens=100, output_tokens=20))


def test_ferramentas_tem_schema_valido():
    assert {f["name"] for f in FERRAMENTAS} == {"listar_lojas", "buscar_itens", "simular_sacola", "finalizar_sacola"}


def test_buscar_itens_filtra_vegetariano_no_catalogo_original():
    saida, erro = executar_ferramenta("buscar_itens", {"tipo": "prato", "vegetariano": True}, V1)
    assert not erro and {i["id"] for i in saida["itens"]} == {"b3", "m2"}


def test_finalizar_rejeita_sacola_com_problema():
    saida, erro = executar_ferramenta("finalizar_sacola", {"itens": [{"id": "v3", "qtd": 1}], "resumo": "x"}, V1)
    assert erro and saida["aceita"] is False and saida["problemas"]


def test_orcamento_do_texto_vale_mesmo_se_o_modelo_esquecer():
    r = interpretar("jantar para 1 até R$ 30", V1)
    saida, erro = executar_ferramenta("finalizar_sacola", {"itens": [{"id": "b3", "qtd": 1}], "resumo": "x"}, V1, r)
    assert erro and any("orçamento" in p for p in saida["problemas"])


def test_validacao_barra_sacola_fora_do_orcamento_e_modelo_corrige():
    caro = [{"id": "m1", "qtd": 3}]
    certo = [{"id": "b3", "qtd": 2}, {"id": "m2", "qtd": 1}]
    cliente = ClienteRoteirizado([
        [uso("buscar_itens", {"tipo": "prato"}, 1)],
        [uso("finalizar_sacola", {"itens": caro, "orcamento": 110, "resumo": "3 pokes"}, 2)],
        [uso("simular_sacola", {"itens": certo, "orcamento": 110}, 3)],
        [uso("finalizar_sacola", {"itens": certo, "orcamento": 110, "resumo": "2 veggies e 1 poke"}, 4)],
    ])
    r = montar_sacola("jantar para 3 até R$ 110", cliente, "modelo-teste", V1, interpretar("jantar para 3 até R$ 110", V1))
    assert r.rejeicoes == 1 and r.sacola == {"b3": 2, "m2": 1}
    rejeicao = cliente.recebido[-1]["messages"][4]["content"][0]
    assert rejeicao["is_error"] and "orçamento" in rejeicao["content"]


def test_pedido_impossivel_termina_sem_sacola():
    cliente = ClienteRoteirizado([[uso("buscar_itens", {"termo": "pizza"}, 1)],
                                  [texto("Não temos pizza no cardápio. Posso montar 3 hambúrgueres veggie?")]])
    r = montar_sacola("pizza para 3", cliente, "m", V1)
    assert r.sacola is None and "pizza" in r.resposta_texto.lower()


def test_limite_de_passos():
    cliente = ClienteRoteirizado([[uso("listar_lojas", {}, i)] for i in range(5)])
    r = montar_sacola("qualquer coisa", cliente, "m", V1, max_passos=5)
    assert r.sacola is None and r.passos == 5


def test_servico_revalida_a_sacola_do_claude():
    """Mesmo que o modelo 'finalize', o serviço valida de novo com as restrições do texto."""
    cliente = ClienteRoteirizado([[uso("finalizar_sacola", {"itens": [{"id": "b3", "qtd": 1}], "resumo": "ok"}, 1)]])
    p = montar("um hambúrguer veggie", V1, motor="claude", cliente=cliente)
    assert p.status == "pronta" and p.validacao["aprovada"] and p.motor == "claude"


def test_servico_cai_para_deterministico_se_o_claude_falhar():
    class Quebrado:
        messages = None
        def __init__(self): self.messages = self
        def create(self, **kw): raise ConnectionError("sem rede")
    p = montar("Sobremesa para 3 pessoas", V1, motor="claude", cliente=Quebrado())
    assert p.motor == "deterministico" and p.status == "pronta" and p.aviso
