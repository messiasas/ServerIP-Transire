const net = require("net");
const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------
const ECHO_HOST = process.env.ECHO_HOST || "::";        // igual ao server.py original
const ECHO_PORT = parseInt(process.env.ECHO_PORT || "5000", 10);
const WEB_PORT = parseInt(process.env.WEB_PORT || "3000", 10);
const HISTORY_LIMIT = 500; // quantos eventos ficam guardados em memória p/ novos clientes

// ---------------------------------------------------------------------------
// Estado compartilhado
// ---------------------------------------------------------------------------
let totalConnections = 0;
let activeConnections = 0;
const history = [];

function pushEvent(event) {
  history.push(event);
  if (history.length > HISTORY_LIMIT) history.shift();
  broadcast(event);
}

function broadcast(event) {
  const payload = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(payload);
  });
}

function nowISO() {
  return new Date().toISOString();
}

// Extrai IP "limpo" (remove prefixo ::ffff: de conexões IPv4-mapeadas)
function cleanIp(rawIp) {
  return rawIp.replace(/^::ffff:/, "");
}

// Tenta mostrar os dados como texto; se não for texto imprimível, mostra em hex
function formatData(buffer) {
  const text = buffer.toString("utf8");
  const isPrintable = /^[\x20-\x7E\s]*$/.test(text) && text.length > 0;
  return {
    text: isPrintable ? text : null,
    hex: buffer.toString("hex"),
    bytes: buffer.length,
  };
}

// ---------------------------------------------------------------------------
// Servidor ECHO (TCP / IPv6) — equivalente ao server.py
// ---------------------------------------------------------------------------
const echoServer = net.createServer({ allowHalfOpen: false }, (socket) => {
  const remoteIp = cleanIp(socket.remoteAddress || "desconhecido");
  const remotePort = socket.remotePort;

  totalConnections += 1;
  activeConnections += 1;

  pushEvent({
    type: "connect",
    ip: remoteIp,
    port: remotePort,
    timestamp: nowISO(),
    totalConnections,
    activeConnections,
  });

  socket.on("data", (data) => {
    const formatted = formatData(data);

    pushEvent({
      type: "data",
      ip: remoteIp,
      port: remotePort,
      timestamp: nowISO(),
      ...formatted,
    });

    // ECHO REAL: devolve exatamente o que foi recebido
    socket.write(data);
    socket.end();
  });

  socket.on("close", () => {
    activeConnections = Math.max(0, activeConnections - 1);
    pushEvent({
      type: "disconnect",
      ip: remoteIp,
      port: remotePort,
      timestamp: nowISO(),
      totalConnections,
      activeConnections,
    });
  });

  socket.on("error", (err) => {
    pushEvent({
      type: "error",
      ip: remoteIp,
      port: remotePort,
      timestamp: nowISO(),
      message: err.message,
    });
  });
});

// Força IPv6-only, igual ao IPV6_V6ONLY=1 do script Python
echoServer.on("error", (err) => {
  console.error("[ECHO] Erro no servidor:", err.message);
});

echoServer.listen({ port: ECHO_PORT, host: ECHO_HOST, ipv6Only: true }, () => {
  console.log(`[ECHO] Servidor ECHO IPv6 ativo em [${ECHO_HOST}]:${ECHO_PORT}`);
});

// ---------------------------------------------------------------------------
// Painel Web (Express + WebSocket)
// ---------------------------------------------------------------------------
const app = express();
app.use(express.static(path.join(__dirname, "public")));

const webServer = http.createServer(app);
const wss = new WebSocketServer({ server: webServer });

wss.on("connection", (ws) => {
  // Ao conectar, manda o snapshot atual + histórico recente
  ws.send(
    JSON.stringify({
      type: "snapshot",
      totalConnections,
      activeConnections,
      history,
    })
  );
});

webServer.listen(WEB_PORT, () => {
  console.log(`[WEB] Painel de monitoramento em http://localhost:${WEB_PORT}`);
});
