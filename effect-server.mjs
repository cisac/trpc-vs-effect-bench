// Effect 4 RPC — HTTP protocol, JSON serialization, Schema validation, Node HTTP server
import { createServer } from "node:http";
import { Effect, Layer, Schema } from "effect";
import { Rpc, RpcGroup, RpcSerialization, RpcServer } from "effect/rpc";
import { HttpRouter } from "effect/http";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";

const MODE = process.env.MODE ?? "pure"; // "pure" | "io"
const IO_MS = Number(process.env.IO_MS ?? 5);
const PORT = Number(process.env.PORT ?? 3002);

const Greet = Rpc.make("Greet", {
  payload: {
    id: Schema.Int,
    name: Schema.NonEmptyString,
    tags: Schema.Array(Schema.String),
  },
  success: Schema.Struct({ id: Schema.Number, greeting: Schema.String, count: Schema.Number }),
});

const Api = RpcGroup.make(Greet);

const Handlers = Api.toLayer({
  Greet: ({ id, name, tags }) =>
    Effect.gen(function* () {
      if (MODE === "io") yield* Effect.sleep(IO_MS);
      return { id, greeting: `Hello ${name}`, count: tags.length };
    }),
});

const RpcLayer = RpcServer.layerHttp({
  group: Api,
  path: "/rpc",
  protocol: "http",
  disableTracing: true, // tRPC has no tracing either
}).pipe(Layer.provide(Handlers), Layer.provide(RpcSerialization.layerJson));

const Main = HttpRouter.serve(RpcLayer, { disableLogger: true }).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: PORT })),
  Layer.tap(() => Effect.sync(() => console.log(`effect ready :${PORT} mode=${MODE}`))),
);

NodeRuntime.runMain(Layer.launch(Main));
