import { Construction } from 'lucide-react'

// Honest placeholder: these lab pages are built next, they are not wired yet.
export default function ComingNext({ title }: { title: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <Construction className="text-slate-400" />
      <h1 className="mt-3 text-lg font-bold text-navy-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">Not built yet. Next on the lab portal list.</p>
    </div>
  )
}
