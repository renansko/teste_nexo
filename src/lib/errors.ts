/**
 * Erro de domínio com código estável e status HTTP sugerido.
 * A camada HTTP converte `AppError` em `{ error: code, message }`.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

export const notFound = (what = "Recurso") => new AppError("NOT_FOUND", `${what} não encontrado`, 404);
