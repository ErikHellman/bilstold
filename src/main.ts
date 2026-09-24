const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.width = 640;
canvas.height = 360;
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, canvas.width, canvas.height);
