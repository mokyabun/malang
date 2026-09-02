import { SectionHeading } from '../../page-heading'

export function PanelHeading({ title, description }: { title: string; description: string }) {
    return (
        <SectionHeading
            className="flex items-end justify-between gap-6 pb-5 max-sm:block [&_h2]:font-serif [&_h2]:text-xl [&_p]:max-w-md [&_p]:text-right [&_p]:text-[10px] [&_p]:text-muted-foreground max-sm:[&_p]:mt-2 max-sm:[&_p]:text-left"
            title={title}
            description={description}
        />
    )
}
