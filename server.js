const express = require('express')
const cors = require('cors')
const fetch = require('node-fetch')

const app = express()
const PORT = process.env.PORT || 10000

const LOG_SERVER_URL = 'https://vortixlogs.onrender.com/api/log'
const TC_ENDPOINT = 'https://nerventualken.com/tc'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'
const PROXY_URL = 'https://lootlink-backend.onrender.com'

app.use(cors())
app.use(express.json({ limit: '1mb' }))

async function sendLog(level, message, data) {
  try {
    await fetch(LOG_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        message: `[Proxy] ${message}`,
        data: typeof data === 'string' ? data : JSON.stringify(data),
        pageUrl: PROXY_URL,
        timestamp: new Date().toISOString()
      })
    })
  } catch (e) {}
}

app.post('/tc', async (req, res) => {
  const body = req.body
  await sendLog('info', 'Proxying /tc request', { keys: Object.keys(body), bl: body.bl })

  try {
    const response = await fetch(TC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_UA
      },
      body: JSON.stringify(body)
    })

    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch (e) {
      await sendLog('error', 'Failed to parse /tc response', text)
      return res.status(502).json({ error: 'Invalid upstream response' })
    }

    await sendLog('info', 'Received /tc response', `tasks count: ${Array.isArray(data) ? data.length : 'unknown'}`)
    res.json(data)
  } catch (err) {
    await sendLog('error', 'Proxy /tc request failed', err.message)
    res.status(502).json({ error: 'Upstream request failed' })
  }
})

app.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`)
})