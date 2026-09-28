import { useState } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { AgentsPage } from '@/features/agents/agents-page'
import { ChatPage } from '@/features/chat/chat-page'
import { ProjectsPage } from '@/features/projects/projects-page'
import { SettingsPage } from '@/features/settings/settings-page'
import { useWindowTranslucency } from '@/features/settings/use-window-translucency'
import { useChatBackground } from '@/features/settings/use-chat-background'
import type { Section } from '@/components/layout/navigation'

function App() {
  const [section, setSection] = useState<Section>('chat')
  const windowTranslucency = useWindowTranslucency()
  const chatBackground = useChatBackground()

  return (
    <AppShell section={section} onNavigate={setSection} background={chatBackground}>
      {section === 'chat' && <ChatPage />}
      {section === 'agents' && <AgentsPage />}
      {section === 'projects' && <ProjectsPage />}
      {section === 'settings' && (
        <SettingsPage windowTranslucency={windowTranslucency} chatBackground={chatBackground} />
      )}
    </AppShell>
  )
}

export default App
