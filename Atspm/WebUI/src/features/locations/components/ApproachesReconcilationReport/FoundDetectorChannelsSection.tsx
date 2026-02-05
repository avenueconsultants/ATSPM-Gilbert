import { useLocationStore } from '@/features/locations/components/editLocation/locationStore'
import { useNotificationStore } from '@/stores/notifications'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import {
  Button,
  Menu,
  MenuItem,
  Paper,
  Typography,
  useTheme,
} from '@mui/material'
import React, { useMemo, useState } from 'react'
import DiscrepancyRow, { DiscrepancyItem } from './DiscrepancyRow'
import DiscrepancySectionCard from './DiscrepancySectionCard'
import type { ItemStatus } from './useDiscrepancyStatuses'

export default function FoundDetectorChannelsSection({
  items,
}: {
  items: DiscrepancyItem[]
}) {
  const theme = useTheme()
  const { addNotification } = useNotificationStore()
  const { approaches, addDetector } = useLocationStore()

  const [availableItems, setAvailableItems] = useState<DiscrepancyItem[]>(items)
  const [itemStatuses, setItemStatuses] = useState<Record<string, ItemStatus>>(
    {}
  )
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)

  const toggle = (key: string) => setSelected((p) => ({ ...p, [key]: !p[key] }))
  const clear = () => setSelected({})

  const selectedItems = useMemo(
    () => availableItems.filter((it) => !!selected[it.id.toString()]),
    [availableItems, selected]
  )

  const selectedCount = selectedItems.length

  const onOpenMenu = (e: React.MouseEvent<HTMLButtonElement>) =>
    setAnchorEl(e.currentTarget)
  const onCloseMenu = () => setAnchorEl(null)

  const addSelectedToApproach = (approachId: number) => {
    if (!selectedItems.length) return

    const sortedItems = selectedItems.slice().sort((a, b) => {
      const an = Number(a.label)
      const bn = Number(b.label)
      if (Number.isFinite(an) && Number.isFinite(bn)) return bn - an
      return a.label
        .toString()
        .localeCompare(b.label.toString(), undefined, { numeric: true })
    })

    try {
      const channelsAdded: number[] = []

      for (const it of sortedItems) {
        const channel = Number(it.label)
        if (!Number.isFinite(channel)) continue
        addDetector(approachId, channel)
        channelsAdded.push(channel)
      }

      if (channelsAdded.length) {
        setAvailableItems((prev) =>
          prev.filter((it) => !channelsAdded.includes(Number(it.label)))
        )
        setItemStatuses((prev) => {
          const next = { ...prev }
          for (const it of sortedItems) next[it.id.toString()] = 'added'
          return next
        })
      }

      addNotification({
        title: `Added ${selectedItems.length} detector(s)`,
        type: 'success',
      })
      clear()
    } catch (err) {
      console.error(err)
      addNotification({ title: 'Error adding detectors', type: 'error' })
    } finally {
      onCloseMenu()
    }
  }

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, backgroundColor: theme.palette.grey[50] }}
    >
      <DiscrepancySectionCard
        title="Detector Channels"
        actions={
          <>
            {selectedCount > 0 ? (
              <Typography
                variant="body2"
                sx={{
                  mr: 1,
                  color: theme.palette.text.secondary,
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedCount} selected
              </Typography>
            ) : null}

            <Button
              size="small"
              variant="outlined"
              disabled={selectedCount === 0 || approaches.length === 0}
              onClick={onOpenMenu}
              endIcon={<KeyboardArrowDownIcon />}
              sx={{ height: 28 }}
            >
              Add selected to…
            </Button>

            <Menu anchorEl={anchorEl} open={open} onClose={onCloseMenu}>
              {approaches.map((a) => (
                <MenuItem
                  key={a.id}
                  onClick={() => addSelectedToApproach(a.id)}
                >
                  {a.description || a.id}
                </MenuItem>
              ))}
            </Menu>

            <Button
              size="small"
              variant="text"
              disabled={selectedCount === 0}
              onClick={clear}
              sx={{ height: 28 }}
            >
              Clear
            </Button>
          </>
        }
      >
        <DiscrepancyRow
          items={availableItems}
          itemStatuses={itemStatuses}
          isSelected={(it) => !!selected[it.id.toString()]}
          onToggleSelected={(it) => toggle(it.id.toString())}
          buttonWidth={60}
        />
      </DiscrepancySectionCard>
    </Paper>
  )
}
