/**
 * Escopo do service desk (Anexo A): só assuntos de TI. Guarda determinística que complementa a instrução do modelo:
 * `open-ticket` recusa pedidos com sinal claro de RH, financeiro ou facilities e nenhum sinal de TI.
 * Conservadora por desenho: na dúvida deixa passar (o modelo decide); nunca bloqueia um assunto de TI.
 * Um classificador com confiança (`NEXO_FAST_MODEL`) é o próximo passo para pegar o que a lista não pega.
 * @wiki docs/brain/conventions/ServiceDeskRules.md
 */

export type OutOfScopeDomain = "RH" | "Financeiro" | "Facilities";

export interface OutOfScope {
  domain: OutOfScopeDomain;
  /** Termo que decidiu (normalizado), para o trace. */
  term: string;
  /** Para onde orientar o funcionário. */
  redirect: string;
}

/** Sinais fortes de assunto fora de TI (frases normalizadas: minúsculas, sem acento). */
const OUT_OF_SCOPE: Record<OutOfScopeDomain, { terms: string[]; redirect: string }> = {
  RH: {
    terms: [
      "ferias", "holerite", "contracheque", "folha de pagamento", "decimo terceiro", "13o salario", "salario",
      "vale refeicao", "vale alimentacao", "vale transporte", "plano de saude", "plano odontologico", "beneficio", "beneficios",
      "admissao", "demissao", "rescisao", "atestado", "banco de horas", "carteira de trabalho", "recrutamento", "vaga de emprego",
    ],
    redirect: "o RH (portal de RH ou rh@nexo.com)",
  },
  Financeiro: {
    terms: [
      "reembolso", "nota fiscal", "cartao corporativo", "adiantamento", "prestacao de contas", "centro de custo",
      "despesa de viagem", "despesas de viagem", "pagamento de fornecedor", "pagamento do fornecedor", "boleto",
    ],
    redirect: "o Financeiro (portal de despesas ou financeiro@nexo.com)",
  },
  Facilities: {
    terms: [
      "ar condicionado", "ar-condicionado", "limpeza", "lampada", "lampadas", "vazamento", "cadeira quebrada", "cadeira",
      "estacionamento", "vaga de garagem", "cracha", "catraca", "banheiro", "copa", "cafe", "elevador", "manutencao predial",
      "chave da sala", "porta emperrada",
    ],
    redirect: "Facilities (facilities@nexo.com ou a recepção)",
  },
};

/** Qualquer um destes presente → é (ou pode ser) TI: a guarda não interfere. */
const IT_SIGNALS = [
  "notebook", "computador", "desktop", "pc", "monitor", "teclado", "mouse", "impressora", "headset", "webcam", "celular corporativo",
  "vpn", "wifi", "wi-fi", "rede", "internet", "senha", "login", "logar", "usuario", "conta",
  "sistema", "software", "programa", "aplicativo", "app", "licenca", "instalar", "instalacao", "atualizacao",
  "email", "e-mail", "outlook", "teams", "sap", "crm", "windows", "office", "excel", "servidor", "tela", "erro", "bug", "travando", "lento",
  "portal de softwares", "intranet",
];

export const normalizeText = (s: string): string =>
  ` ${s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;

const has = (text: string, phrase: string): boolean => text.includes(` ${normalizeText(phrase).trim()} `);

/**
 * Detecta pedido claramente fora de TI. Devolve `undefined` quando há qualquer sinal de TI ou nenhum sinal forte de outra área.
 */
export function detectOutOfScope(text: string): OutOfScope | undefined {
  const norm = normalizeText(text);
  if (norm.trim().length === 0) return undefined;
  if (IT_SIGNALS.some((s) => has(norm, s))) return undefined;
  for (const [domain, { terms, redirect }] of Object.entries(OUT_OF_SCOPE) as [OutOfScopeDomain, { terms: string[]; redirect: string }][]) {
    const term = terms.find((t) => has(norm, t));
    if (term) return { domain, term, redirect };
  }
  return undefined;
}

/** Mensagem para o modelo (não é a resposta ao funcionário): explica a recusa e o que dizer. */
export const outOfScopeMessage = (o: OutOfScope): string =>
  `Assunto de ${o.domain} ("${o.term}"), fora do escopo do service desk de TI (Anexo A). Não abra chamado: oriente o funcionário a procurar ${o.redirect}. Se ele explicar que o problema é de TI (sistema, acesso, equipamento), chame open-ticket de novo com essa descrição.`;
