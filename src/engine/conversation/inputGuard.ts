/**
 * Validação determinística da mensagem do funcionário ANTES de qualquer chamada ao modelo.
 * Regex e contagem, sem LLM: um caractere solto, só símbolos/emoji, repetição ("aaaa") ou só números
 * não chegam ao agent; o engine responde por regra. A política é configuração da persona (`AssistantConfig.inputPolicy`).
 * Módulo puro (sem banco/serviços): o cliente usa a mesma função para bloquear o envio antes da ida ao servidor.
 * @wiki docs/brain/conventions/InputPolicy.md
 */
import type { QuickOption } from "../types";

export interface InputPolicy {
  /** Mínimo de caracteres alfanuméricos (após normalizar). */
  minChars: number;
  /** Teto de caracteres; o mesmo da rota HTTP. */
  maxChars: number;
  /** Mínimo de caracteres alfanuméricos distintos (sem acento, minúsculos): barra "a", "aaaa", "kkkkk". */
  minDistinctAlnum: number;
  /** Aceitar mensagem só com números ("809", "123")? */
  allowDigitsOnly: boolean;
  /** Classe de caracteres permitidos (fonte de regex, ex.: `\\p{L}\\p{N}\\s.,?!-`). Ausente = qualquer caractere. */
  allowedChars?: string;
  /** Exemplo da persona que acompanha a resposta por regra. */
  hint?: string;
  /** Atalhos que a resposta por regra oferece (a persona define). */
  options?: QuickOption[];
}

/** Parte da política que o cliente recebe (sem `options`, que são da resposta). */
export type PublicInputPolicy = Omit<InputPolicy, "options">;

export const DEFAULT_INPUT_POLICY: InputPolicy = { minChars: 2, maxChars: 4000, minDistinctAlnum: 2, allowDigitsOnly: false };

export type InputReason = "too_short" | "too_long" | "no_words" | "digits_only" | "repeated" | "forbidden_chars";

export type InputCheck = { ok: true; text: string } | { ok: false; reason: InputReason; message: string };

export function resolveInputPolicy(p?: Partial<InputPolicy>): InputPolicy {
  return { ...DEFAULT_INPUT_POLICY, ...(p ?? {}) };
}

/** Projeção para o cliente: tudo menos os atalhos. */
export function publicInputPolicy(p?: Partial<InputPolicy>): PublicInputPolicy {
  const { options: _options, ...rest } = resolveInputPolicy(p);
  return rest;
}

/** NFC, remove caracteres de controle (mantém quebra de linha), colapsa espaços e quebras repetidas, trim. */
export function normalizeInput(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‍﻿]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const ALNUM = /[\p{L}\p{N}]/gu;
const LETTER = /\p{L}/u;

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function checkInput(raw: string, policy?: Partial<InputPolicy>): InputCheck {
  const p = resolveInputPolicy(policy);
  const text = normalizeInput(raw);
  const fail = (reason: InputReason): InputCheck => ({ ok: false, reason, message: messageFor(reason, p) });

  if (text.length > p.maxChars) return fail("too_long");
  const alnum = text.match(ALNUM) ?? [];
  if (alnum.length === 0) return fail("no_words");
  if (p.allowedChars) {
    const allowed = new RegExp(`^[${p.allowedChars}]*$`, "u");
    if (!allowed.test(text)) return fail("forbidden_chars");
  }
  if (!p.allowDigitsOnly && !LETTER.test(text)) return fail("digits_only");
  if (alnum.length < p.minChars) return fail("too_short");
  const distinct = new Set(alnum.map(strip));
  if (distinct.size < p.minDistinctAlnum) return fail("repeated");
  return { ok: true, text };
}

const BASE = "Não consegui entender sua mensagem. Me conte em poucas palavras o que está acontecendo ou o que você precisa.";

function messageFor(reason: InputReason, p: InputPolicy): string {
  const hint = p.hint ? ` ${p.hint}` : "";
  switch (reason) {
    case "too_long":
      return `Sua mensagem passou de ${p.maxChars} caracteres. Pode resumir o principal?`;
    case "forbidden_chars":
      return `Sua mensagem tem caracteres que não consigo processar. Escreva só com letras, números e pontuação.${hint}`;
    case "digits_only":
      return `Recebi só números. Me diga a que eles se referem.${hint}`;
    default:
      return `${BASE}${hint}`;
  }
}
