import { useEffect, useState } from 'react'
import { useDashboardStore } from '../stores/dashboardStore'

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const [socket, setSocket] = useState(null)

  useEffect(() => {
    // Backend uses native 'ws' WebSocketServer, so use the browser WebSocket API
    let ws = new WebSocket('ws://localhost:8080')

    const handleOpen = () => {
      console.log('✅ WebSocket connected')
      setConnected(true)
    }

    const handleClose = () => {
      console.log('❌ WebSocket disconnected')
      setConnected(false)
      // Simple reconnect with backoff
      setTimeout(() => {
        ws = new WebSocket('ws://localhost:8080')
        bindEvents()
      }, 1000)
    }

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        useDashboardStore.setState({
          opportunities: data.spreads || [],
          metrics: {
            coinsMonitored: data.totalCoins || data.coins || 0,
            opportunitiesCount: data.spreads?.length || 0,
            topSpread: (data.spreads?.[0]?.netSpread ?? data.spreads?.[0]?.spread ?? 0),
          },
          lastUpdate: new Date(),
        })
      } catch (e) {
        console.error('Failed to parse WS message', e)
      }
    }

    const handleError = (err) => {
      console.error('WebSocket error:', err)
    }

    const bindEvents = () => {
      ws.addEventListener('open', handleOpen)
      ws.addEventListener('close', handleClose)
      ws.addEventListener('message', handleMessage)
      ws.addEventListener('error', handleError)
    }

    bindEvents()
    setSocket(ws)

    return () => {
      if (ws) {
        ws.removeEventListener('open', handleOpen)
        ws.removeEventListener('close', handleClose)
        ws.removeEventListener('message', handleMessage)
        ws.removeEventListener('error', handleError)
        try { ws.close() } catch (e) {}
      }
    }
  }, [])

  return { connected, socket }
}
