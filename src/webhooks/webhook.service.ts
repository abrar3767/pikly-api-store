import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import * as crypto from 'crypto'
import { isIP } from 'net'
import { resolve4 } from 'dns/promises'
import { Webhook, WebhookDocument } from './webhook.schema'

// ── SSRF Guard ─────────────────────────────────────────────────────────────
// These patterns cover all IP ranges that must never be reachable from an
// outbound webhook delivery: loopback, RFC-1918 private ranges, link-local
// (169.254/16, used by AWS/GCP instance metadata), and CGNAT (100.64/10).
const PRIVATE_IP_PATTERNS = [
  /^0\./, // this-host
  /^127\./, // loopback
  /^10\./, // RFC 1918 class A
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918 class B
  /^192\.168\./, // RFC 1918 class C
  /^169\.254\./, // link-local (AWS/GCP metadata)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT (RFC 6598)
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 unique-local
  /^fe80:/i, // IPv6 link-local
]

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((p) => p.test(ip))
}

// Resolves the hostname of a URL to its IPv4 addresses and returns true if
// any of them fall within a private range. Raw IP addresses are checked
// directly. DNS failures are treated as unsafe (return true) to fail-closed.
async function isSsrfTarget(urlString: string): Promise<boolean> {
  try {
    const { hostname } = new URL(urlString)

    // Direct IP address — check immediately without DNS lookup
    if (isIP(hostname)) return isPrivateIp(hostname)

    // Hostname — resolve and check all returned A records
    const ips = await resolve4(hostname)
    return ips.some(isPrivateIp)
  } catch {
    // Unparseable URL or DNS failure — treat as unsafe
    return true
  }
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name)

  constructor(@InjectModel(Webhook.name) private webhookModel: Model<WebhookDocument>) {}

  async register(userId: string, url: string, events: string[]) {
    // SEC-01: SSRF check at registration time so the URL is rejected
    // immediately rather than silently failing at delivery time.
    if (await isSsrfTarget(url)) {
      throw new BadRequestException({
        code: 'SSRF_BLOCKED',
        message: 'Webhook URL resolves to a private or loopback address and cannot be registered.',
      })
    }

    const secret = crypto.randomBytes(32).toString('hex')
    const webhook = await this.webhookModel.create({ userId, url, events, secret, isActive: true })
    // The secret is returned only once — the caller must store it.
    return { ...webhook.toObject(), secret }
  }

  async list(userId: string) {
    return this.webhookModel.find({ userId, isActive: true }).select('-secret').lean()
  }

  async delete(id: string, userId: string) {
    await this.webhookModel.findOneAndDelete({ _id: id, userId })
    return { deleted: true }
  }

  // Dispatches an event to all active webhooks subscribed to it.
  // send() is intentionally fire-and-forget — failures never block the caller.
  async dispatch(event: string, payload: any): Promise<void> {
    const hooks = await this.webhookModel.find({ isActive: true, events: event }).lean()
    for (const hook of hooks) {
      this.send(hook, event, payload).catch((err) =>
        this.logger.error(`Webhook delivery failed to ${hook.url}: ${err.message}`),
      )
    }
  }

  private async send(hook: any, event: string, payload: any): Promise<void> {
    // SEC-01: re-check at send time because the URL's DNS record could have
    // changed since registration (DNS rebinding attack). This is the second
    // line of defence after the registration-time check.
    if (await isSsrfTarget(hook.url)) {
      this.logger.warn(`SSRF blocked at send time for webhook ${hook._id} → ${hook.url}`)
      return
    }

    const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() })
    const signature = crypto.createHmac('sha256', hook.secret).update(body).digest('hex')
    const headers = {
      'Content-Type': 'application/json',
      'X-Pikly-Signature': signature,
      'X-Pikly-Event': event,
    }

    // ── Initial attempt ──────────────────────────────────────────────────
    const ctrl1 = new AbortController()
    const timeout1 = setTimeout(() => ctrl1.abort(), 10_000)
    try {
      const res = await fetch(hook.url, { method: 'POST', headers, body, signal: ctrl1.signal })
      clearTimeout(timeout1)
      await this.webhookModel.findByIdAndUpdate(hook._id, { lastTriggeredAt: new Date() })
      if (!res.ok) {
        this.logger.warn(`Webhook ${hook.url} returned ${res.status} for event "${event}"`)
      }
      return
    } catch {
      clearTimeout(timeout1)
    }

    // ── Single retry after 5 seconds ─────────────────────────────────────
    await new Promise((r) => setTimeout(r, 5_000))

    // SEC-05: the retry now has its own AbortController + timeout.
    // Previously the retry fetch had no timeout and could hang indefinitely,
    // leaking memory through dangling promises.
    const ctrl2 = new AbortController()
    const timeout2 = setTimeout(() => ctrl2.abort(), 10_000)
    try {
      await fetch(hook.url, { method: 'POST', headers, body, signal: ctrl2.signal })
    } catch {
      // Give up after one retry — failure is already logged by dispatch()
    } finally {
      clearTimeout(timeout2)
    }
  }
}
