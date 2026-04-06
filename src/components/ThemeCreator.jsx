import React, { useState } from 'react';

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function themeToVars(t) {
  return {
    '--board-light': t.lightSquare,
    '--board-dark': t.darkSquare,
    '--highlight-from': hexToRgba(t.highlightColor, 0.41),
    '--highlight-to': hexToRgba(t.highlightColor, 0.41),
    '--selected': hexToRgba(t.selectedColor, 0.5),
    '--legal-dot': hexToRgba(t.darkSquare, 0.35),
    '--legal-capture': hexToRgba(t.selectedColor, 0.3),
    '--check': hexToRgba(t.checkColor, 0.5),
    '--knight-aura': hexToRgba(t.auraColor, 0.12),
  };
}

export default function ThemeCreator({ onSave, onCancel }) {
  const [name, setName] = useState('My Theme');
  const [lightSquare, setLightSquare] = useState('#f0d9b5');
  const [darkSquare, setDarkSquare] = useState('#b58863');
  const [highlightColor, setHighlightColor] = useState('#9bc700');
  const [selectedColor, setSelectedColor] = useState('#14551e');
  const [auraColor, setAuraColor] = useState('#629924');
  const [checkColor, setCheckColor] = useState('#ff0000');

  const currentTheme = { name, lightSquare, darkSquare, highlightColor, selectedColor, auraColor, checkColor };
  const vars = themeToVars(currentTheme);

  const pickers = [
    { label: 'Light Square', value: lightSquare, set: setLightSquare },
    { label: 'Dark Square', value: darkSquare, set: setDarkSquare },
    { label: 'Highlight', value: highlightColor, set: setHighlightColor },
    { label: 'Selection', value: selectedColor, set: setSelectedColor },
    { label: 'Aura', value: auraColor, set: setAuraColor },
    { label: 'Check', value: checkColor, set: setCheckColor },
  ];

  return (
    <div className="theme-creator">
      <input
        className="select"
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Theme name"
        maxLength={32}
      />
      <div className="theme-creator__pickers">
        {pickers.map(({ label, value, set }) => (
          <label key={label} className="theme-creator__color-row">
            <span className="theme-creator__color-label">{label}</span>
            <input
              type="color"
              value={value}
              onChange={e => set(e.target.value)}
              className="theme-creator__color-input"
            />
          </label>
        ))}
      </div>
      <div className="theme-creator__preview">
        {Array.from({ length: 16 }, (_, i) => {
          const isLight = (Math.floor(i / 4) + (i % 4)) % 2 === 0;
          return (
            <div
              key={i}
              className="theme-creator__preview-sq"
              style={{ background: isLight ? vars['--board-light'] : vars['--board-dark'] }}
            />
          );
        })}
      </div>
      <div className="theme-creator__actions">
        <button className="btn btn-primary" onClick={() => onSave(currentTheme)}>
          Save
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
