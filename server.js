const express = require('express')
const cors = require('cors')
const fetch = require('node-fetch')

const app = express()
const PORT = process.env.PORT || 10000

const LOG_SERVER_URL = 'https://vortixlogs.onrender.com/api/log'
const TC_ENDPOINT = 'https://nerventualken.com/tc'
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36'
const PROXY_URL = 'https://lootlink-backend.onrender.com'

const BL_TASKS = [18, 2, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 1, 3, 4, 5, 8, 6, 33, 22, 23, 24, 25, 26, 27, 28, 29 ,30 31, 32, 34, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 50, 51, 52, 53, 54, 7, 21, 49, 48]

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
  const originalBody = req.body
  await sendLog('info', 'Received /tc proxy request', { keys: Object.keys(originalBody) })

  const modifiedBody = {
    ...originalBody,
    bl: BL_TASKS,
    max_tasks: 1,
    num_of_tasks: '2'
  }

  await sendLog('info', 'Forwarding modified /tc request', {
    tid: modifiedBody.tid,
    bl: modifiedBody.bl,
    session: modifiedBody.session,
    max_tasks: modifiedBody.max_tasks,
    num_of_tasks: modifiedBody.num_of_tasks,
    design_id: modifiedBody.design_id,
    cur_url: modifiedBody.cur_url ? modifiedBody.cur_url.substring(0, 100) + '...' : undefined,
    is_loot: modifiedBody.is_loot,
    rkey: modifiedBody.rkey
  })

  try {
    const response = await fetch(TC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ANDROID_UA
      },
      body: JSON.stringify(modifiedBody)
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