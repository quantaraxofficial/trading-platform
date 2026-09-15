"use client";

import React, { useState } from "react";
import { ChevronDown, X, Trash2 } from "lucide-react";
import { usePaperTrading } from "@/context/PaperTradingContext";

export default function PaperTradingPanel({ theme, onClose }: { theme?: string, onClose?: () => void }) {
  const [activeTab, setActiveTab] = useState("Positions");
  const { balance, equity, unrealizedPnL, positions, orders, history, closePosition, cancelOrder } = usePaperTrading();

  const isDark = theme === 'dark';
  const bg = isDark ? '#1e222d' : '#ffffff';
  const text = isDark ? '#d1d4dc' : '#131722';
  const textMuted = isDark ? '#787b86' : '#787b86';
  const border = isDark ? '#2a2e39' : '#e0e3eb';

  const tabs = ['Positions', 'Orders', 'Order history', 'Balance history'];

  const formatMoney = (val: number) => val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const formatPrice = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", backgroundColor: bg, color: text }}>
      {/* Top Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: `1px solid ${border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "14px" }}>
            Paper Trading <span style={{ fontSize: "10px", color: textMuted }}>USD</span> <ChevronDown size={14} color={textMuted} />
          </div>
          
          <div style={{ display: "flex", gap: "8px", fontSize: "12px" }}>
            {tabs.map((tab) => (
              <div 
                key={tab} 
                onClick={() => setActiveTab(tab)}
                style={{ 
                  padding: "4px 12px", cursor: "pointer", 
                  backgroundColor: activeTab === tab ? text : 'transparent',
                  color: activeTab === tab ? bg : text,
                  borderRadius: "16px",
                  fontWeight: 500
                }}>
                {tab} 
                {tab === 'Positions' && positions.length > 0 && ` (${positions.length})`}
                {tab === 'Orders' && orders.filter(o => o.status === 'Working').length > 0 && ` (${orders.filter(o => o.status === 'Working').length})`}
              </div>
            ))}
          </div>
        </div>

        {/* Account Info */}
        <div style={{ display: "flex", alignItems: "center", gap: "24px", fontSize: "12px" }}>
          <div><span style={{ color: textMuted }}>Balance:</span> {formatMoney(balance)}</div>
          <div><span style={{ color: textMuted }}>Equity:</span> {formatMoney(equity)}</div>
          <div>
            <span style={{ color: textMuted }}>Open P&L:</span> 
            <span style={{ color: unrealizedPnL > 0 ? '#089981' : unrealizedPnL < 0 ? '#f23645' : text, fontWeight: 600, marginLeft: '4px' }}>
              {unrealizedPnL > 0 ? '+' : ''}{formatMoney(unrealizedPnL)}
            </span>
          </div>
          {onClose && <X size={16} style={{ cursor: 'pointer', color: textMuted }} onClick={onClose} />}
        </div>
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeTab === 'Positions' && (
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>
              <tr>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Symbol</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Side</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Quantity</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Avg fill price</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Take profit</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Stop loss</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Unrealized PnL</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: textMuted }}>No open positions</td></tr>
              ) : (
                positions.map(p => (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: '8px 16px', fontWeight: 600 }}>{p.symbol}</td>
                    <td style={{ padding: '8px 16px', color: p.side === 'buy' ? '#2962ff' : '#f23645' }}>{p.side === 'buy' ? 'Long' : 'Short'}</td>
                    <td style={{ padding: '8px 16px' }}>{p.quantity}</td>
                    <td style={{ padding: '8px 16px' }}>{formatPrice(p.avgFillPrice)}</td>
                    <td style={{ padding: '8px 16px', color: textMuted }}>{p.takeProfit || '-'}</td>
                    <td style={{ padding: '8px 16px', color: textMuted }}>{p.stopLoss || '-'}</td>
                    <td style={{ padding: '8px 16px', color: p.unrealizedPnL > 0 ? '#089981' : p.unrealizedPnL < 0 ? '#f23645' : text }}>
                      {p.unrealizedPnL > 0 ? '+' : ''}{p.unrealizedPnL.toFixed(2)} USD ({p.unrealizedPnLPercent.toFixed(2)}%)
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      <X size={14} style={{ cursor: 'pointer', color: textMuted }} onClick={() => closePosition(p.id)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'Orders' && (
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>
              <tr>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Symbol</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Side</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Type</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Quantity</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Price</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Status</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.filter(o => o.status === 'Working').length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: textMuted }}>No active orders</td></tr>
              ) : (
                orders.filter(o => o.status === 'Working').map(o => (
                  <tr key={o.id} style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: '8px 16px', fontWeight: 600 }}>{o.symbol}</td>
                    <td style={{ padding: '8px 16px', color: o.side === 'buy' ? '#089981' : '#f23645' }}>{o.side.toUpperCase()}</td>
                    <td style={{ padding: '8px 16px' }}>{o.type}</td>
                    <td style={{ padding: '8px 16px' }}>{o.quantity}</td>
                    <td style={{ padding: '8px 16px' }}>{formatPrice(o.price)}</td>
                    <td style={{ padding: '8px 16px', color: '#eab308' }}>{o.status}</td>
                    <td style={{ padding: '8px 16px' }}>
                      <Trash2 size={14} style={{ cursor: 'pointer', color: textMuted }} onClick={() => cancelOrder(o.id)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {activeTab === 'Order history' && (
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', textAlign: 'left' }}>
             <thead style={{ color: textMuted, borderBottom: `1px solid ${border}` }}>
              <tr>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Time</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Symbol</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Side</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Action</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Quantity</th>
                <th style={{ padding: '8px 16px', fontWeight: 400 }}>Price</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} style={{ borderBottom: `1px solid ${border}` }}>
                  <td style={{ padding: '8px 16px', color: textMuted }}>{new Date(h.time).toLocaleString()}</td>
                  <td style={{ padding: '8px 16px', fontWeight: 600 }}>{h.symbol}</td>
                  <td style={{ padding: '8px 16px', color: h.side === 'buy' ? '#089981' : '#f23645' }}>{h.side.toUpperCase()}</td>
                  <td style={{ padding: '8px 16px' }}>{h.action}</td>
                  <td style={{ padding: '8px 16px' }}>{h.quantity}</td>
                  <td style={{ padding: '8px 16px' }}>{formatPrice(h.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'Balance history' && (
          <div style={{ padding: '24px', textAlign: 'center', color: textMuted, fontSize: '13px' }}>
            Balance History not implemented
          </div>
        )}
      </div>
    </div>
  );
}
