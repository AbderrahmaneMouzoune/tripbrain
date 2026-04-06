'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Lightbulb } from 'lucide-react'

interface TipsCardProps {
  tips: string[]
}

export function TipsCard({ tips }: TipsCardProps) {
  if (tips.length === 0) return null

  return (
    <Card className="border-border/60 bg-card/80 shadow-none">
      <CardHeader className="px-4 py-2">
        <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
          <Lightbulb className="text-secondary h-3.5 w-3.5" strokeWidth={1.75} />
          Conseils pratiques
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0 pb-4">
        <ul className="flex flex-col gap-2">
          {tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="text-secondary mt-0.5 shrink-0">→</span>
              <span className="text-foreground leading-snug">{tip}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
