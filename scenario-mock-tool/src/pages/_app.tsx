import { createTheme, CssBaseline, ThemeProvider, Typography, Box } from '@mui/material'
import Head from 'next/head'
import type { AppProps } from 'next/app'
const theme = createTheme()
export default function App({ Component, pageProps }: AppProps) {
  return <ThemeProvider theme={theme}>
    <Head><title>Scenario mock tool</title></Head>
    <CssBaseline />
    <Box component="header" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}><Typography variant="h5">Scenario mock tool</Typography></Box>
    <Component {...pageProps} />
  </ThemeProvider>
}
