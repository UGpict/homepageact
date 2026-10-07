export class HarnessError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(`${code}: ${message}`)
    this.name = "HarnessError"
    this.code = code
  }
}
