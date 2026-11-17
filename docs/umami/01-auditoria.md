# UMAMI — Etapa 1: auditoria do Sacola Multi-loja

Data: 16/11/2026 · Nada foi alterado no código para esta auditoria.

## Estado atual em uma frase

O Sacola já é uma aplicação completa (FastAPI + React), com regras multi-loja testadas e um assistente validado. O que falta para a UMAMI é **identidade, conta de usuário, catálogo com fotos e personalização de produtos** — não reescrever o núcleo.

## Arquitetura encontrada

| Camada | Tecnologia | Observação |
|---|---|---|
| API | FastAPI 0.12x, Pydantic 2 | 25 rotas em `backend/app/api/routes.py` |
| Persistência | SQLAlchemy 2 + Alembic, SQLite local, Postgres via `docker-compose` | 1 migração (`1cfe634d1462`) |
| Regras | `backend/app/rules.py` | fonte única de preço, taxa, prazo e bloqueios |
| Validação | `backend/app/validation.py` | 8 checagens aplicadas a toda proposta |
| Assistente | `backend/app/assistant/` | parser, planejador determinístico, agente Claude, serviço |
| Catálogo | `backend/data/catalogo.json` | 11 lojas, 34 itens, **sem fotos, sem variações** |
| Sessão | cookie anônimo `sacola_sid` | **não existe conta de usuário** |
| Frontend | React 19, Vite 8.3.7, Tailwind 4.3.5, Radix, Motion, TanStack Query | 6 rotas, 3 carregadas sob demanda |
| Testes | 54 pytest, 3 Vitest, 2 Playwright | todos passando em 16/11 |

## Classificação

### 1. Preservar (funciona e é o diferencial)

| Item | Onde | Por quê |
|---|---|---|
| Limite de 4 lojas, pedido mínimo por loja | `rules.py` | regra de negócio central, coberta por testes |
| Agrupamento ≤ 2 km, taxa `max + 1,99 × (n−1)`, prazo `max + 5 × (n−1)` | `rules.py` | idem |
| Separar loja do grupo, estorno parcial na recusa | `rules.py`, `routes.py` | idem |
| Disponibilidade, loja fechada, fora da área | `rules.py` | idem |
| 8 checagens da validação determinística | `validation.py` | garante que a IA nunca confirma nada sozinha |
| Parser, planejador e agente Claude com fallback | `assistant/` | 24/24 casos no gabarito |
| 12 casos originais sobre o catálogo V1 | `data/casos_v1.json`, `catalog.V1` | requisito do projeto original |
| Modelo de pedidos (Pedido → PedidoLoja → PedidoItem) | `models.py` | já separa o pedido por loja |
| Favoritos e listas salvas | `models.py`, `routes.py` | já existem |
| Acompanhamento por loja (simulado e acelerado) | `serializers.py` | fluxo completo testado |

### 2. Corrigir ou aprimorar

| Item | Problema | Proposta |
|---|---|---|
| Marca "sacola." | nome e identidade antigos | UMAMI, mascote, Design System novo |
| Paleta páprica/grafite | não comunica comida nem a marca | paleta UMAMI com contraste corrigido (ver `03-design-system.md`) |
| Loja sem foto (monograma) | baixa apetência visual | capa e logo por loja; fotos de produtos |
| Página inicial | assistente + lista + mapa; faltam categorias, ofertas, populares, recomendações | estrutura inspirada no padrão observado (ver `02-…`) |
| Item do cardápio | sem foto, sem variações, sem observação | página/folha de produto com opções |
| Busca | não existe busca global (só filtro por categoria de loja) | busca por loja e produto, com sugestões e histórico |
| Filtros | só 4 chips de categoria | ordenar, entrega grátis, distância, aberto agora |
| Cupons e descontos | **não existem** no modelo | cupom por loja (regra já prevista no README original: "cupom por loja") |
| Assistente | painel lateral de uma pergunta | conversa com histórico, sugestões e cartões de proposta |
| Checkout | endereço fixo, pagamento simulado | endereços salvos; pagamento continua simulado e rotulado |
| Pedidos | sem entregador, sem histórico filtrável | linha do tempo mais rica; histórico com "pedir de novo" |
| Sessão anônima | sem conta, sem dispositivos | contas com autenticação em etapas, migrando o carrinho anônimo |
| Bundle inicial ~201 KB gzip | acima do ideal para mobile | `LazyMotion`, divisão por rota, imagens responsivas |
| PWA | não existe manifest nem ícones | manifest, ícones maskable, splash |

### 3. Implementar

1. Identidade UMAMI: logotipo, ícones, favicon, PWA, splash, onboarding.
2. Contas: cadastro, login por e-mail ou telefone + senha, código de 6 dígitos (WhatsApp), confirmação de e-mail mascarado, código por e-mail quando necessário, sessões e dispositivos.
3. Catálogo enriquecido: fotos, capas, variações, adicionais, observações (com migração que preserva ids e preços atuais).
4. Busca e descoberta: busca global, sugestões, histórico, filtros e ordenação.
5. Ofertas e cupons por loja, integrados às regras e à validação.
6. Perfil: endereços, preferências, sessões ativas.

## Riscos e restrições identificados

- **Variações de produto mudam o preço.** Hoje `planejar()` recebe `{item_id: qtd}`. Variações exigem linhas de sacola com opções; isso toca `rules.py`, `validation.py`, o agente e o modelo de dados. Proposta: introduzir "linha de sacola" com `item_id + opções + qtd`, calcular o preço da linha antes de entrar em `planejar()`, e manter a assinatura antiga funcionando para não quebrar os 24 casos.
- **Cupons alteram o total validado pelo orçamento do assistente.** A regra precisa ser decidida (o orçamento do pedido em linguagem natural vale antes ou depois do cupom?).
- **Contas vs. sessão anônima.** A tabela `clientes` é chaveada por `sid`. A migração deve criar `usuarios` e vincular, sem perder sacolas e pedidos existentes.
- **Fotos.** Não há fotos no projeto. Precisam ser licenciadas (bancos com licença comercial) ou produzidas; não usarei imagens de terceiros sem licença.
- **Mascote.** A referência é um único raster. Variações de expressão exigem ilustração (ver `04-pendencias.md`).
