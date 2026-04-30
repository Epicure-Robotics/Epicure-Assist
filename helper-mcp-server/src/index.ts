import { inspect } from "node:util";

const redirectStdoutLogsToStderr = () => {
  const writeToStderr = (...args: unknown[]) => {
    const line = args
      .map((arg) => (typeof arg === "string" ? arg : inspect(arg, { colors: false, depth: 6, breakLength: 120 })))
      .join(" ");
    process.stderr.write(`${line}\n`);
  };

  console.log = writeToStderr;
  console.info = writeToStderr;
  console.debug = writeToStderr;
};

const main = async () => {
  redirectStdoutLogsToStderr();

  const { startHelperMcpServer } = await import("./server.js");
  await startHelperMcpServer();
};

main().catch((error) => {
  console.error("helper-mcp-server failed to start");
  console.error(error);
  process.exit(1);
});
