// Required for tsyringe DI
import "reflect-metadata";
import { HubApp } from "./runtime/app";

const app = new HubApp();

await app.start();

process.on("SIGINT", async () => {
  await app.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await app.stop();
  process.exit(0);
});
