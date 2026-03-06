import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import * as crypto     from 'crypto'
import { Webhook, WebhookDocument } from './webhook.schema'

// FEAT-05: Webhook system
// When an order event occurs (created, status changed, etc.), WebhookService
// fires an HTTP POST to all registered endpoints for that event type.
// Each payload is signed with HMAC-SHA256 using the webhook's secret so the
// receiver can verify it came from Pikly and was not tampered with.
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name)

  constructor(@InjectModel(Webhook.name) private webhookModel: Model<WebhookDocument>) {}

  async register(userId: string, url: string, events: string[]) {
    const secret  = crypto.randomBytes(32).toString('hex')
    const webhook = await this.webhookModel.create({ userId, url, events, secret, isActive: true })
    return { ...webhook.toObject(), secret } // only returned once — store it safely
  }

  async list(userId: string) {
    return this.webhookModel.find({ userId, isActive: true }).select('-secret').lean()
  }

  async delete(id: string, userId: string) {
    await this.webhookModel.findOneAndDelete({ _id: id, userId })
    return { deleted: true }
  }

  // Dispatches an event to all active webhooks subscribed to that event type.
  // Failures are logged and retried once — we do not block the main flow.
  async dispatch(event: string, payload: any): Promise<void> {
    const hooks = await this.webhookModel.find({ isActive: true, events: event }).lean()
    for (const hook of hooks) {
      this.send(hook, event, payload).catch(err =>
        this.logger.error(`Webhook delivery failed to ${hook.url}: ${err.message}`)
      )
    }
  }

  private async send(hook: any, event: string, payload: any): Promise<void> {
    const body      = JSON.stringify({ event, payload, timestamp: new Date().toISOString() })
    const signature = crypto.createHmac('sha256', hook.secret).update(body).digest('hex')

    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 10_000)

    try {
      const res = await fetch(hook.url, {
        method:  'POST',
        headers: { 'Content-Type':'application/json', 'X-Pikly-Signature': signature, 'X-Pikly-Event': event },
        body,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      await this.webhookModel.findByIdAndUpdate(hook._id, { lastTriggeredAt: new Date() })

      if (!res.ok) {
        this.logger.warn(`Webhook ${hook.url} returned ${res.status} for event "${event}"`)
      }
    } catch {
      clearTimeout(timeout)
      // Single retry after 5 seconds
      await new Promise(r => setTimeout(r, 5000))
      try {
        await fetch(hook.url, { method:'POST', headers:{'Content-Type':'application/json','X-Pikly-Signature':signature,'X-Pikly-Event':event}, body })
      } catch { /* give up after one retry */ }
    }
  }
}
