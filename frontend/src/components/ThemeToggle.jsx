import React from 'react';
import './ThemeToggle.css';

export default function ThemeToggle({ theme, toggleTheme }) {
  const isDark = theme === 'dark';

  return (
    <div className="scenery-toggle-wrapper">
      <input 
        type="checkbox" 
        id="scenery-toggle" 
        className="scenery-checkbox" 
        checked={isDark} 
        onChange={toggleTheme} 
      />
      <label htmlFor="scenery-toggle" className="scenery-label">
        <div className="scenery-background">
          <div className="stars">
            <div className="star star-1"></div>
            <div className="star star-2"></div>
            <div className="star star-3"></div>
            <div className="star star-4"></div>
            <div className="star star-5"></div>
          </div>
          <div className="clouds">
            <div className="cloud cloud-1"></div>
            <div className="cloud cloud-2"></div>
          </div>
          <div className="mountains">
            <div className="mountain mountain-1"></div>
            <div className="mountain mountain-2"></div>
          </div>
          <div className="grass"></div>
        </div>
        <div className="scenery-thumb">
          <div className="crater crater-1"></div>
          <div className="crater crater-2"></div>
          <div className="crater crater-3"></div>
        </div>
      </label>
    </div>
  );
}
