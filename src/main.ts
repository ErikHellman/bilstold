import { FixedLoop, startRaf } from './core/loop';
import { createSession } from './game/session';
import { Input } from './input/input';
import { Renderer } from './render/renderer';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const { world } = createSession('bilstöld', 1);
const input = new Input(window);
const renderer = new Renderer(canvas);
renderer.setWorld(world);
const loop = new FixedLoop(dt => world.step(input.poll(), dt));
startRaf(loop, a => renderer.render(a), () => 60);

if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__w = world;
