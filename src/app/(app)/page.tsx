import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
  const cards = [
    { title: 'Προϊόντα', value: '—', hint: 'Sync στη Φάση 2' },
    { title: 'Εκκρεμείς μεταφράσεις', value: '—', hint: 'Φάση 3' },
    { title: 'Ανοιχτά containers', value: '—', hint: 'Φάση 7' },
    { title: 'Παραγγελίες', value: '—', hint: 'Φάση 6' },
  ]
  return (
    <div>
      <h1 className="mb-5 text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <Card key={c.title}>
            <CardHeader className="pb-1"><CardTitle className="text-[12.5px] font-medium text-muted-foreground">{c.title}</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">{c.value}</div>
              <p className="text-xs text-muted-foreground">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
