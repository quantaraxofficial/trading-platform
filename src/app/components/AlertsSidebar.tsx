"use client";

import React from "react";
import { Plus, MoreHorizontal, Settings, Clock, CheckCircle2, Play, Pause, Trash2 } from "lucide-react";
import { useAlerts, Alert } from "@/context/AlertsContext";

export default function AlertsSidebar() {
  const { alerts, removeAlert } = useAlerts();

  const activeAlerts = alerts.filter(a => a.status === 'active');
  const pastAlerts = alerts.filter(a => a.status !== 'active');

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--tv-color-border)" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, letterSpacing: "-0.2px" }}>Alerts</h3>
        <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
          <button className="tv-icon-btn" style={{ width: "24px", height: "24px" }}><Plus size={16} strokeWidth={1.5} /></button>
          <button className="tv-icon-btn" style={{ width: "24px", height: "24px" }}><Settings size={16} strokeWidth={1.5} /></button>
          <button className="tv-icon-btn" style={{ width: "24px", height: "24px" }}><MoreHorizontal size={16} strokeWidth={1.5} /></button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        
        {/* Active Alerts */}
        <div style={{ padding: "8px 12px 4px", fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", letterSpacing: "0.3px" }}>
          ACTIVE ({activeAlerts.length})
        </div>
        {activeAlerts.length === 0 ? (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--tv-color-text-muted)", fontSize: "13px" }}>
            No active alerts
          </div>
        ) : (
          activeAlerts.map(alert => (
            <div key={alert.id} style={{ 
              padding: "8px 12px", borderBottom: "1px solid var(--tv-color-border)", 
              display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px",
              cursor: "pointer", position: "relative"
            }}
            className="hover-bg-subtle"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{alert.message}</span>
                <div style={{ display: "flex", gap: "4px", color: "var(--tv-color-text-muted)" }}>
                  <Pause size={14} style={{ cursor: "pointer" }} />
                  <Settings size={14} style={{ cursor: "pointer" }} />
                  <Trash2 size={14} style={{ cursor: "pointer" }} onClick={() => removeAlert(alert.id)} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--tv-color-text-muted)" }}>
                <Clock size={12} /> Active · Created {formatTime(alert.createdAt)}
              </div>
            </div>
          ))
        )}

        {/* Triggered Alerts Log */}
        <div style={{ padding: "16px 12px 4px", fontSize: "11px", fontWeight: 600, color: "var(--tv-color-text-muted)", letterSpacing: "0.3px" }}>
          ALERTS LOG ({pastAlerts.length})
        </div>
        {pastAlerts.length === 0 ? (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--tv-color-text-muted)", fontSize: "13px" }}>
            No alerts log
          </div>
        ) : (
          pastAlerts.map(alert => (
            <div key={alert.id} style={{ 
              padding: "8px 12px", borderBottom: "1px solid var(--tv-color-border)", 
              display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px",
              color: "var(--tv-color-text-muted)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: "var(--tv-color-text)" }}>{alert.message}</span>
                <Trash2 size={14} style={{ cursor: "pointer" }} onClick={() => removeAlert(alert.id)} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <CheckCircle2 size={12} color="#089981" /> Triggered · {formatTime(alert.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
