'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Agency = { id: string; name: string; is_active: boolean; created_at: string }

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [loading,  setLoading]  = useState(true)
  const [newName,  setNewName]  = useState('')
  const [adding,   setAdding]   = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('agencies')
      .select('*')
      .order('name')
    setAgencies(data ?? [])
    setLoading(false)
  }

  async function addAgency(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    setAddError(null)
    const supabase = createClient()
    const { error } = await supabase.from('agencies').insert({ name })
    if (error) {
      setAddError(error.message.includes('unique') ? 'An agency with that name already exists.' : error.message)
    } else {
      setNewName('')
      await load()
    }
    setAdding(false)
  }

  async function toggleActive(agency: Agency) {
    const supabase = createClient()
    await supabase.from('agencies').update({ is_active: !agency.is_active }).eq('id', agency.id)
    setAgencies(prev => prev.map(a => a.id === agency.id ? { ...a, is_active: !a.is_active } : a))
  }

  return (
    <div className="min-h-screen bg-[#0B0F14]">
      <main className="px-4 pt-6 pb-12 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-[#E5E7EB]">Agencies</h1>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Manage the organizations users can select when registering.
          </p>
        </div>

        {/* Add agency */}
        <div className="bg-[#161D26] border border-[#232B36] rounded-2xl p-5 mb-4">
          <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-4">Add Agency</p>
          <form onSubmit={addAgency} className="flex gap-2">
            <input
              type="text"
              className="input flex-1"
              placeholder="e.g. Wayne County Sheriff"
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <button
              type="submit"
              disabled={adding || !newName.trim()}
              className="px-4 py-2 bg-[#FF5A1F] text-white text-sm font-semibold rounded-xl disabled:opacity-50 hover:bg-[#FF6A33] transition-colors shrink-0"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </form>
          {addError && <p className="text-xs text-red-400 mt-2">{addError}</p>}
        </div>

        {/* Agency list */}
        <div className="bg-[#161D26] border border-[#232B36] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#232B36]">
            <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider">
              {loading ? 'Loading…' : `${agencies.length} agencies`}
            </p>
          </div>
          {agencies.map((agency, i) => (
            <div
              key={agency.id}
              className={`flex items-center justify-between px-5 py-3.5 ${i > 0 ? 'border-t border-[#232B36]/60' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-1.5 h-1.5 rounded-full ${agency.is_active ? 'bg-[#22C55E]' : 'bg-[#6B7280]'}`} />
                <span className={`text-sm font-medium ${agency.is_active ? 'text-[#E5E7EB]' : 'text-[#6B7280] line-through'}`}>
                  {agency.name}
                </span>
              </div>
              <button
                onClick={() => toggleActive(agency)}
                className={`text-xs font-semibold px-3 py-1 rounded-lg transition-colors ${
                  agency.is_active
                    ? 'text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10'
                    : 'text-[#22C55E] hover:bg-[#22C55E]/10'
                }`}
              >
                {agency.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
          {!loading && agencies.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-[#6B7280]">No agencies yet.</div>
          )}
        </div>
      </main>
    </div>
  )
}
