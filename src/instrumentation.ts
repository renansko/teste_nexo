/**
 * Boot do servidor Next: valida o ambiente antes de aceitar requisições.
 * Sem o exit, o Next segue de pé respondendo 500 em tudo; encerrar deixa a falha explícita (container reinicia com o erro no log).
 * @wiki docs/brain/conventions/Environment.md
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertRuntimeEnv, EnvError } = await import("@/lib/env");
  try {
    assertRuntimeEnv();
  } catch (err) {
    if (!(err instanceof EnvError)) throw err;
    console.error(`[env] ${err.message}`);
    process.exit(1);
  }
}
