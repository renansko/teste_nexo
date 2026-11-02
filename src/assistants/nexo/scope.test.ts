import { test } from "node:test";
import assert from "node:assert/strict";
import { detectOutOfScope } from "./scope";

test("sinal claro de RH, financeiro ou facilities sem sinal de TI é fora do escopo", () => {
  assert.equal(detectOutOfScope("Minhas férias não apareceram no holerite deste mês")?.domain, "RH");
  assert.equal(detectOutOfScope("Preciso do reembolso da viagem a São Paulo")?.domain, "Financeiro");
  assert.equal(detectOutOfScope("O ar-condicionado do 3º andar está pingando")?.domain, "Facilities");
  assert.equal(detectOutOfScope("Meu crachá não abre a catraca")?.domain, "Facilities");
});

test("qualquer sinal de TI prevalece: a guarda nunca bloqueia TI", () => {
  assert.equal(detectOutOfScope("Senha do SAP bloqueada"), undefined);
  assert.equal(detectOutOfScope("Notebook lento após atualização do Windows"), undefined);
  assert.equal(detectOutOfScope("Não consigo lançar o reembolso no sistema de despesas, dá erro 500"), undefined); // financeiro + sistema/erro
  assert.equal(detectOutOfScope("O portal de férias não abre, dá tela branca"), undefined); // RH + portal/tela
  assert.equal(detectOutOfScope("A impressora da copa não imprime"), undefined); // facilities + impressora
});

test("sem sinal forte de outra área deixa passar (o modelo decide)", () => {
  assert.equal(detectOutOfScope("Preciso de ajuda com uma coisa"), undefined);
  assert.equal(detectOutOfScope(""), undefined);
  assert.equal(detectOutOfScope("Quero trocar de equipe"), undefined);
});

test("ignora acentos, caixa e pontuação; não casa pedaço de palavra", () => {
  assert.equal(detectOutOfScope("FÉRIAS!!!")?.term, "ferias");
  assert.equal(detectOutOfScope("cafeteira elétrica queimou"), undefined); // "cafe" não casa dentro de "cafeteira"
});
