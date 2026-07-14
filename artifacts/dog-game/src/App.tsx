import React, { useState, useEffect } from 'react';
import DogScene from './DogScene';

const SCENE_W = 1280;
const SCENE_H = 720;

function App() {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      setScale(Math.min(window.innerWidth / SCENE_W, window.innerHeight / SCENE_H));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="w-full h-[100dvh] overflow-hidden flex items-center justify-center bg-black">
      <div
        style={{
          width:           SCENE_W,
          height:          SCENE_H,
          transform:       `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink:      0,
          position:        'relative',
        }}
      >
        <DogScene />
      </div>
    </div>
  );
}

export default App;
