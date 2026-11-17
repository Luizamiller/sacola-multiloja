"""Fluxos ponta a ponta pela API: sacola, entrega combinada, checkout, recusa parcial, listas e assistente."""
from .test_auth import entrar_demo


def test_catalogo(client):
    d = client.get("/api/catalogo").json()
    assert len(d["lojas"]) == 11 and any(not l["na_area"] for l in d["lojas"])
    assert client.get("/api/health").json()["motor_assistente"] == "deterministico"


def test_fluxo_completo_de_compra_multi_loja(client):
    entrar_demo(client)
    client.delete("/api/sacola")
    escolhas = {"b1": {"ponto": ["ao_ponto"]}, "b2": {"molho": ["maionese_verde"]}, "m1": {"base": ["arroz"]}, "v2": {}, "v3": {}}
    for item, opcoes in escolhas.items():
        r = client.post("/api/sacola/linhas", json={"item_id": item, "qtd": 1, "opcoes": opcoes})
        assert r.status_code == 201, r.text
    plano = r.json()["plano"]
    assert plano["pode_finalizar"] and len(plano["entregas"]) == 1 and plano["entregas"][0]["combinada"]
    assert round(plano["economia"], 2) == 5.0  # 6,99 + 4,99 + 3,99 − (6,99 + 2 × 1,99)

    sep = client.put("/api/sacola/separadas", json={"lojas": ["mar"]}).json()
    assert len(sep["plano"]["entregas"]) == 2

    ped = client.post("/api/pedidos", json={"pagamento": "pix"})
    assert ped.status_code == 201
    p = ped.json()
    assert len(p["lojas"]) == 3 and client.get("/api/sacola").json()["itens"] == []

    rec = client.post(f"/api/pedidos/{p['id']}/lojas/bem/recusar").json()
    bem = next(l for l in rec["lojas"] if l["loja_id"] == "bem")
    assert bem["recusado"] and bem["valor_estorno"] >= bem["subtotal"]
    assert rec["total_cobrado"] < rec["total"]
    assert client.post(f"/api/pedidos/{p['id']}/lojas/bem/recusar").status_code == 409


def test_checkout_bloqueado_abaixo_do_minimo(client):
    entrar_demo(client)
    client.delete("/api/sacola")
    client.put("/api/sacola/itens/v3", json={"qtd": 1})
    r = client.post("/api/pedidos", json={"pagamento": "pix"})
    assert r.status_code == 422 and "mínimo" in str(r.json())


def test_quinta_loja_e_recusada(client):
    client.delete("/api/sacola")
    for i in ("b3", "a2", "v3"):
        assert client.put(f"/api/sacola/itens/{i}", json={"qtd": 1}).status_code == 200
    client.post("/api/sacola/linhas", json={"item_id": "n1", "qtd": 1, "opcoes": {"borda": ["tradicional"]}})
    assert client.put("/api/sacola/itens/h2", json={"qtd": 1}).status_code == 409


def test_item_esgotado_nao_entra(client):
    assert client.put("/api/sacola/itens/v4", json={"qtd": 1}).status_code == 409


def test_lista_salva_e_favoritos(client):
    listas = client.get("/api/listas").json()
    assert listas[0]["nome"] == "Sexta de sempre"
    client.delete("/api/sacola")
    sac = client.post(f"/api/listas/{listas[0]['id']}/aplicar").json()
    assert {i["id"] for i in sac["itens"]} == {"b1", "b2", "a1"}
    nova = client.post("/api/listas", json={"nome": "Almoço rápido"}).json()
    assert nova["lojas"] == 2
    assert [f["id"] for f in client.put("/api/favoritos/m2").json()] == ["m2"]
    assert client.delete("/api/favoritos/m2").json() == []


def test_assistente_monta_e_aplica(client):
    r = client.post("/api/assistente", json={"pedido": "Jantar para 3 com sobremesa, até R$ 130"}).json()
    assert r["status"] == "pronta" and r["validacao"]["aprovada"] and r["motor"] == "deterministico"
    assert r["proposta"]["plano"]["total"] <= 130
    assert "3 pessoas" in r["restricoes"]["rotulos"]
    itens = {i["id"]: i["qtd"] for i in r["proposta"]["itens"]}
    sac = client.post("/api/sacola/aplicar", json={"itens": itens, "modo": "substituir"}).json()
    assert sac["plano"]["pode_finalizar"]


def test_assistente_explica_impossivel(client):
    r = client.post("/api/assistente", json={"pedido": "Tacos para 2"}).json()
    assert r["status"] == "impossivel" and r["proposta"] is None and "fechada" in r["motivos"][0]
