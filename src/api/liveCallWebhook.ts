import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../db'

const webhookPayloadSchema = z
  .object({
    call_id: z.string().min(1).optional(),
    conversation_id: z.union([z.string(), z.number()]).optional(),
    callId: z.union([z.string(), z.number()]).optional(),
    role: z.string().optional(),
    speaker: z.string().optional(),
    message: z.string().optional(),
    text: z.string().optional(),
    transcript: z.string().optional(),
    content: z.string().optional(),
    last_message: z.boolean().optional(),
    lastMessage: z.boolean().optional(),
    event: z.string().optional(),
    type: z.string().optional(),
    message_id: z.union([z.string(), z.number()]).optional(),
    id: z.union([z.string(), z.number()]).optional(),
    sequence: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough()

type NormalizedWebhookPayload = {
  callId: string
  role: 'user' | 'agent'
  message: string
  lastMessage: boolean
  messageId?: string | number
  id?: string | number
  sequence?: string | number
}

function normalizeRole(role: string | undefined): 'user' | 'agent' {
  const normalized = role?.trim().toLowerCase()
  if (['agent', 'ai', 'assistant', 'bot'].includes(normalized || '')) {
    return 'agent'
  }
  return 'user'
}

function normalizeWebhookPayload(rawPayload: unknown): NormalizedWebhookPayload {
  const payload = webhookPayloadSchema.parse(rawPayload)
  const callId = payload.call_id ?? payload.conversation_id ?? payload.callId
  const role = payload.role ?? payload.speaker
  const message = payload.message ?? payload.text ?? payload.transcript ?? payload.content
  const eventName = (payload.event ?? payload.type ?? '').toLowerCase()
  const lastMessage =
    payload.last_message ??
    payload.lastMessage ??
    ['call_ended', 'conversation_ended', 'end', 'ended', 'post_call_transcription'].includes(eventName)

  if (callId === undefined || callId === null || String(callId).trim() === '') {
    throw new Error('Webhook payload is missing call_id')
  }
  if (message === undefined || message === null) {
    throw new Error('Webhook payload is missing message text')
  }

  return {
    callId: String(callId),
    role: normalizeRole(role),
    message,
    lastMessage,
    messageId: payload.message_id,
    id: payload.id,
    sequence: payload.sequence,
  }
}

function getMessageExternalId(data: NormalizedWebhookPayload) {
  const explicitId = data.messageId ?? data.id ?? data.sequence
  if (explicitId !== undefined && explicitId !== null && String(explicitId).trim() !== '') {
    return String(explicitId)
  }

  return createHash('sha256')
    .update(`${data.callId}\0${data.role}\0${data.message}`)
    .digest('hex')
}

export async function ingestMessageWebhookPayload(rawPayload: unknown) {
  const payload = normalizeWebhookPayload(rawPayload)
  const externalId = getMessageExternalId(payload)

  return prisma.$transaction(async (tx) => {
    const call = await tx.call.upsert({
      where: { id: payload.callId },
      update: {
        active: !payload.lastMessage,
      },
      create: {
        id: payload.callId,
        active: !payload.lastMessage,
      },
    })

    const message = await tx.message.upsert({
      where: {
        callId_externalId: {
          callId: payload.callId,
          externalId,
        },
      },
      update: {
        role: payload.role,
        content: payload.message,
        lastMessage: payload.lastMessage,
      },
      create: {
        callId: payload.callId,
        externalId,
        role: payload.role,
        content: payload.message,
        lastMessage: payload.lastMessage,
      },
    })

    if (payload.lastMessage && call.active) {
      await tx.call.update({
        where: { id: payload.callId },
        data: { active: false },
      })
    }

    return {
      call_id: payload.callId,
      active: !payload.lastMessage,
      message_id: message.id,
    }
  })
}
