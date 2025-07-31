// Version 1.0.3
import "./firebase"; 
import { Application, Assets, Ticker } from 'pixi.js';

async function bootstrap() {
  const container = document.getElementById('game-container');
  if (!container) {
    throw new Error('Game container element not found');
  }

  if (/Mobi/.test(navigator.userAgent)) {
    Ticker.system.maxFPS = 30;
  }

  // 2) Create the app and await init as you had it:
  const app = new Application();
  await app.init({
    resizeTo: container,
    backgroundColor: 0x000000,
    antialias: false,
    autoDensity: false,
    resolution: 1,
  });

  // 3) Now the view & renderer are guaranteed to exist:
  container.appendChild(app.view);

  // Load assets
  Assets.addBundle('game', {
    // splash assets
    splashBackground: '/assets/sprites/splash/background.png',
    rizzzLogo: '/assets/sprites/splash/rizzzLogo.json',

    // menu assets
    wormholeRushIcon: '/assets/sprites/buttons/wormholeRushIcon.png',
    avoidTheRoidIcon: '/assets/sprites/buttons/avoidTheRoidIcon.png',

    cosmoClimbIcon: '/assets/sprites/buttons/cosmoClimbIcon.png',

    // wormhole rush assets
    wormholeBackground: '/assets/sprites/visuals/background.png',
    asteroids: '/assets/sprites/visuals/asteroids.png',
    wormholeRushVisuals: '/assets/sprites/visuals/wormholeRushVisuals.json',
    hearts: '/assets/sprites/visuals/hearts.json',
    alien: '/assets/sprites/visuals/alien.png',
    shield: '/assets/sprites/visuals/shield.png',

    // avoid the roid assets
    coinShine: '/assets/sprites/visuals/coinShine.json',
    star: '/assets/sprites/visuals/star.png',
    aliens: '/assets/sprites/visuals/alienPlayIcons.json',
    avoidTheRoidBackground: '/assets/sprites/visuals/alienBackground.png',

    // cosmo climb assets
    cosmoClimbBackground: '/assets/sprites/visuals/cosmoClimbBackground.png',
    cosmoClimbVisuals: '/assets/sprites/visuals/cosmoClimbVisuals.json',
  });
  await Assets.loadBundle('game');
  
  // Import scenes
  const { SceneManager } = await import('./scenes/SceneManager');
  const { CosmoClimbScene } = await import('./scenes/CosmoClimb');
  
  const sceneManager = new SceneManager(app);
  const difficulties: ('easy'|'medium'|'hard')[] = ['easy','medium','hard'];
  let currentRound = 0;

  function showCosmoClimb() {
    const play = new CosmoClimbScene(app);
    play.onGameOver = () => {
      showCosmoClimb();
    };
    sceneManager.changeScene(play);
  }

  showCosmoClimb();
}

bootstrap();
