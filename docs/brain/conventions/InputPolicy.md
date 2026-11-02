# InputPolicy

Validação determinística do texto livre do funcionário antes de qualquer chamada ao modelo. Código: `src/engine/conversation/inputGuard.ts` (puro, sem banco), encaixe em `src/engine/conversation/turn.ts`, política da Nexo em `src/assistants/nexo/persona.ts`, uso no cliente em `src/components/chat/ChatScreen.tsx`/`Composer.tsx`. Testes: `inputGuard.test.ts`, `turn.test.ts`, `messages/route.test.ts`.

## Contrato

`checkInput(text, policy?) → { ok: true, text } | { ok: false, reason, message }`. `text` volta normalizado (`normalizeInput`: NFC, sem caracteres de controle salvo quebra de linha, espaços colapsados, trim) e é o que fica gravado como mensagem do usuário.

Ordem das regras (primeira que falha decide): `too_long` → `no_words` (nenhuma letra nem dígito: só símbolos, emoji) → `forbidden_chars` (fora de `allowedChars`, se definido) → `digits_only` (sem letra, com `allowDigitsOnly=false`) → `too_short` (menos de `minChars` alfanuméricos) → `repeated` (menos de `minDistinctAlnum` alfanuméricos distintos, sem acento e minúsculos: "aaaa", "kkkk").

`InputPolicy` (`AssistantConfig.inputPolicy`, parcial, mesclada com `DEFAULT_INPUT_POLICY`): `minChars` 2, `maxChars` 4000, `minDistinctAlnum` 2, `allowDigitsOnly` false, `allowedChars?` (classe de regex Unicode), `hint?` (exemplo da persona acrescentado à mensagem), `options?` (atalhos da resposta por regra). `message` é texto curto em pt-BR por motivo.

## Onde roda

- **Servidor (autoritativo).** Em `runTurn`, no único ponto por onde texto livre chega a `agentTurn` sem `resume`: depois de estado da conversa, run suspensa, rascunho e flow ativo. Falhou → resposta `source: "rule"`, nota `entrada sem conteúdo útil (<reason>): respondida por regra, sem chamar o modelo`, payload `options` com os atalhos da persona. Ver [Turn](../functions/Turn.md).
- **Cliente (UX).** `PublicConversation.inputPolicy` (sem `options`) leva a política ao composer, que roda a mesma `checkInput`, desabilita Enviar e mostra a dica ao sair do campo ou ao tentar enviar. Sem conversa ainda, valem os defaults. Ver [FrontendUI](FrontendUI.md).
- **Teto HTTP.** A rota mantém `max(DEFAULT_INPUT_POLICY.maxChars)` no zod como limite fixo (400 `INVALID_BODY`); a política da persona só pode ser mais restritiva e responde por regra, não com erro.

## Invariantes

- Nunca chama o modelo e nunca lança: a mensagem barrada é gravada (conta no limite de mensagens) e recebe resposta no chat.
- Nunca se aplica a clique em opção (`optionId`), a resposta de flow ativo, a resposta à run suspensa (HITL) nem a confirmar/cancelar/editar o rascunho. "1", "ok", "sim" continuam válidos nesses pontos; texto livre ambíguo diante de um rascunho **passa** pela guarda antes de ir ao modelo.
- Conservadora: só barra o que não tem conteúdo ("A", "???", "😀", "aaaa", "123"). "oi", "ok", "vpn", "INC-20311" passam. Palavras reais sem sentido vão ao modelo.
- A mensagem do funcionário gravada é a normalizada; o `trim()` simples foi substituído por `normalizeInput` em `resolveContent`.

## Decisões

- Resposta por regra no chat, não 400: parece conversa, fica transparente no console (origem: regra) e é mensurável pelas notas do trace; o cliente já evita a ida ao servidor nos casos comuns.
- Política por persona, não variável de ambiente: é configuração de produto por tenant (mesmo seam de multi-persona em [AssistantConfig](../services/AssistantConfig.md)).
- Regex e contagem, não classificador: custo zero e sem falso positivo em mensagens curtas legítimas. Classificador rápido para texto sem sentido é o próximo passo (README, "Guardrails por classificador").
- Motivação registrada: no painel do provedor, uma mensagem "A" gerou duas chamadas ao modelo (texto + `report-decision`) para responder "não entendi" (2026-11-02).
