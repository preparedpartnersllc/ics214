import { GlobalNav } from '@/components/GlobalNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GlobalNav />
      {children}
    </>
  )
}
