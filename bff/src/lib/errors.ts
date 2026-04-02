export class BspError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly upstream?: unknown
  ) {
    super(message);
    this.name = 'BspError';
  }
}

export function assertOk(status: number, label: string, upstream?: unknown): void {
  if (status >= 400) {
    throw new BspError(status >= 500 ? 502 : status, `BSP ${label} failed (${status})`, upstream);
  }
}
