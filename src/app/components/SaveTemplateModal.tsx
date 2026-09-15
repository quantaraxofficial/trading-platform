'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

interface SaveTemplateModalProps {
  onClose: (saved?: boolean) => void;
  theme?: string;
  settingsToSave?: any;
}

export default function SaveTemplateModal({ onClose, theme, settingsToSave }: SaveTemplateModalProps) {
  const [templateName, setTemplateName] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  const isDark = theme === 'dark';
  const bg = isDark ? '#1e222d' : '#ffffff';
  const text = isDark ? '#d1d4dc' : '#131722';
  const border = isDark ? '#2a2e39' : '#e0e3eb';

  const handleSave = async () => {
    if (!user) {
      router.push('/signin');
      return;
    }
    
    if (!templateName.trim()) return;

    setLoading(true);
    try {
      await fetch(`http://localhost:8000/api/users/templates/${user.uid}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: templateName,
          tool_type: 'chart_settings',
          settings: settingsToSave
        })
      });
      onClose(true);
    } catch (e) {
      console.error('Error saving template:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10005, backgroundColor: 'rgba(0,0,0,0.4)'
    }}>
      <div style={{
        backgroundColor: bg, color: text, border: `1px solid ${border}`, borderRadius: '8px',
        width: '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', padding: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Save template as</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: text, cursor: 'pointer' }}>
            <X size={20}/>
          </button>
        </div>
        
        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '13px', color: '#787b86', marginBottom: '8px' }}>Template name:</label>
          <input 
            type="text" 
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '6px', 
              border: `2px solid #2962ff`, // Highlighted blue border just like screenshot
              backgroundColor: 'transparent', color: text, outline: 'none',
              fontSize: '14px'
            }}
            autoFocus
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button onClick={onClose} style={{ 
            padding: '8px 20px', borderRadius: '6px', border: `1px solid ${border}`,
            background: 'transparent', color: text, cursor: 'pointer', fontSize: '14px'
          }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={loading || !templateName.trim()} style={{ 
            padding: '8px 20px', borderRadius: '6px', border: 'none',
            background: (!templateName.trim() || loading) ? (isDark ? '#2a2e39' : '#f0f3fa') : '#2962ff', 
            color: (!templateName.trim() || loading) ? '#787b86' : '#fff', 
            cursor: (!templateName.trim() || loading) ? 'not-allowed' : 'pointer', fontSize: '14px'
          }}>
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
