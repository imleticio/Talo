import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Cpu, Search, Star } from 'lucide-react'
import { Popover } from 'radix-ui'
import { Button } from '@/components/ui/button'
import type { AgentModel, AgentModelChoice } from '@/services/agent'
import type { ChatConversation } from './use-chat-conversation'

function modelKey(model: AgentModel) {
  return `${model.providerId}/${model.modelId}`
}

const MENU_GAP = 8
const VIEWPORT_PADDING = 16
const MAX_MENU_HEIGHT = 288
const MIN_MENU_HEIGHT = 180

export function ModelPicker({ chat }: { chat: ChatConversation }) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<{ side: 'bottom' | 'top'; maxHeight: number }>({
    side: 'bottom',
    maxHeight: MAX_MENU_HEIGHT,
  })
  const [provider, setProvider] = useState('all')
  const [search, setSearch] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const selected = useMemo(
    () =>
      chat.models.find(
        (model) =>
          model.providerId === chat.selectedModel?.providerId &&
          model.modelId === chat.selectedModel?.modelId,
      ),
    [chat.models, chat.selectedModel],
  )
  const providers = useMemo(
    () =>
      Array.from(
        new Map(chat.models.map((model) => [model.providerId, model.providerName])).entries(),
      ),
    [chat.models],
  )
  const query = search.trim().toLowerCase()
  const matching = useMemo(
    () =>
      chat.models.filter((model) => {
        if (provider === 'favorites' && !chat.favoriteModels.includes(modelKey(model))) return false
        if (provider !== 'all' && provider !== 'favorites' && provider !== model.providerId)
          return false
        return (
          !query ||
          `${model.name} ${model.providerName} ${model.modelId}`.toLowerCase().includes(query)
        )
      }),
    [chat.models, chat.favoriteModels, provider, query],
  )

  function choose(model: AgentModelChoice | null) {
    chat.selectModel(model)
    setOpen(false)
    setSearch('')
  }

  function changeOpen(next: boolean) {
    if (next && trigger.current) {
      const bounds = trigger.current.getBoundingClientRect()
      const below = window.innerHeight - bounds.bottom - MENU_GAP - VIEWPORT_PADDING
      const above = bounds.top - MENU_GAP - VIEWPORT_PADDING
      // Size for the preferred side before collision detection, so filtering cannot flip the menu.
      const side = below >= MIN_MENU_HEIGHT || below >= above ? 'bottom' : 'top'
      setPlacement({
        side,
        maxHeight: Math.max(0, Math.min(MAX_MENU_HEIGHT, side === 'bottom' ? below : above)),
      })
    }
    setOpen(next)
  }

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger asChild>
        <Button
          ref={trigger}
          type="button"
          variant="ghost"
          aria-label={`Model: ${selected?.name ?? 'OpenCode default'}${chat.selectedModel?.variant ? `, variant ${chat.selectedModel.variant}` : ''}`}
          disabled={chat.activity !== 'idle' || (!chat.info?.installed && !chat.info?.available)}
          className="h-9 max-w-52 min-w-0 gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Cpu className="size-4 shrink-0" strokeWidth={1.7} aria-hidden="true" />
          <span className="truncate font-medium text-foreground">
            {selected?.name ?? (chat.modelsLoading ? 'Loading models…' : 'OpenCode default')}
          </span>
          {chat.selectedModel?.variant && (
            <span className="hidden shrink-0 text-muted-foreground sm:inline">
              {chat.selectedModel.variant}
            </span>
          )}
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label="Choose OpenCode model"
          side={placement.side}
          align="start"
          sideOffset={MENU_GAP}
          collisionPadding={VIEWPORT_PADDING}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            searchInput.current?.focus({ preventScroll: true })
          }}
          style={{
            maxHeight: `min(${placement.maxHeight}px, var(--radix-popover-content-available-height, ${placement.maxHeight}px))`,
          }}
          className="z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl outline-none"
        >
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border p-2">
            <button
              type="button"
              aria-label="All models"
              aria-pressed={provider === 'all'}
              onClick={() => setProvider('all')}
              className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${provider === 'all' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              All
            </button>
            <button
              type="button"
              aria-label="Favorite models"
              aria-pressed={provider === 'favorites'}
              onClick={() => setProvider('favorites')}
              className={`shrink-0 rounded-md px-2 py-1 ${provider === 'favorites' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Star className="size-4" aria-hidden="true" />
            </button>
            {providers.map(([id, name]) => (
              <button
                key={id}
                type="button"
                aria-pressed={provider === id}
                onClick={() => setProvider(id)}
                className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${provider === id ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchInput}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search models…"
              aria-label="Search models"
              className="h-10 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {!query && provider === 'all' && (
              <button
                type="button"
                aria-pressed={!chat.selectedModel}
                onClick={() => choose(null)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs hover:bg-accent"
              >
                <span>OpenCode default</span>
                {!chat.selectedModel && (
                  <Check className="size-4 text-foreground" aria-hidden="true" />
                )}
              </button>
            )}
            {chat.modelsLoading ? (
              <p role="status" className="px-3 py-4 text-sm text-muted-foreground">
                Loading available models…
              </p>
            ) : chat.modelsError ? (
              <div className="flex items-center justify-between gap-3 px-3 py-4 text-sm text-muted-foreground">
                <span>{chat.modelsError}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void chat.loadModels()}
                >
                  Retry
                </Button>
              </div>
            ) : matching.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                {chat.models.length === 0
                  ? 'No connected models in OpenCode.'
                  : 'No matching models.'}
              </p>
            ) : (
              <>
                {matching.slice(0, 100).map((model) => {
                  const key = modelKey(model)
                  const favorite = chat.favoriteModels.includes(key)
                  const active =
                    selected?.providerId === model.providerId && selected.modelId === model.modelId
                  return (
                    <div
                      key={key}
                      className={`flex items-center rounded-lg hover:bg-accent ${active ? 'bg-accent/70' : ''}`}
                    >
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          choose({
                            providerId: model.providerId,
                            modelId: model.modelId,
                            variant: null,
                          })
                        }
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-xs"
                      >
                        <span className="truncate font-medium">{model.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {model.providerName}
                        </span>
                        {active && <Check className="ml-auto size-4 shrink-0" aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        aria-label={`${favorite ? 'Remove' : 'Add'} ${model.name} ${favorite ? 'from' : 'to'} favorites`}
                        aria-pressed={favorite}
                        onClick={() => chat.toggleFavoriteModel(key)}
                        className="mr-2 rounded-lg p-2 text-muted-foreground hover:text-foreground"
                      >
                        <Star
                          className={`size-4 ${favorite ? 'fill-current text-foreground' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  )
                })}
                {matching.length > 100 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    Showing 100 of {matching.length} models. Refine your search to see more.
                  </p>
                )}
              </>
            )}
          </div>
          {selected && selected.variants.length > 0 && (
            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border px-3 py-2 text-xs">
              <label htmlFor="chat-model-variant" className="font-medium">
                {selected.variants.every((value) =>
                  ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value),
                )
                  ? 'Reasoning'
                  : 'Variant'}
              </label>
              <select
                id="chat-model-variant"
                value={chat.selectedModel?.variant ?? ''}
                onChange={(event) =>
                  chat.selectModel({
                    providerId: selected.providerId,
                    modelId: selected.modelId,
                    variant: event.target.value || null,
                  })
                }
                className="max-w-40 rounded-md bg-transparent px-2 py-1 text-right text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Default</option>
                {selected.variants.map((variant) => (
                  <option key={variant} value={variant}>
                    {variant}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
