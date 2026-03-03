import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Download, RefreshCw, Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react'
import type { UpdaterStatus } from '@/types/electron'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'available'; version: string; releaseDate?: string; releaseNotes?: string }
  | { phase: 'downloading'; percent: number; speed: number; transferred: number; total: number }
  | { phase: 'downloaded'; version: string }
  | { phase: 'error'; message: string }
  | { phase: 'up-to-date' }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function UpdateModal() {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.onUpdaterStatus) return
    const cleanup = window.electronAPI.onUpdaterStatus((status: UpdaterStatus) => {
      switch (status.type) {
        case 'checking-for-update':
          setState({ phase: 'checking' })
          break
        case 'update-available':
          setState({
            phase: 'available',
            version: status.data?.version || 'Unknown',
            releaseDate: status.data?.releaseDate,
            releaseNotes: status.data?.releaseNotes,
          })
          setOpen(true)
          break
        case 'update-not-available':
          setState({ phase: 'up-to-date' })
          break
        case 'download-progress':
          setState({
            phase: 'downloading',
            percent: status.data?.percent || 0,
            speed: status.data?.bytesPerSecond || 0,
            transferred: status.data?.transferred || 0,
            total: status.data?.total || 0,
          })
          break
        case 'update-downloaded':
          setState({ phase: 'downloaded', version: status.data?.version || 'Unknown' })
          break
        case 'error':
          setState({ phase: 'error', message: status.data?.message || 'Unknown error' })
          break
      }
    })
    return cleanup
  }, [])

  const handleDownload = async () => {
    setState({ phase: 'downloading', percent: 0, speed: 0, transferred: 0, total: 0 })
    await window.electronAPI.downloadUpdate()
  }

  const handleInstall = () => {
    window.electronAPI.installUpdate()
  }

  const handleClose = (value: boolean) => {
    // Don't allow closing while downloading
    if (state.phase === 'downloading') return
    setOpen(value)
    if (!value && (state.phase === 'error' || state.phase === 'up-to-date')) {
      setState({ phase: 'idle' })
    }
  }

  const isDownloading = state.phase === 'downloading'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={isDownloading ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={isDownloading ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {state.phase === 'available' && <><Sparkles className="h-5 w-5 text-violet-500" /> Mise à jour disponible</>}
            {state.phase === 'downloading' && <><Download className="h-5 w-5 text-blue-500 animate-bounce" /> Téléchargement en cours</>}
            {state.phase === 'downloaded' && <><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Mise à jour prête</>}
            {state.phase === 'error' && <><AlertCircle className="h-5 w-5 text-red-500" /> Erreur de mise à jour</>}
            {state.phase === 'checking' && <><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> Vérification...</>}
          </DialogTitle>
          <DialogDescription>
            {state.phase === 'available' && `La version ${state.version} est disponible.`}
            {state.phase === 'downloading' && 'Veuillez patienter pendant le téléchargement...'}
            {state.phase === 'downloaded' && 'L\'application va redémarrer pour appliquer la mise à jour.'}
            {state.phase === 'error' && 'Une erreur est survenue lors de la mise à jour.'}
            {state.phase === 'checking' && 'Recherche de mises à jour...'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Update available */}
          {state.phase === 'available' && (
            <>
              <div className="rounded-lg border border-violet-200 dark:border-violet-800/50 bg-violet-50 dark:bg-violet-950/30 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-violet-800 dark:text-violet-200">
                    Version {state.version}
                  </span>
                  {state.releaseDate && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(state.releaseDate).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </div>
                {state.releaseNotes && (
                  <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap line-clamp-4">
                    {typeof state.releaseNotes === 'string'
                      ? state.releaseNotes.replace(/<[^>]*>/g, '')
                      : ''}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Plus tard
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors shadow-sm"
                >
                  <Download className="h-4 w-4" />
                  Télécharger
                </button>
              </div>
            </>
          )}

          {/* Download progress */}
          {state.phase === 'downloading' && (
            <div className="space-y-3">
              <Progress value={state.percent} className="h-2.5" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{Math.round(state.percent)}%</span>
                <span>
                  {formatBytes(state.transferred)} / {formatBytes(state.total)}
                </span>
                <span>{formatBytes(state.speed)}/s</span>
              </div>
            </div>
          )}

          {/* Downloaded — ready to install */}
          {state.phase === 'downloaded' && (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Plus tard
              </button>
              <button
                onClick={handleInstall}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
              >
                <RefreshCw className="h-4 w-4" />
                Redémarrer & Installer
              </button>
            </div>
          )}

          {/* Error */}
          {state.phase === 'error' && (
            <>
              <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 p-3">
                <p className="text-xs text-red-700 dark:text-red-300 break-all">
                  {state.message}
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => { setOpen(false); setState({ phase: 'idle' }) }}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  Fermer
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
