// tRPC v11 — standalone Node HTTP adapter, Zod validation, no transformer
import { initTRPC } from "@trpc/server";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { z } from "zod";

const MODE = process.env.MODE ?? "pure"; // "pure" | "io"
const IO_MS = Number(process.env.IO_MS ?? 5);
const PORT = Number(process.env.PORT ?? 3003);

const t = initTRPC.create();

const Input = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  tags: z.array(z.string()),
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const router = t.router({
  greet: t.procedure
    .input(Input)
    .mutation(async ({ input }) => {
      if (MODE === "io") await sleep(IO_MS);
      return { id: input.id, greeting: `Hello ${input.name}`, count: input.tags.length };
    }),
});

createHTTPServer({ router }).listen(PORT, () => console.log(`trpc ready :${PORT} mode=${MODE}`));
