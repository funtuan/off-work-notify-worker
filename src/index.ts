import { Hono } from 'hono'
import { poweredBy } from 'hono/powered-by'
import LineMessage from './utils/lineMessage.js'

type Context = {
  DB: KVNamespace
}

const app = new Hono<{ Bindings: Context }>()

app.use('*', poweredBy())

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

// Hono 記錄當前 gps 位置，並存在 env.DB (kv) 中
app.post('/gps', async (c) => {
  // 由 .req.json() 取得 lat, lng
  const { lat, lng } = await c.req.json<{ lat: string; lng: string }>()
  if (lat && lng) {
    await c.env.DB.put('location', `${lat},${lng}`)
    await c.env.DB.put('lastUpdatedAt', new Date().toISOString())
    return c.text('OK')
  }
  return c.text('No lat or lng')
})

// 產生一個 curl 範例，執行 post /gps
// curl -X POST -d "lat=24.123&lng=121.123" http://localhost:3000/gps

// 確認儲存的 gps 位置
/* app.get('/gps', async (c) => {
  const location = await c.env.DB.get('location')
  const lastUpdatedAt = await c.env.DB.get('lastUpdatedAt')
  return c.json({ location, lastUpdatedAt })
}) */

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    console.log('start scheduled')
    const lineMessage = new LineMessage({
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    })
    console.log('lineMessage', lineMessage)

    const location = await env.DB.get('location')
    const lastUpdatedAt = await env.DB.get('lastUpdatedAt')

    // 如果沒有 lastUpdatedAt 或超過一天，則不發送機車地點
    if (!lastUpdatedAt || Date.now() - new Date(lastUpdatedAt).getTime() > 24 * 60 * 60 * 1000) {
      await lineMessage.pushMessage(
        env.SELF_LINE_USER_ID,
        `下班記得帶！！\n安全帽、錢包、鑰匙\n\n<<今日未紀錄機車停放位置>>`,
      )
      return
    }

    const [lat, lng] = location.split(',').map((v) => Number(v))
    await lineMessage.pushMessage(
      env.SELF_LINE_USER_ID,
      null,
      [
        {
          type: 'text',
          text: `下班記得帶！！\n安全帽、錢包、鑰匙`,
        },
        {
          type: 'location',
          title: '機車停放位置',
          address: '機車停放位置',
          latitude: lat,
          longitude: lng,
        },
      ]
    )
  },
}