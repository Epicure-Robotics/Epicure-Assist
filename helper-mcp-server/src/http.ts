import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { helperMcpEnv } from "./env.js";
import { createHelperMcpServer } from "./server.js";

const MCP_PATH = "/mcp";
const HEALTH_PATH = "/health";
const DEFAULT_HOST = helperMcpEnv.HELPER_MCP_HOST ?? "127.0.0.1";
const DEFAULT_PORT = helperMcpEnv.HELPER_MCP_PORT ?? 3334;

type SessionEntry = {
  server: Awaited<ReturnType<typeof createHelperMcpServer>>;
  transport: StreamableHTTPServerTransport;
};

const sessions = new Map<string, SessionEntry>();

const setCommonHeaders = (response: ServerResponse) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, last-event-id, mcp-protocol-version, mcp-session-id",
  );
  response.setHeader("Access-Control-Expose-Headers", "mcp-protocol-version, mcp-session-id");
};

const writeJson = (response: ServerResponse, status: number, payload: unknown) => {
  setCommonHeaders(response);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
};

const getPathname = (request: IncomingMessage) => {
  const url = request.url ?? "/";
  return new URL(url, `http://${request.headers.host ?? DEFAULT_HOST}`).pathname;
};

const isAuthorized = (request: IncomingMessage) => {
  const expectedToken = helperMcpEnv.HELPER_MCP_BEARER_TOKEN;
  if (!expectedToken) {
    return true;
  }

  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  return authorization.slice("Bearer ".length) === expectedToken;
};

const readJsonBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
};

const cleanupSession = async (sessionId: string) => {
  const entry = sessions.get(sessionId);
  if (!entry) {
    return;
  }

  sessions.delete(sessionId);
  await Promise.allSettled([entry.transport.close(), entry.server.close()]);
};

const handleMcpRequest = async (request: IncomingMessage, response: ServerResponse) => {
  if (!isAuthorized(request)) {
    writeJson(response, 401, {
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Unauthorized",
      },
      id: null,
    });
    return;
  }

  setCommonHeaders(response);

  const sessionIdHeader = request.headers["mcp-session-id"];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

  if (request.method === "POST") {
    const parsedBody = await readJsonBody(request);

    if (sessionId) {
      const existingSession = sessions.get(sessionId);
      if (!existingSession) {
        writeJson(response, 404, {
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Session not found.",
          },
          id: null,
        });
        return;
      }

      await existingSession.transport.handleRequest(request, response, parsedBody);
      return;
    }

    if (!isInitializeRequest(parsedBody)) {
      writeJson(response, 400, {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided.",
        },
        id: null,
      });
      return;
    }

    const server = await createHelperMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        sessions.set(newSessionId, { server, transport });
      },
      onsessionclosed: (closedSessionId) => cleanupSession(closedSessionId),
    });

    transport.onclose = () => {
      const closedSessionId = transport.sessionId;
      if (closedSessionId) {
        void cleanupSession(closedSessionId);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(request, response, parsedBody);
    return;
  }

  if (!sessionId) {
    writeJson(response, 400, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No session ID provided.",
      },
      id: null,
    });
    return;
  }

  const existingSession = sessions.get(sessionId);
  if (!existingSession) {
    writeJson(response, 404, {
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Session not found.",
      },
      id: null,
    });
    return;
  }

  await existingSession.transport.handleRequest(request, response);
};

const handleRequest = async (request: IncomingMessage, response: ServerResponse) => {
  const pathname = getPathname(request);

  if (request.method === "OPTIONS") {
    setCommonHeaders(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (pathname === HEALTH_PATH) {
    writeJson(response, 200, {
      status: "ok",
      transport: "streamable_http",
      endpoint: MCP_PATH,
      auth_required: Boolean(helperMcpEnv.HELPER_MCP_BEARER_TOKEN),
    });
    return;
  }

  if (pathname !== MCP_PATH) {
    writeJson(response, 404, { error: "Not found" });
    return;
  }

  if (request.method !== "GET" && request.method !== "POST" && request.method !== "DELETE") {
    writeJson(response, 405, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    });
    return;
  }

  await handleMcpRequest(request, response);
};

export const startHelperMcpHttpServer = async () => {
  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      console.error("helper-mcp-http request failed");
      console.error(error);

      if (!response.headersSent) {
        writeJson(response, 500, {
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        });
      } else {
        response.end();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(DEFAULT_PORT, DEFAULT_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.error(`Epicure Assist MCP HTTP server listening on http://${DEFAULT_HOST}:${DEFAULT_PORT}${MCP_PATH}`);
  if (helperMcpEnv.HELPER_MCP_BEARER_TOKEN) {
    console.error("Epicure Assist MCP HTTP server requires Authorization: Bearer <HELPER_MCP_BEARER_TOKEN>");
  }
};

const main = async () => {
  await startHelperMcpHttpServer();
};

main().catch((error) => {
  console.error("helper-mcp-http failed to start");
  console.error(error);
  process.exit(1);
});
