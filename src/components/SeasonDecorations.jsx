import React, { useMemo } from 'react';

const getSeason = (date = new Date()) => {
  const month = date.getMonth();
  if (month === 11 || month <= 1) return 'winter';
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  return 'autumn';
};

const DECORATION_MAP = {
  winter: { icon: '❄', count: 16, label: 'Winter' },
  spring: { icon: '✿', count: 14, label: 'Spring' },
  summer: { icon: '✦', count: 12, label: 'Summer' },
  autumn: { icon: '❋', count: 14, label: 'Autumn' },
};

export default function SeasonDecorations() {
  const season = getSeason();
  const config = DECORATION_MAP[season];
  const items = useMemo(
    () => Array.from({ length: config.count }, (_, index) => ({
      id: `${season}-${index}`,
      left: `${(index * 97) % 100}%`,
      delay: `${(index % 7) * 0.8}s`,
      duration: `${8 + (index % 5) * 1.4}s`,
      scale: 0.7 + (index % 4) * 0.14,
      drift: `${((index % 5) - 2) * 22}px`,
    })),
    [config.count, season]
  );

  return (
    <div className={`season-decor season-decor--${season}`} aria-hidden="true" data-season={config.label}>
      {items.map((item) => (
        <span
          key={item.id}
          className="season-decor__item"
          style={{
            left: item.left,
            animationDelay: item.delay,
            animationDuration: item.duration,
            '--season-scale': item.scale,
            '--season-drift': item.drift,
          }}
        >
          {config.icon}
        </span>
      ))}
    </div>
  );
}
