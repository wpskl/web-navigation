const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const DATA_FILE = path.join(__dirname, 'data', 'navigation.json');

function parsePort() {
  const args = process.argv.slice(2);
  let port = 3000;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        console.error('Invalid port number');
        process.exit(1);
      }
      i++;
    }
  }
  return port;
}

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { categories: [] };
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('Invalid URL'));
      return;
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(
      url,
      {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DaohangBot/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirect = new URL(res.headers.location, url).href;
          fetchUrl(redirect).then(resolve).catch(reject);
          res.resume();
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 500000) {
            req.destroy();
            resolve(parseMeta(body, url));
          }
        });
        res.on('end', () => resolve(parseMeta(body, url)));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function parseMeta(html, url) {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i);
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);

  let title = (ogTitle && ogTitle[1]) || (titleMatch && titleMatch[1]) || url;
  title = decodeEntities(title.trim());

  let description = (ogDesc && ogDesc[1]) || (desc && desc[1]) || '';
  description = decodeEntities(description.trim());

  let favicon = extractFavicon(html, url);

  return { title, description, favicon };
}

function extractFavicon(html, pageUrl) {
  // Match any <link> whose rel contains "icon" (icon, shortcut icon, icon shortcut, apple-touch-icon, etc.)
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    const relMatch = tag.match(/\brel=["']([^"']+)["']/i);
    if (!relMatch) continue;
    const rel = relMatch[1].toLowerCase();
    if (!/\bicon\b/.test(rel) && !rel.includes('apple-touch-icon')) continue;

    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch || !hrefMatch[1]) continue;
    try {
      return new URL(hrefMatch[1].trim(), pageUrl).href;
    } catch {
      /* try next */
    }
  }

  try {
    return new URL('/favicon.ico', pageUrl).href;
  } catch {
    return '';
  }
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/data', (_req, res) => {
  res.json(readData());
});

app.put('/api/data', (req, res) => {
  if (!req.body || !Array.isArray(req.body.categories)) {
    res.status(400).json({ error: 'Invalid data format' });
    return;
  }
  writeData(req.body);
  res.json({ ok: true });
});

app.post('/api/fetch-meta', async (req, res) => {
  const { url } = req.body || {};
  if (!url) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }
  try {
    const meta = await fetchUrl(url);
    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch URL' });
  }
});

const port = parsePort();
app.listen(port, () => {
  console.log(`导航应用已启动: http://localhost:${port}`);
  console.log(`              http://127.0.0.1:${port}`);
});
