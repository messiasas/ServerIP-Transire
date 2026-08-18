(() => {
  const consoleEl = document.getElementById("console");
  const totalCountEl = document.getElementById("totalCount");
  const activeCountEl = document.getElementById("activeCount");
  const shownCountEl = document.getElementById("shownCount");
  const ipFilterEl = document.getElementById("ipFilter");
  const clearFilterBtn = document.getElementById("clearFilter");
  const filterHintEl = document.getElementById("filterHint");
  const lampServer = document.getElementById("lampServer").querySelector(".led");
  const clockEl = document.getElementById("clock");

  let events = [];
  let filterText = "";

  // ---------------------------------------------------------------------
  // Relógio da rodapé
  // ---------------------------------------------------------------------
  function tickClock() {
    clockEl.textContent = new Date().toLocaleTimeString("pt-BR");
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ---------------------------------------------------------------------
  // Formatação de cada linha do console
  // ---------------------------------------------------------------------
  const TAGS = {
    connect: "CONECTAR",
    disconnect: "FECHAR",
    data: "DADOS",
    error: "ERRO",
  };

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour12: false });
  }

  function describe(ev) {
    switch (ev.type) {
      case "connect":
        return `origem [${ev.ip}]:${ev.port} — nova conexão`;
      case "disconnect":
        return `origem [${ev.ip}]:${ev.port} — conexão encerrada`;
      case "data": {
        const preview = ev.text !== null
          ? JSON.stringify(ev.text)
          : `0x${ev.hex.slice(0, 40)}${ev.hex.length > 40 ? "…" : ""} (binário)`;
        return `[${ev.ip}]:${ev.port} — recebido ${ev.bytes}B — devolvido via echo — ${preview}`;
      }
      case "error":
        return `[${ev.ip}]:${ev.port} — ${ev.message}`;
      default:
        return JSON.stringify(ev);
    }
  }

  function buildLine(ev) {
    const line = document.createElement("div");
    line.className = `log-line ${ev.type}`;
    line.innerHTML = `
      <span class="log-time">${formatTime(ev.timestamp)}</span>
      <span class="log-tag">${TAGS[ev.type] || ev.type.toUpperCase()}</span>
      <span class="log-body"></span>
    `;
    line.querySelector(".log-body").textContent = describe(ev);
    return line;
  }

  // ---------------------------------------------------------------------
  // Renderização (aplica filtro por IP)
  // ---------------------------------------------------------------------
  function matchesFilter(ev) {
    if (!filterText) return true;
    return (ev.ip || "").toLowerCase().includes(filterText);
  }

  function render() {
    const wasNearBottom =
      consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight < 60;

    consoleEl.innerHTML = "";
    const filtered = events.filter(matchesFilter);

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "console-empty";
      empty.textContent = filterText
        ? `nenhum evento para o filtro "${filterText}"`
        : "aguardando conexões...";
      consoleEl.appendChild(empty);
    } else {
      const frag = document.createDocumentFragment();
      filtered.forEach((ev) => frag.appendChild(buildLine(ev)));
      consoleEl.appendChild(frag);
    }

    shownCountEl.textContent = filtered.length;

    if (wasNearBottom) {
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  }

  function appendOne(ev) {
    events.push(ev);
    if (events.length > 500) events.shift();

    if (!matchesFilter(ev)) return; // não precisa re-renderizar tudo

    const wasNearBottom =
      consoleEl.scrollHeight - consoleEl.scrollTop - consoleEl.clientHeight < 60;

    const empty = consoleEl.querySelector(".console-empty");
    if (empty) empty.remove();

    consoleEl.appendChild(buildLine(ev));
    shownCountEl.textContent = consoleEl.querySelectorAll(".log-line").length;

    if (wasNearBottom) {
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
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
