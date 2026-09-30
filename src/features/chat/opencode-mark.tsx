// Official mark: https://github.com/anomalyco/opencode/blob/dev/packages/ui/src/components/logo.tsx
export function OpenCodeMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 16H4V8H12V16Z" fill="currentColor" opacity={0.35} />
      <path d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill="currentColor" />
    </svg>
  )
}
