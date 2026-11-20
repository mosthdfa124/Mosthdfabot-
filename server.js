const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8080);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const staticFiles = new Set(['/index.html', '/styles.css', '/app.js']);

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error('Request body is too large'));
      }
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (_error) { reject(new Error('Invalid JSON')); }
    });
  });
}

async function answerWithAI(payload) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const systemPrompt = `أنت معلم سوداني متخصص في مناهج الشهادة السودانية.
أجب بالعربية الفصحى الواضحة، واقتصر على إجابة موثوقة مرتبطة بالسؤال.
لا تخترع حقائق أو نتائج أو أرقامًا. إذا كانت المعطيات غير كافية، اطلب المعطيات الناقصة.
نفّذ الحسابات خطوة بخطوة، وتحقق من الوحدات والإشارات والنتيجة النهائية.
أرجع JSON فقط دون نص خارجي وبالهيكل التالي:
{"title":"العنوان","sections":[{"heading":"العنوان","text":"النص"}],"steps":["الخطوة"]}
وضّح أن الإجابة تحتاج مراجعة المنهج المعتمد، ولا تقدم الصورة أو الفيديو الحقيقي إذا لم توجد معلومات كافية.`;

  const userPrompt = `المرحلة: ${payload.stage || 'الشهادة السودانية'}
المادة: ${payload.subject || 'غير محددة'}
نوع الإجابة المطلوب: ${payload.answerType || 'شرح وتفصيل'}
السؤال:
${payload.question}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`AI provider error (${response.status}): ${details.slice(0, 500)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('The AI provider returned an empty response');

  const result = JSON.parse(content);
  if (!Array.isArray(result.sections)) result.sections = [];
  if (!Array.isArray(result.steps)) result.steps = [];
  return result;
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/api/answer') {
    try {
      const payload = await readJson(request);
      const question = String(payload.question || '').trim();
      if (!question) return sendJson(response, 400, { error: 'يرجى إدخال السؤال أو رفع صورة واضحة.' });
      if (question.length > 6000) return sendJson(response, 400, { error: 'السؤال طويل جدًا.' });
      const answer = await answerWithAI(payload);
      sendJson(response, 200, answer);
    } catch (error) {
      sendJson(response, 500, { error: error.message || 'تعذر إنشاء الإجابة.' });
    }
    return;
  }

  if (request.method !== 'GET') {
    response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Method Not Allowed');
    return;
  }

  let pathname = request.url === '/' ? '/index.html' : new URL(request.url, 'http://localhost').pathname;
  if (!staticFiles.has(pathname)) {
    pathname = '/index.html';
  }

  const filePath = path.join(__dirname, pathname);
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
      return;
    }
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript' };
    response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
    response.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Sudan exam assistant: http://localhost:${PORT}`);
  if (!OPENAI_API_KEY) console.log('Warning: OPENAI_API_KEY is not configured');
});
