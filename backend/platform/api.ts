import { api } from "encore.dev/api";

export const health = api(
  { method: "GET", path: "/health", expose: true },
  async (): Promise<{ status: string }> => {
    return { status: "ok" };
  },
);
