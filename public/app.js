(() => {
  const tableBodyEl = document.getElementById("logTableBody");
  const tableWrapEl = document.getElementById("tableWrap");
  const totalCountEl = document.getElementById("totalCount");
  const activeCountEl = document.getElementById("activeCount");
  const shownCountEl = document.getElementById("shownCount");
  const ipFilterEl = document.getElementById("ipFilter");
  const clearFilterBtn = document.getElementById("clearFilter");
  const filterHintEl = document.getElementById("filterHint");
  const lampServer = document.getElementById("lampServer").querySelector(".led");
  const clockEl = document.getElementById("clock");
  const deviceListEl = document.getElementById("deviceList");
  const deviceCountEl = document.getElementById("deviceCount");

  let events = [];
  let filterText = "";
  let devices = [];
  let activeSocket = null;

  const DADOS_MAX_LEN = 60;

  // ---------------------------------------------------------------------
  // Relógio da rodapé
  // ---------------------------------------------------------------------
  function tickClock() {
    clockEl.textContent = new Date().toLocaleTimeString("pt-BR");
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ---------------------------------------------------------------------
  // Formatação de cada linha da tabela
  // ---------------------------------------------------------------------
  function formatDate(iso) {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour12: false });
  }

  function truncate(str, max) {
    if (!str) return "—";
    return str.length > max ? str.slice(0, max) + "…" : str;
  }

  // Convenção do protocolo de echo: dispositivo manda "SERIAL:mensagem".
  // Tudo antes dos dois-pontos é o número de série; o resto é a mensagem.
  function splitSerial(text) {
    const idx = text.indexOf(":");
    if (idx === -1) return { serial: "—", message: text };
    const serial = text.slice(0, idx).trim();
    const message = text.slice(idx + 1).trim();
    return { serial: serial || "—", message };
  }

  // Deriva os valores das 6 colunas a partir de cada tipo de evento
  function rowFields(ev) {
    const dia = formatDate(ev.timestamp);
    const horario = formatTime(ev.timestamp);
    const protocolo = ev.family || null;
    let serial = "—";
    let origem = "—";
    let dados = "—";

    switch (ev.type) {
      case "connect":
        origem = `${ev.ip}:${ev.port}`;
        dados = "nova conexão";
        break;
      case "disconnect":
        origem = `${ev.ip}:${ev.port}`;
        dados = "conexão encerrada";
        break;
      case "error":
        origem = `${ev.ip}:${ev.port}`;
        dados = truncate(ev.message, DADOS_MAX_LEN);
        break;
      case "data":
        origem = `${ev.ip}:${ev.port}`;
        if (ev.text !== null) {
          const parsed = splitSerial(ev.text);
          serial = parsed.serial;
          dados = truncate(parsed.message, DADOS_MAX_LEN);
        } else {
          dados = `0x${ev.hex.slice(0, 40)}${ev.hex.length > 40 ? "…" : ""} (binário)`;
        }
        break;
      case "device_register":
        origem = ev.ip;
        serial = ev.name;
        dados = truncate(`dispositivo registrado — porta de retorno ${ev.replyPort}`, DADOS_MAX_LEN);
        break;
      case "api_ping":
        origem = ev.ip;
        dados = "GET /api/ping";
        break;
      case "pingback_ok":
      case "pingback_fail":
        origem = `${ev.ip}:${ev.replyPort}`;
        serial = ev.name;
        dados = truncate(ev.message, DADOS_MAX_LEN);
        break;
    }

    return { dia, horario, serial, protocolo, origem, dados };
  }

  function buildRow(ev) {
    const f = rowFields(ev);
    const tr = document.createElement("tr");
    tr.className = `row-${ev.type}`;

    const tdDia = document.createElement("td");
    tdDia.textContent = f.dia;

    const tdHora = document.createElement("td");
    tdHora.textContent = f.horario;

    const tdSerial = document.createElement("td");
    tdSerial.className = "serial-cell";
    tdSerial.textContent = f.serial;

    const tdProto = document.createElement("td");
    if (f.protocolo) {
      const badge = document.createElement("span");
      badge.className = `family-badge family-${f.protocolo.toLowerCase()}`;
      badge.textContent = f.protocolo;
      tdProto.appendChild(badge);
    } else {
      tdProto.textContent = "—";
    }

    const tdOrigem = document.createElement("td");
    tdOrigem.className = "origem-cell";
    tdOrigem.textContent = f.origem;

    const tdDados = document.createElement("td");
    tdDados.className = "dados-cell";
    tdDados.textContent = f.dados;

    tr.append(tdDia, tdHora, tdSerial, tdProto, tdOrigem, tdDados);
    return tr;
  }

  function buildEmptyRow() {
    const tr = document.createElement("tr");
    tr.className = "table-empty-row";
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = filterText
      ? `nenhum evento para o filtro "${filterText}"`
      : "aguardando conexões...";
    tr.appendChild(td);
    return tr;
  }

  // ---------------------------------------------------------------------
  // Renderização (aplica filtro por IP)
  // ---------------------------------------------------------------------
  function matchesFilter(ev) {
    if (!filterText) return true;
    return (ev.ip || "").toLowerCase().includes(filterText);
  }

  function isNearBottom() {
    return tableWrapEl.scrollHeight - tableWrapEl.scrollTop - tableWrapEl.clientHeight < 60;
  }

  function render() {
    const wasNearBottom = isNearBottom();

    tableBodyEl.innerHTML = "";
    const filtered = events.filter(matchesFilter);

    if (filtered.length === 0) {
      tableBodyEl.appendChild(buildEmptyRow());
    } else {
      const frag = document.createDocumentFragment();
      filtered.forEach((ev) => frag.appendChild(buildRow(ev)));
      tableBodyEl.appendChild(frag);
    }

    shownCountEl.textContent = filtered.length;

    if (wasNearBottom) {
      tableWrapEl.scrollTop = tableWrapEl.scrollHeight;
    }
  }

  function appendOne(ev) {
    events.push(ev);
    if (events.length > 500) events.shift();

    if (!matchesFilter(ev)) return; // não precisa re-renderizar tudo

    const wasNearBottom = isNearBottom();

    const empty = tableBodyEl.querySelector(".table-empty-row");
    if (empty) empty.remove();

    tableBodyEl.appendChild(buildRow(ev));
    shownCountEl.textContent = tableBodyEl.querySelectorAll("tr:not(.table-empty-row)").length;

    if (wasNearBottom) {
      tableWrapEl.scrollTop = tableWrapEl.scrollHeight;
    }
  }

  // ---------------------------------------------------------------------
  // Dispositivos (app Android via API :7777)
  // ---------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function renderDevices() {
    deviceCountEl.textContent = devices.length;

    if (devices.length === 0) {
      deviceListEl.innerHTML = '<div class="device-empty">nenhum dispositivo registrado ainda</div>';
      return;
    }

    deviceListEl.innerHTML = "";
    devices.forEach((d) => {
      const state = d.lastPingBackStatus === "ok" ? "on"
        : d.lastPingBackStatus === "falha" ? "fail"
        : "pendente";
      const lastPing = d.lastPingBackAt
        ? `ping-pong: ${formatTime(d.lastPingBackAt)} — ${d.lastPingBackStatus}`
        : "ping-pong: ainda não testado";

      const card = document.createElement("div");
      card.className = "device-card";
      const familyBadge = d.family
        ? `<span class="family-badge family-${d.family.toLowerCase()}">${d.family}</span>`
        : "";
      card.innerHTML = `
        <div class="device-id">
          <span class="led" data-state="${state}"></span>
          <span class="device-name">${escapeHtml(d.name)}</span>
          ${familyBadge}
        </div>
        <span class="device-meta">[${escapeHtml(d.ip)}]:${escapeHtml(d.replyPort)}</span>
        <span class="device-meta">${lastPing}</span>
        <button class="device-ping-btn" type="button" data-name="${escapeHtml(d.name)}">Testar ping</button>
      `;
      deviceListEl.appendChild(card);
    });

    deviceListEl.querySelectorAll(".device-ping-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
          btn.disabled = true;
          activeSocket.send(JSON.stringify({ type: "ping_device", name: btn.dataset.name }));
          setTimeout(() => { btn.disabled = false; }, 2000);
        }
      });
    });
  }

  // ---------------------------------------------------------------------
  // Filtro por IP
  // ---------------------------------------------------------------------
  ipFilterEl.addEventListener("input", () => {
    filterText = ipFilterEl.value.trim().toLowerCase();
    filterHintEl.textContent = filterText ? `filtro: "${filterText}"` : "exibindo tudo";
    filterHintEl.classList.toggle("active", Boolean(filterText));
    render();
  });

  clearFilterBtn.addEventListener("click", () => {
    ipFilterEl.value = "";
    filterText = "";
    filterHintEl.textContent = "exibindo tudo";
    filterHintEl.classList.remove("active");
    render();
  });

  // ---------------------------------------------------------------------
  // WebSocket
  // ---------------------------------------------------------------------
  function connectSocket() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}`);
    activeSocket = ws;

    ws.addEventListener("open", () => {
      lampServer.dataset.state = "on";
    });

    ws.addEventListener("close", () => {
      lampServer.dataset.state = "off";
      setTimeout(connectSocket, 1500); // tenta reconectar
    });

    ws.addEventListener("error", () => {
      lampServer.dataset.state = "off";
    });

    ws.addEventListener("message", (msg) => {
      const data = JSON.parse(msg.data);

      if (data.type === "snapshot") {
        events = data.history || [];
        totalCountEl.textContent = data.totalConnections;
        activeCountEl.textContent = data.activeConnections;
        render();
        return;
      }

      if (data.type === "devices_snapshot") {
        devices = data.devices || [];
        renderDevices();
        return;
      }

      if (typeof data.totalConnections === "number") {
        totalCountEl.textContent = data.totalConnections;
      }
      if (typeof data.activeConnections === "number") {
        activeCountEl.textContent = data.activeConnections;
      }

      appendOne(data);
    });
  }

  connectSocket();
})();
