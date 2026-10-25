import { createServer } from "vite";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const require = createRequire(import.meta.url);
const server = await createServer({
  server: { host: "127.0.0.1", port: 5173, strictPort: false },
});
await server.listen();
const env = {
  ...process.env,
  YMG_DEV_URL: `http://127.0.0.1:${server.httpServer.address().port}`,
};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), ["."], {
  env,
  stdio: "inherit",
  windowsHide: true,
});
child.on("exit", async (code) => {
  await server.close();
  process.exit(code || 0);
});
process.on("SIGINT", () => child.kill());
