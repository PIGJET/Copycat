import { randomUUID } from 'node:crypto'
import type { Connect, Plugin } from 'vite'
import { loadEnv } from 'vite'

type Clip = { bytes: Buffer; type: string }
const lifetime = 60 * 60 * 1000
const maxBytes = 8 * 1024 * 1024

export function replayDelivery(): Plugin {
  let env: Record<string,string>
  const clips = new Map<string,Clip>()
  const attempts: number[] = []
  const middleware: Connect.NextHandleFunction = async (req,res,next) => {
    const path = req.url?.split('?')[0] || ''
    if (path.startsWith('/replays/')) {
      const clip = clips.get(path)
      if (!clip || !['GET','HEAD'].includes(req.method || '')) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, {'Content-Type':clip.type, 'Content-Length':clip.bytes.length,
        'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
        'Content-Disposition':'attachment; filename="copycat-replay.'+(clip.type==='video/mp4'?'mp4':'webm')+'"'})
      res.end(req.method==='HEAD' ? undefined : clip.bytes)
      return
    }
    if (path !== '/api/replay-delivery') return next()
    function reply(code: number, message: string) {
      res.writeHead(code, {'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({message}))
    }
    // Sending is an action on the local game kiosk. Only the download route is public.
    const origin = req.headers.origin
    if (req.method !== 'POST' || !origin || !/^http[s]?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ||
        new URL(origin).host !== req.headers.host || !['::1','127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) {
      return reply(403,'Send the replay from the computer running the game.')
    }
    let recipient: string
    try { recipient = decodeURIComponent(String(req.headers['x-replay-recipient'] || '')).trim() }
    catch { return reply(400,'Check the recipient and try again.') }
    const phone = recipient.replace(/[ ()-]/g,'')
    const email = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient)
    if (recipient.length > 254 || (!email && !/^\+[1-9]\d{7,14}$/.test(phone))) return reply(400,'Enter one email address or a mobile number with country code.')
    if (email && !(env.RESEND_API_KEY && env.REPLAY_FROM_EMAIL)) return reply(503,'Email delivery needs setup. Use Choose an app or Download video.')
    if (!email && !(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM && /^https:\/\/[^/]+\/?$/.test(env.REPLAY_PUBLIC_ORIGIN || ''))) return reply(503,'Text delivery needs setup. Use Choose an app or Download video.')
    const type = req.headers['content-type']?.split(';')[0]
    if (type !== 'video/mp4' && type !== 'video/webm') return reply(415,'This video format cannot be sent.')
    const length = Number(req.headers['content-length'])
    if (!Number.isInteger(length) || length < 1 || length > maxBytes) return reply(413,'Choose a replay under 8 MB.')
    const now = Date.now()
    while (attempts.length && attempts[0] < now-lifetime) attempts.shift()
    if (attempts.length >= 30) return reply(429,'This game has reached its hourly send limit.')
    attempts.push(now)
    let linkPath: string | undefined
    try {
      const chunks: Buffer[] = []
      let size=0
      for await (const chunk of req) {
        size+=chunk.length
        if (size>maxBytes) return reply(413,'Choose a replay under 8 MB.')
        chunks.push(chunk)
      }
      const bytes=Buffer.concat(chunks)
      const valid = type==='video/mp4' ? bytes.toString('ascii',4,8)==='ftyp' : bytes.subarray(0,4).toString('hex')==='1a45dfa3'
      if (!valid) return reply(400,'The replay file could not be read.')
      const extension = type==='video/mp4'?'mp4':'webm'
      let result: Response
      if (email) {
        result=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(20000),
          headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
          body:JSON.stringify({from:env.REPLAY_FROM_EMAIL,to:[recipient],subject:'Your Copycat replay',
            text:'Your breaking-news dance replay is attached.',attachments:[{filename:'copycat-replay.'+extension,content:bytes.toString('base64')}]})})
      } else {
        linkPath='/replays/'+randomUUID()+'.'+extension
        clips.set(linkPath,{bytes,type})
        const key=linkPath
        setTimeout(()=>clips.delete(key),lifetime).unref()
        const link=new URL(linkPath,env.REPLAY_PUBLIC_ORIGIN).href
        result=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(env.TWILIO_ACCOUNT_SID)+'/Messages.json',{
          method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:'Basic '+Buffer.from(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN).toString('base64')},
          body:new URLSearchParams({From:env.TWILIO_FROM,To:phone,Body:'Your Copycat replay (available for one hour): '+link})})
      }
      if (!result.ok) throw Error('delivery rejected')
      reply(202,email?'Your email was queued with the video attached.':'Your text was queued with a one-hour replay link.')
    } catch {
      if (linkPath) clips.delete(linkPath)
      reply(502,'Could not confirm delivery. You can still download your replay.')
    }
  }
  return {name:'copycat-replay-delivery', configResolved(config){env=loadEnv(config.mode,config.envDir,'')},
    configureServer(server){server.middlewares.use(middleware)},configurePreviewServer(server){server.middlewares.use(middleware)}}
}
