# Arquitetura e decisões

## Visão geral

Uma API FastAPI concentra as regras de negócio e serve o frontend React em produção. O catálogo é dado de produto versionado em JSON (somente leitura); o estado do usuário — sacola, favoritos, listas, pedidos e log do assistente — fica num banco relacional via SQLAlchemy 2, com migrações Alembic.

| Camada | Escolha | Por quê |
|---|---|---|
| API | FastAPI + Pydantic 2 | Contratos tipados, validação de entrada e OpenAPI em `/api/docs` |
| Persistência | SQLAlchemy 2 + Alembic | Mesmo código em SQLite (dev) e Postgres (produção, `docker compose`) |
| Regras | Python puro (`rules.py`) | Fonte única: interface, checkout e assistente chamam a mesma função |
| Assistente | Claude (tool use) ou planejador determinístico | Funciona sem chave; com chave, o modelo escolhe e o código valida |
| Frontend | React 19, Vite, Tailwind 4, Radix, Motion | Componentes acessíveis, animações curtas e com propósito |
| Estado no cliente | TanStack Query | Cache do servidor, atualização otimista da quantidade |

Rust não foi usado: não há gargalo computacional que justifique (a avaliação inteira roda em ~100 ms).

## Fluxo do assistente

1. `assistant/parser.py` interpreta o pedido em `Restricoes` (pessoas, orçamento, pratos, sobremesas, bebidas, vegetariano, itens citados, prioridade por prazo). Termos mais longos casam primeiro ("poke de salmão" antes de "poke"); comidas conhecidas ausentes do catálogo viram `item_inexistente`.
2. Motor:
   - **Claude** (`assistant/claude_agent.py`): agente com quatro ferramentas. `finalizar_sacola` passa por `validation.validar`; o orçamento entendido do texto vale mesmo que o modelo não o envie.
   - **Planejador** (`assistant/planner.py`): enumera conjuntos de até 4 lojas elegíveis, monta a sacola de forma gulosa (mais barato por porção, com limite de repetição para variar), completa pedidos mínimos por acréscimo ou troca, e só aceita o que passa em `checar_sacola`. Se nada passa, `diagnosticar` explica o motivo e procura a alternativa mais próxima.
3. `assistant/service.py` valida de novo a sacola final e devolve uma `Proposta` com as 8 checagens. A interface só oferece "Usar esta sacola" para propostas aprovadas.

## Validação (8 checagens)

Itens existem no cardápio · quantidades entre 1 e 10 · itens disponíveis e lojas abertas · lojas na área de entrega · até 4 lojas · pedido mínimo de cada loja · total com entrega dentro do orçamento · atende ao pedido (porções de prato, sobremesas, bebidas, vegetariano, itens citados).

Porções: itens com `serve` (uma pizza média serve 2) contam como mais de uma porção, para que "pizza para 3" não exija três pizzas.

## Compatibilidade com o projeto original

- As 4 lojas e os 12 itens originais mantêm os mesmos ids e valores (`origem: v1`). `catalog.V1` recorta exatamente esse catálogo.
- Os 12 casos originais (`data/casos_v1.json`) rodam contra `V1`, e o teste de força bruta do original foi portado.
- Os testes do agente com cliente roteirizado foram portados (rejeição por orçamento e correção, pedido impossível, limite de passos).

## Segurança e operação

- A chave da Anthropic fica só no backend (`.env`, não versionado); o frontend nunca a vê.
- Sessão anônima por cookie `httpOnly`, `SameSite=Lax`.
- Erros inesperados são registrados no log com stack trace e devolvidos ao cliente como mensagem genérica.
- Cada uso do assistente gera um `EventoAssistente` (motor, status, total, latência) para métricas.
