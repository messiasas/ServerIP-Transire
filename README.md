# ECHO-6 (ServerIP) — Monitor de Echo TCP/IPv6 + API de dispositivos

Equivalente ao `server.py` original, com um painel web em tempo real para
acompanhar as conexões, os dados recebidos/devolvidos, e um filtro por IP.

## O que o app faz

- Sobe um servidor TCP **echo** em IPv6 (`::`), porta **5000** — igual ao script Python:
  recebe os bytes de uma conexão e devolve exatamente o mesmo conteúdo (`ECHO REAL`).
- Sobe um painel web em `http://localhost:3000` que mostra, em tempo real:
  - cada conexão aberta/fechada (IP + porta de origem)
  - os dados recebidos em cada conexão
  - contadores de conexões totais e ativas
  - um campo para **filtrar por IP** (aceita substring, ex: digitar `fd00` mostra
    só conexões cujo IP contém `fd00`)

## Como rodar localmente

Pré-requisito: [Node.js](https://nodejs.org) instalado (versão 18 ou superior).

```bash
# 1. Entrar na pasta do projeto
cd ipv6-echo-app

# 2. Instalar as dependências (express + ws)
npm install

# 3. Iniciar o servidor
npm start
```

Você verá algo assim no terminal:

```
[WEB] Painel de monitoramento em http://localhost:3000
[ECHO] Servidor ECHO IPv6 ativo em [::]:5000
```

Abra `http://localhost:3000` no navegador para ver o painel.

## Como testar o echo

Em outro terminal, você pode simular uma conexão IPv6 local:

```bash
# Linux/Mac
echo -n "ola mundo" | nc -6 ::1 5000

# ou via Node (multiplataforma)
node -e "
const net = require('net');
const s = net.createConnection({port:5000, host:'::1'}, () => s.write('ola mundo'));
s.on('data', d => console.log('recebido de volta:', d.toString()));
"
```

A conexão vai aparecer no painel web instantaneamente, com o IP de origem
(`::1`), os dados recebidos e a confirmação do echo.

## API de dispositivos (app Android "ipv6_inova")

Além do echo, o servidor agora sobe uma terceira porta (**7777**, IPv6) com os
endpoints que o app Android espera, para fazer o "ping-pong":

| Método | Rota | Quem chama | O que faz |
|---|---|---|---|
| `POST` | `/api/devices/ping` | App Android, ao abrir | Registra o dispositivo (`name` + `replyPort`). O servidor então tenta contatar de volta o mini-servidor do celular (`GET http://[ip-do-celular]:replyPort/api/ping`) para confirmar o caminho de volta. |
| `GET` | `/api/ping` | App Android, botão manual | Responde `pong` com `remoteAddress`, `localAddress` e `timestamp`. |
| `GET` | `/api/devices` | Depuração (navegador/curl) | Lista os dispositivos registrados e o status do último ping-pong. |

O resultado de cada registro e ping-pong aparece em tempo real no painel web,
e os dispositivos ficam listados na barra lateral com um botão **"Testar
ping"** para repetir o teste manualmente.

## Painel principal (tabela de registro)

O painel mostra uma tabela com 6 colunas para cada evento:

| Coluna | Quem preenche | Descrição |
|---|---|---|
| **Dia** | Aplicação | Data no formato `dd/mm/aaaa`, extraída do horário do evento |
| **Horário** | Aplicação | Hora exata do evento (`HH:mm:ss`) |
| **Serial Number** | Dispositivo externo | Identificador enviado pelo dispositivo (veja convenção abaixo) |
| **Protocolo** | Servidor | `IPv4` ou `IPv6`, detectado automaticamente pelo socket da conexão |
| **Origem** | Dispositivo externo | IP (e porta, quando aplicável) de onde veio a conexão |
| **Dados** | Dispositivo externo | Conteúdo enviado, truncado em até 60 caracteres |

### Convenção do echo (porta 5000): `SERIAL:mensagem`

Como o protocolo de echo original (`server.py`) não tem nenhum campo
estruturado, definimos uma convenção simples para o dispositivo informar o
número de série junto com os dados: tudo **antes dos dois-pontos** é tratado
como Serial Number, e o restante como a mensagem (Dados). Por exemplo, se o
dispositivo mandar:

```
SN-0042:Temperatura 23.5C, umidade 60%
```

O painel mostra:
- **Serial Number:** `SN-0042`
- **Dados:** `Temperatura 23.5C, umidade 60%`

Se o dispositivo mandar uma mensagem **sem** os dois-pontos, o Serial Number
aparece como `—` (não informado) e a mensagem inteira vai para Dados.

**Importante:** essa convenção é só para exibição no painel — o
comportamento de *echo* continua sendo devolver exatamente os bytes
originais, sem alterar nada, igual ao script Python.

Para os eventos de **API de dispositivos** (registro/ping-pong do app
Android), o Serial Number já vem naturalmente do campo `name` que o app
manda ao se registrar.

## Fallback IPv4

O echo (porta 5000) e a API de dispositivos (porta 7777) continuam sendo,
por padrão, **IPv6-only** — igual ao `server.py` original. Mas agora existe
um **segundo listener em paralelo, na mesma porta, em IPv4**, para o caso de
um dispositivo não conseguir alcançar o servidor via IPv6 e precisar cair
no fallback.

Toda conexão (echo, registro de dispositivo, ping manual, ping-pong) é
identificada com um selo **IPv6** ou **IPv4** no painel — tanto nas linhas
do console quanto nos cards de dispositivo — mostrando exatamente por qual
caminho a conexão chegou. Isso é útil justamente para o teste de "o
dispositivo não tem IPv6, então ele cai pra IPv4": você vai ver o selo
**IPv4** aparecer no evento correspondente.

## Configuração (opcional)

Por padrão:
- Porta do echo: `5000`
- Host do echo/API: `::` (todas as interfaces IPv6)
- Porta do painel web: `3000`
- Porta da API de dispositivos: `7777`

Para mudar, use variáveis de ambiente antes de iniciar:

```bash
ECHO_PORT=6000 WEB_PORT=8080 API_PORT=7777 npm start
```

**Atenção:** a porta `7777` está **fixa no código do app Android** (compilada
no APK). Se você mudar `API_PORT` aqui, o app vai parar de encontrar o
servidor — a menos que você também altere e recompile o app (veja a seção
abaixo).

## Rodando no seu servidor Azure

Como o servidor Azure já tem IPv6 configurado (você tinha o `server.py`
rodando lá), basta copiar esta pasta pro servidor (via `scp -r`, por
exemplo) e rodar `npm install && npm start` por lá também. Lembre-se de
liberar as portas 5000 (echo) e 3000 (painel web) no Network Security
Group do Azure se quiser acessar o painel remotamente.

## Estrutura de arquivos

```
ipv6-echo-app/
├── package.json       # dependências (express, ws)
├── server.js           # servidor echo TCP/IPv6 + servidor web/WebSocket
├── public/
│   ├── index.html       # estrutura do painel
│   ├── style.css        # tema industrial (chapa metálica, LEDs, faixas de risco)
│   └── app.js            # lógica do painel: WebSocket, console, filtro por IP
└── README.md
```
