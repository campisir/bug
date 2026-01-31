import { useState } from 'react';
import { useGameLogStore, type LogCategory } from '../store/gameLogStore';
import '../styles/GameLog.css';

interface GameLogProps {
  onClose: () => void;
}

const CATEGORY_LABELS: Record<LogCategory, string> = {
  moves: 'Moves',
  stalls: 'Stalls (Enter/Exit)',
  stall_details: 'Stall Evaluation Details',
  requests: 'Partner Requests',
  captures: 'Captures',
  game_events: 'Game Events',
  chat: 'Chat Messages',
};

export function GameLog({ onClose }: GameLogProps) {
  const formatLog = useGameLogStore((state) => state.formatLog);
  
  const [selectedCategories, setSelectedCategories] = useState<LogCategory[]>([
    'moves',
    'stalls',
    'game_events',
  ]);

  const toggleCategory = (category: LogCategory) => {
    setSelectedCategories((prev) => {
      if (prev.includes(category)) {
        return prev.filter((c) => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const selectAll = () => {
    setSelectedCategories(Object.keys(CATEGORY_LABELS) as LogCategory[]);
  };

  const deselectAll = () => {
    setSelectedCategories([]);
  };

  const logText = formatLog(selectedCategories);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(logText);
  };

  return (
    <div className="game-log-overlay">
      <div className="game-log-modal">
        <div className="game-log-header">
          <h2>Game Log</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <div className="game-log-content">
          <div className="category-selector">
            <div className="category-header">
              <h3>Log Categories</h3>
              <div className="category-actions">
                <button onClick={selectAll} className="select-btn">Select All</button>
                <button onClick={deselectAll} className="select-btn">Deselect All</button>
              </div>
            </div>
            <div className="category-list">
              {(Object.keys(CATEGORY_LABELS) as LogCategory[]).map((category) => (
                <label key={category} className="category-item">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category)}
                    onChange={() => toggleCategory(category)}
                  />
                  <span>{CATEGORY_LABELS[category]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="log-display">
            <div className="log-actions">
              <button onClick={copyToClipboard} className="copy-btn">
                Copy to Clipboard
              </button>
              <span className="log-count">
                {logText.split('\n').filter(l => l.trim()).length} entries
              </span>
            </div>
            <textarea
              className="log-textarea"
              value={logText}
              readOnly
              placeholder="Select categories to view log..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
