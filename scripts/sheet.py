import sys, glob
from PIL import Image
out, pattern, cols = sys.argv[1], sys.argv[2], int(sys.argv[3])
files = sorted(glob.glob(pattern))
ims = [Image.open(f).convert('RGB') for f in files]
w0 = int(sys.argv[4]) if len(sys.argv) > 4 else 480
ims = [i.resize((w0, int(i.height * w0 / i.width))) for i in ims]
rows = (len(ims) + cols - 1) // cols
h0 = max(i.height for i in ims)
sheet = Image.new('RGB', (cols * w0 + (cols + 1) * 6, rows * h0 + (rows + 1) * 6), (60, 60, 60))
for k, im in enumerate(ims):
    sheet.paste(im, (6 + (k % cols) * (w0 + 6), 6 + (k // cols) * (h0 + 6)))
sheet.save(out)
print(len(files), sheet.size)
