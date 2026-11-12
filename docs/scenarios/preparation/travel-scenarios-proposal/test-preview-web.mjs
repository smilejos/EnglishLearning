// 本批唯讀_test前台，只走已另行啟動的5180測試API；不啟動DB/匯入/生成。
import {createServer} from 'vite';
import {createPhonicsPreviewConfig} from '../../../../scripts/preview-phonics.mjs';
if(process.env.TRAVEL_TEST_PREVIEW!=='1')throw new Error('須明示TRAVEL_TEST_PREVIEW=1，並先確認5180為本批_test API');
const config=createPhonicsPreviewConfig('http://127.0.0.1:5180');config.server.port=5181;
const server=await createServer(config);await server.listen();server.printUrls();
for(const key of ['travel-airport-gate','travel-hotel-check-in','travel-ferry-trip','travel-airplane-cabin'])console.log(`http://127.0.0.1:5181/#/scenarios/${key}/revisions/1`);
const close=()=>{void server.close().finally(()=>process.exit());};process.once('SIGINT',close);process.once('SIGTERM',close);
