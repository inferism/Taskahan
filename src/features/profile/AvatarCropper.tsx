import { useEffect, useId, useMemo, useState } from 'react'
import Cropper from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/auth'
import { useLatestRequest } from '@/features/home/useLatestRequest'
import { Avatar, Button, Dialog, DialogClose, useToast } from '@/ui'
import { patchOwnAvatar, removeAvatar, uploadAvatar } from './api'
import { drawCrop, encodeAvatar, loadImage, pickMessages, type Area } from './image'

export interface AvatarCropperProps {
  /** The picked file, already through `checkFile`. Null keeps the dialog closed. */
  file: File | null
  onClose: () => void
  seat: number
  name: string
  hasPhoto: boolean
}

/** Square crop, zoom slider, and the result previewed as the member's own jersey tile. */
export function AvatarCropper(props: AvatarCropperProps) {
  // Remount per file so crop, zoom and errors start fresh.
  return props.file ? <CropDialog key={fileKey(props.file)} {...props} file={props.file} /> : null
}

const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`

function CropDialog({ file, onClose, seat, name, hasPhoto }: AvatarCropperProps & { file: File }) {
  const queryClient = useQueryClient()
  const userId = useAuth().session?.user.id
  const toast = useToast()
  const request = useLatestRequest()
  const zoomId = useId()
  const url = useMemo(() => URL.createObjectURL(file), [file])
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => () => URL.revokeObjectURL(url), [url])
  useEffect(() => {
    let live = true
    loadImage(url).then(
      (img) => live && setImage(img),
      () => live && setError(pickMessages.decode),
    )
    return () => {
      live = false
    }
  }, [url])

  const preview = useMemo(() => {
    if (!image || !area) return null
    try {
      return drawCrop(image, area, 104).toDataURL('image/png')
    } catch {
      return null
    }
  }, [image, area])

  function close() {
    request.cancel()
    onClose()
  }

  async function run(kind: 'save' | 'remove') {
    if (!userId) return
    setError(undefined)
    setBusy(kind)
    const isCurrent = request.begin()
    try {
      let path: string | null = null
      if (kind === 'save') {
        if (!image || !area) throw new Error('not_ready')
        path = await uploadAvatar(userId, await encodeAvatar(image, area))
      } else {
        await removeAvatar()
      }
      patchOwnAvatar(queryClient, userId, path)
      if (!isCurrent()) return
      toast(kind === 'save' ? 'Photo saved' : 'Photo removed')
      onClose()
    } catch (e) {
      if (!isCurrent()) return
      setBusy(null)
      setError(
        e instanceof Error && e.message === 'encode'
          ? 'This browser cannot save WebP photos. Try another browser.'
          : kind === 'save'
            ? 'Could not save the photo. Try again.'
            : 'Could not remove the photo. Try again.',
      )
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title="Profile photo"
      description="Drag to frame your face. Everyone in your groups sees this photo."
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-ink">
        {image && (
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            aspect={1}
            maxZoom={4}
            showGrid={false}
            objectFit="cover"
            disableAutomaticStylesInjection
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropAreaChange={(_, pixels) => setArea(pixels)}
          />
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={zoomId} className="text-label font-semibold">
            Zoom
          </label>
          <input
            id={zoomId}
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            disabled={!image}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-11 w-full accent-court sm:h-10"
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <Avatar seat={seat} name={name} size={52} photoUrl={preview} />
          <span className="text-label text-muted">Preview</span>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-label text-blocked">
          {error}
        </p>
      )}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {hasPhoto && (
          <Button
            variant="destructive"
            className="mr-auto"
            busy={busy === 'remove'}
            busyLabel="Removing…"
            disabled={busy === 'save'}
            onClick={() => void run('remove')}
          >
            Remove photo
          </Button>
        )}
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button
          variant="primary"
          busy={busy === 'save'}
          busyLabel="Saving…"
          disabled={!image || !area || busy === 'remove'}
          onClick={() => void run('save')}
        >
          Save photo
        </Button>
      </div>
    </Dialog>
  )
}
