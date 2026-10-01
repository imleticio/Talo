import type { SVGProps } from 'react'

export function BranchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M6 8v9m0-3c0-4 12-2 12-6" />
      <circle cx="6" cy="5.5" r="2.5" />
      <circle cx="6" cy="19.5" r="2.5" />
      <circle cx="18" cy="5.5" r="2.5" />
    </svg>
  )
}
