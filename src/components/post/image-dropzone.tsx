'use client'

import * as React from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { UploadCloud, X, Loader2, ImageIcon, GripVertical } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export interface MediaImage {
  /** Unique id for dnd-kit (stable across reorders). */
  id: string
  /** Public URL — either /uploads/... or an external https URL. */
  url: string
  /** Original file name (optional). */
  name?: string
}

export interface ImageDropzoneProps {
  images: MediaImage[]
  onChange: (images: MediaImage[]) => void
  /** Compact variant for tighter layouts. */
  compact?: boolean
  className?: string
}

/**
 * Drag-and-drop image uploader + drag-to-reorder grid.
 *
 * - Drop image files onto the zone → uploaded via /api/upload → URL added to list.
 * - Click the zone → file picker opens (multi-select supported).
 * - Existing image tiles are draggable to reorder (Pointer + Keyboard sensors).
 * - Each tile has an X button to remove.
 */
export function ImageDropzone({
  images,
  onChange,
  compact = false,
  className,
}: ImageDropzoneProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const uploadFiles = React.useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
      if (list.length === 0) {
        toast.error('Перетащите изображения (PNG, JPG, WebP)')
        return
      }
      setUploading(true)
      try {
        const fd = new FormData()
        for (const f of list) fd.append('files', f, f.name)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const data = await res.json().catch(() => null)
        if (!data || data.ok !== true) {
          throw new Error(data?.error ?? 'Загрузка не удалась')
        }
        const uploaded: MediaImage[] = (data.files ?? []).map(
          (f: { url: string; name?: string }) => ({
            id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            url: f.url,
            name: f.name,
          }),
        )
        if (uploaded.length > 0) {
          onChange([...images, ...uploaded])
          toast.success(`Добавлено ${uploaded.length} фото`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Неизвестная ошибка'
        toast.error(msg)
      } finally {
        setUploading(false)
      }
    },
    [images, onChange],
  )

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) {
      void uploadFiles(e.dataTransfer.files)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleRemove = (id: string) => {
    onChange(images.filter((i) => i.id !== id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = images.findIndex((i) => i.id === active.id)
    const newIndex = images.findIndex((i) => i.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onChange(arrayMove(images, oldIndex, newIndex))
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Dropzone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed text-center transition-colors',
          compact ? 'p-4' : 'p-6',
          dragOver
            ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30'
            : 'border-slate-300 bg-slate-50/60 hover:border-teal-400 hover:bg-teal-50/40 dark:border-slate-700 dark:bg-slate-900/40',
        )}
      >
        {uploading ? (
          <>
            <Loader2 className="size-6 animate-spin text-teal-600" />
            <span className="text-xs text-muted-foreground">Загрузка…</span>
          </>
        ) : (
          <>
            <UploadCloud
              className={cn(
                'text-teal-600',
                compact ? 'size-5' : 'size-7',
              )}
            />
            <div className={cn(compact ? 'text-xs' : 'text-sm', 'font-medium text-foreground')}>
              Перетащите фото сюда или нажмите
            </div>
            {!compact ? (
              <div className="text-[11px] text-muted-foreground">
                PNG, JPG, WebP · до 8 МБ · порядок можно менять перетаскиванием
              </div>
            ) : null}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void uploadFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {/* Reorderable grid of uploaded images */}
      {images.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={images.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((img) => (
                <SortableImage
                  key={img.id}
                  image={img}
                  onRemove={() => handleRemove(img.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}

      {images.length > 0 ? (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ImageIcon className="size-3" />
          {images.length} фото · тащите плитку, чтобы изменить порядок
        </div>
      ) : null}
    </div>
  )
}

function SortableImage({
  image,
  onRemove,
}: {
  image: MediaImage
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: image.id })
  const [imgError, setImgError] = React.useState(false)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative aspect-square overflow-hidden rounded-md border bg-muted',
        isDragging && 'z-10 ring-2 ring-teal-500',
      )}
    >
      {imgError ? (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageIcon className="size-5" />
        </div>
      ) : (
        <img
          src={image.url}
          alt={image.name ?? 'фото'}
          loading="lazy"
          draggable={false}
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      )}

      {/* Drag handle (covers the tile, but the X button stops propagation) */}
      <button
        type="button"
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        aria-label="Перетащить для изменения порядка"
        {...attributes}
        {...listeners}
      />

      {/* Remove button */}
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="absolute right-1 top-1 size-6 rounded-full bg-black/60 text-white opacity-0 shadow hover:bg-black/80 group-hover:opacity-100"
        aria-label="Удалить фото"
      >
        <X className="size-3" />
      </Button>

      <div className="pointer-events-none absolute left-1 top-1 rounded bg-black/40 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
        <GripVertical className="size-3" />
      </div>
    </div>
  )
}

/** Convert a string[] of URLs (legacy mediaUrls format) to MediaImage[] with stable ids. */
export function urlsToMediaImages(urls: string[]): MediaImage[] {
  return urls
    .filter(Boolean)
    .map((url) => ({
      id: `url-${url}-${Math.random().toString(36).slice(2, 6)}`,
      url,
    }))
}

/** Convert MediaImage[] back to string[] of URLs for persistence. */
export function mediaImagesToUrls(images: MediaImage[]): string[] {
  return images.map((i) => i.url).filter(Boolean)
}
