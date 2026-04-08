const express = require('express');
const fetch = require('node-fetch');
const WebSocket = require('ws');

const app = express();
app.use(express.json({ limit: '1mb' }));

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
const BL_TASKS = Array.from({ length: 50 }, (_, i) => i + 1).filter(n => n !== 17);
const LOG_SERVER_URL = 'https://vortixlogs.onrender.com/api/log';

async function sendLog(level, message, data, pageUrl = 'api') {
  if (!LOG_SERVER_URL) return;
  try {
    await fetch(LOG_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: level,
        message: message,
        data: typeof data === 'string' ? data : JSON.stringify(data),
        pageUrl: pageUrl,
        timestamp: new Date().toISOString()
      }),
    });
  } catch (e) {
    console.error('[API Log failed]', e.message);
  }
}

async function completeTaskViaSkippedLol(taskUrl) {
  const endpoint = 'https://skipped.lol/api/evade/ll';
  const payload = { ID: 17, URL: taskUrl };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`skipped.lol returned ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error('skipped.lol failed');
  return true;
}

function selectFallbackTask(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;
  const eligible = tasks.filter(t => t.task_id !== 17);
  const order = [30, 40, 50, 60];
  for (const seconds of order) {
    const found = eligible.find(t => t.auto_complete_seconds === seconds);
    if (found) return found;
  }
  return eligible[0] || null;
}

function waitForFinalUrl(wsUrl, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        ws.close();
        reject(new Error('WebSocket timeout'));
      }
    }, timeoutMs);

    ws.on('open', () => {
      const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('0');
      }, 10000);
      ws.once('close', () => clearInterval(heartbeat));
    });

    ws.on('message', (data) => {
      const msg = data.toString();
      if (msg.startsWith('r:')) {
        resolved = true;
        clearTimeout(timeout);
        ws.close();
        const rawPublisherLink = msg.slice(2).trim();
        resolve(rawPublisherLink);
      }
    });

    ws.on('error', (err) => {
      if (!resolved) reject(err);
    });
  });
}

app.post('/api/bypass/lootlink', async (req, res) => {
  const startTime = Date.now();
  const { syncDomain, serverDomain, key, tid, cookies, pageUrl } = req.body;

  await sendLog('info', 'LootLink API called', { syncDomain, serverDomain, pageUrl }, pageUrl);

  if (!syncDomain || !serverDomain || !key || !tid) {
    await sendLog('error', 'Missing required fields', { syncDomain, serverDomain, key, tid }, pageUrl);
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const tcUrl = `https://${syncDomain}/tc`;
    const tcPayload = { bl: BL_TASKS };
    await sendLog('info', 'Sending /tc request', { tcUrl, androidUA: ANDROID_UA }, pageUrl);

    const tcRes = await fetch(tcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_UA,
        'Cookie': cookies || '',
      },
      body: JSON.stringify(tcPayload),
    });
    if (!tcRes.ok) throw new Error(`/tc responded with ${tcRes.status}`);
    const tasks = await tcRes.json();
    await sendLog('info', '/tc response received', { tasksCount: tasks.length }, pageUrl);

    let selectedTask = null;
    const task17 = tasks.find(t => t.task_id === 17);
    if (task17 && task17.ad_url) {
      await sendLog('info', 'Task 17 found, using skipped.lol', { ad_url: task17.ad_url }, pageUrl);
      await completeTaskViaSkippedLol(task17.ad_url);
      selectedTask = task17;
    } else {
      selectedTask = selectFallbackTask(tasks);
      await sendLog('info', 'Using fallback task', { taskId: selectedTask?.task_id }, pageUrl);
    }

    if (!selectedTask || !selectedTask.urid) {
      throw new Error('No usable task found');
    }

    const { urid, task_id } = selectedTask;
    const wsServerIndex = parseInt(urid.substr(-5), 10) % 3;
    const wsUrl = `wss://${wsServerIndex}.${serverDomain}/c?uid=${urid}&cat=${task_id}&key=${key}`;
    await sendLog('info', 'Connecting WebSocket', { wsUrl }, pageUrl);

    const rawPublisherLink = await waitForFinalUrl(wsUrl, 30000);
    if (!rawPublisherLink) throw new Error('Empty WebSocket message');

    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    await sendLog('info', 'Bypass successful', { rawPublisherLink, timeTaken }, pageUrl);

    return res.json({
      success: true,
      rawPublisherLink,
      time: timeTaken,
    });
  } catch (err) {
    await sendLog('error', 'Bypass failed', { error: err.message }, pageUrl);
    console.error(err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LootLink bypass API running on port ${PORT}`);
});
