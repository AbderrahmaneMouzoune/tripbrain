'use client'

import { Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EditModeBarProps {
  isEditMode: boolean
  onToggle: () => void
  className?: string
}

export function EditModeBar({
  isEditMode,
  onToggle,
  className,
}: EditModeBarProps) {
  return (
    <Button
      variant={isEditMode ? 'default' : 'outline'}
      size="sm"
      onClick={onToggle}
      className={cn(
        'gap-1.5 transition-all duration-200',
        isEditMode &&
          'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white',
        className,
      )}
      aria-pressed={isEditMode}
      aria-label={isEditMode ? 'Quitter le mode édition' : 'Modifier le jour'}
    >
      {isEditMode ? (
        <>
          <X className="h-3.5 w-3.5" />
          <span className="text-xs">Terminer</span>
        </>
      ) : (
        <>
          <Pencil className="h-3.5 w-3.5" />
          <span className="text-xs">Modifier</span>
        </>
      )}
    </Button>
  )
}
