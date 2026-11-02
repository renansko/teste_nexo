/**
 * Dados de exemplo (Anexo B): funcionários, artigos da central de ajuda e chamados em situações variadas.
 * Datas dos chamados são relativas a "agora" para que "vencido" e "resolvido há N dias" continuem válidos.
 * Idempotente: funcionários/artigos por id; chamados só se a tabela estiver vazia.
 */
import { upsertEmployee, type Employee } from "@/services/employees/employeeService";
import { rememberResolution, upsertArticle, type HelpArticle, type ResolutionMemory } from "@/services/helpCenter/helpCenterService";
import { countTickets, insertTicketRaw, insertUpdateRaw } from "@/services/tickets/ticketService";
import { computeDueAt } from "@/services/tickets/sla";
import type { Ticket } from "@/services/tickets/types";

export const EMPLOYEES: Employee[] = [
  { id: "emp-ana", name: "Ana Souza", email: "ana.souza@nexo.com", department: "Financeiro", role: "employee" },
  { id: "emp-bruno", name: "Bruno Lima", email: "bruno.lima@nexo.com", department: "Vendas", role: "employee" },
  { id: "emp-carla", name: "Carla Mendes", email: "carla.mendes@nexo.com", department: "Marketing", role: "employee" },
  { id: "emp-diego", name: "Diego Rocha", email: "diego.rocha@nexo.com", department: "Engenharia", role: "employee" },
  { id: "emp-elisa", name: "Elisa Martins", email: "elisa.martins@nexo.com", department: "Pessoas", role: "employee" },
  { id: "an-fabio", name: "Fábio Nunes", email: "fabio.nunes@nexo.com", department: "TI · Suporte N1", role: "analyst" },
  { id: "an-gabriela", name: "Gabriela Castro", email: "gabriela.castro@nexo.com", department: "TI · Suporte N2", role: "analyst" },
];

export const ARTICLES: HelpArticle[] = [
  {
    id: "kb-vpn-809", title: "VPN com erro 809", category: "Rede e VPN", tags: ["vpn", "erro 809", "windows 10", "conexão"],
    body: "Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
  },
  {
    id: "kb-horario", title: "Horário do service desk", category: "Outros", tags: ["horário", "plantão", "atendimento", "prazo"],
    body: "O service desk atende de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
  },
  {
    id: "kb-senha-rede", title: "Esqueci a senha da rede (SSO)", category: "Acesso", tags: ["senha", "sso", "login", "redefinir", "bloqueada"],
    body: "Acesse portal.nexo.com/senha, informe seu e-mail corporativo e siga o código enviado ao celular cadastrado. A senha nova vale para Windows, e-mail e Teams. Se a conta estiver bloqueada há mais de 30 minutos, abra um chamado de Acesso.",
  },
  {
    id: "kb-sap-senha", title: "Senha do SAP bloqueada", category: "Acesso", tags: ["sap", "senha", "bloqueio", "desbloquear"],
    body: "O SAP bloqueia a senha após 3 tentativas. O desbloqueio é feito somente pela equipe de Acesso via chamado (categoria Acesso, tipo requisição). Informe seu usuário SAP na descrição.",
  },
  {
    id: "kb-equipamento", title: "Como pedir equipamento (monitor, teclado, notebook)", category: "Hardware", tags: ["monitor", "equipamento", "notebook", "home office", "requisição"],
    body: "Pedidos de equipamento são requisições (REQ) de Hardware, com aprovação do gestor. Prazo de entrega: até 5 dias úteis após a aprovação. Para home office, informe o endereço de entrega na descrição.",
  },
  {
    id: "kb-portal-softwares", title: "Instalar programas pelo portal de softwares", category: "Software", tags: ["instalar", "software", "portal", "licença", "programa"],
    body: "Programas homologados (Office, VPN, Chrome, Zoom, VS Code) podem ser instalados pelo Portal de Softwares sem chamado. Programas fora da lista ou com licença paga exigem uma requisição de Software.",
  },
  {
    id: "kb-outlook", title: "Outlook não sincroniza ou caixa cheia", category: "E-mail", tags: ["outlook", "e-mail", "email", "sincronizar", "caixa cheia", "cota"],
    body: "A cota da caixa é 50 GB. Esvazie a pasta Itens Excluídos e arquive mensagens antigas. Se o Outlook ficar em 'Tentando conectar', feche-o, abra o Teams para renovar o login e abra o Outlook de novo. Persistindo, abra um incidente de E-mail.",
  },
  {
    id: "kb-wifi", title: "Wi-Fi corporativo NEXO-CORP", category: "Rede e VPN", tags: ["wifi", "wi-fi", "rede", "sem fio", "internet"],
    body: "Conecte-se à rede NEXO-CORP com e-mail corporativo e senha de rede. A rede NEXO-GUEST é só para visitantes e não acessa sistemas internos. Se a autenticação falhar, redefina a senha de rede.",
  },
  {
    id: "kb-impressora", title: "Impressora não imprime", category: "Hardware", tags: ["impressora", "imprimir", "impressão", "fila"],
    body: "Verifique se a impressora escolhida é a do seu andar (ex.: IMP-3A) e limpe a fila de impressão. Impressoras são compartilhadas: se a de um andar inteiro parou, isso afeta a equipe e deve ser aberto como incidente.",
  },
  {
    id: "kb-prazos", title: "Prazos e prioridades dos chamados", category: "Outros", tags: ["prazo", "prioridade", "sla", "vencido", "crítica", "alta", "média", "baixa"],
    body: "Crítica: algo parado para uma equipe ou para a empresa, resposta em 1 hora. Alta: impede uma pessoa de trabalhar ou há compromisso no mesmo dia, 4 horas úteis. Média: atrapalha, mas há alternativa, 3 dias úteis. Baixa: pedidos e melhorias sem urgência, 5 dias úteis. O prazo vale para a primeira resposta e para cada atualização.",
  },
];

const H = 3_600_000;
const D = 24 * H;

interface SeedTicket extends Omit<Ticket, "createdAt" | "updatedAt" | "dueAt" | "resolvedAt"> {
  createdAgoMs: number;
  updatedAgoMs: number;
  resolvedAgoMs?: number;
  updates?: { agoMs: number; authorId: string; authorRole: "employee" | "analyst" | "agent" | "system"; text: string }[];
}

const TICKETS: SeedTicket[] = [
  {
    id: "INC-20311", type: "INC", title: "Notebook lento após atualização do Windows", category: "Hardware", priority: "media",
    status: "aguardando_analista", requesterId: "emp-ana", affected: "Só eu",
    description: "Depois da atualização de segunda o notebook demora uns 10 minutos para ligar e trava ao abrir o Excel.",
    createdAgoMs: 6 * D, updatedAgoMs: 6 * D,
  },
  {
    id: "REQ-10442", type: "REQ", title: "Segundo monitor para home office", category: "Hardware", priority: "baixa",
    status: "aprovado", requesterId: "emp-ana", affected: "Só eu",
    description: "Preciso de um segundo monitor para trabalhar de casa. Entrega em São Paulo.",
    createdAgoMs: 7 * D, updatedAgoMs: 2 * D,
    updates: [{ agoMs: 2 * D, authorId: "an-fabio", authorRole: "analyst", text: "Aprovado pelo gestor. Entrega em até 5 dias úteis." }],
  },
  {
    id: "INC-20150", type: "INC", title: "Senha do SAP bloqueada", category: "Acesso", priority: "media",
    status: "resolvido", requesterId: "emp-ana", affected: "Só eu",
    description: "Errei a senha 3 vezes e o SAP bloqueou meu usuário ASOUZA.",
    createdAgoMs: 5 * D, updatedAgoMs: 4 * D, resolvedAgoMs: 4 * D,
    updates: [{ agoMs: 4 * D, authorId: "an-fabio", authorRole: "analyst", text: "Usuário desbloqueado e senha temporária enviada por e-mail." }],
  },
  {
    id: "INC-20287", type: "INC", title: "VPN não conecta, erro 809", category: "Rede e VPN", priority: "alta",
    status: "em_atendimento", requesterId: "emp-bruno", affected: "Só eu",
    description: "Windows 11. Reinstalei o cliente e continua dando erro 809 ao conectar.",
    createdAgoMs: 1 * D, updatedAgoMs: 1 * H,
    updates: [{ agoMs: 1 * H, authorId: "an-gabriela", authorRole: "analyst", text: "Identificado bloqueio no firewall local; aplicando correção remota." }],
  },
  {
    id: "REQ-10398", type: "REQ", title: "Acesso ao CRM de vendas", category: "Acesso", priority: "baixa",
    status: "resolvido", requesterId: "emp-bruno", affected: "Só eu",
    description: "Entrei na equipe de vendas e preciso de acesso ao CRM.",
    createdAgoMs: 25 * D, updatedAgoMs: 20 * D, resolvedAgoMs: 20 * D,
  },
  {
    id: "INC-20330", type: "INC", title: "Outlook não sincroniza e-mails novos", category: "E-mail", priority: "media",
    status: "aberto", requesterId: "emp-carla", affected: "Só eu",
    description: "Desde ontem o Outlook fica em 'Tentando conectar' e só recebo e-mails pelo celular.",
    createdAgoMs: 30 * 60_000, updatedAgoMs: 30 * 60_000,
  },
  {
    id: "INC-20301", type: "INC", title: "Servidor de build fora do ar", category: "Software", priority: "critica",
    status: "resolvido", requesterId: "emp-diego", affected: "Equipe de Engenharia",
    description: "O servidor de CI não responde e ninguém da engenharia consegue publicar.",
    createdAgoMs: 2 * D, updatedAgoMs: 1 * D, resolvedAgoMs: 1 * D,
    updates: [{ agoMs: 1 * D, authorId: "an-gabriela", authorRole: "analyst", text: "Disco cheio; limpeza feita e alerta configurado." }],
  },
  {
    id: "REQ-10450", type: "REQ", title: "Licença do IntelliJ IDEA", category: "Software", priority: "baixa",
    status: "aberto", requesterId: "emp-diego", affected: "Só eu",
    description: "Preciso de uma licença do IntelliJ para o novo projeto.",
    createdAgoMs: 10 * D, updatedAgoMs: 10 * D,
  },
  {
    id: "INC-20335", type: "INC", title: "Impressora do 3º andar não imprime", category: "Hardware", priority: "baixa",
    status: "aberto", requesterId: "emp-elisa", affected: "Só eu",
    description: "A IMP-3A fica com a fila parada; já tentei limpar a fila.",
    createdAgoMs: 1 * D, updatedAgoMs: 1 * D,
  },
];

/**
 * Memória de resolução de exemplo (o que o analista escreveu ao resolver): só título, tipo, categoria e solução.
 * Entra junto dos chamados (depende do chamado existir) para o agent ter um "caso resolvido" desde o início.
 */
const MEMORIES: (Omit<ResolutionMemory, "id" | "resolvedAt"> & { resolvedAgoMs: number })[] = [
  {
    ticketId: "INC-20150", type: "INC", category: "Acesso", title: "Senha do SAP bloqueada",
    solution: "Usuário desbloqueado pela equipe de Acesso no SAP e senha temporária enviada ao e-mail corporativo; trocar a senha no primeiro login. Para agilizar, informe o usuário SAP na descrição do chamado.",
    triedArticleIds: ["article:kb-sap-senha"], resolvedBy: "an-fabio", resolvedAgoMs: 4 * D,
  },
];

export function seedNexo(now = new Date()): { employees: number; articles: number; tickets: number } {
  for (const e of EMPLOYEES) upsertEmployee(e);
  for (const a of ARTICLES) upsertArticle(a);
  let tickets = 0;
  if (countTickets() === 0) {
    for (const s of TICKETS) {
      const { createdAgoMs, updatedAgoMs, resolvedAgoMs, updates, ...rest } = s;
      const updatedAt = new Date(now.getTime() - updatedAgoMs);
      insertTicketRaw({
        ...rest,
        createdAt: new Date(now.getTime() - createdAgoMs).toISOString(),
        updatedAt: updatedAt.toISOString(),
        dueAt: computeDueAt(s.priority, updatedAt).toISOString(),
        resolvedAt: resolvedAgoMs === undefined ? null : new Date(now.getTime() - resolvedAgoMs).toISOString(),
      });
      for (const u of updates ?? []) {
        insertUpdateRaw({ ticketId: s.id, authorId: u.authorId, authorRole: u.authorRole, text: u.text, createdAt: new Date(now.getTime() - u.agoMs).toISOString() });
      }
      tickets += 1;
    }
    for (const m of MEMORIES) {
      const { resolvedAgoMs, ...rest } = m;
      rememberResolution({ ...rest, resolvedAt: new Date(now.getTime() - resolvedAgoMs).toISOString() });
    }
  }
  return { employees: EMPLOYEES.length, articles: ARTICLES.length, tickets };
}
