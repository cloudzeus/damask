'use client'

import { useState } from 'react'
import { MassUploader, type UploadedAsset } from '@/components/media/mass-uploader'
import { ProductImageCollection, type CollectionImage } from '@/components/media/product-image-collection'
import { Card, CardContent } from '@/components/ui/card'

export function MassUploaderDemo() {
  const [assets, setAssets] = useState<UploadedAsset[]>([])
  const [imageOrder, setImageOrder] = useState<CollectionImage[]>([])

  return (
    <div className="flex flex-col gap-6">
      <MassUploader
        pathPrefix="products/demo"
        onUploaded={uploaded => {
          setAssets(prev => [...prev, ...uploaded])
          const newImages = uploaded
            .filter(asset => asset.type === 'IMAGE')
            .map(asset => ({ id: asset.path, url: asset.url, alt: asset.name }))
          if (newImages.length > 0) setImageOrder(prev => [...prev, ...newImages])
        }}
      />

      {imageOrder.length >= 2 && (
        <div>
          <h2 className="mb-3 text-[14px] font-semibold">Συλλογή εικόνων (δοκιμή drag &amp; drop)</h2>
          <div className="flex flex-wrap items-start gap-6">
            <ProductImageCollection images={imageOrder} onReorder={setImageOrder} size={56} />
            <ol className="flex flex-col gap-1 text-[12.5px] text-muted-foreground">
              {imageOrder.map((img, index) => (
                <li key={img.id} className="truncate">
                  {index + 1}. {img.alt}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {assets.length > 0 && (
        <div>
          <h2 className="mb-3 text-[14px] font-semibold">Μεταφορτωμένα αρχεία ({assets.length})</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {assets.map(asset => (
              <Card key={asset.path} size="sm">
                <CardContent className="flex flex-col gap-2">
                  {asset.type === 'IMAGE' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.url} alt={asset.name} className="aspect-square w-full rounded-md object-cover" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-md bg-muted text-[11px] text-muted-foreground">
                      {asset.type}
                    </div>
                  )}
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[11.5px] text-(--brass) hover:underline"
                  >
                    {asset.name}
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
