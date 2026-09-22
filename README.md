# ServerIP — Monitor de Echo TCP + API de dispositivos

Equivalente ao `server.py` original, com um painel web em tempo real para
acompanhar as conexões, os dados recebidos/devolvidos, e filtros por coluna.

## O que o app faz

- Sobe um servidor TCP **echo** em IPv4, porta **1111** — igual ao script Python:
  recebe os bytes de uma conexão e devolve exatamente o mesmo conteúdo (`ECHO REAL`).
- Sobe um painel web em `http://localhost:3000` que mostra, em tempo real:
  - cada conexão aberta/fechada (IP + porta de origem)
  - os dados recebidos em cada conexão
  - contadores de conexões totais e ativas
  - um campo para **filtrar por Serial Number** e outro para **filtrar por IP**
    na barra lateral (aceitam substring, ex: digitar `fd00` mostra só conexões
    cujo IP contém `fd00`)
  - um **filtro por texto em cada coluna** da tabela

## Como rodar localmente

Pré-requisito: [Node.js](https://nodejs.org) instalado (versão 18 ou superior).

```bash
# 1. Entrar na pasta do projeto
cd ServerIP-Transire

# 2. Instalar as dependências (express + ws)
npm install

# 3. Iniciar o servidor
npm start
```

Você verá algo assim no terminal:

```
[WEB] Painel de monitoramento em http://localhost:3000
[ECHO] Servidor ECHO ativo em 0.0.0.0:1111
```

Abra `http://localhost:3000` no navegador para ver o painel.

## Como testar o echo

Em outro terminal, você pode simular uma conexão local:

```bash
# Linux/Mac
echo -n "ola mundo" | nc 127.0.0.1 1111

# ou via Node (multiplataforma)
node -e "
const net = require('net');
const s = net.createConnection({port:1111, host:'127.0.0.1'}, () => s.write('ola mundo'));
s.on('data', d => console.log('recebido de volta:', d.toString()));
"
```

A conexão vai aparecer no painel web instantaneamente, com o IP de origem
(`127.0.0.1`), os dados recebidos e a confirmação do echo.

## API de dispositivos (app Android "ipv6_inova")

Além do echo, o servidor sobe uma terceira porta (**7777**) com os
endpoints que o app Android espera, para fazer o "ping-pong":

| Método | Rota | Quem chama | O que faz |
|---|---|---|---|
| `POST` | `/api/devices/ping` | App Android, ao abrir | Registra o dispositivo (`name` + `replyPort`). O servidor então tenta contatar de volta o mini-servidor do celular (`GET http://[ip-do-celular]:replyPort/api/ping`) para confirmar o caminho de volta. |
| `GET` | `/api/ping` | App Android, botão manual | Responde `pong` com `remoteAddress`, `localAddress` e `timestamp`. |
| `GET` | `/api/devices` | Depuração (navegador/curl) | Lista os dispositivos registrados e o status do último ping-pong. |

O resultado de cada registro e ping-pong aparece em tempo real na tabela do
painel web (linhas `device_register`, `pingback_ok`/`pingback_fail`).

## Painel principal (tabela de registro)

O painel mostra uma tabela com 6 colunas para cada evento:

| Coluna | Quem preenche | Descrição |
|---|---|---|
| **Dia** | Aplicação | Data no formato `dd/mm/aaaa`, extraída do horário do evento |
| **Horário** | Aplicação | Hora exata do evento (`HH:mm:ss`) |
| **Serial Number** | Dispositivo externo | Identificador enviado pelo dispositivo (veja convenção abaixo) |
| **Origem** | Dispositivo externo | IP (e porta, quando aplicável) de onde veio a conexão |
| **Comunicação** | Aplicação | Indica se a troca aconteceu via `Ipv4` ou `Ipv6`, a partir da família de socket detectada pelo servidor (`socket.remoteFamily`). |
| **Teste** | *(ainda sem lógica)* | Reservada para indicar se o teste deu OK, assim que o servidor receber a confirmação do dispositivo externo. Hoje fica sempre vazia (`—`). |

Todas as colunas têm um campo de filtro por texto no próprio cabeçalho da
tabela, além dos filtros de Serial Number e IP na barra lateral.

## Histórico

Todo evento que aparece no painel também é gravado em disco, em um arquivo
`.txt` por dia (pasta `historico/`, criada automaticamente na primeira
execução), nomeado no formato `dd-mm-aa` — por exemplo, os registros do dia
01/09/2026 ficam em `historico/01-09-26.txt`. Cada linha do arquivo tem as
mesmas 6 colunas do painel (Dia, Horário, Serial Number, Origem, Comunicação,
Teste), separadas por tab.

Na barra lateral existe uma aba **Histórico** (ao lado da aba **Painel**).
Ao clicar nela, o painel principal passa a mostrar os registros gravados,
com um seletor de data e um filtro por IP; o botão **← Voltar ao Painel**
(ou a própria aba **Painel**) retorna para a visão em tempo real.

Essa pasta não entra no controle de versão (veja `.gitignore`) — é dado de
runtime, não código.

### Convenção do echo (porta 1111): `SERIAL:mensagem`

Como o protocolo de echo original (`server.py`) não tem nenhum campo
estruturado, definimos uma convenção simples para o dispositivo informar o
número de série junto com os dados: tudo **antes dos dois-pontos** é tratado
como Serial Number, e o restante é a mensagem em si (usada só internamente,
não aparece em nenhuma coluna). Por exemplo, se o dispositivo mandar:

```
SN-0042:Temperatura 23.5C, umidade 60%
```

O painel mostra:
- **Serial Number:** `SN-0042`
- **Comunicação:** `Ipv4` (ou `Ipv6`, dependendo da conexão)

Se o dispositivo mandar uma mensagem **sem** os dois-pontos, o Serial Number
aparece como `—` (não informado).

**Importante:** essa convenção é só para exibição no painel — o
comportamento de *echo* continua sendo devolver exatamente os bytes
originais, sem alterar nada, igual ao script Python.

Para os eventos de **API de dispositivos** (registro/ping-pong do app
Android), o Serial Number já vem naturalmente do campo `name` que o app
manda ao se registrar.

## Configuração (opcional)

Por padrão:
- Porta do echo: `1111`
- Host do echo/API: `0.0.0.0` (todas as interfaces IPv4)
- Porta do painel web: `3000`
- Porta da API de dispositivos: `7777`

Para mudar, use variáveis de ambiente antes de iniciar:

```bash
ECHO_PORT=6000 WEB_PORT=8080 API_PORT=7777 npm start
```

**Atenção:** a porta `7777` está **fixa no código do app Android** (compilada
no APK). Se você mudar `API_PORT` aqui, o app vai parar de encontrar o
servidor — a menos que você também altere e recompile o app.

## Rodando no seu servidor

Basta copiar esta pasta pro servidor (via `git clone` ou `scp -r`, por
exemplo) e rodar `npm install && npm start` por lá também. Lembre-se de
liberar as portas 1111 (echo), 3000 (painel web) e 7777 (API de
dispositivos) no firewall/grupo de segurança do servidor se quiser acessar
remotamente. Veja também o `Dockerfile` incluído no projeto para subir via
Docker.

## Estrutura de arquivos

```
ServerIP-Transire/
├── Dockerfile           # imagem Docker do projeto
├── package.json         # dependências (express, ws)
├── server.js             # servidor echo TCP + servidor web/WebSocket
├── public/
│   ├── index.html          # estrutura do painel (abas Painel/Histórico)
│   ├── style.css           # tema industrial (chapa metálica, LEDs, faixas de risco)
│   ├── app.js               # lógica do painel: WebSocket, tabela, filtros, histórico
│   └── rowFields.js         # deriva as 6 colunas a partir de um evento — usado pelo
│                             # navegador (tabela em tempo real) e pelo servidor (gravação em disco)
├── historico/             # gerado em runtime: um .txt por dia (não versionado)
└── README.md
```
