const net = require("net");
const http = require("http");
const fs = require("fs");
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");
const { rowFields } = require("./public/rowFields.js");

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------
const ECHO_HOST = process.env.ECHO_HOST || "0.0.0.0";   // todas as interfaces IPv4
const ECHO_PORT = parseInt(process.env.ECHO_PORT || "1111", 10);
const WEB_PORT = parseInt(process.env.WEB_PORT || "3000", 10);
const API_PORT = parseInt(process.env.API_PORT || "7777", 10); // API de dispositivos (app Android)
const API_HOST = process.env.API_HOST || "0.0.0.0";     // todas as interfaces IPv4
const HISTORY_LIMIT = 500; // quantos eventos ficam guardados em memória p/ novos clientes
const PINGBACK_TIMEOUT_MS = 5000;

// Diretório onde cada dia de registros fica gravado em um .txt próprio
// (ex: 01-09-26.txt), com as mesmas colunas exibidas no painel.
const HISTORY_DIR = path.join(__dirname, "historico");
const HISTORY_DATE_RE = /^\d{2}-\d{2}-\d{2}$/;
fs.mkdirSync(HISTORY_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Estado compartilhado
// ---------------------------------------------------------------------------
let totalConnections = 0;
let activeConnections = 0;
const history = [];
const devices = new Map(); // name -> { name, ip, replyPort, registeredAt, lastSeen, lastPingBackAt, lastPingBackStatus, lastPingBackMessage }

// Nome do arquivo (dd-mm-aa) do dia do evento, no fuso horário local do servidor
function historyFileDate(timestamp) {
  const d = new Date(timestamp);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

// Converte "dd-mm-aa" de volta pra Date, só pra poder ordenar os arquivos
// cronologicamente (ordem alfabética não funciona, o dia vem primeiro)
function parseHistoryDate(fileDate) {
  const [dd, mm, yy] = fileDate.split("-").map(Number);
  return new Date(2000 + yy, mm - 1, dd);
}

// Grava o evento no .txt do dia correspondente, com as mesmas 6 colunas do
// painel (uma linha por evento, campos separados por tab)
function appendHistoryLine(event) {
  const row = rowFields(event);
  const line = [row.dia, row.horario, row.serial, row.origem, row.comunicacao, row.teste].join("\t");
  const filePath = path.join(HISTORY_DIR, `${historyFileDate(event.timestamp)}.txt`);
  fs.appendFile(filePath, line + "\n", (err) => {
    if (err) console.error("[HISTORICO] Erro ao gravar:", err.message);
  });
}

function pushEvent(event) {
  history.push(event);
  if (history.length > HISTORY_LIMIT) history.shift();
  appendHistoryLine(event);
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

// Atualiza os contadores (total/ativas) de quem já está com o painel aberto,
// sem criar uma linha na tabela e sem entrar no histórico — usado quando uma
// conexão de echo fecha, pra não gerar a linha de "conexão encerrada".
function broadcastCounts() {
  broadcast({ type: "counts", totalConnections, activeConnections });
}

// Tenta contatar o mini-servidor HTTP do próprio celular (NanoHTTPD, GET /api/ping)
// — é a "volta" do ping-pong: o servidor central confirma que consegue alcançar o app.
function pingDeviceBack(device) {
  return new Promise((resolve) => {
    const url = `http://${device.ip}:${device.replyPort}/api/ping`;

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
    ipFamily: device.ipFamily,
    name: device.name,
    replyPort: device.replyPort,
    timestamp: nowISO(),
    message: device.lastPingBackMessage,
  });
  broadcastDevices();
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
// Servidor ECHO (TCP, IPv4)
// ---------------------------------------------------------------------------
function handleEchoConnection(socket) {
  const remoteIp = socket.remoteAddress || "desconhecido";
  const remotePort = socket.remotePort;
  const remoteFamily = socket.remoteFamily; // "IPv4" ou "IPv6"

  totalConnections += 1;
  activeConnections += 1;
  // Não emite mais um evento "connect" separado — o contador é atualizado
  // aqui em memória, e só vira uma linha visível no painel quando (e se)
  // o evento "data" chegar, já carregando os valores atuais dos contadores.

  socket.on("data", (data) => {
    const formatted = formatData(data);

    pushEvent({
      type: "data",
      ip: remoteIp,
      port: remotePort,
      ipFamily: remoteFamily,
      timestamp: nowISO(),
      totalConnections,
      activeConnections,
      ...formatted,
    });

    // ECHO REAL: devolve exatamente o que foi recebido
    socket.write(data);
    socket.end();
  });

  socket.on("close", () => {
    activeConnections = Math.max(0, activeConnections - 1);
    // Sem pushEvent aqui — não queremos uma linha de "conexão encerrada" no
    // painel. Só atualizamos os contadores de quem já está com o painel aberto.
    broadcastCounts();
  });

  socket.on("error", (err) => {
    pushEvent({
      type: "error",
      ip: remoteIp,
      port: remotePort,
      ipFamily: remoteFamily,
      timestamp: nowISO(),
      message: err.message,
    });
  });
}

const echoServer = net.createServer({ allowHalfOpen: false }, handleEchoConnection);
echoServer.on("error", (err) => {
  console.error("[ECHO] Erro no servidor:", err.message);
});
echoServer.listen({ port: ECHO_PORT, host: ECHO_HOST }, () => {
  console.log(`[ECHO] Servidor ECHO ativo em ${ECHO_HOST}:${ECHO_PORT}`);
});

// ---------------------------------------------------------------------------
// Painel Web (Express + WebSocket)
// ---------------------------------------------------------------------------
const app = express();
app.use(express.static(path.join(__dirname, "public")));

// Datas com histórico gravado (mais recente primeiro)
app.get("/api/history/dates", (req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(HISTORY_DIR);
  } catch {
    files = [];
  }

  const dates = files
    .filter((f) => f.endsWith(".txt"))
    .map((f) => f.slice(0, -4))
    .filter((d) => HISTORY_DATE_RE.test(d))
    .sort((a, b) => parseHistoryDate(b) - parseHistoryDate(a));

  res.json(dates);
});

// Linhas gravadas em um dia específico (dd-mm-aa), já no formato das colunas do painel
app.get("/api/history/:date", (req, res) => {
  const { date } = req.params;
  if (!HISTORY_DATE_RE.test(date)) {
    return res.status(400).json({ message: "data inválida — use o formato dd-mm-aa" });
  }

  const filePath = path.join(HISTORY_DIR, `${date}.txt`);
  fs.readFile(filePath, "utf8", (err, content) => {
    if (err) {
      if (err.code === "ENOENT") return res.json([]);
      return res.status(500).json({ message: "erro ao ler histórico" });
    }

    const rows = content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [dia, horario, serial, origem, comunicacao, teste] = line.split("\t");
        return { dia, horario, serial, origem, comunicacao, teste };
      });

    res.json(rows);
  });
});

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

  const ip = req.socket.remoteAddress || "";
  const ipFamily = req.socket.remoteFamily;
  const now = nowISO();
  const existing = devices.get(name);
  const device = {
    name,
    ip,
    ipFamily,
    replyPort,
    registeredAt: existing ? existing.registeredAt : now,
    lastSeen: now,
    lastPingBackAt: existing ? existing.lastPingBackAt : null,
    lastPingBackStatus: existing ? existing.lastPingBackStatus : "pendente",
    lastPingBackMessage: existing ? existing.lastPingBackMessage : "",
  };
  devices.set(name, device);

  pushEvent({ type: "device_register", ip, ipFamily, name, replyPort, timestamp: now });
  broadcastDevices();

  res.json({
    message: "dispositivo registrado",
    remoteAddress: ip,
    localAddress: `${req.socket.localAddress}:${req.socket.localPort}`,
    timestamp: Date.now(),
  });

  // Completa o ping-pong: o servidor tenta alcançar o mini-servidor do celular
  pingBackAndReport(device);
});

// Endpoint de ping "simples" — usado pelo botão manual do app
apiApp.get("/api/ping", (req, res) => {
  const ip = req.socket.remoteAddress || "";
  const ipFamily = req.socket.remoteFamily;
  pushEvent({ type: "api_ping", ip, ipFamily, timestamp: nowISO() });

  res.json({
    message: "pong",
    remoteAddress: ip,
    localAddress: `${req.socket.localAddress}:${req.socket.localPort}`,
    timestamp: Date.now(),
  });
});

// Lista de dispositivos (útil para depuração via curl/navegador)
apiApp.get("/api/devices", (req, res) => {
  res.json(devicesSnapshot());
});

const apiServer = http.createServer(apiApp);
apiServer.on("error", (err) => console.error("[API] Erro no servidor:", err.message));
apiServer.listen({ port: API_PORT, host: API_HOST }, () => {
  console.log(`[API] API de dispositivos ativa em ${API_HOST}:${API_PORT}`);
});
