#!/usr/bin/env node
/**
 * Publicar Revisor de Releases no GitHub
 * Uso: node publicar-github.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

function apiRequest(method, endpoint, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: endpoint,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'revisor-releases-uploader',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Publicar Revisor de Releases       ║');
  console.log('╚══════════════════════════════════════╝\n');

  const token = await ask('Token GitHub (ghp_... ou github_pat_...): ');
  const repo  = await ask('Usuário/Repositório (ex: joao/revisor-releases): ');
  const file  = await ask('Nome do arquivo [revisor-releases.html]: ') || 'revisor-releases.html';

  // Find HTML file in same directory
  const htmlPath = path.join(__dirname, 'revisor-releases.html');
  if (!fs.existsSync(htmlPath)) {
    console.error(`\n✗ Arquivo não encontrado: ${htmlPath}`);
    console.error('  Coloque o revisor-releases.html na mesma pasta deste script.\n');
    rl.close(); return;
  }

  const content = fs.readFileSync(htmlPath, 'utf8');
  const encoded = Buffer.from(content).toString('base64');

  console.log('\n→ Verificando repositório…');
  const check = await apiRequest('GET', `/repos/${repo}/contents/${file}`, token);

  let sha;
  if (check.status === 200) {
    sha = check.data.sha;
    console.log('→ Arquivo existente encontrado. Atualizando…');
  } else if (check.status === 404) {
    console.log('→ Arquivo novo. Criando…');
  } else {
    console.error(`\n✗ Erro ao verificar repositório: ${check.data.message || check.status}`);
    rl.close(); return;
  }

  const now = new Date().toLocaleDateString('pt-BR');
  const body = {
    message: `feat: atualiza revisor de releases (${now})`,
    content: encoded,
    ...(sha ? { sha } : {})
  };

  const push = await apiRequest('PUT', `/repos/${repo}/contents/${file}`, token, body);

  if (push.status === 200 || push.status === 201) {
    const url = push.data.content?.html_url || `https://github.com/${repo}/blob/main/${file}`;
    console.log(`\n✓ Publicado com sucesso!`);
    console.log(`  URL: ${url}\n`);
  } else {
    console.error(`\n✗ Erro ao publicar: ${push.data.message || push.status}\n`);
  }

  rl.close();
}

main().catch(err => { console.error('\n✗ Erro inesperado:', err.message); rl.close(); });
