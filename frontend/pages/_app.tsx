import type { AppProps } from 'next/app'
import '@/style.css'

export default function NineDriveApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
