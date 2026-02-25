"""Generate a German flag icon.ico without Pillow — uses raw BMP/ICO bytes."""
import struct, os

def make_german_flag_ico(path, size=64):
    w, h = size, size
    stripe = h // 3

    # Build raw pixel data (BGR, bottom-up)
    colors = [
        (0x00, 0xCE, 0xFF),   # bottom stripe  → gold  #FFCE00 in BGR
        (0x00, 0x00, 0xDD),   # middle stripe  → red   #DD0000 in BGR
        (0x00, 0x00, 0x00),   # top stripe     → black #000000 in BGR
    ]
    pixels = []
    for row in range(h):
        stripe_idx = row // stripe
        stripe_idx = min(stripe_idx, 2)
        b, g, r = colors[stripe_idx]
        for col in range(w):
            pixels += [b, g, r, 0xFF]   # BGRA

    # BMP DIB header for ICO
    bmp_hdr_size  = 40
    bmp_data_size = w * h * 4
    bmp = struct.pack('<IiiHHIIiiII',
        bmp_hdr_size,   # header size
        w, h * 2,       # width, height (×2 per ICO spec)
        1,              # color planes
        32,             # bits per pixel
        0,              # BI_RGB
        bmp_data_size,
        0, 0, 0, 0)
    bmp += bytes(pixels)

    # ICO file header + directory
    ico_hdr = struct.pack('<HHH', 0, 1, 1)   # reserved, type=1, count=1
    offset  = 6 + 16                          # after header + directory
    ico_dir = struct.pack('<BBBBHHII',
        w, h, 0, 0, 1, 32,
        bmp_hdr_size + bmp_data_size,
        offset)

    with open(path, 'wb') as f:
        f.write(ico_hdr + ico_dir + bmp)
    print(f"Icon saved: {path}")

make_german_flag_ico(os.path.join(os.path.dirname(__file__), "icon.ico"), size=64)
