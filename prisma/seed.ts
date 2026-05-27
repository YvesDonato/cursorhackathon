import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./dev.db',
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding database...')

  await prisma.bookingRequest.deleteMany()

  const bookings = await prisma.bookingRequest.createMany({
    data: [
      {
        clientName: 'Maria Garcia',
        service: 'Haircut & Highlights',
        requestedDate: 'June 2, 2026',
        requestedTime: '2:30 PM',
        originalLanguage: 'Spanish',
        phone: '+1 (555) 123-4567',
        notes: 'Regular customer, prefers stylist Ana',
        status: 'pending',
      },
      {
        clientName: 'Ahmed Hassan',
        service: 'Manicure',
        requestedDate: 'June 3, 2026',
        requestedTime: '9:00 AM',
        originalLanguage: 'Arabic',
        phone: '+1 (555) 234-5678',
        notes: 'First-time customer',
        status: 'pending',
      },
    ],
  })

  console.log(`✅ Created ${bookings.count} booking requests`)
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
