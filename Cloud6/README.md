# ECHO-6 — Monitor de Echo TCP/IPv6

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

## Configuração (opcional)

Por padrão:
- Porta do echo: `5000`
- Host do echo: `::` (todas as interfaces IPv6)
- Porta do painel web: `3000`

Para mudar, use variáveis de ambiente antes de iniciar:

```bash
ECHO_PORT=6000 WEB_PORT=8080 npm start
```

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
