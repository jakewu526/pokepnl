# Design assets

## `PokePnL Logo.ai`

The logo master: a hand holding a card reading "POKE PNL", black hairline
vector art on a 960x560pt page. Saved PDF-compatible, so it can be read
without Illustrator.

`public/pokepnl-mark.png` is **generated from this file**, not hand-edited.
The version that shipped before 2026-09-12 was a 480x368 export whose wrist
was cropped off at the file's own bottom edge -- unrecoverable by any amount
of CSS, which is why the master lives here now.

### Regenerating `public/pokepnl-mark.png`

Needs `pymupdf` and `pillow`:

```python
import pymupdf, io
from PIL import Image, ImageFilter

doc = pymupdf.open("design/PokePnL Logo.ai")
page = doc[0]

# The artwork's own bounds, plus 2pt so the strokes aren't clipped.
box = pymupdf.Rect(177.891, 119.919, 380.5561, 394.5405)
box = pymupdf.Rect(box.x0 - 2, box.y0 - 2, box.x1 + 2, box.y1 + 2)

pix = page.get_pixmap(matrix=pymupdf.Matrix(6, 6), clip=box, alpha=True)
img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")

# The source is hairline vector art and reads as a grey smudge at the 40-60px
# the mark actually renders. MaxFilter(5) at 6x dilates the strokes by ~2px a
# side -- roughly a 50% weight bump -- which survives the downscale. 7 starts
# closing up the counters inside "POKE PNL".
alpha = img.getchannel("A").filter(ImageFilter.MaxFilter(5))

# White art on transparent: MobileTabBar drops the PNG straight onto the
# emerald circle and wants white, while BrandMark and the watchlist card back
# use it as a CSS mask and only read the alpha.
out = Image.new("RGBA", img.size, (255, 255, 255, 0))
out.putalpha(alpha)
out.save("public/pokepnl-mark.png", optimize=True)
```

Result: 1241x1673, ~86KB, ~3:4 portrait.

### If the logo changes

The ~3:4 aspect is load-bearing. Re-check these four consumers:

- `components/BrandMark.tsx` -- explicit `h-*`/`w-*` matching the aspect
- `components/BrandLink.tsx` -- the wordmark lockup built on BrandMark
- `components/MobileTabBar.tsx` -- hardcoded intrinsic `width`/`height` props
- `components/RotatingWatchlistCard.tsx` -- the card back

and the dashboard's `lg:h-[calc(100dvh-6.0625rem)]` in `app/dashboard/page.tsx`,
which is the header's measured height and moves if the mark's height does.
