import { createServerFn } from '@tanstack/react-start'
import { prisma } from '../db'

export type LiveCallMessage = {
  id: number
  role: 'user' | 'agent'
  message: string
  timestamp: string
}

export type LiveCallTranscript = {
  callId: string | null
  active: boolean
  messages: LiveCallMessage[]
}

const ACTIVE_CALL_TIMEOUT_MS = 30_000

export const getLiveCallTranscript = createServerFn({ method: 'GET' }).handler(
  async (): Promise<LiveCallTranscript> => {
    const activeAfter = new Date(Date.now() - ACTIVE_CALL_TIMEOUT_MS)
    const call = await prisma.call.findFirst({
      where: {
        active: true,
        updatedAt: {
          gte: activeAfter,
        },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    })

    if (!call) {
      return {
        callId: null,
        active: false,
        messages: [],
      }
    }

    return {
      callId: call.id,
      active: call.active && call.updatedAt >= activeAfter,
      messages: call.messages.map((message) => ({
        id: message.id,
        role: message.role === 'agent' ? 'agent' : 'user',
        message: message.content,
        timestamp: message.createdAt.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
      })),
    }
  },
)
