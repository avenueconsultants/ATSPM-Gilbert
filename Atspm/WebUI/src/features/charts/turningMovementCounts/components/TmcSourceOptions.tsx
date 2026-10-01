import type { Location } from '@/api/config'
import {
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
} from '@mui/material'
import { useEffect } from 'react'
import { useTmcSources } from '../useTmcSources'

export function TmcSourceOptions({
  location,
  source = 'atspm',
  deviceIds = [],
  decoder,
  onChange,
}: {
  location?: Location | null
  source?: string
  deviceIds?: number[] | string
  decoder?: string
  onChange: (source: string, deviceIds: number[], decoder?: string) => void
}) {
  const { sources, loading } = useTmcSources(location)
  const ids = (Array.isArray(deviceIds) ? deviceIds : deviceIds.split(','))
    .map(Number)
    .sort((a, b) => a - b)
  const requested = source === 'devices' ? `devices:${decoder ?? ''}:${ids.join(',')}` : 'atspm'
  const matches = sources.filter((s) => source === 'devices'
    ? s.key !== 'atspm' && s.deviceIds.join(',') === ids.join(',') && (!decoder || s.decoder === decoder)
    : s.key === 'atspm')
  const selected = matches.length === 1 ? matches[0] : undefined
  useEffect(() => {
    if (!loading && !selected) onChange('atspm', [])
  }, [loading, requested, selected?.key, location?.id])
  if (sources.length <= 1) return null
  return (
    <FormControl>
      <FormLabel id="tmc-count-source">Count source</FormLabel>
      <RadioGroup
        aria-labelledby="tmc-count-source"
        value={selected?.key ?? 'atspm'}
        onChange={(_, key) => {
          const choice = sources.find((s) => s.key === key)!
          onChange(
            choice.key === 'atspm' ? 'atspm' : 'devices',
            choice.deviceIds,
            choice.decoder
          )
        }}
      >
        {sources.map((s) => (
          <FormControlLabel
            key={s.key}
            value={s.key}
            control={<Radio />}
            label={s.name}
          />
        ))}
      </RadioGroup>
    </FormControl>
  )
}
