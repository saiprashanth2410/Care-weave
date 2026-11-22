/** What a caught value may carry (Node, MongoDB and fetch errors add a few fields). A catch variable is `unknown`; read it through this. */
export type ErrorLike = { message?: string; name?: string; code?: unknown; codeName?: string; keyPattern?: Record<string, unknown>; status?: number };

export const asError = (e: unknown): ErrorLike => (e && typeof e === 'object' ? (e as ErrorLike) : { message: String(e) });
