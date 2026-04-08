 'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { HomeButton } from '@/components/ui/HomeButton'
import { Button } from '@/components/ui/Button'

interface ImportRow {
  full_name: string
  email: string
  phone: string
  default_agency: string
  default_unit: string
  role: string
  notes: string
}

export default function ImportProfilesPage() {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<{ name: string; status: 'success' | 'error'; message?: string }[]>([])
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')

  function parseCSV(text: string): ImportRow[] {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))

    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const row: any = {}
      headers.forEach((h, i) => { row[h] = values[i] ?? '' })
      return {
        full_name: row.full_name ?? row.name ?? '',
        email: row.email ?? '',
        phone: row.phone ?? '',
        default_agency: row.default_agency ?? row.agency ?? '',
        default_unit: row.default_unit ?? row.unit ?? '',
        role: row.role ?? 'member',
        notes: row.notes ?? '',
      }
    }).filter(r => r.full_name && r.email)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseCSV(text)
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  async function runImport() {
    setImporting(true)
    setResults([])
    const supabase = createClient()
    const newResults = []

    for (const row of rows) {
      try {
        const { data, error } = await supabase.rpc('admin_create_profile', {
          p_full_name: row.full_name,
          p_email: row.email,
          p_role: ['admin', 'supervisor', 'member'].includes(row.role) ? row.role : 'member',
          p_agency: row.default_agency || null,
        })

        if (error) {
          newResults.push({ name: row.full_name, status: 'error' as const, message: error.message })
          continue
        }

        // Update additional fields
        if (row.phone || row.default_unit || row.notes) {
          await supabase.from('profiles').update({
            phone: row.phone || null,
            default_unit: row.default_unit || null,
            notes: row.notes || null,
          }).eq('id', data)
        }

        newResults.push({ name: row.full_name, status: 'success' as const })
      } catch (err: any) {
        newResults.push({ name: row.full_name, status: 'error' as const, message: err.message })
      }
    }

    setResults(newResults)
    setImporting(false)
    setStep('done')
  }

  const successCount = results.filter(r => r.status === 'success').length
  const errorCount = results.filter(r => r.status === 'error').length

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 max-w-2xl mx-auto">
      <HomeButton />

      <div className="mb-6">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-1">Admin</p>
        <h1 className="text-xl font-semibold text-zinc-100">Import Profiles</h1>
        <p className="text-sm text-zinc-500 mt-1">Upload a CSV to create multiple profiles at once.</p>
      </div>

      {/* CSV format guide */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-2">Required CSV Format</p>
        <div className="bg-zinc-950 rounded-lg p-3 overflow-x-auto">
          <p className="text-xs font-mono text-green-400 whitespace-nowrap">
            full_name,email,phone,default_agency,default_unit,role,notes
          </p>
          <p className="text-xs font-mono text-zinc-400 whitespace-nowrap mt-1">
            Anthony Watts,watts@dfd.gov,313-555-0100,Detroit Fire Department,Engine 23,admin,
          </p>
          <p className="text-xs font-mono text-zinc-400 whitespace-nowrap">
            Parrish Eason,eason@dfd.gov,313-555-0101,Detroit Fire Department,Ladder 5,member,
          </p>
        </div>
        <p className="text-xs text-zinc-600 mt-2">
          Role must be: member, supervisor, or admin. Phone, unit, and notes are optional.
        </p>
      </div>

      {/* Upload step */}
      {step === 'upload' && (
        <div className="bg-zinc-900 border border-zinc-800 border-dashed rounded-xl p-8 text-center">
          <p className="text-zinc-400 text-sm mb-4">Select your CSV file</p>
          <label className="bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-500 transition-colors cursor-pointer">
            Choose CSV File
            <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </label>
        </div>
      )}

      {/* Preview step */}
      {step === 'preview' && rows.length > 0 && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-200">
                {rows.length} profiles ready to import
              </p>
              <button onClick={() => { setRows([]); setStep('upload') }}
                className="text-xs text-zinc-500 hover:text-zinc-300">
                Change file
              </button>
            </div>
            <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
              {rows.map((row, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-mono text-zinc-300 flex-shrink-0">
                    {row.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200">{row.full_name}</p>
                    <p className="text-xs text-zinc-500">{row.email} · {row.default_agency || 'No agency'} · {row.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={runImport} loading={importing} className="w-full">
            Import {rows.length} Profiles
          </Button>
        </div>
      )}

      {/* Done step */}
      {step === 'done' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-900/30 border border-green-800 rounded-xl p-4 text-center">
              <p className="text-2xl font-semibold text-green-400">{successCount}</p>
              <p className="text-xs text-green-600 mt-0.5">Imported</p>
            </div>
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-center">
              <p className="text-2xl font-semibold text-red-400">{errorCount}</p>
              <p className="text-xs text-red-600 mt-0.5">Failed</p>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="divide-y divide-zinc-800 max-h-96 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <span className={`text-sm ${r.status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {r.status === 'success' ? '✓' : '×'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200">{r.name}</p>
                    {r.message && <p className="text-xs text-red-400 mt-0.5">{r.message}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => { setRows([]); setResults([]); setStep('upload') }}
            className="w-full bg-zinc-800 text-zinc-200 border border-zinc-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors">
            Import Another File
          </button>
        </div>
      )}
    </div>
  )
}