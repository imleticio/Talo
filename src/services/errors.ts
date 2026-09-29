export class AppError extends Error {
  readonly kind?: string

  constructor(message: string, options?: ErrorOptions & { kind?: string }) {
    super(message, options)
    this.name = 'AppError'
    this.kind = options?.kind
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof Error) return new AppError(error.message, { cause: error })
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return new AppError(error.message, {
      cause: error,
      kind: 'kind' in error && typeof error.kind === 'string' ? error.kind : undefined,
    })
  }
  return new AppError(typeof error === 'string' ? error : 'An unexpected error occurred')
}
