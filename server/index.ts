import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { env } from "./config/env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const staticPath =
    env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  const app = createApp({ staticPath });
  const server = createServer(app);

  server.listen(env.PORT, () => {
    console.log(`Server running on http://localhost:${env.PORT}/`);
  });
}

startServer().catch(console.error);
