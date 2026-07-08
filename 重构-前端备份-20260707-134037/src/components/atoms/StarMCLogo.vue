<template>
  <div class="starmc-logo-container">
    <div class="pixel-icon">
      <div class="pixel-star"></div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'StarMCLogo',
};
</script>

<style scoped>
.starmc-logo-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
  padding: 5px;
}

.pixel-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

/* Pure CSS Pixel Art Star */
.pixel-star {
  width: 4px;
  height: 4px;
  background-color: #FFFFFF; /* Center Shine */
  box-shadow: 
    /* Inner Cross (Gold) */
    0 -4px 0 0 #FFAA00,
    0 4px 0 0 #FFAA00,
    -4px 0 0 0 #FFAA00,
    4px 0 0 0 #FFAA00,
    
    /* Outline (Black) */
    0 -8px 0 0 #000,      /* Top Tip */
    0 8px 0 0 #000,       /* Bottom Tip */
    -8px 0 0 0 #000,      /* Left Tip */
    8px 0 0 0 #000,       /* Right Tip */
    
    /* Corner Outlines */
    -4px -4px 0 0 #000,
    4px -4px 0 0 #000,
    -4px 4px 0 0 #000,
    4px 4px 0 0 #000;
    
  margin: 0;
  position: relative;
  transform: scale(1);
  transition: transform 0.2s ease-in-out;
}

/* Automatic complex animation */
.pixel-star {
  width: 4px;
  height: 4px;
  background-color: #FFFFFF; /* Center Shine */
  margin: 0;
  position: relative;
  transform: scale(1);
  will-change: transform, box-shadow, filter;
  animation: pixel-complex-morph 8s infinite cubic-bezier(0.68, -0.55, 0.27, 1.55);
}

.pixel-star::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: transparent;
  z-index: -1;
  animation: star-pulse 8s infinite ease-in-out;
}

/* Particle Effects Layer */
.pixel-star::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2px;
  height: 2px;
  background: transparent;
  z-index: -2;
  transform: translate(-50%, -50%);
  animation: particle-burst 8s infinite linear;
}

@keyframes pixel-complex-morph {
  0%, 100% {
    /* Gold State */
    background-color: #FFFFFF;
    transform: scale(1) rotate(0deg);
    filter: drop-shadow(0 0 2px rgba(255, 170, 0, 0.5));
    box-shadow: 
      0 -4px 0 0 #FFAA00, 0 4px 0 0 #FFAA00, -4px 0 0 0 #FFAA00, 4px 0 0 0 #FFAA00,
      0 -8px 0 0 #000, 0 8px 0 0 #000, -8px 0 0 0 #000, 8px 0 0 0 #000,
      -4px -4px 0 0 #000, 4px -4px 0 0 #000, -4px 4px 0 0 #000, 4px 4px 0 0 #000;
  }
  15% {
    /* Diamond/Ice - Expansion */
    background-color: #E0FFFF;
    transform: scale(1.2) rotate(45deg);
    filter: drop-shadow(0 0 4px rgba(0, 255, 255, 0.6));
    box-shadow: 
      0 -6px 0 0 #00FFFF, 0 6px 0 0 #00FFFF, -6px 0 0 0 #00FFFF, 6px 0 0 0 #00FFFF,
      0 -10px 0 0 #0088FF, 0 10px 0 0 #0088FF, -10px 0 0 0 #0088FF, 10px 0 0 0 #0088FF,
      -8px -8px 0 0 rgba(0, 136, 255, 0.5), 8px -8px 0 0 rgba(0, 136, 255, 0.5), -8px 8px 0 0 rgba(0, 136, 255, 0.5), 8px 8px 0 0 rgba(0, 136, 255, 0.5);
  }
  30% {
    /* Emerald/Creeper - Glitch & Compact */
    background-color: #DDFFDD;
    transform: scale(0.8) rotate(90deg);
    filter: drop-shadow(0 0 3px rgba(0, 255, 0, 0.5));
    box-shadow: 
      /* Creeper Face-ish abstract */
      -2px -4px 0 0 #00AA00, 2px -4px 0 0 #00AA00,
      0 0 0 0 #00AA00,
      -2px 2px 0 0 #00AA00, 2px 2px 0 0 #00AA00, 0 4px 0 0 #00AA00,
      /* Outer noise */
      -6px -6px 0 0 #004400, 6px 6px 0 0 #004400, -6px 6px 0 0 #004400, 6px -6px 0 0 #004400;
  }
  45% {
    /* Void/End - Dispersion */
    background-color: #E0AAFF;
    transform: scale(1.1) rotate(180deg);
    filter: drop-shadow(0 0 5px rgba(170, 0, 255, 0.7));
    box-shadow: 
      /* Core X */
      -4px -4px 0 0 #AA00FF, 4px 4px 0 0 #AA00FF, 4px -4px 0 0 #AA00FF, -4px 4px 0 0 #AA00FF,
      /* Drifting Particles */
      0 -12px 0 0 #220044, 0 12px 0 0 #220044, -12px 0 0 0 #220044, 12px 0 0 0 #220044,
      -10px 0 0 0 #440088, 10px 0 0 0 #440088,
      -14px -8px 0 0 #220044, 14px 8px 0 0 #220044;
  }
  60% {
    /* Redstone/Nether - Unstable */
    background-color: #FFDDDD;
    transform: scale(1.05) rotate(225deg) skew(5deg);
    filter: drop-shadow(0 0 4px rgba(255, 0, 0, 0.6));
    box-shadow: 
      /* Pulsing Core */
      0 -3px 0 0 #FF0000, 0 3px 0 0 #FF0000, -3px 0 0 0 #FF0000, 3px 0 0 0 #FF0000,
      /* Jagged Edges */
      0 -8px 0 0 #880000, 0 8px 0 0 #880000, -8px 0 0 0 #880000, 8px 0 0 0 #880000,
      /* Sparks */
      -6px -6px 0 0 #FF8800, 6px -6px 0 0 #FF8800, -6px 6px 0 0 #FF8800, 6px 6px 0 0 #FF8800;
  }
  75% {
    /* Lapis/Enchanting - Swirl */
    background-color: #CCCCFF;
    transform: scale(0.9) rotate(300deg);
    filter: drop-shadow(0 0 3px rgba(0, 0, 255, 0.5));
    box-shadow: 
      /* Spiral hint */
      0 -5px 0 0 #0000AA, 3px 3px 0 0 #0000AA, -3px 5px 0 0 #0000AA, -5px -2px 0 0 #0000AA,
      /* Magic particles */
      4px -6px 0 0 #4444FF, -6px 4px 0 0 #4444FF,
      8px 0 0 0 rgba(68, 68, 255, 0.5), -8px 0 0 0 rgba(68, 68, 255, 0.5);
  }
}

@keyframes star-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 170, 0, 0); }
  15% { box-shadow: 0 0 15px 8px rgba(0, 255, 255, 0.4); }
  30% { box-shadow: 0 0 10px 5px rgba(0, 255, 0, 0.3); }
  45% { box-shadow: 0 0 20px 10px rgba(170, 0, 255, 0.3); }
  60% { box-shadow: 0 0 12px 6px rgba(255, 0, 0, 0.5); }
  75% { box-shadow: 0 0 15px 5px rgba(0, 0, 255, 0.4); }
}

@keyframes particle-burst {
  0%, 100% { box-shadow: none; }
  15% { 
    box-shadow: 
      15px -15px 0 -1px rgba(255, 255, 255, 0.5), 
      -15px 15px 0 -1px rgba(255, 255, 255, 0.5),
      -15px -15px 0 -1px rgba(255, 255, 255, 0.5),
      15px 15px 0 -1px rgba(255, 255, 255, 0.5);
  }
  45% {
    box-shadow: 
      20px 0 0 -1px rgba(170, 0, 255, 0.6), 
      -20px 0 0 -1px rgba(170, 0, 255, 0.6),
      0 20px 0 -1px rgba(170, 0, 255, 0.6),
      0 -20px 0 -1px rgba(170, 0, 255, 0.6);
  }
  60% {
    box-shadow: 
      10px -20px 0 -0.5px #FF8800, 
      -10px -15px 0 -0.5px #FF8800,
      0 -25px 0 -0.5px #FF8800;
  }
  75% {
    box-shadow: 
      12px 12px 0 -1px #4444FF, 
      -8px 16px 0 -1px #4444FF,
      4px 20px 0 -1px #4444FF;
  }
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}
</style>
