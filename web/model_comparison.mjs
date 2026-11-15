import {simpleTrialView} from './simple_trial_view.mjs';
const escape=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(value,digits=5)=>Number.isFinite(value)?value.toFixed(digits):'—';
const signed=(value,digits=5)=>Number.isFinite(value)?(value>0?'+':'')+value.toFixed(digits):'—';
const accuracy=value=>Number.isFinite(value)?(value*100).toFixed(2)+'%':'—';

export function modelComparisonView(info={}){
 const pair=info.primary_comparison;
 if(!pair)return {description:'Chưa có cặp kết quả LR không có pattern và LR có pattern cho mô hình này.',markup:''};
 if(info.version?.startsWith('cs2_lr_')){
  const a=pair.baseline,b=pair.with_pattern;
  const models=info.comparison?Object.values(info.comparison):[a,b];
  const row=m=>`<tr><th>${escape(m.label)}</th><td>${m.features}</td><td>${m.chosen_C}</td><td>${accuracy(m.evaluation.validation.accuracy)}</td><td>${accuracy(m.evaluation.test.accuracy)}</td><td>${number(m.evaluation.test.roc_auc)}</td><td>${number(m.evaluation.test.brier_score)}</td></tr>`;
  const selected=models.find(m=>m.id===info.chosen_family);
  return {description:info.site_coordination?'So sánh LR dùng trạng thái, pattern riêng lẻ và đặc trưng phối hợp vào site từ PrefixSpan. Chọn cấu hình bằng validation, ngưỡng phân loại 0.5.':'So sánh LR dùng trạng thái và LR bổ sung các pattern MOVE của PrefixSpan. Chọn cấu hình bằng validation, ngưỡng phân loại 0.5.',
   markup:`<h3>Đối chứng CS2</h3><div class="comparison-scroll"><table><thead><tr><th>Mô hình</th><th>Features</th><th>C</th><th>Val Accuracy</th><th>Test Accuracy</th><th>Test AUC</th><th>Test Brier ↓</th></tr></thead><tbody>${models.map(row).join('')}</tbody></table></div><p>Mô hình được chọn theo validation: ${escape(selected?.label||info.chosen_family)}.</p><p>${escape(info.split_policy?.method||info.split_policy||'')}</p>${info.site_coordination?'<p>Đặc trưng phối hợp tính từ các pattern hoàn tất trong 15 giây gần nhất, cửa sổ cùng vào site 5 giây và trạng thái người chơi tại timestamp dự đoán. Kết quả test của lượt này là thăm dò trên tập đã xem trước.</p>':''}`};
 }

 const a=pair.baseline,b=pair.with_pattern,delta=pair.differences.test;
 const labels={A_state:'LR không có pattern',B_state_global:'LR có pattern',C_state_global_personal:'LR có thêm pattern theo tuyển thủ',D_state_identity_control:'LR có định danh tuyển thủ',P_state_personal:'LR với pattern theo tuyển thủ',R_state_side:'LR có pattern (hiệu chỉnh trên baseline)',R_state_side_personal:'LR có pattern phe và tuyển thủ (hiệu chỉnh trên baseline)'};
 const accuracyGoal=pair.selection_metric?.includes('Accuracy');
 const row=(model,baseline=false)=>{
  const test=model.evaluation.test;
  return `<tr data-comparison-model="${escape(model.id)}"><th scope="row">${escape(model.label)}${baseline?'<small class="baseline-tag">Baseline</small>':''}</th><td>${model.features.toLocaleString('en-US')}</td>${accuracyGoal?`<td>${accuracy(test.accuracy_at_0_5)}</td>`:''}<td>${accuracy(test.accuracy)}</td><td>${number(test.roc_auc)}</td><td>${number(test.brier_score)}</td><td>${number(test.log_loss)}</td></tr>`;
 };
 let markup=`<h3>Hiệu quả khi thêm thông tin pattern</h3><div class="comparison-scroll"><table class="primary-comparison"><thead><tr><th>Mô hình</th><th>Features</th>${accuracyGoal?'<th>Test Accuracy @0.5 ↑</th>':''}<th>${accuracyGoal?'Test Accuracy ngưỡng val ↑':'Test Accuracy ↑'}</th><th>Test AUC ↑</th><th>Test Brier ↓</th><th>Test Log Loss ↓</th></tr></thead><tbody>${row(a,true)}${row(b)}</tbody><tfoot><tr data-comparison-delta><th>Có pattern − Baseline</th><td>+${pair.pattern_features.toLocaleString('en-US')}</td>${accuracyGoal?`<td>${signed((b.evaluation.test.accuracy_at_0_5-a.evaluation.test.accuracy_at_0_5)*100,3)} điểm %</td>`:''}<td>${signed(delta.accuracy*100,3)} điểm %</td><td>${signed(delta.roc_auc)}</td><td>${signed(delta.brier_score)}</td><td>${signed(delta.log_loss)}</td></tr></tfoot></table></div>`;
 markup+=`<p class="comparison-protocol">Cùng dữ liệu, nhãn thắng round, feature trạng thái và cách chia train/validation/test. Bản có pattern thêm ${pair.pattern_features.toLocaleString('en-US')} feature MOVE, min_sup ${pair.pattern_support_percent}%. Test: ${a.evaluation.test.rounds.toLocaleString('en-US')} round / ${a.evaluation.test.snapshots.toLocaleString('en-US')} snapshot.</p>`;
 const fixedDelta=(b.evaluation.test.accuracy_at_0_5??b.evaluation.test.accuracy)-(a.evaluation.test.accuracy_at_0_5??a.evaluation.test.accuracy);
 const result=accuracyGoal?`Ở ngưỡng chung 0.5: ${signed(fixedDelta*100,3)} điểm % Accuracy. Với ngưỡng chọn trên validation, Accuracy trên test ${delta.accuracy>0?'tăng':delta.accuracy<0?'giảm':'không đổi'} ${Math.abs(delta.accuracy*100).toFixed(3)} điểm % so với baseline. Brier ${delta.brier_score>0?'tăng':delta.brier_score<0?'giảm':'không đổi'} ${Math.abs(delta.brier_score).toFixed(5)}.`:delta.brier_score>0?'Trong cấu hình đã đo, thêm pattern làm Brier trên test tăng; chưa cải thiện dự đoán.':delta.brier_score<0?'Trong cấu hình đã đo, thêm pattern làm Brier trên test giảm.':'Hai cấu hình có cùng Brier trên test.';
 const selectionNote=accuracyGoal?`Cấu hình và ngưỡng phân loại được chọn bằng Accuracy trên validation; Brier phân hòa. Baseline: C=${a.chosen_C}, ngưỡng=${a.decision_threshold}, validation Accuracy=${accuracy(a.evaluation.validation.accuracy)}. Có pattern: C=${b.chosen_C}, ngưỡng=${b.decision_threshold}, validation Accuracy=${accuracy(b.evaluation.validation.accuracy)}. Không chọn theo test.`:`Cùng grid C; mỗi mô hình chọn C riêng bằng validation Brier rồi Log Loss. Baseline: C=${a.chosen_C}, validation Brier=${number(a.evaluation.validation.brier_score)}. Có pattern: C=${b.chosen_C}, validation Brier=${number(b.evaluation.validation.brier_score)}. Không chọn theo test.`;
 markup+=`<p class="comparison-result">${result}</p><details class="comparison-details"><summary>Chi tiết chọn cấu hình và thí nghiệm bổ sung</summary><p>${selectionNote}</p>`;
 if(accuracyGoal)markup+=`<p>Accuracy nếu cùng dùng ngưỡng 0.5: baseline ${accuracy(a.evaluation.test.accuracy_at_0_5)}, có pattern ${accuracy(b.evaluation.test.accuracy_at_0_5)}. ${escape(pair.test_status)}. Đây là kết quả thăm dò trên test đã sử dụng trước đây.</p><p>Feature pattern: ${b.global_features||0} theo map/phe và ${b.personal_features||0} theo tuyển thủ; các block được điều chỉnh trọng số riêng sau chuẩn hóa.</p>`;

 const boot=pair.round_bootstrap;
 if(boot?.accuracy_at_0_5_ci95)markup+=`<p>Chênh lệch Accuracy ở ngưỡng 0.5: ${signed(boot.accuracy_at_0_5_difference*100,3)} điểm %; CI 95% [${signed(boot.accuracy_at_0_5_ci95[0]*100,3)}, ${signed(boot.accuracy_at_0_5_ci95[1]*100,3)}]. Đây là metric thứ cấp; không dùng để thay đổi lựa chọn đã khóa.</p>`;
 if(boot?.accuracy_ci95)markup+=`<p>Chênh lệch Accuracy: ${signed(boot.accuracy_difference*100,3)} điểm %; CI 95% [${signed(boot.accuracy_ci95[0]*100,3)}, ${signed(boot.accuracy_ci95[1]*100,3)}] theo nhóm cặp đội. Khoảng chứa 0 nghĩa là chưa có bằng chứng chắc chắn về cải thiện.</p>`;
 if(boot)markup+=`<p>Cải thiện Brier trung bình từng round so với baseline: ${signed(boot.round_balanced_brier_improvement_over_A,6)}; CI 95% [${signed(boot.ci95[0],6)}, ${signed(boot.ci95[1],6)}]. Bootstrap theo ${boot.clusters} cặp đội, ${boot.replicates} lần; số dương tốt hơn baseline. Đại lượng này khác Brier tính trên snapshot trong bảng.</p>`;
 const extra=Object.entries(info.comparison||{}).filter(([key])=>![a.id,b.id].includes(key));
 if(extra.length)markup+='<p>Các biến thể sau không thuộc cặp so sánh chính:</p><table><thead><tr><th>Thử nghiệm bổ sung</th><th>Test Brier ↓</th><th>Test AUC ↑</th></tr></thead><tbody>'+extra.map(([key,value])=>`<tr><td>${escape(labels[key]||key)}</td><td>${number(value.evaluation.test.brier_score)}</td><td>${number(value.evaluation.test.roc_auc)}</td></tr>`).join('')+'</tbody></table>';
 markup+='</details>';
 if(info.simple_trial)markup=simpleTrialView(info.simple_trial)+'<details class="comparison-details"><summary>Đối chứng trước và mô hình đang phục vụ replay</summary>'+markup+'</details>';
 return {description:`Baseline là LR không có thông tin pattern. So sánh với LR có cùng trạng thái và bổ sung feature pattern MOVE được khai phá trên train. Mặc định replay dùng ${labels[info.chosen_family]||info.chosen_family}; có thể đổi mô hình trong Tùy chọn phân tích. Đổi min_sup chỉ thay phần phân tích, không huấn luyện lại LR.`,markup};
}
