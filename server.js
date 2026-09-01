const net = require("net");
const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------
const ECHO_HOST = process.env.ECHO_HOST || "::";        // igual ao server.py original
const ECHO_HOST_V4 = process.env.ECHO_HOST_V4 || "0.0.0.0"; // fallback IPv4, mesma porta
const ECHO_PORT = parseInt(process.env.ECHO_PORT || "5000", 10);
const WEB_PORT = parseInt(process.env.WEB_PORT || "3000", 10);
const API_PORT = parseInt(process.env.API_PORT || "7777", 10); // API de dispositivos (app Android)
const API_HOST_V4 = process.env.API_HOST_V4 || "0.0.0.0";     // fallback IPv4, mesma porta
const HISTORY_LIMIT = 500; // quantos eventos ficam guardados em memória p/ novos clientes
const PINGBACK_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Estado compartilhado
// ---------------------------------------------------------------------------
let totalConnections = 0;
let activeConnections = 0;
const history = [];
const devices = new Map(); // name -> { name, ip, replyPort, family, registeredAt, lastSeen, lastPingBackAt, lastPingBackStatus, lastPingBackMessage }

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

function devicesSnapshot() {
  return Array.from(devices.values());
}

// Manda a lista de dispositivos pra todo mundo conectado no painel
// (não entra no histórico do console, é um estado à parte)
function broadcastDevices() {
  broadcast({ type: "devices_snapshot", devices: devicesSnapshot() });
}

<<<<<<< HEAD
// Atualiza os contadores (total/ativas) de quem já está com o painel aberto,
// sem criar uma linha na tabela e sem entrar no histórico — usado quando uma
// conexão de echo fecha, pra não gerar a linha de "conexão encerrada".
function broadcastCounts() {
  broadcast({ type: "counts", totalConnections, activeConnections });
}

=======
>>>>>>> 1f902fe684080e3f9fb5dc10711842875bff06f4
// Tenta contatar o mini-servidor HTTP do próprio celular (NanoHTTPD, GET /api/ping)
// — é a "volta" do ping-pong: o servidor central confirma que consegue alcançar o app.
function pingDeviceBack(device) {
  return new Promise((resolve) => {
    const hostForUrl = device.ip.includes(":") ? `[${device.ip}]` : device.ip;
    const url = `http://${hostForUrl}:${device.replyPort}/api/ping`;

    const req = http.get(url, { timeout: PINGBACK_TIMEOUT_MS }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          body,
        });
      });
    });

    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", (err) => resolve({ ok: false, error: err.message }));
  });
}

async function pingBackAndReport(device) {
  const result = await pingDeviceBack(device);
  device.lastPingBackAt = nowISO();
  device.lastPingBackStatus = result.ok ? "ok" : "falha";
  device.lastPingBackMessage = result.ok
    ? result.body
    : result.error || `HTTP ${result.status}`;
  devices.set(device.name, device);

  pushEvent({
    type: result.ok ? "pingback_ok" : "pingback_fail",
    ip: device.ip,
    name: device.name,
    replyPort: device.replyPort,
    family: device.family,
    timestamp: nowISO(),
    message: device.lastPingBackMessage,
  });
  broadcastDevices();
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
// Servidor ECHO (TCP) — equivalente ao server.py, com fallback IPv4
// ---------------------------------------------------------------------------
// Mesma lógica de conexão é usada pelos dois listeners (IPv6 e IPv4);
// o que muda é só por qual socket a conexão chegou. `socket.remoteFamily`
// já vem pronto do Node ("IPv4" ou "IPv6"), não precisamos adivinhar.
function handleEchoConnection(socket) {
  const remoteIp = cleanIp(socket.remoteAddress || "desconhecido");
  const remotePort = socket.remotePort;
  const family = socket.remoteFamily; // "IPv4" ou "IPv6"

  totalConnections += 1;
  activeConnections += 1;
<<<<<<< HEAD
  // Não emite mais um evento "connect" separado — o contador é atualizado
  // aqui em memória, e só vira uma linha visível no painel quando (e se)
  // o evento "data" chegar, já carregando os valores atuais dos contadores.
=======

  pushEvent({
    type: "connect",
    ip: remoteIp,
    port: remotePort,
    family,
    timestamp: nowISO(),
    totalConnections,
    activeConnections,
  });
>>>>>>> 1f902fe684080e3f9fb5dc10711842875bff06f4

  socket.on("data", (data) => {
    const formatted = formatData(data);

    pushEvent({
      type: "data",
      ip: remoteIp,
      port: remotePort,
      family,
      timestamp: nowISO(),
<<<<<<< HEAD
      totalConnections,
      activeConnections,
=======
>>>>>>> 1f902fe684080e3f9fb5dc10711842875bff06f4
      ...formatted,
    });

    // ECHO REAL: devolve exatamente o que foi recebido
    socket.write(data);
    socket.end();
  });

  socket.on("close", () => {
    activeConnections = Math.max(0, activeConnections - 1);
<<<<<<< HEAD
    // Sem pushEvent aqui — não queremos uma linha de "conexão encerrada" no
    // painel. Só atualizamos os contadores de quem já está com o painel aberto.
    broadcastCounts();
=======
    pushEvent({
      type: "disconnect",
      ip: remoteIp,
      port: remotePort,
      family,
      timestamp: nowISO(),
      totalConnections,
      activeConnections,
    });
>>>>>>> 1f902fe684080e3f9fb5dc10711842875bff06f4
  });

  socket.on("error", (err) => {
    pushEvent({
      type: "error",
      ip: remoteIp,
      port: remotePort,
      family,
      timestamp: nowISO(),
      message: err.message,
    });
  });
}

// Listener "oficial" — IPv6 puro, igual ao IPV6_V6ONLY=1 do script Python
const echoServer = net.createServer({ allowHalfOpen: false }, handleEchoConnection);
echoServer.on("error", (err) => {
  console.error("[ECHO] Erro no servidor IPv6:", err.message);
});
echoServer.listen({ port: ECHO_PORT, host: ECHO_HOST, ipv6Only: true }, () => {
  console.log(`[ECHO] Servidor ECHO IPv6 ativo em [${ECHO_HOST}]:${ECHO_PORT}`);
});

// Listener paralelo — IPv4, mesma porta lógica, para dispositivos que
// não conseguem alcançar o servidor via IPv6 e precisam cair no fallback.
const echoServer4 = net.createServer({ allowHalfOpen: false }, handleEchoConnection);
echoServer4.on("error", (err) => {
  console.error("[ECHO] Erro no servidor IPv4 (fallback):", err.message);
});
echoServer4.listen({ port: ECHO_PORT, host: ECHO_HOST_V4 }, () => {
  console.log(`[ECHO] Servidor ECHO IPv4 (fallback) ativo em ${ECHO_HOST_V4}:${ECHO_PORT}`);
});

// ---------------------------------------------------------------------------
// Painel Web (Express + WebSocket)
// ---------------------------------------------------------------------------
const app = express();
app.use(express.static(path.join(__dirname, "public")));

const webServer = http.createServer(app);
const wss = new WebSocketServer({ server: webServer });

wss.on("connection", (ws) => {
  // Ao conectar, manda o snapshot atual + histórico recente + dispositivos
  ws.send(
    JSON.stringify({
      type: "snapshot",
      totalConnections,
      activeConnections,
      history,
    })
  );
  ws.send(JSON.stringify({ type: "devices_snapshot", devices: devicesSnapshot() }));

  // Permite disparar um ping-pong manual a partir do botão "PING" no painel
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "ping_device" && msg.name && devices.has(msg.name)) {
      pingBackAndReport(devices.get(msg.name));
    }
  });
});

webServer.listen(WEB_PORT, () => {
  console.log(`[WEB] Painel de monitoramento em http://localhost:${WEB_PORT}`);
});

// ---------------------------------------------------------------------------
// API de dispositivos (usada pelo app Android "ipv6_inova") — porta 7777
// ---------------------------------------------------------------------------
const apiApp = express();
apiApp.use(express.json());

// O app Android registra o nome do dispositivo + a porta onde ele fica
// escutando (replyPort) assim que abre.
apiApp.post("/api/devices/ping", (req, res) => {
  const { name, replyPort } = req.body || {};
  if (!name || !replyPort) {
    return res.status(400).json({ message: "name e replyPort são obrigatórios" });
  }

  const ip = cleanIp(req.socket.remoteAddress || "");
  const family = req.socket.remoteFamily; // "IPv4" ou "IPv6"
  const now = nowISO();
  const existing = devices.get(name);
  const device = {
    name,
    ip,
    replyPort,
    family,
    registeredAt: existing ? existing.registeredAt : now,
    lastSeen: now,
    lastPingBackAt: existing ? existing.lastPingBackAt : null,
    lastPingBackStatus: existing ? existing.lastPingBackStatus : "pendente",
    lastPingBackMessage: existing ? existing.lastPingBackMessage : "",
  };
  devices.set(name, device);

  pushEvent({ type: "device_register", ip, name, replyPort, family, timestamp: now });
  broadcastDevices();

  res.json({
    message: "dispositivo registrado",
    remoteAddress: ip,
    family,
    localAddress: `${req.socket.localAddress}:${req.socket.localPort}`,
    timestamp: Date.now(),
  });

  // Completa o ping-pong: o servidor tenta alcançar o mini-servidor do celular
  pingBackAndReport(device);
});

// Endpoint de ping "simples" — usado pelo botão manual do app
apiApp.get("/api/ping", (req, res) => {
  const ip = cleanIp(req.socket.remoteAddress || "");
  const family = req.socket.remoteFamily;
  pushEvent({ type: "api_ping", ip, family, timestamp: nowISO() });

  res.json({
    message: "pong",
    remoteAddress: ip,
    family,
    localAddress: `${req.socket.localAddress}:${req.socket.localPort}`,
    timestamp: Date.now(),
  });
});

// Lista de dispositivos (útil para depuração via curl/navegador)
apiApp.get("/api/devices", (req, res) => {
  res.json(devicesSnapshot());
});

// Listener "oficial" — IPv6 puro
const apiServer = http.createServer(apiApp);
apiServer.on("error", (err) => console.error("[API] Erro no servidor IPv6:", err.message));
apiServer.listen({ port: API_PORT, host: ECHO_HOST, ipv6Only: true }, () => {
  console.log(`[API] API de dispositivos (IPv6) ativa em [${ECHO_HOST}]:${API_PORT}`);
});

// Listener paralelo — IPv4, mesma porta lógica, para fallback
const apiServer4 = http.createServer(apiApp);
apiServer4.on("error", (err) => console.error("[API] Erro no servidor IPv4 (fallback):", err.message));
apiServer4.listen({ port: API_PORT, host: API_HOST_V4 }, () => {
  console.log(`[API] API de dispositivos (IPv4 fallback) ativa em ${API_HOST_V4}:${API_PORT}`);
});
