import * as React from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn('h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100', className)}
      {...props}
    />
  )
}
