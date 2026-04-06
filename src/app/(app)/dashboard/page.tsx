 import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-orange-500 font-mono text-xs tracking-widest uppercase">
            ICS 214
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-zinc-100">
          Welcome, {profile.full_name}
        </h1>
        <p className="text-zinc-500 text-sm mt-1 capitalize">{profile.role}</p>
      </div>

      <div className="space-y-3">
        <Link href="/events"
          className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
          <p className="text-zinc-100 font-medium">Events</p>
          <p className="text-zinc-500 text-sm mt-0.5">View and manage incidents</p>
        </Link>

        <Link href="/my-log"
          className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
          <p className="text-zinc-100 font-medium">My 214</p>
          <p className="text-zinc-500 text-sm mt-0.5">Log your activity</p>
        </Link>
      </div>
    </div>
  )
}