import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/* Cloudscape-style buttons (AWS console look) */
const buttonVariants = cva(
  'aws-btn',
  {
    variants: {
      variant: {
        default: 'aws-btn-primary',
        outline: 'aws-btn-normal',
        ghost: 'aws-btn-ghost',
        soft: 'aws-btn-normal',
        danger: 'aws-btn-danger',
      },
      size: {
        default: '',
        sm: 'h-[30px] px-3 text-[13px]',
        icon: 'w-[34px] px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />
}
