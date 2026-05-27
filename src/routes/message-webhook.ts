import { createFileRoute } from '@tanstack/react-router'
import { ZodError } from 'zod'
import { ingestMessageWebhookPayload } from '../api/liveCallWebhook'

export const Route = createFileRoute('/message-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json()
          const result = await ingestMessageWebhookPayload(payload)
          return Response.json(result)
        } catch (error) {
          if (error instanceof SyntaxError) {
            return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
          }

          if (error instanceof ZodError) {
            return Response.json(
              {
                error: 'Invalid webhook payload',
                issues: error.issues,
              },
              { status: 400 },
            )
          }

          if (error instanceof Error && error.message.startsWith('Webhook payload is missing')) {
            return Response.json({ error: error.message }, { status: 400 })
          }

          console.error('Failed to process message webhook', error)
          return Response.json({ error: 'Failed to process webhook' }, { status: 500 })
        }
      },
    },
  },
})
