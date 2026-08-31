const SUPABASE_URL = 'https://xklwzkraobxetxdcysun.supabase.co';
const PROXY_URL = SUPABASE_URL + '/functions/v1/takamol-proxy/api/takamol/categories';

fetch(PROXY_URL, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
  .then(r => {
    console.log('Status:', r.status, 'Content-Type:', r.headers.get('content-type'));
    return r.text();
  })
  .then(t => {
    console.log('Response:', t.substring(0, 800));
  })
  .catch(e => {
    console.log('Error:', e.message);
  });

// Also test with the Railway URL directly
const RAILWAY_URL = 'https://takamol-api.up.railway.app/api/takamol/categories';
setTimeout(() => {
  fetch(RAILWAY_URL, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
    .then(r => {
      console.log('\nRailway Status:', r.status);
      return r.text();
    })
    .then(t => console.log('Railway Response:', t.substring(0, 500)))
    .catch(e => console.log('Railway Error:', e.message));
}, 500);
