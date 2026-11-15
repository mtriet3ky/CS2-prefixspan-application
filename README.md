# CS2 Tactical Replay

Phát lại round đấu CS2 và dùng **PrefixSpan** để tìm các chuỗi di chuyển thường gặp. Demo có **226 bản ghi trận đấu, 4.806 round và 48.060 chuỗi tuyển thủ–round** trên Mirage, Inferno và Dust II.

![Round Replay trên Dust II](docs/replay.png)

## Bạn có thể xem gì?

| Chế độ | Nội dung |
| --- | --- |
| **Round Replay** | Chọn đội, trận và round. Tua bản đồ, xem vị trí, trang bị, utility quan sát được và xác suất thắng tại thời điểm đang xem. |
| **Khai phá chiến thuật** | Xem đường di chuyển thường gặp của tuyển thủ và các bài di chuyển của từng đội. Chọn một mẫu để xem tuyến trên bản đồ. |

## Chạy trên máy cá nhân

Cần **Python 3.11 trở lên**, Git và Git LFS. Bản demo đầy đủ chiếm khoảng **4,3 GiB**. Nếu repo ở chế độ Private, hãy đăng nhập bằng tài khoản đã được cấp quyền truy cập.

### Windows (PowerShell)

```powershell
git lfs install
git clone https://github.com/mtriet3ky/CS2-prefixspan-application.git
cd CS2-prefixspan-application
git lfs pull
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .
.\.venv\Scripts\python.exe -m cs2_tactical
```

### macOS / Linux

```sh
git lfs install
git clone https://github.com/mtriet3ky/CS2-prefixspan-application.git
cd CS2-prefixspan-application
git lfs pull
python3 -m venv .venv
.venv/bin/python -m pip install -e .
.venv/bin/python -m cs2_tactical
```

Mở [Round Replay](http://127.0.0.1:8767/) hoặc [Khai phá chiến thuật](http://127.0.0.1:8767/tactical.html). Nếu cổng 8767 đang bận, thêm `--port 8787` vào lệnh chạy. Nhấn `Ctrl+C` để dừng.

Cài đặt ở chế độ editable (`-e`) để ứng dụng đọc `web/` và `data/` trong bản clone. Có thể thêm `--prepare-data` vào lệnh chạy để kiểm tra dữ liệu mà không mở server. Nếu thiếu file, chạy `git lfs pull` trong thư mục repo.

## Cách đọc kết quả

**Pattern support** là tỷ lệ chuỗi trong tập khai phá có chứa mẫu. Mỗi chuỗi thuộc một tuyển thủ trong một round. Với replay, ngưỡng mặc định là **2%**. PrefixSpan xét các bước MOVE liên tiếp sau khi lọc sự kiện phụ, còn utility quan sát được có thể xuất hiện trên chuỗi khớp khi trình chiếu.

**Xác suất thắng round** được đọc từ dữ liệu dự đoán Logistic Regression đã tính theo các mốc quan sát. Trang chiến thuật dùng thêm quy tắc theo map, khu vực và phe để gắn nhãn như rush, push hoặc giữ vị trí. Xem thêm [cấu trúc dữ liệu và cách tính](docs/data.md).

## Cấu trúc thư mục

```text
src/cs2_tactical/   API, replay, PrefixSpan và phân tích chiến thuật
web/                HTML, CSS, JavaScript và icon
data/              Dữ liệu replay, bản đồ, đường đi và dự đoán
docs/              Ảnh demo và ghi chú dữ liệu
pyproject.toml      Cấu hình cài đặt và lệnh chạy
```

[Hướng dẫn đưa bản demo lên GitHub](docs/publishing.md)
