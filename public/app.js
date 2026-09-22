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

  const navTabEls = document.querySelectorAll(".nav-tab");
  const viewPainelEl = document.getElementById("viewPainel");
  const viewHistoricoEl = document.getElementById("viewHistorico");
  const historyTableWrapEl = document.getElementById("historyTableWrap");
  const historyTableBodyEl = document.getElementById("historyTableBody");
  const historyDateSelectEl = document.getElementById("historyDateSelect");
  const historyIpFilterEl = document.getElementById("historyIpFilter");
  const historyCountEl = document.getElementById("historyCount");
  const historyBackBtn = document.getElementById("historyBack");

  let events = [];
  let ipFilterText = "";
  let serialFilterText = "";
  const columnFilters = { dia: "", horario: "", serial: "", origem: "", comunicacao: "", teste: "" };

  // ---------------------------------------------------------------------
  // Relógio da rodapé
  // ---------------------------------------------------------------------
  function tickClock() {
    clockEl.textContent = new Date().toLocaleTimeString("pt-BR");
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ---------------------------------------------------------------------
  // Formatação de cada linha da tabela (lógica compartilhada com o
  // servidor, que usa a mesma função para gravar o histórico em disco)
  // ---------------------------------------------------------------------
  const { rowFields } = window.RowFields;

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
  // Aba Histórico: lê os registros gravados em disco (public/rowFields.js
  // já roda no servidor pra gerar essas mesmas linhas), organizados por data
  // ---------------------------------------------------------------------
  let historyRows = [];
  let historyIpFilterText = "";

  function buildHistoryRow(row) {
    const tr = document.createElement("tr");

    const tdDia = document.createElement("td");
    tdDia.textContent = row.dia || "—";

    const tdHora = document.createElement("td");
    tdHora.textContent = row.horario || "—";

    const tdSerial = document.createElement("td");
    tdSerial.className = "serial-cell";
    tdSerial.textContent = row.serial || "—";

    const tdOrigem = document.createElement("td");
    tdOrigem.className = "origem-cell";
    tdOrigem.textContent = row.origem || "—";

    const tdComunicacao = document.createElement("td");
    tdComunicacao.className = "comunicacao-cell";
    tdComunicacao.textContent = row.comunicacao || "—";

    const tdTeste = document.createElement("td");
    tdTeste.className = "teste-cell";
    tdTeste.textContent = row.teste || "—";

    tr.append(tdDia, tdHora, tdSerial, tdOrigem, tdComunicacao, tdTeste);
    return tr;
  }

  function buildHistoryEmptyRow(message) {
    const tr = document.createElement("tr");
    tr.className = "table-empty-row";
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = message;
    tr.appendChild(td);
    return tr;
  }

  function renderHistory() {
    historyTableBodyEl.innerHTML = "";

    const filtered = historyIpFilterText
      ? historyRows.filter((row) => String(row.origem || "").toLowerCase().includes(historyIpFilterText))
      : historyRows;

    if (filtered.length === 0) {
      historyTableBodyEl.appendChild(
        buildHistoryEmptyRow(
          historyRows.length === 0 ? "nenhum registro para esta data" : "nenhum registro para o filtro de IP aplicado"
        )
      );
    } else {
      const frag = document.createDocumentFragment();
      filtered.forEach((row) => frag.appendChild(buildHistoryRow(row)));
      historyTableBodyEl.appendChild(frag);
    }

    historyCountEl.textContent = filtered.length;
  }

  async function loadHistoryDates() {
    const previouslySelected = historyDateSelectEl.value;
    try {
      const res = await fetch("/api/history/dates");
      const dates = await res.json();

      historyDateSelectEl.innerHTML = "";
      if (!dates || dates.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "nenhuma data gravada";
        historyDateSelectEl.appendChild(opt);
        historyRows = [];
        renderHistory();
        return;
      }

      dates.forEach((date) => {
        const opt = document.createElement("option");
        opt.value = date;
        opt.textContent = date;
        historyDateSelectEl.appendChild(opt);
      });

      if (dates.includes(previouslySelected)) {
        historyDateSelectEl.value = previouslySelected;
      }

      await loadHistoryForDate(historyDateSelectEl.value);
    } catch {
      historyDateSelectEl.innerHTML = '<option value="">erro ao carregar datas</option>';
      historyRows = [];
      renderHistory();
    }
  }

  async function loadHistoryForDate(date) {
    if (!date) {
      historyRows = [];
      renderHistory();
      return;
    }
    try {
      const res = await fetch(`/api/history/${encodeURIComponent(date)}`);
      historyRows = res.ok ? await res.json() : [];
    } catch {
      historyRows = [];
    }
    renderHistory();
  }

  historyDateSelectEl.addEventListener("change", () => {
    loadHistoryForDate(historyDateSelectEl.value);
  });

  historyIpFilterEl.addEventListener("input", () => {
    historyIpFilterText = historyIpFilterEl.value.trim().toLowerCase();
    renderHistory();
  });

  // ---------------------------------------------------------------------
  // Alternância Painel <-> Histórico
  // ---------------------------------------------------------------------
  function switchView(view) {
    const isHistorico = view === "historico";

    navTabEls.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
    viewPainelEl.hidden = isHistorico;
    viewHistoricoEl.hidden = !isHistorico;
    tableWrapEl.hidden = isHistorico;
    historyTableWrapEl.hidden = !isHistorico;

    if (isHistorico) {
      loadHistoryDates();
    }
  }

  navTabEls.forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  historyBackBtn.addEventListener("click", () => switchView("painel"));

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
