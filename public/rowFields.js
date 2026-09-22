// Deriva as 6 colunas do painel (Dia, Horário, Serial Number, Origem,
// Comunicação, Teste) a partir de um evento — usado tanto pelo servidor
// (para gravar o histórico em disco) quanto pelo painel no navegador
// (para renderizar a tabela em tempo real), garantindo que os dois lados
// mostrem exatamente a mesma coisa.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RowFields = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  function formatDate(iso) {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour12: false });
  }

  // Comunicação indica só o protocolo usado na troca (IPv4/IPv6); quem
  // decide isso é o servidor (socket.remoteFamily), não o dispositivo.
  function formatIpFamily(family) {
    if (family === "IPv6") return "Ipv6";
    if (family === "IPv4") return "Ipv4";
    return "—";
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

  function rowFields(ev) {
    const dia = formatDate(ev.timestamp);
    const horario = formatTime(ev.timestamp);
    let serial = "—";
    let origem = "—";
    // Teste (resultado do OK) ainda não tem lógica implementada — fica
    // vazia por enquanto.
    const teste = "—";

    switch (ev.type) {
      case "connect":
      case "disconnect":
      case "error":
        origem = `${ev.ip}:${ev.port}`;
        break;
      case "data":
        origem = `${ev.ip}:${ev.port}`;
        if (ev.text !== null && ev.text !== undefined) {
          serial = splitSerial(ev.text).serial;
        }
        break;
      case "device_register":
        origem = ev.ip;
        serial = ev.name;
        break;
      case "api_ping":
        origem = ev.ip;
        break;
      case "pingback_ok":
      case "pingback_fail":
        origem = `${ev.ip}:${ev.replyPort}`;
        serial = ev.name;
        break;
    }

    const comunicacao = formatIpFamily(ev.ipFamily);

    return { dia, horario, serial, origem, comunicacao, teste };
  }

  return { formatDate, formatTime, formatIpFamily, splitSerial, rowFields };
});
