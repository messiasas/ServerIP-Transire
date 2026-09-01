(() => {
  const tableBodyEl = document.getElementById("logTableBody");
  const tableWrapEl = document.getElementById("tableWrap");
  const totalCountEl = document.getElementById("totalCount");
  const activeCountEl = document.getElementById("activeCount");
  const shownCountEl = document.getElementById("shownCount");
  const ipFilterEl = document.getElementById("ipFilter");
  const serialFilterEl = document.getElementById("serialFilter");
  const colFilterEls = document.querySelectorAll(".col-filter-input");
  const clearFilterBtn = document.getElementById("clearFilter");
  const filterHintEl = document.getElementById("filterHint");
  const lampServer = document.getElementById("lampServer").querySelector(".led");
  const clockEl = document.getElementById("clock");

  let events = [];
  let ipFilterText = "";
  let serialFilterText = "";
  const columnFilters = { dia: "", horario: "", serial: "", origem: "", comunicacao: "", teste: "" };

  const COMUNICACAO_MAX_LEN = 60;

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

  // Deriva os valores das colunas a partir de cada tipo de evento
  function rowFields(ev) {
    const dia = formatDate(ev.timestamp);
    const horario = formatTime(ev.timestamp);
    let serial = "—";
    let origem = "—";
    let comunicacao = "—";
    // Teste (resultado do OK) ainda não tem lógica implementada — fica
    // vazia por enquanto. Comunicação por ora só recebe as mensagens dos
    // dispositivos externos (mesmo comportamento da antiga coluna Dados).
    const teste = "—";

    switch (ev.type) {
      case "connect":
        origem = `${ev.ip}:${ev.port}`;
        comunicacao = "nova conexão";
        break;
      case "disconnect":
        origem = `${ev.ip}:${ev.port}`;
        comunicacao = "conexão encerrada";
        break;
      case "error":
        origem = `${ev.ip}:${ev.port}`;
        comunicacao = truncate(ev.message, COMUNICACAO_MAX_LEN);
        break;
      case "data":
        origem = `${ev.ip}:${ev.port}`;
        if (ev.text !== null) {
          const parsed = splitSerial(ev.text);
          serial = parsed.serial;
          comunicacao = truncate(parsed.message, COMUNICACAO_MAX_LEN);
        } else {
          comunicacao = `0x${ev.hex.slice(0, 40)}${ev.hex.length > 40 ? "…" : ""} (binário)`;
        }
        break;
      case "device_register":
        origem = ev.ip;
        serial = ev.name;
        comunicacao = truncate(`dispositivo registrado — porta de retorno ${ev.replyPort}`, COMUNICACAO_MAX_LEN);
        break;
      case "api_ping":
        origem = ev.ip;
        comunicacao = "GET /api/ping";
        break;
      case "pingback_ok":
      case "pingback_fail":
        origem = `${ev.ip}:${ev.replyPort}`;
        serial = ev.name;
        comunicacao = truncate(ev.message, COMUNICACAO_MAX_LEN);
        break;
    }

    return { dia, horario, serial, origem, comunicacao, teste };
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

    const tdOrigem = document.createElement("td");
    tdOrigem.className = "origem-cell";
    tdOrigem.textContent = f.origem;

    const tdComunicacao = document.createElement("td");
    tdComunicacao.className = "comunicacao-cell";
    tdComunicacao.textContent = f.comunicacao;

    const tdTeste = document.createElement("td");
    tdTeste.className = "teste-cell";
    tdTeste.textContent = f.teste;

    tr.append(tdDia, tdHora, tdSerial, tdOrigem, tdComunicacao, tdTeste);
    return tr;
  }

  function buildEmptyRow() {
    const tr = document.createElement("tr");
    tr.className = "table-empty-row";
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = hasActiveFilters()
      ? "nenhum evento para os filtros aplicados"
      : "aguardando conexões...";
    tr.appendChild(td);
    return tr;
  }

  // ---------------------------------------------------------------------
  // Renderização (aplica os filtros: Serial Number e IP na barra lateral,
  // e um filtro por texto em cada coluna da tabela)
  // ---------------------------------------------------------------------
  function hasActiveFilters() {
    return Boolean(
      ipFilterText ||
      serialFilterText ||
      Object.values(columnFilters).some((v) => v)
    );
  }

  function matchesFilter(ev) {
    if (ipFilterText && !(ev.ip || "").toLowerCase().includes(ipFilterText)) return false;

    const f = rowFields(ev);
    if (serialFilterText && !String(f.serial || "").toLowerCase().includes(serialFilterText)) return false;

    for (const col of Object.keys(columnFilters)) {
      const needle = columnFilters[col];
      if (needle && !String(f[col] || "").toLowerCase().includes(needle)) return false;
    }

    return true;
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
  // Filtros: Serial Number e IP (barra lateral) + filtro por coluna (tabela)
  // ---------------------------------------------------------------------
  const COLUMN_LABELS = {
    dia: "dia",
    horario: "horário",
    serial: "serial (coluna)",
    origem: "origem",
    comunicacao: "comunicação",
    teste: "teste",
  };

  function updateFilterHint() {
    const parts = [];
    if (serialFilterText) parts.push(`serial: "${serialFilterText}"`);
    if (ipFilterText) parts.push(`ip: "${ipFilterText}"`);
    for (const col of Object.keys(columnFilters)) {
      if (columnFilters[col]) parts.push(`${COLUMN_LABELS[col]}: "${columnFilters[col]}"`);
    }
    filterHintEl.textContent = parts.length ? `filtro: ${parts.join(", ")}` : "exibindo tudo";
    filterHintEl.classList.toggle("active", parts.length > 0);
  }

  serialFilterEl.addEventListener("input", () => {
    serialFilterText = serialFilterEl.value.trim().toLowerCase();
    updateFilterHint();
    render();
  });

  ipFilterEl.addEventListener("input", () => {
    ipFilterText = ipFilterEl.value.trim().toLowerCase();
    updateFilterHint();
    render();
  });

  colFilterEls.forEach((input) => {
    input.addEventListener("input", () => {
      columnFilters[input.dataset.col] = input.value.trim().toLowerCase();
      updateFilterHint();
      render();
    });
  });

  clearFilterBtn.addEventListener("click", () => {
    serialFilterEl.value = "";
    ipFilterEl.value = "";
    serialFilterText = "";
    ipFilterText = "";
    colFilterEls.forEach((input) => {
      input.value = "";
      columnFilters[input.dataset.col] = "";
    });
    updateFilterHint();
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

      // O painel de Dispositivos foi removido do front-end, mas o servidor
      // ainda envia esse snapshot ao registrar/pingar um dispositivo — só
      // ignoramos aqui pra não virar uma linha inválida na tabela.
      if (data.type === "devices_snapshot") {
        return;
      }

      // Atualização "silenciosa" de contadores (ex: quando uma conexão de
      // echo fecha) — não vira linha na tabela, só atualiza o total/ativas.
      if (data.type === "counts") {
        totalCountEl.textContent = data.totalConnections;
        activeCountEl.textContent = data.activeConnections;
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
