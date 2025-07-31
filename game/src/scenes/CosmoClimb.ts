import { Application, Container, Sprite, Text, Ticker, Graphics, TilingSprite, Texture, Spritesheet, Assets } from 'pixi.js';

interface Platform {
  sprite: Sprite;
  x: number;
  y: number;
}

export class CosmoClimbScene extends Container {
  private app: Application;
  private alien!: Sprite;
  private platforms: Platform[] = [];
  private velocityY: number = 0;
  private velocityX: number = 0;
  private gravity: number = 0.055;
  private jumpVelocity: number = -3.2;
  private maxVelocityX: number = 7;
  private tilt: number = 0;
  private score: number = 0;
  private scoreText!: Text;
  private highestY: number = 0;
  private platformSpacing: number = 80;
  private platformWidth: number = 100;
  private platformHeight: number = 20;
  private isGameOver: boolean = false;
  private background!: TilingSprite;
  private visuals!: Spritesheet;
  private startOverlay?: Container;
  public onGameOver?: () => void;
  private gameStarted: boolean = false;
  private spawnY: number = 0;

  constructor(app: Application) {
    super();
    this.app = app;
    this.jumpVelocity = -Math.sqrt(2 * this.gravity * 180);
    this.init();
  }

  private async init() {
    // Load visuals spritesheet
    this.visuals = Assets.get('cosmoClimbVisuals') as Spritesheet;
    
    // Background
    const bgTex = Texture.from('cosmoClimbBackground');
    this.background = new TilingSprite(bgTex, this.app.renderer.width, this.app.renderer.height * 3);
    this.background.tilePosition.y = 0;
    this.addChild(this.background);

    // Calculate spawn position
    this.spawnY = this.app.renderer.height - this.app.renderer.height * 0.2;

    // Create bottom platforms
    const platformCount = Math.ceil(this.app.renderer.width / this.platformWidth) + 1;
    const bottomPlatforms: Platform[] = [];
    for (let i = 0; i < platformCount; i++) {
      const x = (i * this.platformWidth) + this.platformWidth / 2 - ((platformCount * this.platformWidth) - this.app.renderer.width) / 2;
      const safeTex = ['platform-1.png', 'platform-2.png', 'platform-3.png'][Math.floor(Math.random() * 3)];
      const p: Platform = {
        sprite: new Sprite(this.visuals.textures[safeTex]),
        x,
        y: this.spawnY,
      };
      this.addPlatformToScene(p);
      bottomPlatforms.push(p);
    }

    // Generate simple platforms
    let y = this.spawnY - this.platformSpacing;
    const platforms: Platform[] = [...bottomPlatforms];
    
    // Generate 20 platforms for testing
    for (let i = 0; i < 20; i++) {
      const x = 60 + Math.random() * (this.app.renderer.width - 120);
      const texKey = ['platform-1.png', 'platform-2.png', 'platform-3.png'][Math.floor(Math.random() * 3)];
      
      const p: Platform = {
        sprite: new Sprite(this.visuals.textures[texKey]),
        x,
        y,
      };
      this.addPlatformToScene(p);
      platforms.push(p);
      
      y -= this.platformSpacing * (0.8 + Math.random() * 0.4);
    }
    this.platforms = platforms;

    // Create alien
    const safePlatform = bottomPlatforms[Math.floor(Math.random() * platformCount)];
    this.alien = new Sprite(this.visuals.textures['alien-right.png']);
    this.alien.width = 48;
    this.alien.height = 48;
    this.alien.anchor.set(0.5);
    this.alien.x = safePlatform.x;
    this.alien.y = safePlatform.y - 32;
    this.addChild(this.alien);
    this.highestY = this.alien.y;

    // Score text
    this.scoreText = new Text('0', {
      fontFamily: 'Chewy', fontSize: 32, fill: 0xffffff, stroke: 0x000000, strokeThickness: 4
    } as any);
    this.scoreText.x = 20;
    this.scoreText.y = 20;
    this.addChild(this.scoreText);

    // Show start overlay
    this.showStartOverlay();

    // Set up tilt controls
    this.setupTiltControls();
    Ticker.shared.add(this.update, this);
  }

  private addPlatformToScene(p: Platform) {
    p.sprite.width = this.platformWidth;
    p.sprite.height = this.platformHeight;
    p.sprite.anchor.set(0.5);
    p.sprite.x = p.x;
    p.sprite.y = p.y;
    this.addChild(p.sprite);
  }

  private setupTiltControls() {
    // Only enable tilt controls on mobile
    if (this.isMobileDevice()) {
      console.log('Mobile device detected, setting up tilt controls...');
      
      // Check if we need permission (iOS 13+)
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        console.log('iOS device detected, will request permission when game starts');
      } else {
        // Android or older iOS - no permission needed
        window.addEventListener('deviceorientation', this.handleTilt);
        console.log('Tilt controls enabled (no permission required)');
      }
    } else {
      console.log('Desktop device detected, no tilt controls');
    }
  }

  private async enableTiltControls() {
    if (!this.isMobileDevice()) return;
    
    try {
      // Check if we need permission (iOS 13+)
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        console.log('Requesting device orientation permission...');
        const permissionState = await (DeviceOrientationEvent as any).requestPermission();
        console.log(`Permission result: ${permissionState}`);
        
        if (permissionState === 'granted') {
          window.addEventListener('deviceorientation', this.handleTilt);
          console.log('Tilt controls enabled (permission granted)');
        } else {
          console.log('Tilt controls disabled (permission denied)');
        }
      } else {
        // Android or older iOS - no permission needed
        window.addEventListener('deviceorientation', this.handleTilt);
        console.log('Tilt controls enabled (no permission required)');
      }
    } catch (error) {
      console.error('Failed to enable tilt controls:', error);
    }
  }

  private handleTilt = (event: DeviceOrientationEvent) => {
    const gamma = event.gamma;
    if (gamma === null) return;
    
    // Debug logging
    console.log(`Tilt event: gamma=${gamma?.toFixed(1)}`);
    
    // Dead zone to prevent drift
    const deadZone = 2;
    if (Math.abs(gamma) < deadZone) {
      this.tilt = 0;
      return;
    }
    
    // Simple tilt mapping
    const maxTilt = 20;
    const normalizedTilt = Math.max(-maxTilt, Math.min(maxTilt, gamma));
    this.tilt = (normalizedTilt / maxTilt) * 0.8;
    
    console.log(`Tilt value: ${this.tilt.toFixed(3)}`);
  };

  private update = () => {
    if (this.isGameOver || !this.gameStarted) return;
    
    // Movement from tilt
    this.velocityX += this.tilt * 0.4;
    this.velocityX *= 0.9; // Damping
    this.velocityX = Math.max(-this.maxVelocityX, Math.min(this.maxVelocityX, this.velocityX));
    
    this.alien.x += this.velocityX;
    
    // Wrap alien horizontally
    if (this.alien.x < 0) this.alien.x = this.app.renderer.width;
    if (this.alien.x > this.app.renderer.width) this.alien.x = 0;
    
    // Gravity
    this.velocityY += this.gravity;
    this.alien.y += this.velocityY;
    
    // Alien direction
    if (this.velocityX > 0.3) {
      this.alien.texture = this.visuals.textures['alien-right.png'];
    } else if (this.velocityX < -0.3) {
      this.alien.texture = this.visuals.textures['alien-left.png'];
    }
    
    // Platform collision
    if (this.velocityY > 0) {
      for (let i = 0; i < this.platforms.length; i++) {
        const platform = this.platforms[i];
        if (
          Math.abs(this.alien.x - platform.sprite.x) < this.platformWidth / 2 &&
          Math.abs(this.alien.y + this.alien.height / 2 - platform.sprite.y) < this.platformHeight / 2
        ) {
          this.velocityY = this.jumpVelocity;
          break;
        }
      }
    }
    
    // Camera follow
    const screenMidY = this.app.renderer.height / 2;
    if (this.alien.y < screenMidY) {
      const dy = screenMidY - this.alien.y;
      this.alien.y = screenMidY;
      this.highestY -= dy;
      this.score += Math.floor(dy);
      this.scoreText.text = this.score.toString();
      
      for (const platform of this.platforms) {
        platform.sprite.y += dy;
      }
      this.background.tilePosition.y += dy;
    }
    
    // Remove off-screen platforms
    this.platforms = this.platforms.filter(platform => {
      if (platform.sprite.y > this.app.renderer.height + 50) {
        this.removeChild(platform.sprite);
        return false;
      }
      return true;
    });
    
    // Game over if alien falls off bottom
    if (this.alien.y > this.app.renderer.height) {
      this.isGameOver = true;
      this.showGameOver();
    }
  };

  private showGameOver() {
    const overlay = new Graphics();
    overlay.beginFill(0x000000, 0.7);
    overlay.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    overlay.endFill();
    this.addChild(overlay);
    const text = new Text('Game Over', {
      fontFamily: 'Chewy', fontSize: 64, fill: 0xffffff, stroke: 0x000000, strokeThickness: 6, align: 'center'
    } as any);
    text.anchor.set(0.5);
    text.x = this.app.renderer.width / 2;
    text.y = this.app.renderer.height / 2;
    this.addChild(text);
    setTimeout(() => {
      this.removeChild(overlay);
      this.removeChild(text);
      if (this.onGameOver) this.onGameOver();
    }, 2000);
  }

  public resize() {
    if (this.startOverlay) {
      this.startOverlay.width = this.app.renderer.width;
      this.startOverlay.height = this.app.renderer.height;
      this.startOverlay.children[0].width = this.app.renderer.width;
      this.startOverlay.children[0].height = this.app.renderer.height;
      this.startOverlay.children[1].x = this.app.renderer.width / 2;
      this.startOverlay.children[1].y = this.app.renderer.height / 2;
    }
  }

  public destroy(options?: any) {
    window.removeEventListener('deviceorientation', this.handleTilt);
    if (this.app.view) {
      this.app.view.removeEventListener('touchstart', () => {});
      this.app.view.removeEventListener('touchmove', () => {});
      this.app.view.removeEventListener('touchend', () => {});
    }
    Ticker.shared.remove(this.update, this);
    super.destroy(options);
  }

  private isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  private showStartOverlay() {
    if (this.startOverlay) return;
    this.startOverlay = new Container();
    const g = new Graphics();
    g.beginFill(0x000000, 0.7);
    g.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    g.endFill();
    this.startOverlay.addChild(g);
    
    const t = new Text('Tilt to Move\nTap to Start\n\nTouch left/right to move', {
      fontFamily: 'Chewy', fontSize: 36, fill: 0xffffff, stroke: 0x000000, strokeThickness: 8, align: 'center'
    } as any);
    t.anchor.set(0.5);
    t.x = this.app.renderer.width / 2;
    t.y = this.app.renderer.height / 2;
    this.startOverlay.addChild(t);
    this.startOverlay.interactive = true;
    this.startOverlay.eventMode = 'static';
    this.startOverlay.on('pointerdown', () => {
      this.startGame();
    });    
    this.addChild(this.startOverlay);
  }

  private setupTouchControls() {
    if (!this.isMobileDevice()) return;
    
    let touchStartX = 0;
    let isTouching = false;
    
    this.app.view.addEventListener('touchstart', (e) => {
      e.preventDefault();
      touchStartX = e.touches[0].clientX;
      isTouching = true;
    });
    
    this.app.view.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!isTouching) return;
      
      const touchX = e.touches[0].clientX;
      const deltaX = touchX - touchStartX;
      const screenWidth = this.app.renderer.width;
      
      // Map touch movement to tilt
      this.tilt = (deltaX / screenWidth) * 2;
      this.tilt = Math.max(-1, Math.min(1, this.tilt));
    });
    
    this.app.view.addEventListener('touchend', (e) => {
      e.preventDefault();
      isTouching = false;
      this.tilt = 0;
    });
    
    console.log('Touch controls enabled as fallback');
  }

  private startGame = async () => {
    this.gameStarted = true;
    
    // Reset controls
    this.tilt = 0;
    this.velocityX = 0;
    
    // Enable tilt controls
    await this.enableTiltControls();
    
    // Enable touch controls as fallback
    this.setupTouchControls();
    
    if (this.startOverlay) {
      this.removeChild(this.startOverlay);
      this.startOverlay = undefined;
    }
  }
}
