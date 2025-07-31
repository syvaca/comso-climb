import { Application, Container, Sprite, Text, Ticker, Graphics, TilingSprite, Texture, Spritesheet, Assets, Rectangle } from 'pixi.js';

interface Platform {
  sprite: Sprite;
  x: number;
  y: number;
  type: 'normal' | 'broken';
  powerupSprite?: Sprite;
  powerupType?: 'rocket' | 'powercell';
  breaking?: boolean; // for breakable platforms, true if already jumped on
}

interface Monster {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface DeviceOrientationEventiOS extends DeviceOrientationEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/**
 * CosmoClimbScene - A platformer game with tilt controls for mobile devices
 * 
 * Tilt Controls Implementation:
 * - Uses DeviceOrientationEvent API for mobile devices
 * - Supports both gamma (left-right) and beta (front-back) tilt axes
 * - Includes dead zone to prevent drift when device is held steady
 * - Automatically handles iOS permission requests
 * - Falls back to keyboard controls on desktop or when permission is denied
 * - Includes device orientation change handling for screen rotation
 * - Smooth input filtering and velocity damping for responsive controls
 */
export class CosmoClimbScene extends Container {
  private app: Application;
  private alien!: Sprite;
  private platforms: Platform[] = [];
  private monsters: Monster[] = [];
  private velocityY: number = 0;
  private velocityX: number = 0;
  private gravity: number = 0.055;
  private jumpHeight: number = 180; // pixels, desired jump height
  private jumpVelocity: number = -3.2; // will be set in constructor
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
  private rocketActive: boolean = false;
  private rocketTimer: number = 0;
  private powercellActive: boolean = false;
  private background!: TilingSprite;
  private visuals!: Spritesheet;
  private alienDirection: 'left' | 'right' = 'right';
  private tiltPermissionGranted: boolean = false;
  private startOverlay?: Container;
  public onGameOver?: () => void;
  private gameStarted: boolean = false;
  private monstersSpawned: boolean = false;
  private spawnY: number = 0;
  private allMonsters: Monster[] = [];
  private highestMonsterY: number = 0;
  // Map configuration
  private mapHeight: number = 5000;
  // Track alien's actual world position
  private alienWorldY: number = 0;
  // Solar storm properties
  private solarStorm!: Sprite;
  private solarStormY: number = 0;
  private solarStormSpeed: number = 0.7; // Base speed of storm movement
  private solarStormCatchupSpeed: number = 0.5; // Speed when catching up to alien

  constructor(app: Application) {
    super();
    this.app = app;
    // Calculate jumpVelocity based on jumpHeight and gravity
    this.jumpVelocity = -Math.sqrt(2 * this.gravity * this.jumpHeight);
    this.init();
  }

  private async init() {
    // Load visuals spritesheet (assume already loaded in asset loader)
    this.visuals = Assets.get('cosmoClimbVisuals') as Spritesheet;
    // Tiling background
    const bgTex = Texture.from('cosmoClimbBackground');
    this.background = new TilingSprite(bgTex, this.app.renderer.width, this.app.renderer.height * 3);
    this.background.tilePosition.y = 0;
    this.addChild(this.background);

    // Calculate spawnY 20% above the bottom
    this.spawnY = this.app.renderer.height - this.app.renderer.height * 0.2;

    // Fill the entire spawnY row with safe platforms
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

    // Generate initial platforms (no overlap, can cluster, random y spacing)
    let y = this.spawnY - this.platformSpacing;
    const platforms: Platform[] = [...bottomPlatforms];
    // Generate platforms for the entire map height
    const initialMaxY = this.spawnY - this.mapHeight;
    while (y > initialMaxY) {
      let tries = 0;
      let placed = false;
      while (!placed && tries < 20) {
        const x = 60 + Math.random() * (this.app.renderer.width - 120);
        if (platforms.length > 0 && Math.random() < 0.3) {
          const prev = platforms[platforms.length - 1];
          const clusterX = prev.x + (Math.random() - 0.5) * 120;
          if (clusterX > 60 && clusterX < this.app.renderer.width - 60) {
            if (Math.random() < 0.5) {
              placed = this.tryPlacePlatform(platforms, clusterX, y);
              if (placed) break;
            }
          }
        }
        placed = this.tryPlacePlatform(platforms, x, y);
        tries++;
      }
      y -= this.platformSpacing * (0.5 + Math.random() * 0.8);
    }

    // Ensure every platform has a reachable next platform above it BEFORE adding to scene
    const maxJumpHeight = this.jumpHeight;
    // Estimate max horizontal reach: maxVelocityX * jump duration (t = sqrt(2*jumpHeight/gravity))
    const jumpTime = Math.sqrt(2 * this.jumpHeight / this.gravity);
    const maxHorizontalReach = this.maxVelocityX * jumpTime;
    // Sort platforms by y descending (bottom to top)
    platforms.sort((a, b) => b.y - a.y);
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      // Find any platform (broken or not) above within jump range (ellipse)
      const reachable = platforms.some(q =>
        q !== p &&
        q.y < p.y &&
        q.y > p.y - maxJumpHeight &&
        Math.abs(q.x - p.x) <= maxHorizontalReach
      );
      if (!reachable) {
        // Insert a new safe platform within jump range
        const newY = p.y - maxJumpHeight * (0.7 + Math.random() * 0.3);
        if (newY < initialMaxY) continue;
        const minX = Math.max(60, p.x - maxHorizontalReach);
        const maxX = Math.min(this.app.renderer.width - 60, p.x + maxHorizontalReach);
        const newX = minX + Math.random() * (maxX - minX);
        const safeTex = ['platform-1.png', 'platform-2.png', 'platform-3.png'][Math.floor(Math.random() * 3)];
        const newPlat: Platform = {
          sprite: new Sprite(this.visuals.textures[safeTex]),
          x: newX,
          y: newY,
          type: 'normal',
        };
        platforms.push(newPlat);
        // Resort after adding
        platforms.sort((a, b) => b.y - a.y);
      }
    }

    // Actually add the platforms to the scene
    for (let i = 0; i < platforms.length; i++) {
      this.addPlatformToScene(platforms[i]);
    }
    this.platforms = platforms;

    // Pick a random safe platform from the bottom row for the alien spawn
    const safePlatform = bottomPlatforms[Math.floor(Math.random() * platformCount)];
    if (safePlatform) {
      this.alien = new Sprite(this.visuals.textures['alien-right.png']);
      this.alien.width = 48;
      this.alien.height = 48;
      this.alien.anchor.set(0.5);
      this.alien.x = safePlatform.x;
      this.alien.y = safePlatform.y - 32;
      this.alienWorldY = this.alien.y;
      this.addChild(this.alien);
    } else {
      // fallback: center at spawnY
      this.alien = new Sprite(this.visuals.textures['alien-right.png']);
      this.alien.width = 48;
      this.alien.height = 48;
      this.alien.anchor.set(0.5);
      this.alien.x = this.app.renderer.width / 2;
      this.alien.y = this.spawnY;
      this.alienWorldY = this.alien.y;
      this.addChild(this.alien);
    }
    this.highestY = this.alien.y;
    this.velocityY = 0;

    // Score text
    this.scoreText = new Text('0', {
      fontFamily: 'Chewy', fontSize: 32, fill: 0xffffff, stroke: 0x000000, strokeThickness: 4
    } as any);
    this.scoreText.x = 20;
    this.scoreText.y = 20;
    this.addChild(this.scoreText);

    // Initialize monster arrays
    this.allMonsters = [];
    this.monsters = [];
    
    // Pre-generate monsters throughout the map
    this.generateMonsters();

    // Initialize solar storm
    this.solarStorm = new Sprite(this.visuals.textures['solar-storm.png']);
    this.solarStorm.width = this.app.renderer.width;
    // Keep natural sprite height, don't scale vertically
    this.solarStorm.anchor.set(0, 0); // Anchor to top-left
    this.solarStorm.x = 0;
    // Position storm top at Y=840 (just below alien's position)
    this.solarStorm.y = 600; // Top edge at Y=600
    this.solarStormY = this.highestY + 840; // World position for top edge at Y=840
    this.solarStorm.visible = false; // Hide storm until game starts
    console.log(`Initial storm positioning: screenY=${this.solarStorm.y}, worldY=${this.solarStormY}, screenHeight=${this.app.renderer.height}, stormHeight=${this.solarStorm.height}`);
    this.addChild(this.solarStorm);

    // Show tap to start overlay
    this.showStartOverlay();

    // Set up device orientation handling based on device type
    if (this.isMobileDevice()) {
      if (this.hasDeviceOrientationSupport()) {
        if (this.isMobileWithPermissionPrompt()) {
          // iOS 13+ device that requires permission - handled in overlay
          console.log('Mobile device detected with permission requirement');
        } else {
          // Mobile device without permission requirement (Android, older iOS)
          console.log('Mobile device detected without permission requirement');
          window.addEventListener('deviceorientation', this.handleTilt);
          window.addEventListener('orientationchange', this.handleDeviceOrientationChange);
          this.tiltPermissionGranted = true;
        }
      } else {
        // Mobile device without device orientation support
        console.log('Mobile device detected without device orientation support');
      }
    } else {
      // Desktop device - no device orientation needed
      console.log('Desktop device detected');
    }
    
    // Always set up keyboard controls as fallback
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    Ticker.shared.add(this.update, this);
  }

  private randomPlatformTexture(): string {
    const options = ['platform-1.png', 'platform-2.png', 'platform-3.png', 'platform-broken.png'];
    const idx = Math.floor(Math.random() * options.length);
    return options[idx];
  }

  // Helper to try to place a platform without overlap
  private tryPlacePlatform(existing: Platform[], x: number, y: number): boolean {
    const minDist = 80; // Minimum distance between platforms
    for (const p of existing) {
      const dx = p.x - x;
      const dy = p.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < minDist) return false;
    }
    // Randomly choose platform type
    let type: Platform['type'] = 'normal';
    let texKey = this.randomPlatformTexture();
    if (texKey === 'platform-broken.png') type = 'broken';
    // Powerup
    let powerupSprite: Sprite | undefined = undefined;
    let powerupType: Platform['powerupType'] | undefined = undefined;
    if (type === 'normal' && Math.random() < 0.1) {
      if (Math.random() < 0.2) {
        powerupSprite = new Sprite(this.visuals.textures['rocket-off.png']);
        powerupType = 'rocket';
      } else {
        powerupSprite = new Sprite(this.visuals.textures['powercell.png']);
        powerupType = 'powercell';
      }
      powerupSprite.width = 32;
      powerupSprite.height = 32;
      powerupSprite.anchor.set(0.5);
      powerupSprite.x = x;
      powerupSprite.y = y - 24;
    }
    existing.push({ sprite: new Sprite(this.visuals.textures[texKey]), x, y, type, powerupSprite, powerupType });
    return true;
  }

  // Actually add the platform and its powerup to the scene
  private addPlatformToScene(p: Platform) {
    p.sprite.width = this.platformWidth;
    p.sprite.height = this.platformHeight;
    p.sprite.anchor.set(0.5);
    p.sprite.x = p.x;
    p.sprite.y = p.y;
    this.addChild(p.sprite);
    if (p.powerupSprite) {
      p.powerupSprite.x = p.x;
      p.powerupSprite.y = p.y - 24;
      this.addChild(p.powerupSprite);
    }
  }

  private createMonster(y: number, x?: number): Monster {
    const monsterKeys = ['monster-1.png', 'monster-2.png', 'monster-3.png'];
    const key = monsterKeys[Math.floor(Math.random() * monsterKeys.length)];
    const sprite = new Sprite(this.visuals.textures[key]);
    sprite.anchor.set(0.5);
    sprite.width = 48;
    sprite.height = 48;
    // Use provided X or random X
    sprite.x = x !== undefined ? x : 40 + Math.random() * (this.app.renderer.width - 80);
    sprite.y = y;
    // Do not add to scene yet
    const vx = (Math.random() - 0.5) * 1.5;
    const vy = (Math.random() - 0.5) * 0.5;
    return { sprite, x: sprite.x, y: sprite.y, vx, vy };
  }

  private handleTilt = (event: DeviceOrientationEvent) => {
    if (this.usingKeyboard) return;
    
    // Get device orientation values
    const gamma = event.gamma; // Left-right tilt
    const beta = event.beta;   // Front-back tilt
    const alpha = event.alpha; // Device rotation around z-axis
    
    // Check if we have valid orientation data
    if (gamma === null || beta === null) return;
    
    // Determine the primary tilt axis based on device orientation
    let tiltValue: number;
    
    // For most mobile games, gamma (left-right tilt) is the primary control
    // But we can also use beta (front-back) as a fallback or alternative
    if (Math.abs(gamma) > Math.abs(beta)) {
      // Use gamma (left-right tilt) as primary control
      tiltValue = gamma;
    } else {
      // Use beta (front-back tilt) as primary control
      tiltValue = beta;
    }
    
    // Apply dead zone to prevent drift when device is held steady
    const deadZone = 5; // degrees
    if (Math.abs(tiltValue) < deadZone) {
      tiltValue = 0;
    }
    
    // Normalize and scale the tilt value
    // Gamma typically ranges from -90 to +90 degrees
    // We want to map this to a reasonable control range
    const maxTilt = 30; // degrees
    const normalizedTilt = Math.max(-maxTilt, Math.min(maxTilt, tiltValue));
    
    // Convert to a control value between -1 and 1
    this.tilt = normalizedTilt / maxTilt;
    
    // Apply additional smoothing to prevent jittery movement
    this.tilt *= 0.8; // Reduce sensitivity slightly
    
    // Debug logging (can be removed in production)
    if (Math.abs(this.tilt) > 0.1) {
      console.log(`Tilt: gamma=${gamma?.toFixed(1)}, beta=${beta?.toFixed(1)}, normalized=${this.tilt.toFixed(3)}`);
    }
  };

  private handleDeviceOrientationChange = (event: Event) => {
    // This method handles device orientation changes (like screen rotation)
    // We can use this to recalibrate tilt controls if needed
    console.log('Device orientation changed - recalibrating tilt controls');
    this.calibrateTiltControls();
  };

  private calibrateTiltControls() {
    // Reset tilt values to center
    this.tilt = 0;
    this.velocityX = 0;
    console.log('Tilt controls calibrated');
  }

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
    
    // Handle input switching - if keyboard is used, temporarily disable tilt
    if (this.usingKeyboard) {
      // Gradually reduce tilt influence when keyboard is used
      this.tilt *= 0.9;
    }
    
    // Horizontal movement from tilt or keyboard
    const effectiveTilt = this.usingKeyboard ? this.keyboardTilt : this.tilt;
    
    // Apply tilt input with smoothing
    this.velocityX += effectiveTilt * 0.3; // Reduced sensitivity for smoother control
    this.velocityX *= 0.92; // Slightly more damping for smoother movement
    
    // Clamp velocity to prevent excessive speed
    this.velocityX = Math.max(-this.maxVelocityX, Math.min(this.maxVelocityX, this.velocityX));
    
    // Apply velocity to alien position
    this.alien.x += this.velocityX;
    
    // Wrap alien horizontally
    if (this.alien.x < 0) this.alien.x = this.app.renderer.width;
    if (this.alien.x > this.app.renderer.width) this.alien.x = 0;
    // Gravity or rocket
    if (this.rocketActive) {
      // Limit rocket speed so alien never moves up faster than the camera
      const maxRocketSpeed = Math.abs(this.jumpVelocity) * 0.95;
      this.velocityY = -maxRocketSpeed;
      this.rocketTimer -= Ticker.shared.deltaMS;
      if (this.rocketTimer <= 0) {
        this.rocketActive = false;
      }
    } else {
      this.velocityY += this.gravity;
    }
    this.alien.y += this.velocityY;
    this.alienWorldY += this.velocityY; // Update world position based on velocity
    // Alien sprite direction
    if (this.rocketActive) {
      this.alien.texture = this.visuals.textures['rocket-on.png'];
    } else if (this.velocityX > 0.5) {
      this.alien.texture = this.visuals.textures['alien-right.png'];
      this.alienDirection = 'right';
    } else if (this.velocityX < -0.5) {
      this.alien.texture = this.visuals.textures['alien-left.png'];
      this.alienDirection = 'left';
    }
    // Platform collision (only falling, and not on broken)
    if (!this.rocketActive && this.velocityY > 0) {
      for (let i = 0; i < this.platforms.length; i++) {
        const platform = this.platforms[i];
        if (
          Math.abs(this.alien.x - platform.sprite.x) < this.platformWidth / 2 &&
          Math.abs(this.alien.y + this.alien.height / 2 - platform.sprite.y) < this.platformHeight / 2
        ) {
          if (platform.type === 'broken') {
            // Allow the jump, but immediately break and remove the platform
            let jumpV = this.jumpVelocity;
            if (this.powercellActive) {
              jumpV *= 1.7;
              this.powercellActive = false;
            }
            this.velocityY = jumpV;
            // Powerup effects
            if (platform.powerupType === 'rocket') {
              this.rocketActive = true;
              this.rocketTimer = 4000; // ms
              platform.powerupType = undefined;
              if (platform.powerupSprite) {
                this.removeChild(platform.powerupSprite);
                platform.powerupSprite = undefined;
              }
            } else if (platform.powerupType === 'powercell') {
              this.powercellActive = true;
              // Apply high bounce immediately when powercell is collected
              this.velocityY = this.jumpVelocity * 1.7;
              this.powercellActive = false; // Consume immediately after use
              platform.powerupType = undefined;
              if (platform.powerupSprite) {
                this.removeChild(platform.powerupSprite);
                platform.powerupSprite = undefined;
              }
            }
            // Now break and remove the platform
            this.removeChild(platform.sprite);
            if (platform.powerupSprite) this.removeChild(platform.powerupSprite);
            this.platforms.splice(i, 1);
            break;
          }
          // Landed on safe platform
          let jumpV = this.jumpVelocity;
          if (this.powercellActive) {
            jumpV *= 1.7;
            this.powercellActive = false;
          }
          this.velocityY = jumpV;
          // Powerup effects
          if (platform.powerupType === 'rocket') {
            this.rocketActive = true;
            this.rocketTimer = 4000; // ms
            platform.powerupType = undefined;
            if (platform.powerupSprite) {
              this.removeChild(platform.powerupSprite);
              platform.powerupSprite = undefined;
            }
          } else if (platform.powerupType === 'powercell') {
            this.powercellActive = true;
            // Apply high bounce immediately when powercell is collected
            this.velocityY = this.jumpVelocity * 1.7;
            this.powercellActive = false; // Consume immediately after use
            platform.powerupType = undefined;
            if (platform.powerupSprite) {
              this.removeChild(platform.powerupSprite);
              platform.powerupSprite = undefined;
            }
          }
          break;
        }
      }
    }
    // Camera follows alien upward if above screen midpoint
    const screenMidY = this.app.renderer.height / 2;
    if (this.alien.y < screenMidY) {
      const dy = screenMidY - this.alien.y;
      // Move alien down to midpoint, and move everything else down by the same amount
      this.alien.y = screenMidY;
      this.highestY -= dy; // keep highestY in sync with world position
      this.score += Math.floor(dy);
      this.scoreText.text = this.score.toString();
     
      for (const platform of this.platforms) {
        platform.sprite.y += dy;
        if (platform.powerupSprite) platform.powerupSprite.y += dy;
      }
      for (const monster of this.monsters) {
        monster.sprite.y += dy;
      }
      // Move solar storm with camera (like platforms)
      this.solarStorm.y += dy;
      this.background.tilePosition.y += dy;
    }
   
    // Solar storm movement and collision
    this.updateSolarStorm();
   
    // Remove monsters that have gone below the screen
    this.monsters = this.monsters.filter(monster => {
      if (monster.sprite.y > this.app.renderer.height + 50) {
        this.removeChild(monster.sprite);
        return false; // Remove from monsters array
      }
      return true; // Keep in monsters array
    });
   
    // Remove platforms that have gone below the screen
    this.platforms = this.platforms.filter(platform => {
      if (platform.sprite.y > this.app.renderer.height + 50) {
        this.removeChild(platform.sprite);
        if (platform.powerupSprite) {
          this.removeChild(platform.powerupSprite);
        }
        return false; // Remove from platforms array
      }
      return true; // Keep in platforms array
    });
   
    // Monsters move and check collision
    for (const monster of this.monsters) {
      monster.sprite.x += monster.vx;
      monster.sprite.y += monster.vy;
      // Bounce off walls
      if (monster.sprite.x < 24 || monster.sprite.x > this.app.renderer.width - 24) monster.vx *= -1;
      if (monster.sprite.y < 0 || monster.sprite.y > this.app.renderer.height - 200) monster.vy *= -1;
      // Collision with alien
      if (
        Math.abs(this.alien.x - monster.sprite.x) < 32 &&
        Math.abs(this.alien.y - monster.sprite.y) < 32
      ) {
        console.log(`Alien died: Hit monster (monster at screen X: ${monster.sprite.x.toFixed(1)}, Y: ${monster.sprite.y.toFixed(1)})`);
        this.isGameOver = true;
        this.showGameOver();
      }
    }
    // Game over if alien falls off bottom
    if (this.alien.y > this.app.renderer.height) {
      console.log(`Alien died: Fell off bottom of screen (screen Y: ${this.alien.y.toFixed(1)})`);
      this.isGameOver = true;
      this.showGameOver();
    }
    // Win condition: alien reaches 5000px height
    const currentHeight = this.spawnY - this.alienWorldY;
    if (currentHeight >= 5000) {
      this.isGameOver = true;
      this.showWinOverlay();
    }
   
    // Debug: Log solar storm world Y position every 1000px of alien height
    if (Math.floor(currentHeight / 1000) > Math.floor((currentHeight - (this.velocityY || 0)) / 1000)) {
      const stormWorldY = this.solarStormY - this.highestY;
      console.log(`Height: ${Math.floor(currentHeight)}px - Solar storm world Y: ${stormWorldY.toFixed(1)}`);
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
    // TODO: Handle resizing for background, alien, and platforms
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
    window.removeEventListener('orientationchange', this.handleDeviceOrientationChange);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    Ticker.shared.remove(this.update, this);
    super.destroy(options);
  }

  private isMobileWithPermissionPrompt(): boolean {
    // Check if we're on a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Check if device orientation API is available
    const hasDeviceOrientation = typeof DeviceOrientationEvent !== 'undefined';
    
    // Check if permission is required (iOS 13+)
    const requiresPermission = typeof (DeviceOrientationEvent as any).requestPermission === 'function';
    
    return isMobile && hasDeviceOrientation && requiresPermission;
  }

  private isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  private hasDeviceOrientationSupport(): boolean {
    return typeof DeviceOrientationEvent !== 'undefined';
  }
  
  private showStartOverlay() {
    if (this.startOverlay) return;
    this.startOverlay = new Container();
    const g = new Graphics();
    g.beginFill(0x000000, 0.7);
    g.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
    g.endFill();
    this.startOverlay.addChild(g);
    
    // Create instruction text based on device type
    let instructionText = 'Tap to Start';
    if (this.isMobileDevice()) {
      if (this.hasDeviceOrientationSupport()) {
        if (this.isMobileWithPermissionPrompt()) {
          instructionText = 'Tap to Start\n(Tilt to control)';
        } else {
          instructionText = 'Tap to Start\n(Tilt to control)';
        }
      } else {
        instructionText = 'Tap to Start\n(Use keyboard: A/D or Arrow Keys)';
      }
    } else {
      instructionText = 'Tap to Start\n(Use keyboard: A/D or Arrow Keys)';
    }
    
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
    this.startOverlay.on('pointerdown', (_event: any) => {
      // Request permissions directly in the user gesture handler
      if (this.isMobileWithPermissionPrompt()) {
        // iOS 13+ device that requires permission
        console.log('Requesting device orientation permission...');
        (DeviceOrientationEvent as any).requestPermission().then((permissionState: string) => {
          console.log(`Permission result: ${permissionState}`);
          if (permissionState === 'granted') {
            window.addEventListener('deviceorientation', this.handleTilt);
            window.addEventListener('orientationchange', this.handleDeviceOrientationChange);
            this.tiltPermissionGranted = true;
            console.log('Device orientation permission granted');
            this.startGame();
          } else {
            console.log('Device orientation permission denied');
            this.showPermissionDeniedPopup(`Permission denied: ${permissionState}`);
          }
        }).catch((err: any) => {
          console.error('Permission request error:', err);
          this.showPermissionDeniedPopup(`Permission error: ${err}`);
        });
      } else {
        // Non-iOS device or older iOS - no permission needed
        if (this.isMobileDevice() && this.hasDeviceOrientationSupport()) {
          window.addEventListener('deviceorientation', this.handleTilt);
          window.addEventListener('orientationchange', this.handleDeviceOrientationChange);
          this.tiltPermissionGranted = true;
          console.log('Device orientation enabled without permission requirement');
        }
        this.startGame();
      }
    });    
    this.addChild(this.startOverlay);
  }

  private showPermissionDeniedPopup(message?: string) {
    const popup = new Container();
    const bg = new Graphics();
    bg.beginFill(0x000000, 0.8);
    bg.drawRoundedRect(0, 0, 300, 150, 10);
    bg.endFill();
    popup.addChild(bg);
    
    const text = new Text(message || 'Permission Denied\nUse keyboard controls', {
      fontFamily: 'Chewy', fontSize: 24, fill: 0xffffff, stroke: 0x000000, strokeThickness: 4, align: 'center'
    } as any);
    text.anchor.set(0.5);
    text.x = 150;
    text.y = 75;
    popup.addChild(text);
    
    popup.x = (this.app.renderer.width - 300) / 2;
    popup.y = (this.app.renderer.height - 150) / 2;
    popup.interactive = true;
    popup.eventMode = 'static';
    popup.on('pointerdown', () => {
      this.removeChild(popup);
      this.startGame(); // Start game anyway with keyboard controls
    });
    
    this.addChild(popup);
  }

  private startGame = () => {
    this.gameStarted = true;
    this.solarStorm.visible = true; // Show solar storm when game starts
    
    // Reset tilt controls for clean start
    this.tilt = 0;
    this.velocityX = 0;
    this.usingKeyboard = false;
    this.keyboardTilt = 0;
    
    // Log tilt status for debugging
    if (this.tiltPermissionGranted) {
      console.log('Game started with tilt controls enabled');
    } else {
      console.log('Game started with keyboard controls only');
    }
    
    if (this.startOverlay) {
      this.removeChild(this.startOverlay);
      this.startOverlay = undefined;
    }
  }

  private generateMonsters = () => {
    // Generate 12 monsters randomly throughout the map height (like platforms)
    const numMonsters = 12;
    const mapStartY = this.spawnY - this.mapHeight + 200; // Start 200px from bottom
    const mapEndY = this.spawnY - 200; // End 200px from spawn point
    
    for (let i = 0; i < numMonsters; i++) {
      // Random Y position throughout the map height
      const y = mapStartY + Math.random() * (mapEndY - mapStartY);
      // Random X position across screen width
      const x = 60 + Math.random() * (this.app.renderer.width - 120);
      
      const monster = this.createMonster(y, x);
      this.allMonsters.push(monster);
    }
    
    // Add all monsters to the scene immediately (like platforms)
    for (const monster of this.allMonsters) {
      this.addChild(monster.sprite);
      this.monsters.push(monster);
    }
  }

  private updateSolarStorm = () => {
    // Move solar storm upward in world coordinates (0.3px per frame)
    this.solarStormY -= this.solarStormSpeed;
    
    // Cap storm top at alien top + 500 pixels (prevent alien from fully outrunning storm)
    const alienTopForCap = this.alien.y - this.alien.height / 2;
    const maxStormTop = alienTopForCap + 500;
    const currentStormTop = this.solarStormY - this.highestY;
    if (currentStormTop > maxStormTop) {
      this.solarStormY = this.highestY + maxStormTop;
    }
    
    // Convert world position to screen position (like platforms)
    this.solarStorm.y = this.solarStormY - this.highestY;
   
    // Debug world-to-screen conversion
    console.log(`Storm update: worldY=${this.solarStormY.toFixed(1)}, highestY=${this.highestY.toFixed(1)}, screenY=${this.solarStorm.y.toFixed(1)}`);
    
    // Collision detection with alien
    const stormTop = this.solarStorm.y; // Top edge of storm
    const stormBottom = this.solarStorm.y + this.solarStorm.height; // Bottom edge of storm
    const alienTop = this.alien.y - this.alien.height / 2;
    const alienBottom = this.alien.y + this.alien.height / 2;
    
    // Debug collision values
    console.log(`Storm: top=${stormTop.toFixed(1)}, bottom=${stormBottom.toFixed(1)}, height=${this.solarStorm.height}`);
    console.log(`Alien: top=${alienTop.toFixed(1)}, bottom=${alienBottom.toFixed(1)}, height=${this.alien.height}`);
    
    // Check if alien overlaps with storm vertically
    if (alienBottom > stormTop && alienTop < stormBottom) {
      // Check horizontal overlap
      const stormLeft = this.solarStorm.x;
      const stormRight = this.solarStorm.x + this.solarStorm.width;
      const alienLeft = this.alien.x - this.alien.width / 2;
      const alienRight = this.alien.x + this.alien.width / 2;
      
      if (alienRight > stormLeft && alienLeft < stormRight) {
        console.log(`Alien died: Hit solar storm (storm at screen Y: ${this.solarStorm.y.toFixed(1)}, alien at screen Y: ${this.alien.y.toFixed(1)})`);
        this.isGameOver = true;
        this.showGameOver();
      }
    }
    
    // Debug: Log solar storm world Y position every 1000px of alien height
    const currentHeight = this.spawnY - this.alienWorldY;
    if (Math.floor(currentHeight / 1000) > Math.floor((currentHeight - (this.velocityY || 0)) / 1000)) {
      console.log(`Height: ${Math.floor(currentHeight)}px - Solar storm world Y: ${this.solarStormY.toFixed(1)}`);
    }
  }


} 