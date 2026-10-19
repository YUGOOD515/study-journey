import type { Hono } from "hono";
import type { Ctx } from "./context";
import type { Env } from "./env";

export interface AppEnv {
  Bindings: Env;
  Variables: {
    ctx: Ctx;
    user: { id: string; email: string; name: string; emailVerified: boolean };
  };
}

export type App = Hono<AppEnv>;
