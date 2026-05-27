import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from '../db'

export const getBookings = createServerFn().handler(async () => {
  return prisma.bookingRequest.findMany({ orderBy: { createdAt: 'desc' } })
})

export const updateBookingStatus = createServerFn()
  .inputValidator(z.object({ id: z.number(), status: z.enum(['accepted', 'declined']) }))
  .handler(async ({ data }) => {
    return prisma.bookingRequest.update({
      where: { id: data.id },
      data: { status: data.status },
    })
  })
