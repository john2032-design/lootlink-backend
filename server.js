const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const LOG_SERVER_URL = 'https://vortixlogs.onrender.com/api/log';

async function sendLog(level, message, data, pageUrl) {
  try {
    await fetch(LOG_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        message,
        data: data || '',
        pageUrl: pageUrl || '',
        timestamp: new Date().toISOString()
      })
    });
  } catch (e) {
    console.error('Log send failed', e);
  }
}

app.post('/proxy/tc', async (req, res) => {
  const targetUrl = req.headers['x-target-url'];
  if (!targetUrl) {
    await sendLog('error', 'Missing X-Target-URL header', '', req.headers.referer || '');
    return res.status(400).json({ error: 'Missing X-Target-URL header' });
  }

  const forwardHeaders = { ...req.headers };
  delete forwardHeaders.host;
  delete forwardHeaders['x-target-url'];
  forwardHeaders['user-agent'] = ANDROID_UA;
  forwardHeaders['content-type'] = 'application/json';

  let body = req.body;
  if (body && typeof body === 'object') {
    if (!body.bl) {
      const blTasks = Array.from({ length: 50 }, (_, i) => i + 1).filter(n => n !== 17);
      body.bl = blTasks;
    }
  } else {
    body = { bl: Array.from({ length: 50 }, (_, i) => i + 1).filter(n => n !== 17) };
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: JSON.stringify(body)
    });

    const responseData = await response.text();
    const contentType = response.headers.get('content-type');

    await sendLog('info', `Proxy /tc request to ${targetUrl}`, `Status: ${response.status}`, req.headers.referer || '');

    res.status(response.status);
    if (contentType) res.set('content-type', contentType);
    res.send(responseData);
  } catch (err) {
    await sendLog('error', 'Proxy /tc request failed', err.message, req.headers.referer || '');
    res.status(500).json({ error: 'Proxy request failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`TC Proxy API running on port ${PORT}`);
});