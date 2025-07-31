import { Application, Container } from 'pixi.js';

export interface ResizableScene extends Container {
  resize(): void;
  destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void;
}

export class SceneManager {
  private currentScene?: ResizableScene;
  private readonly resizeHandler = () => this.resizeCurrentScene();

  constructor(private readonly app: Application) {
    window.addEventListener('resize', this.resizeHandler);
  }

  changeScene(newScene: ResizableScene) {
    // Remove current scene
    if (this.currentScene) {
      this.app.stage.removeChild(this.currentScene);
      this.currentScene.destroy({
        children: true,
        texture: false,
        baseTexture: false,
      });
    }

    // Set and add new scene
    this.currentScene = newScene;
    this.app.stage.addChild(newScene);
  }

  private resizeCurrentScene() {
    if (!this.currentScene) return;

    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.currentScene.resize();
  }

  destroy() {
    window.removeEventListener('resize', this.resizeHandler);
    if (this.currentScene) {
      this.currentScene.destroy({ children: true });
      this.currentScene = undefined;
    }
  }
}
