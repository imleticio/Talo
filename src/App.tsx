import { useState } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { AgentsPage } from '@/features/agents/agents-page'
import { ChatWorkspaceView } from '@/features/chat/chat-workspace-view'
import { useChatConversation } from '@/features/chat/use-chat-conversation'
import { ProjectsPage } from '@/features/projects/projects-page'
import { RepositoryPage } from '@/features/repository/repository-page'
import { SettingsPage } from '@/features/settings/settings-page'
import { useWindowTranslucency } from '@/features/settings/use-window-translucency'
import { useChatBackground } from '@/features/settings/use-chat-background'
import type { Section } from '@/components/layout/navigation'

function App() {
  const [section, setSection] = useState<Section>('chat')
  const windowTranslucency = useWindowTranslucency()
  const chatBackground = useChatBackground()
  const chat = useChatConversation()

  return (
    <AppShell section={section} onNavigate={setSection} background={chatBackground} chat={chat}>
      {section === 'chat' && <ChatWorkspaceView chat={chat} />}
      {section === 'agents' && <AgentsPage />}
      {section === 'projects' && <ProjectsPage />}
      {section === 'repository' && (
        <RepositoryPage chat={chat} onShowChat={() => setSection('chat')} />
      )}
      {section === 'settings' && (
        <SettingsPage windowTranslucency={windowTranslucency} chatBackground={chatBackground} />
      )}
    </AppShell>
  )
}

export default App
