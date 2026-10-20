import ReconcileMockPage from '@/features/locations/components/ReconcileLanes/ReconcileMockPage'
import type { GetServerSideProps } from 'next'

// Explicit server-side opt-in. This route is unavailable on ordinary deployments.
export const getServerSideProps: GetServerSideProps = async () =>
  process.env.ENABLE_RECONCILE_MOCKS === 'true'
    ? { props: {} }
    : { notFound: true }

export default ReconcileMockPage
