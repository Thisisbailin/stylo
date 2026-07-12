export type D1RunResult = {
  meta?: {
    changes?: number;
  };
};

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export type PagesContext<Env> = {
  request: Request;
  env: Env;
  waitUntil?: (promise: Promise<unknown>) => void;
};
