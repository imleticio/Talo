import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getAppInfo, type AppInfo } from '@/services/tauri'
import { GradientBlurBackground } from '@/features/chat/gradient-blur-background'
import { hazeStyle } from '@/features/chat/haze-style'
import { MAX_CHAT_BACKGROUND_OPACITY, type ChatBackground } from './use-chat-background'
import type { WindowTranslucency } from './use-window-translucency'

function intensity(opacity: number) {
  return Math.round((opacity / MAX_CHAT_BACKGROUND_OPACITY) * 100)
}

export function SettingsPage({
  windowTranslucency,
  chatBackground,
}: {
  windowTranslucency: WindowTranslucency
  chatBackground: ChatBackground
}) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewActive, setPreviewActive] = useState(false)

  useEffect(() => {
    if (!isTauri()) return
    let active = true
    getAppInfo()
      .then((value) => {
        if (active) setInfo(value)
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <section className="mx-auto w-full max-w-2xl px-8 py-14">
      <h1 className="text-2xl font-medium tracking-[-0.04em]">Appearance</h1>
      <p className="mt-2 text-sm text-muted-foreground">Make Talo feel at home on your desktop.</p>

      <div className="mt-8 rounded-xl border border-border bg-card/60 p-5 text-sm">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="font-medium">Translucent window</p>
            <p className="mt-1 max-w-sm leading-5 text-muted-foreground">
              {windowTranslucency.loading
                ? 'Checking desktop support…'
                : windowTranslucency.supported
                  ? 'Blur the desktop behind Talo while keeping your workspace clear.'
                  : 'Available in the macOS and Windows desktop app.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Translucent window"
            aria-checked={windowTranslucency.enabled}
            disabled={
              windowTranslucency.loading || windowTranslucency.busy || !windowTranslucency.supported
            }
            onClick={() => void windowTranslucency.toggle(!windowTranslucency.enabled)}
            className="group flex h-6 w-11 shrink-0 items-center rounded-full bg-muted p-0.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-checked:bg-foreground"
          >
            <span className="size-5 rounded-full bg-foreground shadow-sm transition-transform group-aria-checked:translate-x-5 group-aria-checked:bg-background" />
          </button>
        </div>
        {windowTranslucency.supported && (
          <div className="mt-5 border-t border-border pt-5">
            <label
              htmlFor="window-tint-opacity"
              className="flex justify-between text-xs text-muted-foreground"
            >
              <span>Tint opacity</span>
              <span>{windowTranslucency.opacity}%</span>
            </label>
            <input
              id="window-tint-opacity"
              type="range"
              min="15"
              max="100"
              step="1"
              value={windowTranslucency.opacity}
              disabled={!windowTranslucency.enabled || windowTranslucency.busy}
              onChange={(event) => windowTranslucency.changeOpacity(Number(event.target.value))}
              className="mt-3 w-full accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Lower values reveal more of your desktop.
            </p>
          </div>
        )}
        {windowTranslucency.radiusSupported && (
          <div className="mt-5 border-t border-border pt-5">
            <label
              htmlFor="window-blur-radius"
              className="flex justify-between text-xs text-muted-foreground"
            >
              <span>Desktop blur radius</span>
              <span>{windowTranslucency.radius}</span>
            </label>
            <input
              id="window-blur-radius"
              type="range"
              min="1"
              max="64"
              value={windowTranslucency.radius}
              disabled={!windowTranslucency.enabled || windowTranslucency.busy}
              onChange={(event) => void windowTranslucency.changeRadius(Number(event.target.value))}
              className="mt-3 w-full accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>
        )}
        {windowTranslucency.error && (
          <p className="mt-4 text-xs text-destructive" role="alert">
            {windowTranslucency.error}
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card/60 p-5 text-sm">
        <h2 className="font-medium">Haze background</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Dissolve an image behind Chat, Agents and Projects while keeping content sharp.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!chatBackground.supported || chatBackground.busy}
            onClick={() => void chatBackground.selectImage()}
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {chatBackground.busy ? 'Adding image…' : 'Choose image'}
          </button>
          {chatBackground.imageUrl && (
            <button
              type="button"
              disabled={chatBackground.busy}
              onClick={chatBackground.clearImage}
              className="text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove image
            </button>
          )}
          {!chatBackground.supported && (
            <span className="text-xs text-muted-foreground">Available in the desktop app.</span>
          )}
        </div>
        {chatBackground.imageUrl && (
          <>
            <label
              htmlFor="chat-background-scope"
              className="mt-5 block text-xs text-muted-foreground"
            >
              Show in chat
            </label>
            <select
              id="chat-background-scope"
              value={chatBackground.scope}
              disabled={chatBackground.busy}
              onChange={(event) => chatBackground.setScope(event.target.value as 'empty' | 'all')}
              className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="all">Before and during conversations</option>
              <option value="empty">Only before messages</option>
            </select>

            <label
              htmlFor="chat-background-empty-opacity"
              className="mt-5 flex justify-between text-xs text-muted-foreground"
            >
              <span>Empty chat intensity</span>
              <span>{intensity(chatBackground.emptyOpacity)}%</span>
            </label>
            <input
              id="chat-background-empty-opacity"
              type="range"
              min="0"
              max={MAX_CHAT_BACKGROUND_OPACITY}
              value={chatBackground.emptyOpacity}
              aria-valuetext={`${intensity(chatBackground.emptyOpacity)}% intensity`}
              disabled={chatBackground.busy}
              onChange={(event) => chatBackground.setEmptyOpacity(Number(event.target.value))}
              className="mt-2 w-full accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />

            <label
              htmlFor="chat-background-session-opacity"
              className="mt-4 flex justify-between text-xs text-muted-foreground"
            >
              <span>Conversation intensity</span>
              <span>{intensity(chatBackground.sessionOpacity)}%</span>
            </label>
            <input
              id="chat-background-session-opacity"
              type="range"
              min="0"
              max={MAX_CHAT_BACKGROUND_OPACITY}
              value={chatBackground.sessionOpacity}
              aria-valuetext={`${intensity(chatBackground.sessionOpacity)}% intensity`}
              disabled={chatBackground.busy}
              onChange={(event) => chatBackground.setSessionOpacity(Number(event.target.value))}
              className="mt-2 w-full accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />

            <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
              <span>Preview</span>
              <button
                type="button"
                onClick={() => setPreviewActive(!previewActive)}
                className="rounded-lg border border-border px-2 py-1 hover:bg-accent hover:text-foreground"
              >
                {previewActive ? 'Show empty chat' : 'Show conversation'}
              </button>
            </div>
            <div
              className="haze-pane gradient-blur-preview mt-3 flex h-44 items-end overflow-hidden rounded-xl border border-border bg-background p-5"
              data-session-empty={!previewActive}
              data-background-scope={chatBackground.scope}
              style={hazeStyle(
                chatBackground.imageUrl,
                chatBackground.emptyOpacity,
                chatBackground.sessionOpacity,
              )}
            >
              <GradientBlurBackground />
              <span className="text-xs text-foreground">
                {previewActive ? 'Conversation preview' : 'Empty chat preview'}
              </span>
            </div>
          </>
        )}
        {chatBackground.error && (
          <p className="mt-3 text-xs text-destructive" role="alert">
            {chatBackground.error}
          </p>
        )}
      </div>

      <h2 className="mt-12 text-lg font-medium tracking-tight">About Talo</h2>
      <div className="mt-4 rounded-xl border border-border bg-card/60 p-5 text-sm">
        <p className="font-medium">Desktop runtime</p>
        <p className="mt-1 text-muted-foreground" role={error ? 'alert' : undefined}>
          {error ??
            (info
              ? `${info.name} v${info.version}`
              : isTauri()
                ? 'Loading…'
                : 'Open the desktop app to see runtime details.')}
        </p>
      </div>
    </section>
  )
}
