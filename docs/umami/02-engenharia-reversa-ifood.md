# UMAMI — Etapa 2: engenharia reversa do iFood

Investigação **contínua**: este documento cresce a cada conjunto de capturas. Toda afirmação traz a origem.

## Ferramentas: o que foi possível usar

| Ferramenta | Situação em 16/11/2026 | Consequência |
|---|---|---|
| Navegador integrado + Playwright em `ifood.com.br` | O site respondeu **403 com a verificação anti-robô da Cloudflare** ("Executando verificação de segurança") | Não contornei a verificação. Inspeção automatizada do site está indisponível |
| REA (Reverse Engineer Anything) | Voltado a binários e aplicações compiladas. Aplicá-lo ao app do iFood exigiria descompilar software proprietário | Não usado: foge da engenharia reversa da experiência observável que você pediu |
| Ferramentas de desenvolvedor no seu navegador | Possível só com você operando, na sua sessão | Se quiser, você pode exportar capturas, gravações de tela ou um arquivo HAR **sem dados pessoais** |
| **Capturas que você envia** | Disponível | Fonte principal desta investigação |

Legenda de origem: **[C1]** = captura 1 (PDF "Delivery de Comida, Mercado e Farmácia rápido! - iFood", site web logado, `ifood.com.br/inicio`, 16/11/26 17:48, 3 páginas, cidade Pelotas). **[A investigar]** = ainda sem evidência.

## Inventário de telas

| Área | Tela | Status | Origem |
|---|---|---|---|
| Página inicial | Início (web, logado) | analisada | [C1] |
| Acesso e conta | Abertura, onboarding, login, cadastro, recuperação, confirmação de identidade, perfil | não observadas | [A investigar] |
| Busca | Campo, sugestões, histórico, resultados | não observadas | [A investigar] |
| Estabelecimento | Página da loja, cardápio, avaliações | não observadas | [A investigar] |
| Produto | Folha do produto, complementos, observação | não observadas | [A investigar] |
| Carrinho e checkout | Sacola, cupons, pagamento, confirmação | não observadas | [A investigar] |
| Acompanhamento | Status, entregador, histórico | não observadas | [A investigar] |

## Tela analisada: Início (web) [C1]

![Início do iFood, web](referencias/ifood-inicio-web-p1.png)

### Estrutura, de cima para baixo

1. **Título institucional** grande: "Pedir seu delivery no iFood é rápido e prático! Conheça as categorias". Tom de página de entrada, não de app.
2. **"Explore o iFood"** — linha de **verticais** com ilustrações 3D sobre fundo vermelho: Restaurantes, Mercados, Farmácias, Pet Shop, Gourmet, Shopping.
3. **Faixa fixa de cupons**: "Você tem 76 cupons! Aproveite seus descontos", com ícone de cupom. Aparece repetida no topo de cada página impressa → indica um elemento **fixo (sticky)** sobreposto ao conteúdo.
4. **"Famosos no iFood · Marcas famosas"** — carrossel horizontal de logos circulares (~68 px) com nome da loja embaixo, setas laterais e link "Ver mais" em vermelho.
5. **Categorias de comida** — carrossel horizontal de cartões com foto recortada do prato sobre fundo de cor pastel própria de cada categoria (rosa, verde, lilás, amarelo) e rótulo embaixo: Promoções, Saudável, Árabe, Açaí, Doces & Bolos, Pizza, Lanches…
6. **Barra de filtros em pílulas**, uma linha, rolável: Ordenar ▾, Entrega Grátis, Vale-refeição ▾, Distância ▾, Entrega Parceira, Super Restaurantes, Filtros. Pílulas com ▾ abrem menus; as demais parecem alternâncias.
7. **Lista de lojas em duas colunas**. Cada item:
   - logo circular (~48 px) à esquerda;
   - nome (negrito, ~15 px);
   - linha de metadados: ★ nota (amarela) · categoria · distância;
   - linha de entrega: faixa de tempo ("10–25 min") · taxa ("R$ 8,99") ou **"Grátis" em verde**;
   - linha opcional de benefício em azul com ícone: "Entrega grátis a partir de R$ 75", "Cupom de R$ 5 disponível";
   - ícone vermelho circular no canto direito em parte dos itens (provável selo de destaque ou favorito; **significado não identificável na captura**).
8. Botão **"Ver mais"** em largura total, texto vermelho, borda fina (paginação por demanda, não rolagem infinita).
9. **Rodapé** institucional em colunas (iFood, Descubra, Social) e informações legais.

### Padrões de design observados

| Padrão | Evidência | Leitura |
|---|---|---|
| Fotografia e ilustração carregam a cor | categorias e verticais coloridas; fundo da página branco | a interface é neutra para a comida aparecer |
| Vermelho só em marca, links e chamadas | "Ver mais", ícones vermelhos | um acento, usado com parcimônia |
| Verde = gratuidade | "Grátis" sempre em verde | cor semântica de benefício |
| Azul = benefício condicional | cupom e entrega grátis a partir de X | segunda cor semântica |
| Metadados compactos com "•" | "4.9 • Lanches • 1.1 km" | densidade alta, leitura rápida |
| Faixas de tempo, não minutos exatos | "52–62 min" | expectativa honesta |
| Carrosséis horizontais para descoberta, lista vertical para decisão | seções 4–5 vs. 7 | dois modos de navegação na mesma página |
| Cupom sempre visível | faixa fixa | incentivo constante à conversão |

### Comportamentos inferíveis (sem confirmação)

- Carrosséis com setas → rolagem horizontal por passo. **[A confirmar com gravação]**
- Pílulas com ▾ abrem menu suspenso; as outras alternam o filtro e recarregam a lista. **[A confirmar]**
- "Ver mais" acrescenta lojas à lista. **[A confirmar]**
- A faixa de cupons provavelmente abre a lista de cupons. **[A confirmar]**

Não há na captura: cabeçalho com endereço e busca (o PDF começa abaixo dele, ou o cabeçalho não foi impresso), estados de carregamento, erros, transições.

### Pontos de atrito observados

- Título institucional ocupa o topo de uma página de usuário logado.
- Dois carrosséis seguidos (marcas e categorias) antes de qualquer loja.
- O ícone vermelho no canto dos itens não tem rótulo visível.
- Lista em duas colunas sem foto de capa: decisão baseada só em logo, nota e taxa.

## Matriz comparativa

| Área | iFood: observado | Sacola atual | Melhoria proposta para UMAMI |
|---|---|---|---|
| Página inicial | [C1] verticais, cupons fixos, marcas, categorias com foto, filtros em pílula, lista de lojas com nota/tempo/taxa/benefício | título + assistente + 4 chips + lista + mapa | Endereço e busca no topo; categorias com foto em carrossel; **"Monte sua sacola"** (multi-loja) como bloco próprio; ofertas; lojas próximas com capa; populares; assistente como entrada secundária |
| Busca | [A investigar] | não existe | busca global por loja e produto, sugestões e histórico (detalhar após capturas) |
| Categorias | [C1] cartões com foto e fundo pastel por categoria | 4 chips de texto | cartões ilustrados com cor de fundo própria por categoria, dentro da paleta UMAMI |
| Estabelecimentos | [C1] só na lista: logo, nota, categoria, distância, tempo, taxa, benefício | linha com monograma, distância, prazo, taxa, mínimo | linha/cartão com capa, logo, faixa de tempo, "Grátis" semântico, benefício e **selo "entrega combinada"** quando está a ≤ 2 km de uma loja da sacola |
| Produtos | [A investigar] | linha sem foto, sem opções | foto, opções e observação (após capturas) |
| Carrinho | [A investigar] | agrupado por loja, entrega combinada, mínimo por loja | manter a lógica; redesenhar após capturas |
| Checkout | [A investigar] | endereço fixo, pagamento simulado | endereços salvos e cupons (após capturas) |
| Acompanhamento | [A investigar] | linha do tempo por loja, simulada | após capturas |

## Próximas capturas mais úteis (em ordem)

1. **App no celular**: tela inicial com cabeçalho (endereço, busca) e barra de navegação inferior.
2. **Busca**: campo vazio (histórico/sugestões), digitando, resultados.
3. **Página de uma loja**: topo, abas/categorias do cardápio, lista de itens.
4. **Produto**: folha com complementos obrigatórios e opcionais, observação, botão de adicionar.
5. **Sacola e checkout**: itens, cupom, pagamento, resumo, confirmação.
6. **Acompanhamento** de um pedido em andamento.
7. **Login/cadastro** (sem mostrar seus dados).

Gravações curtas de tela (5–15 s) de: abrir/fechar um filtro, adicionar um item, mudar quantidade, aplicar cupom. Cubra ou borre endereço, nome, telefone e cupons pessoais.
