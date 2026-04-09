interface FormFieldProps {
  label: string
  error?: string
  children: React.ReactNode
}

export function FormField({ label, error, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-[#EF4444]">{error}</p>}
    </div>
  )
}
