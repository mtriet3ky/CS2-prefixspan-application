export function simpleTrialView(trial){
 const separate=!!trial.models.utility;
 const labels={baseline:'LR baseline',move:'LR + PrefixSpan MOVE',mixed:'LR + PrefixSpan MOVE–Utility',utility:'LR + utility riêng',move_utility:'LR + PrefixSpan MOVE + utility riêng'};
 const rows=(separate?['baseline','utility','move','move_utility']:['baseline','move','mixed']).map(k=>{
  const r=trial.models[k],e=r.evaluation.test,s=r.selection;
  return `<tr data-simple-model="${k}"><th>${labels[k]}</th><td>${s.features}</td><td>${s.min_sup?s.min_sup+'%':'—'}</td><td>${s.C}</td><td>${(r.evaluation.validation.accuracy*100).toFixed(3)}%</td><td>${(e.accuracy*100).toFixed(3)}%</td><td>${e.roc_auc.toFixed(5)}</td><td>${e.brier_score.toFixed(5)}</td></tr>`;
 }).join('');
 return `<h3>${separate?'Bốn đối chứng — giữ MOVE, utility riêng':'Thử nghiệm PrefixSpan đơn giản'} — ngưỡng 0.5</h3><div class="comparison-scroll"><table class="primary-comparison"><thead><tr><th>Mô hình</th><th>Features</th><th>min_sup</th><th>C</th><th>Val Accuracy ↑</th><th>Test Accuracy ↑</th><th>Test AUC ↑</th><th>Test Brier ↓</th></tr></thead><tbody>${rows}</tbody></table></div><p class="comparison-protocol">Cùng 400 feature trạng thái và cùng split. Pattern theo map/phe, không có pattern cá nhân. Feature MOVE đếm người hoàn tất mẫu trong 30 giây gần nhất. ${separate?'Utility là 8 feature riêng theo loại/phe, không chen vào sequence MOVE.':'Utility dùng vị trí người ném tại throwTick.'} Chọn bằng validation, ngưỡng 0.5 cố định; test lịch sử chỉ mang tính thăm dò.</p><p class="comparison-result">Đây là thí nghiệm đối chứng riêng; kết quả không tự thay mô hình đang phục vụ replay.</p>`;
}
