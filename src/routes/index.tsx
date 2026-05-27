import { createFileRoute } from '@tanstack/react-router'
import { getBookings } from '../api/bookings'
import { OwnerDashboard } from '../components/OwnerDashboard'

export const Route = createFileRoute('/')({
  component: Home,
  loader: () => getBookings(),
})

function Home() {
  const bookings = Route.useLoaderData()
  return <OwnerDashboard initialBookings={bookings} />
}
