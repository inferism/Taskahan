import type { ReactNode } from 'react'
import { Tabs as T } from 'radix-ui'
import { cn } from './cn'

export interface TabItem {
  value: string
  label: string
  content: ReactNode
}

export interface TabsProps {
  items: TabItem[]
  label: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

export function Tabs({ items, label, value, defaultValue, onValueChange }: TabsProps) {
  return (
    <T.Root
      value={value}
      defaultValue={value === undefined ? (defaultValue ?? items[0]?.value) : undefined}
      onValueChange={onValueChange}
    >
      <T.List aria-label={label} className="flex border-b border-line">
        {items.map((i) => (
          <T.Trigger
            key={i.value}
            value={i.value}
            className={cn(
              'h-11 border-b-[3px] border-transparent px-4 text-body font-semibold text-muted',
              'hover:text-ink data-[state=active]:border-(--tab-line) data-[state=active]:text-ink',
            )}
          >
            {i.label}
          </T.Trigger>
        ))}
      </T.List>
      {items.map((i) => (
        <T.Content key={i.value} value={i.value} className="pt-3">
          {i.content}
        </T.Content>
      ))}
    </T.Root>
  )
}
