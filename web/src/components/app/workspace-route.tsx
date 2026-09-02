import { AppShell, type WorkspacePage } from './app-shell'

export function WorkspaceRoute({ page }: { page: WorkspacePage }) {
    return <AppShell page={page} />
}
