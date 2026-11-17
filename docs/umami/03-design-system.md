# UMAMI — Design System (versão 1)

**Implementado na Etapa 3** (16/11/2026) em `web/src/index.css`, `web/src/components/brand.tsx` e `web/public/marca/`.

| Item | Onde está | Situação |
|---|---|---|
| Tokens de cor (claro e escuro) | `index.css` | feito |
| Fredoka (títulos) + Nunito Sans (texto), ambas com latim estendido | `index.css` | feito |
| Logotipo (ícone oficial + "UMAMI") | `brand.tsx` `Logo` | feito |
| Ícones, favicon, apple-touch, PWA maskable | `public/marca/`, gerados por `web/scripts/gerar_icones.py` | feito |
| Manifest PWA (sem service worker por enquanto) | `public/manifest.webmanifest` | feito |
| Splash (1× por sessão, some quando o catálogo carrega) | `brand.tsx` `Splash` | feito |
| Seigaiha e borda de ondas | `index.css` `.seigaiha`, `.borda-onda` | feito: banner inicial, splash, confirmação de pedido |
| Mascote em estados estratégicos | sacola vazia, pedido enviado, splash | feito |
| Novas poses do mascote | — | depende de ilustração (04-pendencias) |

## Mascote

Referência: `referencias/mascote-referencia.webp` — dragão vermelho e dourado, olhos fechados sorrindo, bigodes dourados, juba em chamas laranja, sacola creme com cloche vermelho na boca, sobre quadrado arredondado em degradê vermelho→laranja.

| Uso | Versão | Origem |
|---|---|---|
| Ícone do app, favicon, PWA (maskable) | a própria referência, recortada e reamostrada | derivada da referência |
| Splash | ícone centralizado sobre creme, entrada com leve escala | derivada |
| Logotipo | ícone + palavra "UMAMI" em tipografia própria | derivada + tipografia |
| Login, onboarding, estados vazios, sucesso, carregamento | **novas poses e expressões** | **exige ilustração nova** — ver `04-pendencias.md` |

Regra de uso: mascote só em abertura, autenticação, onboarding, estados vazios, sucesso e campanhas. Nunca em cartões de produto, listas ou formulários comuns.

## Cor — paleta refinada com contraste medido

Medições WCAG (relação de contraste):

| Combinação | Contraste | Veredito |
|---|---|---|
| Branco sobre laranja `#FF8A24` | 2,36 | **reprovado** para texto |
| Branco sobre tomate `#E94332` | 3,95 | só texto grande (≥ 18,7 px negrito) |
| Chocolate `#43251F` sobre laranja | 5,85 | aprovado |
| Chocolate sobre queijo `#FFC94A` | 9,00 | aprovado |
| Chocolate sobre creme `#FFF3DF` | 12,57 | aprovado |
| Laranja sobre creme | 2,15 | **reprovado** para texto |

Decisões:

| Token | Valor | Uso |
|---|---|---|
| `marca` | `#E94332` tomate | logotipo, ícones de marca, destaques (sem texto pequeno em branco por cima) |
| `marca-700` | `#C8321F` | texto e ícones vermelhos sobre claro (4,87 sobre creme) |
| `compra` | `#FF8A24` laranja | **botões de compra com texto chocolate** (5,85) |
| `compra-hover` | tom mais escuro do laranja, mantendo ≥ 4,5 com chocolate | |
| `oferta` | `#FFC94A` queijo | selos de oferta e cupom, sempre com texto chocolate |
| `fundo` | `#FFF3DF` creme (telas), `#FFFFFF` (cartões, para as fotos se destacarem) | |
| `texto` | `#43251F` chocolate · secundário e terciário derivados | |
| `gratis` | verde a definir (≥ 4,5 sobre branco) | "Grátis" — o padrão observado no iFood é útil e não é identidade exclusiva |
| tema escuro | chocolate profundo como fundo, creme como texto; tons de marca reajustados e medidos | |

Estados nunca só pela cor: sempre ícone ou texto junto.

## Tipografia (a validar)

- Títulos: uma grotesca arredondada e calorosa, com bom suporte a acentos e a outros alfabetos (expansão internacional).
- Texto e números: grotesca neutra com algarismos tabulares para preços.
- Candidatas de licença aberta: a definir na Etapa 3 junto com testes de legibilidade em 360 px.

## Formas, espaço e padrões japoneses

- Raios: 12 px em cartões, 999 px em pílulas e botões de compra, 8 px em campos.
- Espaço: escala de 4 px.
- Sombras: só em elementos flutuantes (sacola fixa, folhas, menus).
- **Seigaiha** em traço fino creme sobre vermelho: só em banners de campanha, cabeçalho da splash e borda superior de cartões especiais (ofertas da UMAMI, "Monte sua sacola").
- Divisória ornamental fina em seções editoriais; nunca em listas.

## Movimento

- 150–250 ms, curva de saída suave. Itens entram com deslocamento de 4–8 px.
- Adicionar à sacola: o contador da sacola "pula" e o total desliza até o novo valor.
- Mascote: piscar, balanço leve da sacola. Só na abertura, nos estados vazios e no sucesso.
- `prefers-reduced-motion`: tudo instantâneo.
