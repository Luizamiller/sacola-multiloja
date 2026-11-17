export type Loja = {
  id: string; nome: string; categoria: string; taxa: number; prazo: number; prazo_max: number; minimo: number;
  x: number; y: number; aberta: boolean; abre_as: string | null; nota: number | null; cor: string;
  distancia_km: number; na_area: boolean; imagem: string | null; cupons: string[];
};
export type OpcaoItem = { id: string; nome: string; preco: number };
export type GrupoOpcao = { id: string; nome: string; min: number; max: number; itens: OpcaoItem[] };
export type Item = {
  id: string; loja: string; nome: string; descricao: string; preco: number; tipo: string;
  vegetariano: boolean | null; serve: number; disponivel: boolean; esgotado: boolean; imagem: string | null; opcoes: GrupoOpcao[];
};
export type ItemQtd = Item & {
  qtd: number; linha_id?: number; opcoes_escolhidas?: Record<string, string[]>; detalhes?: string[]; observacao?: string; preco_unitario?: number;
};
export type Ocorrencia = { codigo: string; mensagem: string; loja: string | null; item: string | null };
export type Entrega = {
  lojas: string[]; combinada: boolean; taxa: number; taxa_separada: number; prazo: number; separada_pelo_cliente: boolean;
};
export type Plano = {
  lojas: { id: string; nome: string; subtotal: number; minimo: number; abaixo_do_minimo: boolean }[];
  entregas: Entrega[]; total_itens: number; total_taxas: number; economia: number; total: number; prazo: number;
  problemas: Ocorrencia[]; pode_finalizar: boolean; desconto?: number; total_final?: number;
};
export type CupomInfo = { codigo: string | null; valido: boolean; desconto: number; motivo: string | null; descricao?: string };
export type Sacola = { itens: ItemQtd[]; lojas_separadas: string[]; plano: Plano | null; cupom: CupomInfo | null };
export type Categoria = { id: string; nome: string; icone: string; cor: string; lojas: string[] };
export type Catalogo = {
  endereco: string; cliente: { x: number; y: number }; raio_entrega_km: number; lojas: Loja[]; itens: Item[];
  categorias: Categoria[]; cupons: number;
};
export type Cupom = { codigo: string; descricao: string; tipo: string; valor: number; minimo: number; loja: string | null; loja_nome: string | null };
export type Lista = { id: number; nome: string; itens: ItemQtd[]; total: number; lojas: number; problemas: string[] };
export type Etapa = { codigo: string; rotulo: string; progresso: number };
export type Pedido = {
  id: number; criado_em: string; endereco: string; pagamento: string; total_itens: number; total_taxas: number;
  economia: number; total: number; estornado: number; total_cobrado: number; prazo: number; entregas: Entrega[];
  origem: string; etapas: { codigo: string; rotulo: string }[]; cupom: string | null; desconto: number;
  lojas: {
    loja_id: string; loja_nome: string; subtotal: number; prazo: number; recusado: boolean; valor_estorno: number;
    motivo_recusa: string | null; etapa: Etapa; entregador: { nome: string; veiculo: string; simulado: boolean } | null;
    itens: { item_id: string; nome: string; preco: number; qtd: number; detalhes: string[]; observacao: string }[];
  }[];
};
export type Check = { id: string; rotulo: string; ok: boolean; detalhes: string[] };
export type PropostaSacola = { itens: ItemQtd[]; plano: Plano };
export type RespostaAssistente = {
  pedido: string; motor: "claude" | "deterministico"; status: "pronta" | "impossivel"; resumo: string;
  motivos: string[]; aviso: string | null; restricoes: { rotulos: string[] };
  proposta: PropostaSacola | null; alternativa: PropostaSacola | null; alternativa_descricao: string;
  validacao: { aprovada: boolean; checks: Check[] } | null; metricas: Record<string, number | string[]>;
};
export type Usuario = { id: number; nome: string; email: string; telefone: string; primeiro_nome: string };
export type Desafio = {
  id: string; etapa: "whatsapp" | "email_confirmacao" | "email_codigo"; telefone: string;
  email: { inicio: string; faltam: number; fim: string } | null; email_mascarado: string;
  tentativas_restantes: number; reenvio_em_s: number; reenvios_restantes: number; expira_em: string; modo_teste: boolean;
};
export type Endereco = { id: number; apelido: string; linha: string; complemento: string; padrao: boolean };

export class ApiError extends Error {
  constructor(public status: number, message: string, public detalhes?: unknown) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...init });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const d = body?.detail;
    const msg = typeof d === "string" ? d : d?.mensagem ?? "Não foi possível concluir. Tente de novo.";
    throw new ApiError(res.status, msg, d);
  }
  return body as T;
}

const json = (b: unknown) => JSON.stringify(b);
const post = <T,>(p: string, b?: unknown) => req<T>(p, { method: "POST", body: b === undefined ? undefined : json(b) });

export const api = {
  health: () => req<{ status: string; motor_assistente: string }>("/health"),
  catalogo: () => req<Catalogo>("/catalogo"),
  busca: (q: string) => req<{ lojas: Loja[]; itens: Item[] }>(`/busca?q=${encodeURIComponent(q)}`),
  cupons: () => req<Cupom[]>("/cupons"),
  sacola: () => req<Sacola>("/sacola"),
  definirItem: (id: string, qtd: number) => req<Sacola>(`/sacola/itens/${id}`, { method: "PUT", body: json({ qtd }) }),
  adicionarLinha: (b: { item_id: string; qtd: number; opcoes: Record<string, string[]>; observacao: string }) => post<Sacola>("/sacola/linhas", b),
  alterarLinha: (id: number, qtd: number) => req<Sacola>(`/sacola/linhas/${id}`, { method: "PATCH", body: json({ qtd }) }),
  separar: (lojas: string[]) => req<Sacola>("/sacola/separadas", { method: "PUT", body: json({ lojas }) }),
  cupom: (codigo: string | null) => req<Sacola>("/sacola/cupom", { method: "PUT", body: json({ codigo }) }),
  aplicar: (itens: Record<string, number>, modo: "substituir" | "somar") => post<Sacola>("/sacola/aplicar", { itens, modo }),
  esvaziar: () => req<Sacola>("/sacola", { method: "DELETE" }),
  finalizar: (pagamento: string, endereco_id?: number, origem = "manual") => post<Pedido>("/pedidos", { pagamento, origem, endereco_id }),
  pedidos: () => req<Pedido[]>("/pedidos"),
  pedido: (id: number) => req<Pedido>(`/pedidos/${id}`),
  repetir: (id: number) => post<Sacola & { indisponiveis: string[] }>(`/pedidos/${id}/repetir`),
  recusar: (id: number, loja: string) => post<Pedido>(`/pedidos/${id}/lojas/${loja}/recusar`),
  favoritos: () => req<Item[]>("/favoritos"),
  favoritar: (id: string) => req<Item[]>(`/favoritos/${id}`, { method: "PUT" }),
  desfavoritar: (id: string) => req<Item[]>(`/favoritos/${id}`, { method: "DELETE" }),
  listas: () => req<Lista[]>("/listas"),
  criarLista: (nome: string, itens?: Record<string, number>) => post<Lista>("/listas", { nome, itens }),
  apagarLista: (id: number) => req<void>(`/listas/${id}`, { method: "DELETE" }),
  aplicarLista: (id: number) => post<Sacola>(`/listas/${id}/aplicar`, { itens: {}, modo: "somar" }),
  exemplos: () => req<string[]>("/assistente/exemplos"),
  assistente: (pedido: string) => post<RespostaAssistente>("/assistente", { pedido }),
  enderecos: () => req<Endereco[]>("/enderecos"),
  criarEndereco: (b: Omit<Endereco, "id">) => post<Endereco[]>("/enderecos", b),
  enderecoPadrao: (id: number) => req<Endereco[]>(`/enderecos/${id}/padrao`, { method: "PUT" }),
  apagarEndereco: (id: number) => req<Endereco[]>(`/enderecos/${id}`, { method: "DELETE" }),
  // autenticação
  eu: () => req<{ usuario: Usuario | null; modo_teste: boolean }>("/auth/eu"),
  entrar: (identificador: string, senha: string) => post<Desafio>("/auth/entrar", { identificador, senha }),
  cadastro: (b: { nome: string; email: string; telefone: string; senha: string }) => post<Desafio>("/auth/cadastro", b),
  desafio: (id: string) => req<Desafio>(`/auth/desafios/${id}`),
  enviarCodigo: (id: string, codigo: string) => post<Desafio | { etapa: "concluido"; usuario: Usuario }>(`/auth/desafios/${id}/codigo`, { codigo }),
  confirmarEmail: (id: string, faltantes: string) => post<Desafio | { etapa: "concluido"; usuario: Usuario }>(`/auth/desafios/${id}/email`, { faltantes }),
  reenviar: (id: string) => post<Desafio>(`/auth/desafios/${id}/reenviar`),
  sair: () => post<{ ok: boolean }>("/auth/sair"),
  sessoes: () => req<{ id: number; dispositivo: string; criado_em: string; visto_em: string; atual: boolean }[]>("/auth/sessoes"),
  encerrarSessao: (id: number) => req<{ ok: boolean }>(`/auth/sessoes/${id}`, { method: "DELETE" }),
  caixaDeTestes: () => req<{ id: number; canal: string; destino: string; texto: string; criado_em: string }[]>("/auth/caixa-de-testes"),
};
