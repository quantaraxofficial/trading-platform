const fs = require('fs');

const file = 'src/app/components/drawing/ui/SubBar.tsx';
let content = fs.readFileSync(file, 'utf8');

// Fix the missing closing div for the toolbar
// We just replace `<MoreMenu />` with `<MoreMenu />\n      </div>`
content = content.replace(/<MoreMenu \/>/g, '<MoreMenu />\n      </div>');

// Now we need to update the MoreMenu definition to include the visibility intervals logic.
// Let's replace the old MoreMenu string with the new one.
// We can just use a regex to replace the MoreMenu function definition from `const MoreMenu = () => (` up to `  const onStrokeWidthChange` (which we saw is right after).

const moreMenuRegex = /(const MoreMenu = \(\) => \([\s\S]*?\}\);)(\s*const onStrokeWidthChange)/;

const newMoreMenuComponent = `
  const [showVisibilityOrder, setShowVisibilityOrder] = useState(false);

  const MoreMenu = () => (
    <div style={{ position: 'relative' }}>
      <button className="tv-icon-btn" onClick={() => setShowDropdown(!showDropdown)} style={{ width: '34px', height: '34px', color: '#131722', borderRadius: '4px', border: 'none', background: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
        <MoreHorizontal size={18} strokeWidth={1.5} />
      </button>
      {showDropdown && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: '#ffffff', border: '1px solid #e0e3eb', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 100, padding: '4px 0', minWidth: '180px' }}>
          
          {/* Visual Order with Submenu */}
          <div 
            style={{ position: 'relative' }}
            onMouseEnter={() => setShowVisualOrder(true)}
            onMouseLeave={() => setShowVisualOrder(false)}
          >
            <button style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              Visual order
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            {showVisualOrder && (
              <div style={{ position: 'absolute', top: '0', right: '100%', marginRight: '4px', backgroundColor: '#ffffff', border: '1px solid #e0e3eb', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 101, padding: '4px 0', minWidth: '160px' }}>
                <button onClick={() => handleVisualOrder('front')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Bring to front</button>
                <button onClick={() => handleVisualOrder('back')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Send to back</button>
                <button onClick={() => handleVisualOrder('forward')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Bring forward</button>
                <button onClick={() => handleVisualOrder('backward')} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Send backward</button>
              </div>
            )}
          </div>

          {/* Visibility Submenu */}
          <div 
            style={{ position: 'relative' }}
            onMouseEnter={() => setShowVisibilityOrder(true)}
            onMouseLeave={() => setShowVisibilityOrder(false)}
          >
            <button style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
              Visibility on intervals
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            {showVisibilityOrder && (
              <div style={{ position: 'absolute', top: '0', right: '100%', marginRight: '4px', backgroundColor: '#ffffff', border: '1px solid #e0e3eb', borderRadius: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', zIndex: 101, padding: '4px 0', minWidth: '160px' }}>
                {['Seconds', 'Minutes', 'Hours', 'Days', 'Weeks', 'Months', 'Ranges'].map(interval => {
                  const key = interval.toLowerCase();
                  const isEnabled = selectedShape?.visibility?.[key]?.enabled ?? true;
                  return (
                    <button 
                      key={interval}
                      onClick={() => {
                        if (!selectedShapeId) return;
                        const currentVis = selectedShape?.visibility || {
                          ticks: { enabled: true, from: 1, to: 1000 },
                          seconds: { enabled: true, from: 1, to: 59 },
                          minutes: { enabled: true, from: 1, to: 59 },
                          hours: { enabled: true, from: 1, to: 24 },
                          days: { enabled: true, from: 1, to: 366 },
                          weeks: { enabled: true, from: 1, to: 52 },
                          months: { enabled: true, from: 1, to: 12 },
                          ranges: { enabled: true }
                        };
                        const newVis = { ...currentVis, [key]: { ...currentVis[key], enabled: !isEnabled } };
                        updateDrawing(selectedShapeId, { visibility: newVis });
                      }}
                      style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#131722', display: 'flex', alignItems: 'center', gap: '8px' }} 
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} 
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div style={{ width: '14px', height: '14px', border: '1px solid #b2b5be', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isEnabled ? '#2962ff' : 'transparent', borderColor: isEnabled ? '#2962ff' : '#b2b5be' }}>
                        {isEnabled && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      {interval}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          
          <div style={{ height: '1px', backgroundColor: '#f0f3fa', margin: '4px 0' }} />

          <button onClick={() => { handleClone(); setShowDropdown(false); }} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            Clone
            <span style={{ color: '#b2b5be', fontSize: '11px' }}>Ctrl + Drag</span>
          </button>
          <button onClick={() => setShowDropdown(false)} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
            Copy
            <span style={{ color: '#b2b5be', fontSize: '11px' }}>Ctrl + C</span>
          </button>
          
          <div style={{ height: '1px', backgroundColor: '#f0f3fa', margin: '4px 0' }} />
          
          <button onClick={handleHide} style={{ width: '100%', padding: '8px 16px', textAlign: 'left', background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#131722' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f3fa'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>Hide</button>
        </div>
      )}
    </div>
  );`;

content = content.replace(moreMenuRegex, newMoreMenuComponent + '$2');

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated SubBar.tsx with fix and visibility intervals.');
