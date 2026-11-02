import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInput, normalizeInput, publicInputPolicy, resolveInputPolicy, type InputReason } from "./inputGuard";

const reason = (text: string, policy?: Parameters<typeof checkInput>[1]): InputReason | "ok" => {
  const r = checkInput(text, policy);
  return r.ok ? "ok" : r.reason;
};

test("mensagens sem conteúdo útil são barradas com o motivo certo", () => {
  const cases: [string, InputReason][] = [
    ["A", "too_short"],
    ["a", "too_short"],
    ["?", "no_words"],
    ["???", "no_words"],
    ["!!! ... ---", "no_words"],
    ["😀", "no_words"],
    ["😀😀😀", "no_words"],
    ["   ", "no_words"],
    ["aaaa", "repeated"],
    ["kkkkkkkk", "repeated"],
    ["AaÁá", "repeated"],
    ["1", "digits_only"],
    ["809", "digits_only"],
    ["12 345", "digits_only"],
    ["x".repeat(4001), "too_long"],
  ];
  for (const [text, expected] of cases) assert.equal(reason(text), expected, JSON.stringify(text));
});

test("mensagens curtas mas reais passam", () => {
  for (const text of ["oi", "ok", "vpn", "INC-20311", "e aí?", "não", "erro 809", "A VPN caiu", "ñ sei"]) {
    assert.equal(reason(text), "ok", text);
  }
});

test("texto aprovado volta normalizado (NFC, sem controle, espaços colapsados)", () => {
  const r = checkInput("  minha\u0000  vpn  \r\n\r\n\r\n da   erro​ 809 ");
  assert.ok(r.ok);
  assert.equal(r.text, "minha vpn\n\nda erro 809");
  assert.equal(normalizeInput("é"), "é"); // NFD → NFC
});

test("política configurável: só números, caracteres permitidos, mínimos", () => {
  assert.equal(reason("809", { allowDigitsOnly: true }), "ok");
  assert.equal(reason("1", { allowDigitsOnly: true, minChars: 1, minDistinctAlnum: 1 }), "ok");
  assert.equal(reason("A", { minChars: 1, minDistinctAlnum: 1 }), "ok");
  assert.equal(reason("vpn <script>", { allowedChars: "\\p{L}\\p{N}\\s.,?!-" }), "forbidden_chars");
  assert.equal(reason("vpn caiu, e agora?", { allowedChars: "\\p{L}\\p{N}\\s.,?!-" }), "ok");
  assert.equal(reason("vpn", { minChars: 5 }), "too_short");
  assert.equal(reason("abcdef", { maxChars: 5 }), "too_long");
});

test("mensagem de resposta traz a dica da persona e o motivo específico", () => {
  const r = checkInput("???", { hint: 'Por exemplo: "minha VPN dá erro 809".' });
  assert.ok(!r.ok);
  assert.match(r.message, /Não consegui entender/);
  assert.match(r.message, /minha VPN dá erro 809/);
  const digits = checkInput("123");
  assert.ok(!digits.ok && /só números/.test(digits.message));
  const long = checkInput("x".repeat(10), { maxChars: 5 });
  assert.ok(!long.ok && /5 caracteres/.test(long.message));
});

test("resolveInputPolicy aplica defaults e publicInputPolicy omite as opções", () => {
  const p = resolveInputPolicy({ hint: "h", options: [{ id: "x", label: "X" }] });
  assert.equal(p.minChars, 2);
  assert.equal(p.allowDigitsOnly, false);
  const pub = publicInputPolicy(p);
  assert.equal(pub.hint, "h");
  assert.ok(!("options" in pub));
});
