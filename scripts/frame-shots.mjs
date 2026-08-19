import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const bleedArg = process.argv.find(a => a.startsWith('--bleed='));
const BLEED = bleedArg ? Number(bleedArg.split('=')[1]) : 0;

const PY = `
import pathlib, sys
from PIL import Image, ImageDraw

SHOTS = pathlib.Path(sys.argv[1])
BLEED = int(sys.argv[2])

RADIUS = [('pill', 80), ('card', 28), ('popup', 24), ('options', 24)]

def radius_for(name):
    for key, r in RADIUS:
        if key in name:
            return r
    return 24

done = skipped = 0
print(f"{'file':30} {'crop':>6} {'radius':>7} {'size':>13}")
for p in sorted(SHOTS.glob('*.png')):
    im = Image.open(p)
    if im.mode == 'RGBA' and im.getpixel((0, 0))[3] == 0:
        print(f'{p.name:30} {"-":>6} {"-":>7} already framed')
        skipped += 1
        continue

    im = im.convert('RGBA')
    bleed = BLEED if p.name.startswith('card-') else 0
    if bleed:
        w, h = im.size
        if w > bleed * 2 and h > bleed * 2:
            im = im.crop((bleed, bleed, w - bleed, h - bleed))

    r = radius_for(p.name)
    w, h = im.size
    r = min(r, w // 2, h // 2)

    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    out.save(p, optimize=True)
    print(f'{p.name:30} {BLEED:>6} {r:>7} {w}x{h}')
    done += 1

print(f'\\nframed {done}, skipped {skipped}')
`;

execFileSync('python', ['-c', PY, `${ROOT}/src/welcome/shots`, String(BLEED)], {
  stdio: 'inherit',
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
});
