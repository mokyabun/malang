import { useAtomValue } from 'jotai'

import { workspaceInitializedAtom } from './atom'
import { ChatWorkspace } from './chat/chat-workspace'
import type { WorkspacePage } from './workspace/types'
import { useWorkspaceBootstrap } from './workspace/use-workspace-bootstrap'
import { WorkspaceLoading } from './workspace/workspace-feedback'
import { WorkspaceLayout } from './workspace/workspace-layout'

export type { WorkspacePage } from './workspace/types'

export function AppShell({ page }: { page: WorkspacePage }) {
    useWorkspaceBootstrap(page)
    const initialized = useAtomValue(workspaceInitializedAtom)

    if (!initialized) return <WorkspaceLoading />

    return (
        <WorkspaceLayout>
            <ChatWorkspace page={page} />
        </WorkspaceLayout>
    )
}
