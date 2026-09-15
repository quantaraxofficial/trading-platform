'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface Position {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  avgFillPrice: number;
  takeProfit?: number;
  stopLoss?: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  tradeValue: number;
  marketValue: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'Market' | 'Limit' | 'Stop';
  status: 'Working' | 'Filled' | 'Cancelled' | 'Rejected';
  quantity: number;
  price: number; // The limit/stop price
  takeProfit?: number;
  stopLoss?: number;
  createdAt: number;
}

export interface HistoryItem {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  action: 'Buy' | 'Sell' | 'Cancel' | 'TP' | 'SL';
  quantity: number;
  price: number;
  time: number;
}

interface PaperTradingContextType {
  balance: number;
  equity: number;
  realizedPnL: number;
  unrealizedPnL: number;
  positions: Position[];
  orders: Order[];
  history: HistoryItem[];
  currentPrice: number;
  setCurrentPrice: (price: number) => void;
  placeOrder: (order: Omit<Order, 'id' | 'status' | 'createdAt'>) => void;
  closePosition: (id: string) => void;
  cancelOrder: (id: string) => void;
}

const PaperTradingContext = createContext<PaperTradingContextType>({
  balance: 100000,
  equity: 100000,
  realizedPnL: 0,
  unrealizedPnL: 0,
  positions: [],
  orders: [],
  history: [],
  currentPrice: 0,
  setCurrentPrice: () => {},
  placeOrder: () => {},
  closePosition: () => {},
  cancelOrder: () => {},
});

export const PaperTradingProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [balance, setBalance] = useState(100000);
  const [realizedPnL, setRealizedPnL] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);

  // Load from Firebase
  useEffect(() => {
    if (!user?.uid) {
      // Reset if logged out
      setBalance(100000);
      setRealizedPnL(0);
      setPositions([]);
      setOrders([]);
      setHistory([]);
      return;
    }
    const loadPaperTrading = async () => {
      try {
        const docRef = doc(db, 'userPaperTrading', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.balance !== undefined) setBalance(data.balance);
          if (data.realizedPnL !== undefined) setRealizedPnL(data.realizedPnL);
          if (data.positions) setPositions(data.positions);
          if (data.orders) setOrders(data.orders);
          if (data.history) setHistory(data.history);
        }
      } catch (error) {
        console.error("Failed to load paper trading data:", error);
      }
    };
    loadPaperTrading();
  }, [user]);

  // Save to Firebase
  useEffect(() => {
    if (!user?.uid) return;
    const saveData = async () => {
      try {
        await setDoc(doc(db, 'userPaperTrading', user.uid), {
          balance, realizedPnL, positions, orders, history
        }, { merge: true });
      } catch (error) {
        console.error("Failed to save paper trading data:", error);
      }
    };
    // Debounce this in production, but for now we just save on change
    saveData();
  }, [balance, realizedPnL, positions, orders, history, user]);

  // Update PnL on price change
  useEffect(() => {
    if (currentPrice > 0) {
      setPositions(prev => prev.map(p => {
        const isLong = p.side === 'buy';
        const priceDiff = isLong ? currentPrice - p.avgFillPrice : p.avgFillPrice - currentPrice;
        const pnl = priceDiff * p.quantity;
        const pnlPct = (priceDiff / p.avgFillPrice) * 100;
        return {
          ...p,
          unrealizedPnL: pnl,
          unrealizedPnLPercent: pnlPct,
          marketValue: currentPrice * p.quantity,
        };
      }));

      // Check limit/stop orders
      orders.filter(o => o.status === 'Working').forEach(o => {
        let trigger = false;
        if (o.side === 'buy' && o.type === 'Limit' && currentPrice <= o.price) trigger = true;
        if (o.side === 'buy' && o.type === 'Stop' && currentPrice >= o.price) trigger = true;
        if (o.side === 'sell' && o.type === 'Limit' && currentPrice >= o.price) trigger = true;
        if (o.side === 'sell' && o.type === 'Stop' && currentPrice <= o.price) trigger = true;

        if (trigger) {
          executeOrder(o);
        }
      });
    }
  }, [currentPrice]);

  const executeOrder = (order: Order) => {
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'Filled' } : o));
    
    // Add history
    const historyItem: HistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      symbol: order.symbol,
      side: order.side,
      action: order.side === 'buy' ? 'Buy' : 'Sell',
      quantity: order.quantity,
      price: currentPrice,
      time: Date.now()
    };
    setHistory(prev => [historyItem, ...prev]);

    // Check if position already exists for symbol
    setPositions(prev => {
      const existingIdx = prev.findIndex(p => p.symbol === order.symbol);
      if (existingIdx >= 0) {
        const p = prev[existingIdx];
        // If same side, average up/down
        if (p.side === order.side) {
          const newQty = p.quantity + order.quantity;
          const newAvg = ((p.avgFillPrice * p.quantity) + (currentPrice * order.quantity)) / newQty;
          const newPositions = [...prev];
          newPositions[existingIdx] = { ...p, quantity: newQty, avgFillPrice: newAvg, tradeValue: newAvg * newQty };
          return newPositions;
        } else {
          // Opposite side: reduce or flip
          if (order.quantity < p.quantity) {
            // Partial close
            const realized = (p.side === 'buy' ? currentPrice - p.avgFillPrice : p.avgFillPrice - currentPrice) * order.quantity;
            setRealizedPnL(r => r + realized);
            setBalance(b => b + realized);
            const newPositions = [...prev];
            newPositions[existingIdx] = { ...p, quantity: p.quantity - order.quantity, tradeValue: p.avgFillPrice * (p.quantity - order.quantity) };
            return newPositions;
          } else if (order.quantity === p.quantity) {
            // Full close
            const realized = (p.side === 'buy' ? currentPrice - p.avgFillPrice : p.avgFillPrice - currentPrice) * order.quantity;
            setRealizedPnL(r => r + realized);
            setBalance(b => b + realized);
            return prev.filter(x => x.symbol !== order.symbol);
          } else {
            // Flip position
            const realized = (p.side === 'buy' ? currentPrice - p.avgFillPrice : p.avgFillPrice - currentPrice) * p.quantity;
            setRealizedPnL(r => r + realized);
            setBalance(b => b + realized);
            const remainingQty = order.quantity - p.quantity;
            const newPositions = [...prev];
            newPositions[existingIdx] = {
              id: Math.random().toString(36).substr(2, 9),
              symbol: order.symbol,
              side: order.side,
              quantity: remainingQty,
              avgFillPrice: currentPrice,
              takeProfit: order.takeProfit,
              stopLoss: order.stopLoss,
              unrealizedPnL: 0,
              unrealizedPnLPercent: 0,
              tradeValue: currentPrice * remainingQty,
              marketValue: currentPrice * remainingQty,
            };
            return newPositions;
          }
        }
      } else {
        // New position
        return [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          avgFillPrice: currentPrice,
          takeProfit: order.takeProfit,
          stopLoss: order.stopLoss,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          tradeValue: currentPrice * order.quantity,
          marketValue: currentPrice * order.quantity,
        }];
      }
    });
  };

  const placeOrder = (orderData: Omit<Order, 'id' | 'status' | 'createdAt'>) => {
    const order: Order = {
      ...orderData,
      id: Math.random().toString(36).substr(2, 9),
      status: orderData.type === 'Market' ? 'Filled' : 'Working',
      createdAt: Date.now()
    };
    
    if (orderData.type === 'Market') {
      executeOrder(order);
    } else {
      setOrders(prev => [order, ...prev]);
    }
  };

  const closePosition = (id: string) => {
    setPositions(prev => {
      const p = prev.find(x => x.id === id);
      if (p) {
        const realized = (p.side === 'buy' ? currentPrice - p.avgFillPrice : p.avgFillPrice - currentPrice) * p.quantity;
        setRealizedPnL(r => r + realized);
        setBalance(b => b + realized);
        
        setHistory(h => [{
          id: Math.random().toString(36).substr(2, 9),
          symbol: p.symbol,
          side: p.side === 'buy' ? 'sell' : 'buy',
          action: p.side === 'buy' ? 'Sell' : 'Buy',
          quantity: p.quantity,
          price: currentPrice,
          time: Date.now()
        }, ...h]);
      }
      return prev.filter(x => x.id !== id);
    });
  };

  const cancelOrder = (id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'Cancelled' } : o));
    const order = orders.find(o => o.id === id);
    if (order) {
      setHistory(h => [{
        id: Math.random().toString(36).substr(2, 9),
        symbol: order.symbol,
        side: order.side,
        action: 'Cancel',
        quantity: order.quantity,
        price: order.price,
        time: Date.now()
      }, ...h]);
    }
  };

  const unrealizedPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const equity = balance + unrealizedPnL;

  return (
    <PaperTradingContext.Provider value={{
      balance, equity, realizedPnL, unrealizedPnL, positions, orders, history,
      currentPrice, setCurrentPrice, placeOrder, closePosition, cancelOrder
    }}>
      {children}
    </PaperTradingContext.Provider>
  );
};

export const usePaperTrading = () => useContext(PaperTradingContext);
