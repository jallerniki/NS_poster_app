'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Send,
  MessageCircle,
  Users,
  Trash2,
  KeyRound,
  Link2,
  Server,
  Loader2,
  Search,
  Check,
  Hash,
  Megaphone,
  UsersRound,
} from 'lucide-react'

import {
  PLATFORMS,
  type Platform,
  type PlatformMeta,
  safeParse,
} from '@/lib/social'
import { cn } from '@/lib/utils'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

/** Map the string icon name from PLATFORMS meta to actual lucide-react components. */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Send,
  MessageCircle,
  Users,
}

interface PlatformAccount {
  id: string
  platform: string
  name: string
  targetId: string | null
  token: string
  extra: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  _count?: { targets: number }
}

function maskToken(token: string): string {
  if (!token) return ''
  if (token.length <= 8) return '••••'
  return `${token.slice(0, 8)}••••`
}

function getMeta(platform: string): PlatformMeta | null {
  return PLATFORMS[platform as Platform] ?? null
}

function platformChipStyle(hex: string): React.CSSProperties {
  return { backgroundColor: `${hex}1a`, color: hex, borderColor: `${hex}40` }
}

/** Render a "Подключить площадку" / "Редактировать" dialog form. */
interface AccountFormValues {
  platform: Platform
  name: string
  targetId: string
  token: string
  extra: string
}

/** A chat/channel returned by the bot API (TG or MAX). */
interface BotChat {
  id: string
  type: 'channel' | 'group' | 'supergroup' | 'private' | 'dialog'
  title: string
  username?: string
}

function AccountFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSubmit,
  submitting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initial?: PlatformAccount | null
  onSubmit: (values: AccountFormValues) => void
  submitting: boolean
}) {
  const isCreate = mode === 'create'
  const [platform, setPlatform] = React.useState<Platform>(
    initial?.platform ? (initial.platform as Platform) : 'telegram',
  )
  const [name, setName] = React.useState(initial?.name ?? '')
  const [targetId, setTargetId] = React.useState(initial?.targetId ?? '')
  const [token, setToken] = React.useState(initial?.token ?? '')
  const [extra, setExtra] = React.useState(initial?.extra ?? '')
  const [showToken, setShowToken] = React.useState(false)

  // Channel-loading state for TG/MAX (bot token → list of channels/chats).
  const [channels, setChannels] = React.useState<BotChat[] | null>(null)
  const [loadingChannels, setLoadingChannels] = React.useState(false)
  const [channelsError, setChannelsError] = React.useState<string | null>(null)

  // Reset state when dialog opens with new data
  React.useEffect(() => {
    if (!open) return
    setPlatform((initial?.platform as Platform) ?? 'telegram')
    setName(initial?.name ?? '')
    setTargetId(initial?.targetId ?? '')
    setToken(initial?.token ?? '')
    setExtra(initial?.extra ?? '')
    setShowToken(false)
  }, [open, initial])

  const meta = PLATFORMS[platform]

  // Load channels/chats from the bot API (TG / MAX) using the entered token.
  async function loadChannels() {
    if (!token.trim()) {
      toast.error('Сначала введите токен бота')
      return
    }
    setLoadingChannels(true)
    setChannelsError(null)
    setChannels(null)
    try {
      const endpoint =
        platform === 'telegram'
          ? '/api/bots/telegram/chats'
          : '/api/bots/max/chats'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!data || data.ok !== true) {
        const msg = data?.error || 'Не удалось загрузить каналы'
        setChannelsError(msg)
        toast.error(msg)
        return
      }
      const list: BotChat[] = (data.chats ?? []).map((c: BotChat) => ({
        id: String(c.id),
        type: c.type,
        title: c.title,
        username: c.username,
      }))
      setChannels(list)
      if (list.length === 0 && data.hint) {
        toast.message(data.hint)
      } else {
        toast.success(`Найдено каналов/чатов: ${list.length}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Сеть недоступна'
      setChannelsError(msg)
      toast.error(msg)
    } finally {
      setLoadingChannels(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Укажите название подключения')
      return
    }
    if (!token.trim()) {
      toast.error('Укажите токен')
      return
    }
    // Validate extra JSON if present
    if (extra.trim()) {
      try {
        JSON.parse(extra)
      } catch {
        toast.error('Поле extra должно быть валидным JSON (или оставьте пустым)')
        return
      }
    }
    onSubmit({
      platform,
      name: name.trim(),
      targetId: targetId.trim(),
      token: token.trim(),
      extra: extra.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? 'Подключить площадку' : 'Редактировать подключение'}
          </DialogTitle>
          <DialogDescription>
            Заполните токен бота и ID целевого чата/канала.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="acc-platform">Площадка</Label>
            <Select
              value={platform}
              onValueChange={(v) => {
                setPlatform(v as Platform)
                setChannels(null)
                setChannelsError(null)
                setTargetId('')
              }}
              disabled={!isCreate}
            >
              <SelectTrigger id="acc-platform" className="w-full">
                <SelectValue placeholder="Выберите площадку" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(PLATFORMS).map((p) => {
                  const Icon = ICON_MAP[p.icon] ?? Send
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <Icon className="size-4" />
                        {p.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-teal-200 bg-teal-50/50 p-3 text-xs text-muted-foreground dark:border-teal-900/40 dark:bg-teal-950/20">
            <div className="font-medium text-foreground">{meta.description}</div>
            <div className="mt-1 leading-relaxed">{meta.hint}</div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="acc-name">Название</Label>
            <Input
              id="acc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Основной Telegram-канал"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="acc-token">{meta.tokenLabel}</Label>
            <div className="relative">
              <Input
                id="acc-token"
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => {
                  setToken(e.target.value)
                  // invalidate loaded channels when token changes
                  setChannels(null)
                  setChannelsError(null)
                }}
                placeholder="xxxx:yyyy..."
                required
                className="pr-10 font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 size-7"
                onClick={() => setShowToken((s) => !s)}
                tabIndex={-1}
              >
                {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            {(platform === 'telegram' || platform === 'max') && token.trim() ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadChannels}
                disabled={loadingChannels}
                className="mt-1 gap-2 self-start"
              >
                {loadingChannels ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Search className="size-3.5" />
                )}
                {channels ? 'Обновить список каналов' : 'Загрузить каналы'}
              </Button>
            ) : null}
          </div>

          {/* Target ID — for TG/MAX shows a channel picker once channels are loaded;
              for VK keeps the manual input. */}
          {(platform === 'telegram' || platform === 'max') ? (
            <ChannelPicker
              platform={platform}
              channels={channels}
              loading={loadingChannels}
              error={channelsError}
              selectedId={targetId}
              selectedTitle={
                channels?.find((c) => c.id === targetId)?.title
              }
              onSelect={(chat) => {
                setTargetId(chat.id)
                // Auto-fill name from the channel title if name is empty.
                if (!name.trim()) setName(chat.title)
                // Store the channel title + username in extra so the card can
                // display a friendly channel name later.
                try {
                  const existing = extra.trim() ? JSON.parse(extra) : {}
                  setExtra(
                    JSON.stringify({
                      ...existing,
                      channelTitle: chat.title,
                      channelUsername: chat.username ?? null,
                    }),
                  )
                } catch {
                  setExtra(
                    JSON.stringify({
                      channelTitle: chat.title,
                      channelUsername: chat.username ?? null,
                    }),
                  )
                }
              }}
              hasToken={token.trim().length > 0}
              token={token}
            />
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="acc-target">{meta.targetLabel}</Label>
              <Input
                id="acc-target"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder={`Например, ${platform === 'vk' ? '123456 (ID сообщества)' : '@channel'}`}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="acc-extra">
              Extra (JSON, опционально)
              <span className="ml-1 text-xs text-muted-foreground">
                — напр. apiId/apiHash для TG, groupId для VK
              </span>
            </Label>
            <Textarea
              id="acc-extra"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={3}
              placeholder='{"apiId": 12345, "apiHash": "abc..."}'
              className="font-mono text-xs"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-teal-700 text-white hover:bg-teal-700/90"
            >
              {submitting ? 'Сохранение…' : isCreate ? 'Подключить' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Channel/chat picker shown when the user has loaded channels for a TG/MAX bot. */
function ChannelPicker({
  platform,
  channels,
  loading,
  error,
  selectedId,
  selectedTitle,
  onSelect,
  hasToken,
  token,
}: {
  platform: 'telegram' | 'max'
  channels: BotChat[] | null
  loading: boolean
  error: string | null
  selectedId: string
  selectedTitle?: string
  onSelect: (chat: BotChat) => void
  hasToken: boolean
  token: string
}) {
  const meta = PLATFORMS[platform]
  const [showManual, setShowManual] = React.useState(false)
  const [manualInput, setManualInput] = React.useState('')
  const [resolving, setResolving] = React.useState(false)
  const [manualError, setManualError] = React.useState<string | null>(null)

  const placeholder =
    platform === 'telegram'
      ? '@username_канала или -100xxxxxxxxxx'
      : 'ID чата (цифры)'

  const handleResolve = async () => {
    if (!manualInput.trim() || !token.trim()) return
    setResolving(true)
    setManualError(null)
    try {
      const endpoint =
        platform === 'telegram'
          ? '/api/bots/telegram/resolve-chat'
          : '/api/bots/max/resolve-chat'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), chatId: manualInput.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!data || data.ok !== true) {
        const msg = data?.error || 'Не удалось найти канал'
        setManualError(msg)
        return
      }
      const chat = data.chat as BotChat
      onSelect(chat)
      setShowManual(false)
      setManualInput('')
      toast.success(`Канал найден: ${chat.title}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Сеть недоступна'
      setManualError(msg)
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="grid gap-2">
      <Label className="flex items-center gap-1.5">
        <span
          className="inline-block size-3.5 rounded-full"
          style={{ backgroundColor: meta.hex }}
          aria-hidden
        />
        Канал / чат для публикации
      </Label>

      {!hasToken ? (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Введите токен бота выше, чтобы загрузить список каналов.
        </div>
      ) : loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      ) : channels && channels.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Бот не видит ни одного чата через обновления. Это нормально для
          каналов — Telegram отдаёт чаты только после недавней активности.
          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="ml-1 font-semibold underline underline-offset-2"
          >
            Введите @username канала вручную
          </button>
          .
        </div>
      ) : channels && channels.length > 0 ? (
        <ScrollArea className="max-h-56 rounded-md border">
          <div className="flex flex-col p-1">
            {channels.map((chat) => {
              const active = selectedId === chat.id
              const TypeIcon =
                chat.type === 'channel'
                  ? Megaphone
                  : chat.type === 'private' || chat.type === 'dialog'
                    ? Hash
                    : UsersRound
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => onSelect(chat)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                    active
                      ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/30'
                      : 'border-transparent hover:bg-accent',
                  )}
                >
                  <TypeIcon
                    className="size-4 shrink-0"
                    style={{ color: meta.hex }}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {chat.title}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {chat.username ? `@${chat.username} · ` : ''}
                      {chat.type === 'channel'
                        ? 'канал'
                        : chat.type === 'private' || chat.type === 'dialog'
                          ? 'личный чат'
                          : 'группа'}{' '}
                      · {chat.id}
                    </span>
                  </span>
                  {active ? (
                    <Check className="size-4 shrink-0 text-teal-600" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </ScrollArea>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Нажмите «Загрузить каналы» выше, чтобы увидеть список чатов и каналов,
          где бот присутствует.
        </div>
      )}

      {/* Manual @username / ID entry — always available as a fallback */}
      {hasToken && !showManual ? (
        <button
          type="button"
          onClick={() => setShowManual(true)}
          className="self-start text-[11px] font-medium text-teal-700 underline underline-offset-2 hover:text-teal-800"
        >
          {platform === 'telegram'
            ? 'Или введите @username канала вручную'
            : 'Или введите ID чата вручную'}
        </button>
      ) : null}

      {showManual ? (
        <div className="rounded-md border bg-muted/30 p-2.5">
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
            {platform === 'telegram'
              ? 'Введите @username публичного канала или числовой ID'
              : 'Введите ID чата MAX (бот должен быть участником)'}
          </div>
          <div className="flex gap-2">
            <Input
              value={manualInput}
              onChange={(e) => {
                setManualInput(e.target.value)
                setManualError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleResolve()
                }
              }}
              placeholder={placeholder}
              disabled={resolving}
              className="h-8 text-xs"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleResolve}
              disabled={resolving || !manualInput.trim()}
              className="h-8 gap-1 bg-teal-700 text-white hover:bg-teal-800"
            >
              {resolving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Search className="size-3.5" />
              )}
              Найти
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowManual(false)
                setManualInput('')
                setManualError(null)
              }}
              className="h-8"
            >
              Отмена
            </Button>
          </div>
          {manualError ? (
            <div className="mt-1.5 rounded border border-rose-200 bg-rose-50 p-1.5 text-[11px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
              {manualError}
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedId ? (
        <div className="text-[11px] text-muted-foreground">
          Выбран: <span className="font-medium text-foreground">{selectedTitle || selectedId}</span>{' '}
          <code className="font-mono">({selectedId})</code>
        </div>
      ) : null}
    </div>
  )
}

function AccountCard({
  account,
  onEdit,
  onDelete,
  onToggleActive,
  toggling,
}: {
  account: PlatformAccount
  onEdit: () => void
  onDelete: () => void
  onToggleActive: (next: boolean) => void
  toggling: boolean
}) {
  const meta = getMeta(account.platform)
  const [showToken, setShowToken] = React.useState(false)
  const Icon = meta ? ICON_MAP[meta.icon] ?? Send : Send
  const hex = meta?.hex ?? '#64748b'

  const extraPairs = React.useMemo<Array<[string, string]>>(() => {
    if (!account.extra) return []
    const parsed = safeParse<Record<string, unknown>>(account.extra, {})
    return Object.entries(parsed).map(([k, v]) => [
      k,
      typeof v === 'object' ? JSON.stringify(v) : String(v),
    ])
  }, [account.extra])

  return (
    <Card
      className="relative gap-4 overflow-hidden pt-0"
      style={{ borderTop: `3px solid ${hex}` }}
    >
      <CardHeader className="pt-5">
        <div className="flex items-start gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-md border"
            style={platformChipStyle(hex)}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{account.name}</CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {meta && (
                <Badge
                  variant="outline"
                  className="border-current/30"
                  style={{ color: hex }}
                >
                  {meta.label}
                </Badge>
              )}
              {!account.active && (
                <Badge variant="secondary" className="text-muted-foreground">
                  Отключено
                </Badge>
              )}
              {typeof account._count?.targets === 'number' && (
                <Badge variant="secondary" className="text-muted-foreground">
                  {account._count.targets} постов
                </Badge>
              )}
            </div>
          </div>
          <Switch
            checked={account.active}
            disabled={toggling}
            onCheckedChange={(checked) => onToggleActive(checked)}
            aria-label="Активность подключения"
          />
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 text-sm">
        <div className="grid gap-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Link2 className="size-3" />
            {meta?.targetLabel ?? 'Target ID'}
          </div>
          {/* Show the channel title (from extra.channelTitle) as the main label,
              with the raw ID as a secondary mono detail. */}
          {(() => {
            const extraInfo = safeParse<Record<string, unknown>>(account.extra, {})
            const title = typeof extraInfo.channelTitle === 'string' ? extraInfo.channelTitle : undefined
            const username = typeof extraInfo.channelUsername === 'string' ? extraInfo.channelUsername : undefined
            return (
              <div className="flex flex-col gap-0.5">
                {title ? (
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Megaphone className="size-3.5" style={{ color: hex }} />
                    <span className="truncate">{title}</span>
                    {username ? (
                      <span className="text-xs text-muted-foreground">
                        @{username}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="font-mono text-xs text-muted-foreground break-all">
                  {account.targetId || <span>—</span>}
                </div>
              </div>
            )
          })()}
        </div>

        <div className="grid gap-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <KeyRound className="size-3" />
            {meta?.tokenLabel ?? 'Token'}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs break-all">
              {showToken ? account.token : maskToken(account.token)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setShowToken((s) => !s)}
            >
              {showToken ? (
                <EyeOff className="size-3" />
              ) : (
                <Eye className="size-3" />
              )}
              {showToken ? 'Скрыть' : 'Показать'}
            </Button>
          </div>
        </div>

        {extraPairs.length > 0 && (
          <div className="grid gap-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Server className="size-3" />
              Доп. параметры (extra)
            </div>
            <div className="grid gap-1 rounded-md border bg-muted/30 p-2">
              {extraPairs.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-2 font-mono text-xs"
                >
                  <span className="text-muted-foreground">{k}</span>
                  <span className="truncate text-right break-all">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <CardContent className="flex items-center gap-2 pt-0">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="size-3.5" />
          Редактировать
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          Удалить
        </Button>
      </CardContent>
    </Card>
  )
}

export function PlatformsSection() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery<PlatformAccount[]>({
    queryKey: ['platforms'],
    queryFn: async () => {
      const res = await fetch('/api/platforms')
      if (!res.ok) throw new Error('Не удалось загрузить подключения')
      return (await res.json()) as PlatformAccount[]
    },
  })

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<PlatformAccount | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<PlatformAccount | null>(null)

  const createMutation = useMutation({
    mutationFn: async (values: AccountFormValues) => {
      const res = await fetch('/api/platforms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: values.platform,
          name: values.name,
          targetId: values.targetId || null,
          token: values.token,
          extra: values.extra || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Ошибка создания')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Площадка подключена')
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
      setDialogOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (vars: {
      id: string
      values: AccountFormValues
    }) => {
      const res = await fetch(`/api/platforms/${vars.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: vars.values.platform,
          name: vars.values.name,
          targetId: vars.values.targetId || null,
          token: vars.values.token,
          extra: vars.values.extra || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Ошибка обновления')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Подключение обновлено')
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
      setDialogOpen(false)
      setEditTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: async (vars: { id: string; active: boolean }) => {
      const res = await fetch(`/api/platforms/${vars.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: vars.active }),
      })
      if (!res.ok) throw new Error('Не удалось изменить статус')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/platforms/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Не удалось удалить')
      return res.json()
    },
    onSuccess: () => {
      toast.success('Подключение удалено')
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const submitting = createMutation.isPending || updateMutation.isPending

  function openCreate() {
    setEditTarget(null)
    setDialogOpen(true)
  }

  function openEdit(acc: PlatformAccount) {
    setEditTarget(acc)
    setDialogOpen(true)
  }

  function handleSubmit(values: AccountFormValues) {
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, values })
    } else {
      createMutation.mutate(values)
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="bg-teal-50/40 dark:bg-teal-950/10">
        <CardHeader>
          <CardTitle className="text-base">Подключение ботов</CardTitle>
          <CardDescription>
            Здесь хранятся токены ботов и ID чатов/каналов для каждой площадки.
            Токены хранятся локально в БД проекта.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          Всего подключений:{' '}
          <span className="font-medium text-foreground">{data?.length ?? 0}</span>
        </div>
        <Button
          onClick={openCreate}
          className="bg-teal-700 text-white hover:bg-teal-700/90"
        >
          <Plus className="size-4" />
          Подключить площадку
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Не удалось загрузить подключения.{' '}
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => refetch()}
            >
              Повторить
            </Button>
          </CardContent>
        </Card>
      ) : !data || data.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-muted p-3">
              <Plus className="size-5 text-muted-foreground" />
            </div>
            <div>
              <div className="font-medium">Нет подключённых площадок</div>
              <div className="text-sm text-muted-foreground">
                Подключите Telegram, MAX или ВКонтакте, чтобы начать публиковать посты.
              </div>
            </div>
            <Button
              onClick={openCreate}
              className="bg-teal-700 text-white hover:bg-teal-700/90"
            >
              <Plus className="size-4" />
              Подключить площадку
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onEdit={() => openEdit(acc)}
              onDelete={() => setDeleteTarget(acc)}
              onToggleActive={(next) =>
                toggleMutation.mutate({ id: acc.id, active: next })
              }
              toggling={toggleMutation.isPending}
            />
          ))}
        </div>
      )}

      <AccountFormDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setEditTarget(null)
        }}
        mode={editTarget ? 'edit' : 'create'}
        initial={editTarget}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить подключение?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name ? (
                <>
                  Подключение «{deleteTarget.name}» будет удалено без возможности
                  восстановления. Связанные запланированные посты также будут
                  затронуты.
                </>
              ) : (
                'Это действие нельзя отменить.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
              }}
            >
              {deleteMutation.isPending ? 'Удаление…' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default PlatformsSection
