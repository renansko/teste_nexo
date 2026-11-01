/** Markdown leve das respostas → HTML, sem HTML cru passar. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { RichText } from "./RichText";

const html = (text: string) => renderToStaticMarkup(<RichText text={text} />);

test("negrito, itálico e código inline", () => {
  assert.equal(
    html("Seu chamado é o **INC-20400**, está *aberto* com `prioridade` Alta."),
    "<div><p>Seu chamado é o <strong>INC-20400</strong>, está <em>aberto</em> com <code>prioridade</code> Alta.</p></div>",
  );
});

test("listas, parágrafos e quebras de linha", () => {
  assert.equal(
    html("Rascunho:\n- Tipo: INC\n- Categoria: Hardware\n\nPosso criar?\nSim ou não"),
    "<div><p>Rascunho:</p><ul><li>Tipo: INC</li><li>Categoria: Hardware</li></ul><p>Posso criar?<br/>Sim ou não</p></div>",
  );
  assert.equal(html("1. um\n2) dois"), "<div><ol><li>um</li><li>dois</li></ol></div>");
});

test("HTML no texto é escapado; sintaxe desconhecida fica literal", () => {
  assert.equal(html("<b>x</b> e ~~y~~"), "<div><p>&lt;b&gt;x&lt;/b&gt; e ~~y~~</p></div>");
});
