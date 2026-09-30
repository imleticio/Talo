import { Check, ChevronDown } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { ChatConversation } from './use-chat-conversation'

const REASONING_LABELS: Record<string, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
}

function variantLabel(value: string) {
  return Object.hasOwn(REASONING_LABELS, value) ? REASONING_LABELS[value] : value
}

export function ReasoningPicker({ chat }: { chat: ChatConversation }) {
  const selected = chat.models.find(
    (model) =>
      model.providerId === chat.selectedModel?.providerId &&
      model.modelId === chat.selectedModel?.modelId,
  )
  const variants = selected?.variants ?? []
  const configurable = variants.length > 0
  const reasoning = variants.every((variant) => Object.hasOwn(REASONING_LABELS, variant))
  const options = reasoning
    ? Object.keys(REASONING_LABELS).filter((variant) => variants.includes(variant))
    : variants
  const label = reasoning ? 'Reasoning' : 'Variant'
  const current = chat.selectedModel?.variant ?? ''
  const currentLabel = current ? variantLabel(current) : 'Default'
  const disabled =
    !configurable ||
    chat.activity !== 'idle' ||
    Boolean(chat.deletingId) ||
    (!chat.info?.installed && !chat.info?.available)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={`${label}: ${currentLabel}`}
          title={
            configurable
              ? label
              : selected
                ? 'This model has no configurable reasoning options'
                : 'Choose a model to configure reasoning'
          }
          disabled={disabled}
          className="h-9 max-w-full gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <span className="max-w-28 truncate">{currentLabel}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          aria-label={reasoning ? 'Reasoning effort' : 'Model variant'}
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="z-50 max-h-[min(18rem,var(--radix-dropdown-menu-content-available-height))] min-w-36 overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl outline-none"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground">
            {label}
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={current}
            onValueChange={(variant) => {
              if (disabled || !selected || (variant && !variants.includes(variant))) return
              chat.selectModel({
                providerId: selected.providerId,
                modelId: selected.modelId,
                variant: variant || null,
              })
            }}
          >
            {['', ...options].map((variant) => (
              <DropdownMenu.RadioItem
                key={variant}
                value={variant}
                className="relative flex cursor-default items-center rounded-lg py-2 pr-8 pl-2 text-xs outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
              >
                {variant ? variantLabel(variant) : 'Default'}
                <DropdownMenu.ItemIndicator className="absolute right-2 flex items-center">
                  <Check className="size-3.5" aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
