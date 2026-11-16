# CS2 Tactical Replay

Phát lại round đấu CS2 và dùng **PrefixSpan** để tìm các chuỗi di chuyển thường gặp. Demo có **248 demo map, 5.284 round và 52.840 chuỗi tuyển thủ–round** trên Mirage, Inferno và Dust II.

![Round Replay trên Dust II](docs/replay.png)

## Chạy trên máy cá nhân

Cần **Python 3.11–3.14**, Git và Git LFS. Lần đầu tải khoảng **4,7 GiB** dữ liệu. Nên chừa khoảng **10 GiB** dung lượng trống cho dữ liệu, bộ nhớ đệm Git LFS và môi trường Python.

### Linux / macOS

```sh
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/mtriet3ky/CS2-prefixspan-application.git
cd CS2-prefixspan-application
python3 run_demo.py
```

Trên Ubuntu/Debian, nếu thiếu Git LFS hoặc mô-đun tạo môi trường Python, cài bằng `sudo apt install git-lfs python3-venv`.

### Windows (PowerShell)

```powershell
$env:GIT_LFS_SKIP_SMUDGE = '1'
git clone https://github.com/mtriet3ky/CS2-prefixspan-application.git
Remove-Item Env:GIT_LFS_SKIP_SMUDGE
cd CS2-prefixspan-application
py -3 run_demo.py
```

Nếu đã clone từ trước, chạy `git pull --ff-only` trong thư mục dự án, rồi chạy lệnh `run_demo.py` tương ứng ở trên. Script tải dữ liệu còn thiếu, tạo hoặc dùng lại `.venv` và khởi động web. Nếu lượt tải bị ngắt, chạy lại lệnh để Git LFS dùng lại các file đã tải.

Mở [Round Replay](http://localhost:8767/) hoặc [Khai phá chiến thuật](http://localhost:8767/tactical.html). Nếu cổng 8767 đang bận, thêm `--port 8787` vào lệnh chạy. Nhấn `Ctrl+C` để dừng.

Nếu Git LFS báo `quota` hoặc `bandwidth`, gửi dòng lỗi cho người quản lý repo để kiểm tra [hạn mức Git LFS](https://docs.github.com/en/billing/concepts/product-billing/git-lfs). Nếu lỗi xảy ra trước khi khởi động web, chạy lại với `--prepare-data` để kiểm tra riêng bước cài đặt và dữ liệu.
