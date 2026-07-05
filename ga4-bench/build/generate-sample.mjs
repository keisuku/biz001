import fs from 'node:fs/promises';
await fs.mkdir('testdata/ga4-sample',{recursive:true});
const months=['2026-04','2026-05','2026-06'];
const channels=['Organic Search','Paid Search','Direct','Referral'];
const lps=['/','/lp/cyber','/contact','/column/security'];
const qs=['サイバー保険','丸紅 セーフネット','情報漏洩 保険','ランサムウェア 対策'];
function csv(rows){return rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n')+'\n'}
for(const [mi,m] of months.entries()){
 const ym=m.replace('-','');
 await fs.writeFile(`testdata/ga4-sample/ga4_channel_${ym}.csv`,csv([[`# GA4 レポート ${m}`],[],['セッションのデフォルトチャネルグループ','セッション','エンゲージのあったセッション数','新規ユーザー'],...channels.map((c,i)=>[c,1000+mi*120+i*90+(mi===2&&c==='Organic Search'?900:0),700+mi*80+i*40,400+mi*50+i*20]) ]));
 await fs.writeFile(`testdata/ga4-sample/ga4_landing_${ym}.csv`,csv([[`# Landing page report ${m}`],[],['ランディング ページ','セッション','エンゲージメント率','コンバージョン'],...lps.map((p,i)=>[p,700+mi*70+i*60,`${55+mi*4-i}%`,i===1&&mi===2?80:10+mi*3+i]) ]));
 await fs.writeFile(`testdata/ga4-sample/gsc_queries_${ym}.csv`,csv([['クエリ','クリック数','表示回数','CTR','掲載順位'],...qs.map((q,i)=>[q,60+mi*8+i*5,1200+mi*100+i*120,`${(5+mi+i/2).toFixed(1)}%`,(8-mi-i/4).toFixed(1)]) ]));
 await fs.writeFile(`testdata/ga4-sample/gsc_pages_${ym}.csv`,csv([['ページ','クリック数','表示回数','CTR','掲載順位'],...lps.map((p,i)=>[p,50+mi*7+i*6,900+mi*90+i*100,`${(4+mi+i/3).toFixed(1)}%`,(9-mi-i/5).toFixed(1)]) ]));
}
console.log('testdata/ga4-sample に3ヶ月分のGA4/GSCサンプルCSVを生成しました');
