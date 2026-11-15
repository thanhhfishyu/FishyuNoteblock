# Note Block Song Builder

Biến file **MIDI** (`.mid`) hoặc **Open Note Block Studio** (`.nbs`) thành mạch note block + redstone cho Minecraft Java, xuất ra:

- **`.litematic`** cho Litematica
- **`.schem`** cho WorldEdit

Mọi thứ chạy ngay trong trình duyệt, file nhạc không được tải lên đâu cả.

## Tính năng

- Tự chọn nhạc cụ theo track MIDI, tự chọn quãng tám tốt nhất, nốt vượt quãng thì đổi nhạc cụ (giữ đúng cao độ) hoặc gập quãng tám
- Đọc file `.nbs` đã cân bằng sẵn trong Note Block Studio
- Chỉnh tốc độ bài, dịch tông, bật/tắt từng track
- 1–3 làn song song (tối đa 9 nốt kêu cùng lúc), có/không có note block tầng trên
- Xếp mạch: gập rắn gọn gần vuông, giới hạn dài × rộng, hoặc một hàng thẳng
- Xem trước mạch theo từng lớp, nghe thử, bảng vật liệu
- Mạch được kiểm tra bằng mô phỏng redstone trước khi xuất

## Dùng

Mở `index.html` trên trình duyệt (hoặc trang GitHub Pages của repo này).

## Phát triển

Mã chính nằm ở `core.js` (không phụ thuộc DOM) và `index.src.html` (giao diện). Chạy `python3 build.py` để gộp thành `index.html` một file.
