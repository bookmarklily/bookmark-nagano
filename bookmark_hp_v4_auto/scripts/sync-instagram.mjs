import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(PUBLIC, 'data');
const IMG = path.join(PUBLIC, 'images', 'instagram');
const token = process.env.INSTAGRAM_ACCESS_TOKEN;
const limit = Math.max(1, Math.min(Number(process.env.INSTAGRAM_LIMIT || 50), 100));
if (!token) throw new Error('INSTAGRAM_ACCESS_TOKEN が未設定です');

await fs.mkdir(DATA, {recursive:true});
await fs.mkdir(IMG, {recursive:true});

const fields = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,children{media_type,media_url,thumbnail_url}';
const endpoint = new URL('https://graph.instagram.com/me/media');
endpoint.searchParams.set('fields', fields);
endpoint.searchParams.set('limit', String(limit));
endpoint.searchParams.set('access_token', token);

const res = await fetch(endpoint);
const rawText = await res.text();
if (!res.ok) throw new Error(`Instagram API ${res.status}: ${rawText.slice(0,500)}`);
const payload = JSON.parse(rawText);

const cityRegion = [
  ['長野','北信'],['須坂','北信'],['千曲','北信'],['中野','北信'],['飯山','北信'],
  ['上田','東信'],['小諸','東信'],['佐久','東信'],['軽井沢','東信'],['御代田','東信'],['東御','東信'],
  ['松本','中信'],['安曇野','中信'],['塩尻','中信'],['大町','中信'],['白馬','中信'],
  ['諏訪','南信'],['茅野','南信'],['岡谷','南信'],['伊那','南信'],['駒ヶ根','南信'],['飯田','南信']
];
const typeRules = [
  ['WORKSHOP', /workshop|ワークショップ|\bws\b/i],
  ['BATTLE', /battle|バトル/i],
  ['CONTEST', /contest|コンテスト|competition/i],
  ['SHOWCASE', /showcase|ショーケース|発表会|dance show/i],
  ['EVENT', /event|festival|fes|祭|学園祭|文化祭/i]
];

function clean(s=''){return s.replace(/\r/g,'').trim()}
function firstTitle(caption=''){
  const lines=clean(caption).split('\n').map(x=>x.trim()).filter(Boolean);
  const skip=/^(【?BOOKMARK|DATE\b|PLACE\b|TIME\b|OPEN\b|FEE\b|PRICE\b|ENTRY\b|INFO\b|@|#)/i;
  let line=lines.find(x=>!skip.test(x)) || lines[0] || 'Instagram Event';
  line=line.replace(/^【|】$/g,'').replace(/^\d{1,2}\s*[｜|]\s*/,'').trim();
  return line.slice(0,90);
}
function classify(caption=''){
  const hit=typeRules.find(([,re])=>re.test(caption)); return hit?.[0] || 'EVENT';
}
function locate(caption=''){
  const hit=cityRegion.find(([city])=>caption.includes(city));
  return hit ? {city:hit[0],area:hit[1]} : {city:'長野県',area:'要確認'};
}
function capture(caption, labels){
  for(const label of labels){
    const re=new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:：｜|]?\\s*([^\\n]+)`,'i');
    const m=caption.match(re); if(m) return m[1].trim();
  }
  return '';
}
function extractDate(caption=''){
  const labeled=capture(caption,['DATE','日程','日時']); if(labeled) return labeled;
  const m=caption.match(/(?:20\d{2}[.\/-])?\d{1,2}[.\/-]\d{1,2}(?:\s*(?:SAT|SUN|MON|TUE|WED|THU|FRI|土|日|月|火|水|木|金))?/i);
  return m?.[0] || '日程 要確認';
}
function extractVenue(caption=''){
  return capture(caption,['PLACE','VENUE','会場','場所']) || '会場 要確認';
}
function extractTime(caption=''){
  const labeled=capture(caption,['TIME','DANCE','START','時間']); if(labeled) return labeled;
  const m=caption.match(/\b\d{1,2}:\d{2}\s*(?:[-〜~–—]\s*\d{1,2}:\d{2})?/); return m?.[0] || '時間 要確認';
}
function imageSource(m){
  if(m.media_type==='VIDEO') return m.thumbnail_url || m.media_url;
  if(m.media_type==='CAROUSEL_ALBUM'){
    const child=m.children?.data?.[0]; return child?.thumbnail_url || child?.media_url || m.media_url;
  }
  return m.media_url || m.thumbnail_url;
}
function extFrom(contentType='', url=''){
  if(contentType.includes('png')) return '.png';
  if(contentType.includes('webp')) return '.webp';
  if(contentType.includes('jpeg')||contentType.includes('jpg')) return '.jpg';
  const e=path.extname(new URL(url).pathname).toLowerCase(); return ['.jpg','.jpeg','.png','.webp'].includes(e)?e:'.jpg';
}
async function cacheImage(m){
  const src=imageSource(m); if(!src) return '';
  const r=await fetch(src); if(!r.ok) return '';
  const buf=Buffer.from(await r.arrayBuffer());
  const ext=extFrom(r.headers.get('content-type')||'',src);
  const safe=String(m.id).replace(/[^0-9A-Za-z_-]/g,'_');
  const filename=`${safe}-${crypto.createHash('sha1').update(buf).digest('hex').slice(0,8)}${ext}`;
  await fs.writeFile(path.join(IMG,filename),buf);
  return `images/instagram/${filename}`;
}

const events=[];
for(const m of payload.data || []){
  const caption=clean(m.caption||'');
  const image=await cacheImage(m);
  const loc=locate(caption);
  const dateLabel=extractDate(caption), venue=extractVenue(caption), time=extractTime(caption);
  events.push({
    id:m.id, source:'instagram', title:firstTitle(caption), type:classify(caption), typeJa:classify(caption),
    area:loc.area, city:loc.city, dateLabel, time, venue, image,
    instagram:m.permalink||'https://www.instagram.com/bookmark_nagano/', timestamp:m.timestamp||'', caption,
    needsReview:[dateLabel,time,venue,loc.area].some(x=>String(x).includes('要確認'))
  });
}

await fs.writeFile(path.join(DATA,'events.json'), JSON.stringify(events,null,2)+'\n');
await fs.writeFile(path.join(DATA,'sync.json'), JSON.stringify({syncedAt:new Date().toISOString(),count:events.length,account:'bookmark_nagano'},null,2)+'\n');
console.log(`BOOKMARK sync complete: ${events.length} posts`);
