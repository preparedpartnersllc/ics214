'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

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
  const [rows,      setRows]      = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [results,   setResults]   = useState<{ name: string; status: 'success' | 'error'; message?: string }[]>([])
  const [step,      setStep]      = useState<'upload' | 'preview' | 'done'>('upload')

  function parseCSV(text: string): ImportRow[] {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const row: any = {}
      headers.forEach((h, i) => { row[h] = values[i] ?? '' })
      return {
        full_name:      row.full_name ?? row.name ?? '',
        email:          row.email ?? '',
        phone:          row.phone ?? '',
        default_agency: row.default_agency ?? row.agency ?? '',
        default_unit:   row.default_unit ?? row.unit ?? '',
        role:           row.role ?? 'member',
        notes:          row.notes ?? '',
      }
    }).filter(r => r.full_name && r.email)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      setRows(parseCSV(text))
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
          p_email:     row.email,
          p_role:      ['admin', 'supervisor', 'member'].includes(row.role) ? row.role : 'member',
          p_agency:    row.default_agency || null,
        })
        if (error) { newResults.push({ name: row.full_name, status: 'error' as const, message: error.message }); continue }
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
  const errorCount   = results.filter(r => r.status === 'error').length

  return (
    <div className="min-h-screen bg-[#0B0F14] flex flex-col">
      <main className="flex-1 px-4 pt-6 pb-12 max-w-2xl mx-auto w-full space-y-5">

        <div className="flex items-center gap-2 mb-2">
          <Link href="/admin/people" className="text-xs text-[#6B7280] hover:text-[#E5E7EB] transition-colors flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            People
          </Link>
          <span className="text-[#232B36] text-xs">/</span>
          <span className="text-xs text-[#E5E7EB] font-medium">Import Profiles</span>
        </div>

        <h1 className="text-lg font-semibold text-[#E5E7EB] !mt-0">Import Profiles</h1>

        {/* CSV format reference */}
        <div className="bg-[#161D26] border border-[#232B36] rounded-2xl p-4">
          <p className="text-xs text-[#6B7280] font-mono uppercase tracking-wider mb-3">Required CSV Format</p>
          <div className="bg-[#0B0F14] rounded-xl p-3 overflow-x-auto">
            <p className="text-xs font-mono text-[#22C55E] whitespace-nowrap">
              full_name,email,phone,default_agency,default_unit,role,notes
            </p>
            <p className="text-xs font-mono text-[#6B7280] whitespace-nowrap mt-1">
              Anthony Watts,watts@dfd.gov,313-555-0100,Detroit Fire Department,Engine 23,admin,
            </p>
            <p className="text-xs font-mono text-[#6B7280] whitespace-nowrap">
              Parrish Eason,eason@dfd.gov,313-555-0101,Detroit Fire Department,Ladder 5,member,
            </p>
          </div>
          <p className="text-xs text-[#6B7280]/60 mt-2.5">
            Role must be: <span className="font-mono">member</span>, <span className="font-mono">supervisor</span>, or <span className="font-mono">admin</span>. Phone, unit, and notes are optional.
          </p>
        </div>

        {/* Upload step */}
        {step === 'upload' && (
          <div className="bg-[#161D26] border border-[#232B36] border-dashed rounded-2xl p-10 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#121821] border border-[#232B36] flex items-center justify-center">
              <svg className="w-5 h-5 text-[#6B7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[#E5E7EB]">Select your CSV file</p>
              <p className="text-xs text-[#6B7280] mt-0.5">One profile per row, headers required</p>
            </div>
            <label className="bg-[#FF5A1F] hover:bg-[#FF6A33] active:bg-[#E14A12] active:scale-[0.97] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-sm">
              Choose CSV File
              <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </label>
          </div>
        )}

        {/* Preview step */}
        {step === 'preview' && rows.length > 0 && (
          <div className="space-y-4">
            <div className="bg-[#161D26] border border-[#232B36] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#232B36] flex items-center justify-between">
                <p className="text-sm font-semibold text-[#E5E7EB]">
                  {rows.length} profile{rows.length !== 1 ? 's' : ''} ready to import
                </p>
                <button
                  onClick={() => { setRows([]); setStep('upload') }}
                  className="text-xs text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
                >
                  Change file
                </button>
              </div>
              <div className="divide-y divide-[#232B36]/60 max-h-72 overflow-y-auto">
                {rows.map((row, i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#232B36] flex items-center justify-center text-xs font-mono text-[#9CA3AF] flex-shrink-0">
                      {row.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#E5E7EB]">{row.full_name}</p>
                      <p className="text-xs text-[#6B7280] truncate">
                        {row.email} · {row.default_agency || 'No agency'} ·{' '}
                        <span className="font-mono">{row.role}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={runImport} loading={importing} className="w-full">
              Import {rows.length} Profile{rows.length !== 1 ? 's' : ''}
            </Button>
          </div>
        )}

        {/* Done step */}
        {step === 'done' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#22C55E]/8 border border-[#22C55E]/20 rounded-2xl p-4 text-center">
                <p className="text-2xl font-bold text-[#22C55E]">{successCount}</p>
                <p className="text-xs text-[#22C55E]/70 mt-0.5 font-medium">Imported</p>
              </div>
              <div className={`border rounded-2xl p-4 text-center ${
                errorCount > 0
                  ? 'bg-[#EF4444]/8 border-[#EF4444]/20'
                  : 'bg-[#161D26] border-[#232B36]'
              }`}>
                <p className={`text-2xl font-bold ${errorCount > 0 ? 'text-[#EF4444]' : 'text-[#6B7280]'}`}>
                  {errorCount}
                </p>
                <p className={`text-xs mt-0.5 font-medium ${errorCount > 0 ? 'text-[#EF4444]/70' : 'text-[#6B7280]'}`}>
                  Failed
                </p>
              </div>
            </div>

            {results.length > 0 && (
              <div className="bg-[#161D26] border border-[#232B36] rounded-2xl overflow-hidden">
                <div className="divide-y divide-[#232B36]/60 max-h-80 overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center gap-3">
                      <span className={`text-sm flex-shrink-0 ${r.status === 'success' ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                        {r.status === 'success' ? '✓' : '✗'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#E5E7EB]">{r.name}</p>
                        {r.message && <p className="text-xs text-[#EF4444] mt-0.5">{r.message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { setRows([]); setResults([]); setStep('upload') }}
              className="w-full bg-[#161D26] text-[#9CA3AF] border border-[#232B36] px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-[#1a2235] hover:border-[#3a4555] transition-colors"
            >
              Import another file
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
