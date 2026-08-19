import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');

const PY = `
import pathlib, sys
from PIL import Image, ImageChops

SHOTS = pathlib.Path(sys.argv[1])
COLORS = 256
before = after = 0
worst_pct = 0.0

print(f"{'file':30} {'was':>8} {'now':>8} {'saved':>7} {'>d24':>8}")
for p in sorted(SHOTS.glob('*.png')):
    orig = p.stat().st_size
    src = Image.open(p).convert('RGBA')
    q = src.quantize(colors=COLORS, method=Image.FASTOCTREE, dither=Image.NONE)

    tmp = p.with_suffix('.tmp.png')
    q.save(tmp, optimize=True)
    new = tmp.stat().st_size

    back = q.convert('RGBA')
    if back.getchannel('A').getextrema() != src.getchannel('A').getextrema():
        print(f'{p.name:30} alpha range changed, keeping original')
        tmp.unlink()
        before += orig; after += orig
        continue

    hist = ImageChops.difference(src.convert('RGB'), back.convert('RGB')).convert('L').histogram()
    px = src.size[0] * src.size[1]
    pct = sum(hist[24:]) * 100.0 / px
    worst_pct = max(worst_pct, pct)

    if new < orig and pct < 0.10:
        tmp.replace(p); kept = new; flag = ''
    else:
        tmp.unlink(); kept = orig; flag = '  KEPT ORIGINAL'
    before += orig; after += kept
    print(f'{p.name:30} {orig/1024:7.1f}K {kept/1024:7.1f}K {100-kept*100/orig:6.0f}% {pct:7.3f}%{flag}')

print(f'\\ntotal {before/1024:.1f} KB -> {after/1024:.1f} KB  ({100-after*100/before:.0f}% smaller)')
print(f'worst image: {worst_pct:.3f}% of pixels differ by more than 24/255')
`;

execFileSync('python', ['-c', PY, `${ROOT}/src/welcome/shots`], {
  stdio: 'inherit',
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
});
