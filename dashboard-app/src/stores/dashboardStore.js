import { create } from 'zustand'
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

export const useDashboardStore = create((set, get) => ({
  // Data
  opportunities: [],
  balances: {},
  stats: {
    totalBalance: 0,
    profit: 0,
    profitPercent: 0,
    totalTrades: 0,
    winRate: 0,
  },
  metrics: {
    coinsMonitored: 0,
    opportunitiesCount: 0,
    topSpread: 0,
  },
  
  // Filters
  filters: {
    search: '',
    minSpread: 0,
    coin: '',
  },
  
  // UI State
  loading: false,
  error: null,
  lastUpdate: null,
  
  // Feature Toggles
  features: {
    positionSizing: false,
    multiTrade: false,
    feeOptimizer: false,
    flashDetector: false,
    riskManager: false,
    aiBalance: false,
    mlPredictor: false,
    autoTransfer: false,
  },

  // Actions
  fetchSnapshot: async () => {
    try {
      set({ loading: true, error: null })
      const { data } = await api.get('/snapshot')
      
      set({
        opportunities: data.spreads || [],
        metrics: {
          coinsMonitored: data.coins || 0,
          opportunitiesCount: data.spreads?.length || 0,
          topSpread: data.spreads?.[0]?.spread || 0,
        },
        lastUpdate: new Date(),
        loading: false,
      })
    } catch (error) {
      set({ 
        error: error.message, 
        loading: false 
      })
      console.error('Failed to fetch snapshot:', error)
    }
  },

  fetchBalances: async () => {
    try {
      // Backend may not expose balances yet; tolerate 404/errors
      const { data } = await api.get('/balances')
      set({ balances: data })
    } catch (error) {
      // Silently ignore to avoid static feel
      // Keep previous balances if any
    }
  },

  fetchStats: async () => {
    try {
      const { data } = await api.get('/paper/stats')
      set({ 
        stats: {
          totalBalance: data.balance || 0,
          profit: data.profit || 0,
          profitPercent: data.profitPercent || 0,
          totalTrades: data.totalTrades || 0,
          winRate: data.winRate || 0,
        }
      })
    } catch (error) {
      // no-op, keep last stats
    }
  },

  setFilter: (key, value) => {
    set(state => ({
      filters: { ...state.filters, [key]: value }
    }))
  },

  toggleFeature: async (featureName) => {
    const currentValue = get().features[featureName]
    
    try {
      await api.post(`/features/${featureName}/toggle`, {
        enabled: !currentValue
      })
      
      set(state => ({
        features: {
          ...state.features,
          [featureName]: !currentValue
        }
      }))
    } catch (error) {
      console.error(`Failed to toggle ${featureName}:`, error)
    }
  },

  executeTrade: async (opportunity) => {
    try {
      const { data } = await api.post('/execute', {
        coin: opportunity.coin,
        buyExchange: opportunity.buy.exchange,
        sellExchange: opportunity.sell.exchange,
        spread: opportunity.spread,
      })
      return data
    } catch (error) {
      console.error('Failed to execute trade:', error)
      throw error
    }
  },

  // Filtered opportunities
  getFilteredOpportunities: () => {
    const { opportunities, filters } = get()
    
    return opportunities.filter(opp => {
      // Search filter
      if (filters.search && !opp.coin.toLowerCase().includes(filters.search.toLowerCase())) {
        return false
      }
      
      // Min spread filter
      if (opp.spread < filters.minSpread) {
        return false
      }
      
      return true
    })
  },
}))
