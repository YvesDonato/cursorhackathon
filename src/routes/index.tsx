import { createFileRoute } from '@tanstack/react-router'
import { OwnerDashboard } from '../components/OwnerDashboard'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return <OwnerDashboard />
}
