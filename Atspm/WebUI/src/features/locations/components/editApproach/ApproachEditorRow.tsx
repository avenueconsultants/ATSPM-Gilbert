import { Box, ButtonBase, IconButton, Tooltip, Typography } from '@mui/material'
import { useEffect, useState } from 'react'

import { ConfigApproach } from '@/features/locations/components/editLocation/editLocationConfigHandler'
import { useLocationWizardStore } from '@/features/locations/components/LocationSetupWizard/locationSetupWizardStore'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SaveIcon from '@mui/icons-material/Save'
import WarningRoundedIcon from '@mui/icons-material/WarningRounded'

interface ApproachEditorRowProps {
  approach: ConfigApproach
  open: boolean
  handleApproachClick: () => void
  handleCopyApproach: () => void
  handleSaveApproach: () => void
  openDeleteApproachModal: () => void
}

const ApproachEditorRowHeader = ({
  open,
  approach,
  handleApproachClick,
  handleCopyApproach,
  handleSaveApproach,
  openDeleteApproachModal,
}: ApproachEditorRowProps) => {
  const { badApproaches } = useLocationWizardStore()
  const [isBadApproach, setIsBadApproach] = useState(false)

  useEffect(() => {
    setIsBadApproach(badApproaches.includes(approach.id))
  }, [badApproaches, approach.id])

  const backgroundColor = () => {
    if (isBadApproach) {
      return 'rgba(255, 165, 0, 0.3)'
    } else if (approach.isNew) {
      return 'rgba(100, 210, 100, 0.3)'
    } else {
      return 'white'
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 1,
        backgroundColor: backgroundColor(),
        position: 'relative', // Required for absolute positioning of the error icon
      }}
    >
      {/* Error Icon for Bad Approaches */}
      {isBadApproach && (
        <Tooltip title="Phase number not found in data">
          <WarningRoundedIcon
            sx={{
              position: 'absolute',
              left: '-30px',
              color: 'warning.light',
              fontSize: '1.5rem',
            }}
          />
        </Tooltip>
      )}

      <Tooltip title="Approach Details">
        <ButtonBase
          onClick={handleApproachClick}
          sx={{
            cursor: 'pointer',
            textTransform: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <Box display="flex" alignItems="center">
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                transition: 'transform 0.2s ease-in-out',
                transform: open ? 'rotateZ(-180deg)' : 'rotateZ(0deg)',
              }}
            >
              <ExpandMoreIcon />
            </Box>
            <Typography
              variant="h4"
              component={'h3'}
              sx={{ padding: 1, marginRight: 2 }}
            >
              {approach.description}
            </Typography>
            <Typography variant="h5" component="p">
              {approach.detectors.length}{' '}
              {approach.detectors.length === 1 ? 'Detector' : 'Detectors'}
            </Typography>
          </Box>
        </ButtonBase>
      </Tooltip>
      <Box display="flex" alignItems="center">
        <Tooltip title="Copy Approach">
          <IconButton aria-label="copy approach" onClick={handleCopyApproach}>
            <ContentCopyIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Save Approach">
          <IconButton
            aria-label="save approach"
            color="success"
            onClick={handleSaveApproach}
          >
            <SaveIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete Approach">
          <IconButton
            aria-label="delete approach"
            color="error"
            onClick={openDeleteApproachModal}
          >
            <DeleteIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  )
}

export default ApproachEditorRowHeader
