import dynamic from 'next/dynamic'

const DriveApp = dynamic(() => import('@/App'), { ssr: false })

export default function CatchAllPage() {
  return <DriveApp />
}
