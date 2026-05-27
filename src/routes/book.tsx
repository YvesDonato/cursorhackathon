import { createFileRoute } from '@tanstack/react-router'
import { CustomerBooking } from '../components/CustomerBooking'

export const Route = createFileRoute('/book')({ component: Book })

function Book() {
  return <CustomerBooking />
}
