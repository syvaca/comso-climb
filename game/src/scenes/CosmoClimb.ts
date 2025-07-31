import { Application, Container, Sprite, Text, Ticker, Graphics, TilingSprite, Texture, Spritesheet, Assets, Rectangle } from 'pixi.js';

interface Platform {
  sprite: Sprite;
  x: number;
  y: number;
  type: 'normal' | 'broken';
}

interface Monster {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export class CosmoClimbScene extends Container {
  private app: Application;
  private alien!: Sprite;
  private platforms: Platform[] = [];
  private monsters: Monster[] = [];
  private velocityY: number = 0;
  private velocityX: number = 0;
  private gravity: number = 0.055;
  private jumpHeight: number = 180;
  private jumpVelocity: number = -3.2;
  private maxVelocityX: number = 7;
  private tilt: number = 0;
  private keyboardTilt: number = 0;
  private usingKeyboard: boolean = false;
  private score: number = 0;
  private scoreText!: Text;
  private highestY: number = 0;
  private platformSpacing: number = 60;
  private platformWidth: number = 100;
  private platformHeight: number = 20;
  private isGameOver: boolean = false;
  private background!: TilingSprite;
  private visuals!: Spritesheet;
  private startOverlay?: Container;
  public onGameOver?: () => void;
  private gameStarted: boolean = false;
  private spawnY: number = 0;
  private alienWorldY: number = 0;
  private solarStorm!: Sprite;
  private solarStormY: number = 0;
  private solarStormSpeed: number = 0.7;

  constructor(app: Application) {
    super();
    this.app = app;
    this.jumpVelocity = -Math.sqrt(2 * this.gravity * this.jumpHeight);
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
        type: 'normal',
      };
      this.addPlatformToScene(p);
      bottomPlatforms.push(p);
    }

    // Generate platforms
    let y = this.spawnY - this.platformSpacing;
    const platforms: Platform[] = [...bottomPlatforms];
    const mapHeight = 5000;
    const initialMaxY = this.spawnY - mapHeight;
    
    while (y > initialMaxY) {
      const x = 60 + Math.random() * (this.app.renderer.width - 120);
      const texKey = this.randomPlatformTexture();
      const type: Platform['type'] = texKey === 'platform-broken.png' ? 'broken' : 'normal';
      
      const p: Platform = {
        sprite: new Sprite(this.visuals.textures[texKey]),
        x,
        y,
        type,
      };
      this.addPlatformToScene(p);
      platforms.push(p);
      
      y -= this.platformSpacing * (0.5 + Math.random() * 0.8);
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
    this.alienWorldY = this.alien.y;
    this.addChild(this.alien);
    this.highestY = this.alien.y;

    // Score text
    this.scoreText = new Text('0', {
      fontFamily: 'Chewy', fontSize: 32, fill: 0xffffff, stroke: 0x000000, strokeThickness: 4
    } as any);
    this.scoreText.x = 20;
    this.scoreText.y = 20;
    this.addChild(this.scoreText);

    // Generate monsters
    this.generateMonsters();

    // Solar storm
    this.solarStorm = new Sprite(this.visuals.textures['solar-storm.png']);
    this.solarStorm.width = this.app.renderer.width;
    this.solarStorm.anchor.set(0, 0);
    this.solarStorm.x = 0;
    this.solarStorm.y = 600;
    this.solarStormY = this.highestY + 840;
    this.solarStorm.visible = false;
    this.addChild(this.solarStorm);

    // Show start overlay
    this.showStartOverlay();

    // Set up controls
    this.setupControls();
    Ticker.shared.add(this.update, this);
  }

  private randomPlatformTexture(): string {
    const options = ['platform-1.png', 'platform-2.png', 'platform-3.png', 'platform-broken.png'];
    return options[Math.floor(Math.random() * options.length)];
  }

  private addPlatformToScene(p: Platform) {
    p.sprite.width = this.platformWidth;
    p.sprite.height = this.platformHeight;
    p.sprite.anchor.set(0.5);
    p.sprite.x = p.x;
    p.sprite.y = p.y;
    this.addChild(p.sprite);
  }

  private createMonster(y: number, x?: number): Monster {
    const monsterKeys = ['monster-1.png', 'monster-2.png', 'monster-3.png'];
    const key = monsterKeys[Math.floor(Math.random() * monsterKeys.length)];
    const sprite = new Sprite(this.visuals.textures[key]);
    sprite.anchor.set(0.5);
    sprite.width = 48;
    sprite.height = 48;
    sprite.x = x !== undefined ? x : 40 + Math.random() * (this.app.renderer.width - 80);
    sprite.y = y;
    const vx = (Math.random() - 0.5) * 1.5;
    const vy = (Math.random() - 0.5) * 0.5;
    return { sprite, x: sprite.x, y: sprite.y, vx, vy };
  }

  private generateMonsters() {
    const numMonsters = 12;
    const mapStartY = this.spawnY - 5000 + 200;
    const mapEndY = this.spawnY - 200;
    
    for (let i = 0; i < numMonsters; i++) {
      const y = mapStartY + Math.random() * (mapEndY - mapStartY);
      const x = 60 + Math.random() * (this.app.renderer.width - 120);
      const monster = this.createMonster(y, x);
      this.addChild(monster.sprite);
      this.monsters.push(monster);
    }
  }

  private setupControls() {
    // Keyboard controls
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  private handleTilt = (event: DeviceOrientationEvent) => {
    if (this.usingKeyboard) return;
    
    const gamma = event.gamma;
    if (gamma === null) return;
    
    // Dead zone
    const deadZone = 5;
    if (Math.abs(gamma) < deadZone) {
      this.tilt = 0;
      return;
    }
    
    // Normalize tilt
    const maxTilt = 30;
    const normalizedTilt = Math.max(-maxTilt, Math.min(maxTilt, gamma));
    this.tilt = (normalizedTilt / maxTilt) * 0.8;
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      this.keyboardTilt = -0.4;
      this.usingKeyboard = true;
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      this.keyboardTilt = 0.4;
      this.usingKeyboard = true;
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (
      e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' ||
      e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D'
    ) {
      this.keyboardTilt = 0;
      this.usingKeyboard = false;
    }
  };

  private update = () => {
    if (this.isGameOver || !this.gameStarted) return;
    
    // Handle input switching
    if (this.usingKeyboard) {
      this.tilt *= 0.9;
    }
    
    // Movement
    const effectiveTilt = this.usingKeyboard ? this.keyboardTilt : this.tilt;
    this.velocityX += effectiveTilt * 0.3;
    this.velocityX *= 0.92;
    this.velocityX = Math.max(-this.maxVelocityX, Math.min(this.maxVelocityX, this.velocityX));
    
    this.alien.x += this.velocityX;
    
    // Wrap alien
    if (this.alien.x < 0) this.alien.x = this.app.renderer.width;
    if (this.alien.x > this.app.renderer.width) this.alien.x = 0;
    
    // Gravity
    this.velocityY += this.gravity;
    this.alien.y += this.velocityY;
    this.alienWorldY += this.velocityY;
    
    // Alien direction
    if (this.velocityX > 0.5) {
      this.alien.texture = this.visuals.textures['alien-right.png'];
    } else if (this.velocityX < -0.5) {
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
          if (platform.type === 'broken') {
            this.velocityY = this.jumpVelocity;
            this.removeChild(platform.sprite);
            this.platforms.splice(i, 1);
            break;
          }
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
      for (const monster of this.monsters) {
        monster.sprite.y += dy;
      }
      this.solarStorm.y += dy;
      this.background.tilePosition.y += dy;
    }
    
    // Update solar storm
    this.updateSolarStorm();
    
    // Remove off-screen objects
    this.monsters = this.monsters.filter(monster => {
      if (monster.sprite.y > this.app.renderer.height + 50) {
        this.removeChild(monster.sprite);
        return false;
      }
      return true;
    });
    
    this.platforms = this.platforms.filter(platform => {
      if (platform.sprite.y > this.app.renderer.height + 50) {
        this.removeChild(platform.sprite);
        return false;
      }
      return true;
    });
    
    // Monster movement and collision
    for (const monster of this.monsters) {
      monster.sprite.x += monster.vx;
      monster.sprite.y += monster.vy;
      if (monster.sprite.x < 24 || monster.sprite.x > this.app.renderer.width - 24) monster.vx *= -1;
      if (monster.sprite.y < 0 || monster.sprite.y > this.app.renderer.height - 200) monster.vy *= -1;
      
      if (
        Math.abs(this.alien.x - monster.sprite.x) < 32 &&
        Math.abs(this.alien.y - monster.sprite.y) < 32
      ) {
        this.isGameOver = true;
        this.showGameOver();
      }
    }
    
    // Game over conditions
    if (this.alien.y > this.app.renderer.height) {
      this.isGameOver = true;
      this.showGameOver();
    }
    
    const currentHeight = this.spawnY - this.alienWorldY;
    if (currentHeight >= 5000) {
      this.isGameOver = true;
      this.showWinOverlay();
    }
  };

  private updateSolarStorm = () => {
    this.solarStormY -= this.solarStormSpeed;
    
    const alienTopForCap = this.alien.y - this.alien.height / 2;
    const maxStormTop = alienTopForCap + 500;
    const currentStormTop = this.solarStormY - this.highestY;
    if (currentStormTop > maxStormTop) {
      this.solarStormY = this.highestY + maxStormTop;
    }
    
    this.solarStorm.y = this.solarStormY - this.highestY;
    
    // Collision detection
    const stormTop = this.solarStorm.y;
    const stormBottom = this.solarStorm.y + this.solarStorm.height;
    const alienTop = this.alien.y - this.alien.height / 2;
    const alienBottom = this.alien.y + this.alien.height / 2;
    
    if (alienBottom > stormTop && alienTop < stormBottom) {
      const stormLeft = this.solarStorm.x;
      const stormRight = this.solarStorm.x + this.solarStorm.width;
      const alienLeft = this.alien.x - this.alien.width / 2;
      const alienRight = this.alien.x + this.alien.width / 2;
      
      if (alienRight > stormLeft && alienLeft < stormRight) {
        this.isGameOver = true;
        this.showGameOver();
      }
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

  private showWinOverlay() {
    const overlay = new Graphics();
    overlay.beginFill(0x000000, 0.7);
    overlay.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    overlay.endFill();
    this.addChild(overlay);
    const text = new Text('You Win!', {
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
      this.startOverlay.hitArea = new Rectangle(0, 0, this.app.renderer.width, this.app.renderer.height);
    }
  }

  public destroy(options?: any) {
    window.removeEventListener('deviceorientation', this.handleTilt);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
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
    
    const instructionText = this.isMobileDevice() ? 'Tap to Start\n(Tilt to control)' : 'Tap to Start\n(Use keyboard: A/D or Arrow Keys)';
    const t = new Text(instructionText, {
      fontFamily: 'Chewy', fontSize: 48, fill: 0xffffff, stroke: 0x000000, strokeThickness: 8, align: 'center'
    } as any);
    t.anchor.set(0.5);
    t.x = this.app.renderer.width / 2;
    t.y = this.app.renderer.height / 2;
    this.startOverlay.addChild(t);
    this.startOverlay.interactive = true;
    this.startOverlay.eventMode = 'static';
    this.startOverlay.hitArea = new Rectangle(0, 0, this.app.renderer.width, this.app.renderer.height);
    this.startOverlay.on('pointerdown', () => {
      this.startGame();
    });    
    this.addChild(this.startOverlay);
  }

  private startGame = () => {
    this.gameStarted = true;
    this.solarStorm.visible = true;
    
    // Reset controls
    this.tilt = 0;
    this.velocityX = 0;
    this.usingKeyboard = false;
    this.keyboardTilt = 0;
    
    // Enable tilt controls on mobile
    if (this.isMobileDevice()) {
      try {
        window.addEventListener('deviceorientation', this.handleTilt);
        console.log('Tilt controls enabled');
      } catch (error) {
        console.log('Tilt controls not available, using keyboard only');
      }
    }
    
    if (this.startOverlay) {
      this.removeChild(this.startOverlay);
      this.startOverlay = undefined;
    }
  }
}
