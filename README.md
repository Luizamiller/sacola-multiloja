# Sacola Multi-loja

Estudo de produto + protótipo navegável para um app de delivery: uma sacola que aceita itens de **várias lojas ao mesmo tempo**, com **entrega combinada** para lojas próximas e **pratos favoritos** reutilizáveis.

> Projeto conceitual de portfólio, sem vínculo com nenhuma empresa. Lojas, preços e distâncias são fictícios.

## O problema

Em apps de delivery, a sacola costuma aceitar apenas uma loja. Ao adicionar um item de outra loja, o usuário precisa descartar a sacola atual ou desistir do novo item. Isso gera:

- dois checkouts para um pedido que, na cabeça do usuário, é um só (almoço + sobremesa, refeição + farmácia);
- perda de itens escolhidos com calma;
- nenhum lugar para guardar **pratos** (não só restaurantes) que a pessoa pede sempre.

## A solução

| Hoje | Proposta |
|---|---|
| 1 loja por sacola | Sacola agrupada por loja (até 4) |
| Trocar de loja apaga a sacola | Itens de lojas diferentes convivem |
| Favoritos só de restaurantes | Pratos favoritos + listas salvas ("Sexta de sempre") |
| Uma taxa por pedido | Entrega combinada para lojas a até 2 km |

Pagamento único; cada loja recebe só o seu pedido, então a operação do restaurante não muda.

## Regras de negócio

- **Limite:** até 4 lojas por sacola.
- **Pedido mínimo:** vale por loja; o checkout fica bloqueado até ajustar.
- **Agrupamento:** lojas a ≤ 2 km entre si formam um grupo (componentes conectados num grafo de distâncias).
- **Taxa combinada:** `max(taxas) + 1,99 × (n − 1)`
- **Prazo combinado:** `max(prazos) + 5 min × (n − 1)` — o usuário pode separar o grupo se tiver pressa.
- **Cupom:** por loja.
- **Cancelamento parcial:** se uma loja recusar, só aquele pedido é estornado.

## Camada de IA (próximo passo)

- **Assistente de pedido:** um LLM interpreta "jantar para 3 com sobremesa, até R$ 120" e devolve uma sacola montada a partir do cardápio, do histórico e dos favoritos.
- **Sugestão de agrupamento:** avisar quando lojas da sacola podem sair juntas.
- **Complemento inteligente:** sugerir loja próxima para o que falta (bebida, sobremesa).

No protótipo essas sugestões são regras simples; a versão com LLM é o próximo passo.

## Métricas

- Abandono ao trocar de loja
- Ticket médio
- Taxa de uso da entrega combinada
- Recompra via listas salvas

Riscos: prazo maior em entregas combinadas, cancelamentos parciais, complexidade logística para o entregador.

## Protótipo

`index.html` é um único arquivo (HTML + CSS + JavaScript puro, sem dependências). Para rodar, basta abrir no navegador.

Dá para:
- navegar pelas lojas e adicionar itens de lojas diferentes;
- favoritar pratos e repetir uma lista salva;
- ligar/desligar a entrega combinada e ver taxa, prazo e economia mudarem;
- ver o bloqueio de pedido mínimo por loja;
- finalizar com um pagamento que gera um pedido por loja.

## Estrutura do código

- `STORES` / `ITEMS`: dados fictícios (com coordenadas em km).
- `clusters()`: agrupa lojas por proximidade (BFS com limite de 2 km).
- `plan()`: calcula subtotais, taxas, prazos, economia e bloqueios.
- `render()`: desenha as três abas (Início, Favoritos, Sacola).

---
Autora: **Luiza Miller** · [LinkedIn](https://linkedin.com/in/luiza-miller)
