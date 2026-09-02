import { Label } from '@/components/ui/label'

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Label className="grid items-start gap-2 text-xs font-medium leading-normal text-muted-foreground">
            {label}
            {children}
        </Label>
    )
}
