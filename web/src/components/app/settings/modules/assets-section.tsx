import { ImageSquare } from '@phosphor-icons/react'

import { TabsContent } from '@/components/ui/tabs'
import { assetUrl } from '@/lib/api'

import { formatAssetBytes } from './format'
import type { ModuleEditorProps } from './types'

export function ModuleAssetsSection({ assets }: Pick<ModuleEditorProps, 'assets'>) {
    return (
        <TabsContent value="assets">
            {assets.length ? (
                <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                    {assets.map((asset) => (
                        <a
                            key={`${asset.assetId}-${asset.sourceUri}`}
                            className="group grid min-h-40 grid-rows-[minmax(7rem,1fr)_auto] overflow-hidden border border-border bg-card transition-colors hover:border-primary/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                            href={assetUrl(asset.assetId)}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <span className="grid min-h-0 place-items-center overflow-hidden bg-background/70">
                                {asset.mimeType.startsWith('image/') ? (
                                    <img
                                        className="max-h-52 w-full object-contain"
                                        src={assetUrl(asset.assetId)}
                                        alt=""
                                    />
                                ) : asset.mimeType.startsWith('video/') ? (
                                    <video
                                        className="max-h-52 w-full object-contain"
                                        src={assetUrl(asset.assetId)}
                                        muted
                                    />
                                ) : (
                                    <ImageSquare className="size-8 text-muted-foreground" />
                                )}
                            </span>
                            <span className="grid gap-1 border-t border-border p-3">
                                <strong className="truncate text-xs font-medium text-foreground">
                                    {asset.name || '이름 없는 에셋'}
                                </strong>
                                <small className="font-mono text-[9px] text-muted-foreground">
                                    {asset.mimeType} · {formatAssetBytes(asset.size)}
                                </small>
                            </span>
                        </a>
                    ))}
                </div>
            ) : (
                <div className="grid min-h-52 place-content-center justify-items-center gap-2 border-y border-border text-center text-muted-foreground">
                    <ImageSquare className="size-7" />
                    <p className="text-xs">이 모듈에 포함된 에셋이 없습니다.</p>
                    <small className="max-w-sm text-center text-[10px] leading-5">
                        에셋이 든 .risum 또는 .charx 파일을 다시 가져오면 이곳에 표시됩니다.
                    </small>
                </div>
            )}
        </TabsContent>
    )
}
