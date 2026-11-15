# Đưa demo lên GitHub

Tạo một repository trống và kiểm tra hạn mức Git LFS của tài khoản. Bản đầy đủ có khoảng 4,3 GiB dữ liệu. Tệp `.gitattributes` đã khai báo các file lớn cần dùng LFS.

Chạy từ thư mục chứa `pyproject.toml`:

```sh
git init -b main
git lfs install
git add .
git lfs ls-files
git commit -m "Add CS2 tactical replay demo"
git remote add origin <url-repository>
git push -u origin main
```

Trước khi commit, kiểm tra `git lfs ls-files` có các tệp `.parquet`, `.jsonl`, tệp cache `.sqlite` và các JSON lớn trong `data/analysis/`. Gửi cho người xem URL repo và hướng dẫn clone bằng Git LFS trong README.

Khi chia sẻ công khai, giữ thông báo bản quyền đi kèm các tài nguyên và kiểm tra quyền phân phối dữ liệu trận đấu, hình ảnh và icon.
