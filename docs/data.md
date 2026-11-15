# Dữ liệu và phân tích

| Thành phần | Vai trò |
| --- | --- |
| `data/demos/` | Trạng thái tuyển thủ theo mốc quan sát, sự kiện và chuỗi theo từng demo. |
| `data/round_metadata.parquet` | Danh mục round, map, đội, phe và kết quả. |
| `data/sequences.jsonl` | Tập chuỗi tuyển thủ–round dùng cho dữ liệu và kiểm tra phiên bản. |
| `data/models/` | Mô hình được chọn, dự đoán đã tính sẵn và danh mục pattern. |
| `data/analysis/` | Chỉ mục phân tích và đường di chuyển dựa trên tọa độ quan sát. |
| `data/assets/`, `web/assets/` | Radar, cấu hình tọa độ, callout và icon trang bị. |

PrefixSpan tính support theo số chuỗi có chứa mẫu. Một chuỗi có thể chứa mẫu nhiều lần nhưng chỉ đóng góp một đơn vị vào support count. Khi xem bài di chuyển của đội, tần suất lấy số round của đội trên map và phe đã chọn làm mẫu số. Dự đoán thắng round và tỷ lệ thắng lịch sử là hai chỉ số riêng.

Giao diện phát lại những mốc đã quan sát. Utility chỉ xuất hiện ở các round có dữ liệu tương ứng. Bản demo chứa dữ liệu CS2 đã xử lý và dự đoán có sẵn để chạy ngay sau khi cài đặt.

`file_timestamps.json` lưu thông tin để khôi phục timestamp sau khi clone, giúp cache phân tích nhận đúng bản dữ liệu. Cache JSON và SQLite trong `data/analysis/` đi cùng nhau.

Thông báo giấy phép tài nguyên hiện có nằm trong `web/assets/`. Xem [Awpy](https://github.com/pnxenopoulos/awpy) và [Total CS Callouts](https://totalcsgo.com/callouts) để tham khảo các nguồn dùng trong quá trình xây dựng dữ liệu và bản đồ.
