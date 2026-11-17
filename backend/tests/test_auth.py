"""Contas UMAMI (modo de testes), linhas com opções, cupons, endereços, busca e pedir de novo."""
import re

import pytest

from app.seed import DEMO


def ultimo_codigo(client, canal="whatsapp") -> str:
    caixa = client.get("/api/auth/caixa-de-testes").json()
    msg = next(m for m in caixa if m["canal"] == canal)
    return re.search(r"\b(\d{6})\b", msg["texto"]).group(1)


def entrar_demo(client) -> dict:
    d = client.post("/api/auth/entrar", json={"identificador": DEMO["email"], "senha": DEMO["senha"]}).json()
    d = client.post(f"/api/auth/desafios/{d['id']}/codigo", json={"codigo": ultimo_codigo(client)}).json()
    ini, fim = d["email"]["inicio"], d["email"]["fim"]
    escondido = DEMO["email"][len(ini): len(DEMO["email"]) - len(fim)]
    r = client.post(f"/api/auth/desafios/{d['id']}/email", json={"faltantes": escondido})
    assert r.json()["etapa"] == "concluido", r.text
    return r.json()


def test_login_em_etapas_com_whatsapp_e_email(client):
    assert client.get("/api/auth/eu").json()["usuario"] is None
    d = client.post("/api/auth/entrar", json={"identificador": "(11) 98888-0000", "senha": DEMO["senha"]}).json()
    assert d["etapa"] == "whatsapp" and d["telefone"].endswith("0000") and d["modo_teste"] is True
    caixa = client.get("/api/auth/caixa-de-testes").json()
    assert caixa[0]["canal"] == "whatsapp" and "código" in caixa[0]["texto"]
    d = client.post(f"/api/auth/desafios/{d['id']}/codigo", json={"codigo": ultimo_codigo(client)}).json()
    assert d["etapa"] == "email_confirmacao" and "•" in d["email_mascarado"]
    r = entrar_demo(client)
    assert r["usuario"]["email"] == DEMO["email"]
    assert client.get("/api/auth/eu").json()["usuario"]["primeiro_nome"] == "Ana"


def test_senha_errada_e_codigo_errado(client):
    assert client.post("/api/auth/entrar", json={"identificador": DEMO["email"], "senha": "errada"}).status_code == 401
    d = client.post("/api/auth/entrar", json={"identificador": DEMO["email"], "senha": DEMO["senha"]}).json()
    r = client.post(f"/api/auth/desafios/{d['id']}/codigo", json={"codigo": "000000"})
    assert r.status_code == 400 and "Restam 4" in r.json()["detail"]
    # erro no caminho → depois do e-mail, pede também o código enviado ao e-mail
    d = client.post(f"/api/auth/desafios/{d['id']}/codigo", json={"codigo": ultimo_codigo(client)}).json()
    ini, fim = d["email"]["inicio"], d["email"]["fim"]
    d = client.post(f"/api/auth/desafios/{d['id']}/email", json={"faltantes": DEMO["email"][len(ini): -len(fim)]}).json()
    assert d["etapa"] == "email_codigo"
    r = client.post(f"/api/auth/desafios/{d['id']}/codigo", json={"codigo": ultimo_codigo(client, "email")})
    assert r.json()["etapa"] == "concluido"


def test_bloqueia_apos_cinco_codigos_errados(client):
    d = client.post("/api/auth/entrar", json={"identificador": DEMO["email"], "senha": DEMO["senha"]}).json()
    for _ in range(4):
        client.post(f"/api/auth/desafios/{d['id']}/codigo", json={"codigo": "111111"})
    assert client.post(f"/api/auth/desafios/{d['id']}/codigo", json={"codigo": "111111"}).status_code == 429
    assert client.get(f"/api/auth/desafios/{d['id']}").status_code == 404


def test_reenvio_respeita_espera(client):
    d = client.post("/api/auth/entrar", json={"identificador": DEMO["email"], "senha": DEMO["senha"]}).json()
    assert d["reenvio_em_s"] > 0
    assert client.post(f"/api/auth/desafios/{d['id']}/reenviar").status_code == 429


def test_cadastro_novo_e_duplicado(client):
    corpo = {"nome": "Bruno Teste", "email": "bruno@exemplo.com", "telefone": "21 97777-1234", "senha": "senha-segura-1"}
    d = client.post("/api/auth/cadastro", json=corpo)
    assert d.status_code == 201 and d.json()["etapa"] == "whatsapp"
    assert client.post("/api/auth/cadastro", json=corpo).status_code == 409


def test_checkout_exige_login_e_sacola_anonima_migra(client):
    entrar_demo(client)
    client.delete("/api/sacola")  # a sacola da conta precisa estar vazia para receber a do visitante
    client.post("/api/auth/sair")
    client.put("/api/sacola/itens/b3", json={"qtd": 1})
    assert client.post("/api/pedidos", json={"pagamento": "pix"}).status_code == 401
    entrar_demo(client)
    assert any(i["id"] == "b3" for i in client.get("/api/sacola").json()["itens"])


def test_sessoes_e_sair(client):
    entrar_demo(client)
    sessoes = client.get("/api/auth/sessoes").json()
    assert any(s["atual"] for s in sessoes)
    client.post("/api/auth/sair")
    assert client.get("/api/auth/eu").json()["usuario"] is None
    assert client.get("/api/auth/sessoes").status_code == 401


# ---------- linhas com opções ----------

def test_opcoes_obrigatorias_e_precos(client):
    client.delete("/api/sacola")
    assert client.put("/api/sacola/itens/b1", json={"qtd": 1}).status_code == 422  # ponto da carne é obrigatório
    r = client.post("/api/sacola/linhas", json={"item_id": "b1", "qtd": 2, "opcoes": {"ponto": ["mal"], "extras": ["bacon", "cheddar"]},
                                              "observacao": "sem cebola"})
    linha = r.json()["itens"][0]
    assert linha["preco_unitario"] == pytest.approx(32.9 + 4.5 + 3.5) and linha["detalhes"] == ["Mal passado", "Bacon crocante", "Cheddar extra"]
    assert r.json()["plano"]["total_itens"] == pytest.approx((32.9 + 8) * 2)
    erro = client.post("/api/sacola/linhas", json={"item_id": "b1", "qtd": 1, "opcoes": {"ponto": ["mal", "bem"]}})
    assert erro.status_code == 422 and "no máximo" in erro.json()["detail"]
    # mesma combinação soma; combinação diferente vira outra linha
    client.post("/api/sacola/linhas", json={"item_id": "b1", "qtd": 1, "opcoes": {"ponto": ["mal"], "extras": ["cheddar", "bacon"]}, "observacao": "Sem cebola"})
    client.post("/api/sacola/linhas", json={"item_id": "b1", "qtd": 1, "opcoes": {"ponto": ["bem"]}})
    itens = client.get("/api/sacola").json()["itens"]
    assert sorted(i["qtd"] for i in itens) == [1, 3]


# ---------- cupons ----------

def test_cupom_minimo_loja_e_desconto(client):
    client.delete("/api/sacola")
    client.put("/api/sacola/itens/b3", json={"qtd": 1})
    s = client.put("/api/sacola/cupom", json={"codigo": "brasa15"}).json()
    assert not s["cupom"]["valido"] and "Faltam" in s["cupom"]["motivo"]
    s = client.put("/api/sacola/itens/b3", json={"qtd": 2}).json()
    assert s["cupom"]["valido"] and s["plano"]["desconto"] == pytest.approx(min(59.8 * 0.15, 12))
    assert s["plano"]["total_final"] == pytest.approx(s["plano"]["total"] - s["plano"]["desconto"])
    s = client.put("/api/sacola/cupom", json={"codigo": "ACAI5"}).json()
    assert not s["cupom"]["valido"] and "Açaí da Praça" in s["cupom"]["motivo"]
    assert client.put("/api/sacola/cupom", json={"codigo": "NAOEXISTE"}).status_code == 404


def test_pedido_guarda_desconto_opcoes_e_repete(client):
    entrar_demo(client)
    client.delete("/api/sacola")
    client.post("/api/sacola/linhas", json={"item_id": "n1", "qtd": 1, "opcoes": {"borda": ["catupiry"]}, "observacao": "bem assada"})
    client.put("/api/sacola/cupom", json={"codigo": "BEMVINDO"})
    p = client.post("/api/pedidos", json={"pagamento": "pix"}).json()
    assert p["desconto"] == 10 and p["cupom"] == "BEMVINDO"
    item = p["lojas"][0]["itens"][0]
    assert item["detalhes"] == ["Recheada com requeijão"] and item["observacao"] == "bem assada" and item["preco"] == pytest.approx(57.9)
    s = client.post(f"/api/pedidos/{p['id']}/repetir").json()
    assert s["itens"][0]["opcoes_escolhidas"] == {"borda": ["catupiry"]} and s["indisponiveis"] == []


# ---------- endereços e busca ----------

def test_enderecos(client):
    entrar_demo(client)
    lista = client.get("/api/enderecos").json()
    assert lista[0]["padrao"]
    lista = client.post("/api/enderecos", json={"apelido": "Trabalho", "linha": "Av. Paulista, 1000", "padrao": True}).json()
    assert lista[0]["apelido"] == "Trabalho" and sum(e["padrao"] for e in lista) == 1


def test_busca_por_loja_e_produto(client):
    r = client.get("/api/busca", params={"q": "poke"}).json()
    assert {i["id"] for i in r["itens"]} >= {"m1", "m2"} and r["lojas"][0]["id"] == "mar"
    assert client.get("/api/busca", params={"q": "farmacia"}).json()["lojas"][0]["id"] == "bem"
    assert client.get("/api/busca", params={"q": "x"}).json() == {"lojas": [], "itens": []}
