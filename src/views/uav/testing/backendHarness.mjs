import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

// Test-only local process; no demo API and no production control endpoint.
export async function createBackendHarness() {
  const reservation = createServer();
  await new Promise((resolveReady, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolveReady);
  });
  const port = reservation.address().port;
  await new Promise((resolveClosed) => reservation.close(resolveClosed));
  let child;
  const url = `http://127.0.0.1:${port}`;
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise((resolveExit) => {
        const timeout = setTimeout(resolveExit, 5000);
        child.once("close", () => {
          clearTimeout(timeout);
          resolveExit();
        });
        child.kill();
      });
    }
    child = undefined;
  }
  async function start() {
    if (child) return;
    let failure = "";
    child = spawn(
      process.env.FORESTFIRE_PYTHON ?? "python",
      [
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--log-level",
        "error",
      ],
      { cwd: resolve("backend"), windowsHide: true, stdio: ["ignore", "ignore", "pipe"] }
    );
    child.on("error", (error) => {
      failure = error.message;
    });
    child.stderr.on("data", (chunk) => {
      failure = (failure + chunk).slice(-3000);
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(500) });
        if (response.ok) return;
      } catch {
        /* Wait until Uvicorn binds. */
      }
      if (child.exitCode !== null || child.signalCode !== null) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    await stop();
    throw new Error(
      `Python backend did not start. Set FORESTFIRE_PYTHON to a Python with backend requirements installed. ${failure}`
    );
  }
  return { start, stop, websocketUrl: `ws://127.0.0.1:${port}/ws/telemetry` };
}
