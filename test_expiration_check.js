
const BASE_URL = 'http://localhost:3000';

async function run() {
  try {
    // 1. Upload file
    console.log('Uploading file...');
    const uploadRes = await fetch(`${BASE_URL}/trpc/files.upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        json: {
          filename: 'test.txt',
          fileData: Buffer.from('hello world').toString('base64'),
          mimeType: 'text/plain',
          fileSize: 11,
          expiresInSeconds: 5
        }
      })
    });
    
    const uploadData = await uploadRes.json();
    if (uploadData.error) {
      console.error('Upload failed:', uploadData.error);
      return;
    }
    
    const shareToken = uploadData.result.data.json.shareToken;
    console.log('File uploaded. Share token:', shareToken);
    
    // 2. Check immediately (should exist)
    console.log('Checking immediately...');
    const check1 = await fetch(`${BASE_URL}/trpc/files.getByShareToken?input=${encodeURIComponent(JSON.stringify({ json: { shareToken } }))}`);
    const check1Data = await check1.json();
    
    if (check1Data.result && check1Data.result.data.json.file) {
      console.log('Check 1: File exists (Expected)');
    } else {
      console.error('Check 1: File NOT found (Unexpected)', check1Data);
    }
    
    // 3. Wait 6 seconds
    console.log('Waiting 6 seconds...');
    await new Promise(r => setTimeout(r, 6000));
    
    // 4. Check again (should be expired)
    console.log('Checking after expiration...');
    const check2 = await fetch(`${BASE_URL}/trpc/files.getByShareToken?input=${encodeURIComponent(JSON.stringify({ json: { shareToken } }))}`);
    const check2Data = await check2.json();
    
    if (check2Data.error && check2Data.error.json.message === 'File has expired') {
      console.log('Check 2: File expired (Expected)');
    } else if (check2Data.result && check2Data.result.data.json.file) {
      console.error('Check 2: File STILL exists (Unexpected)');
    } else {
      console.log('Check 2: Other result', check2Data);
    }
    
  } catch (e) {
    console.error('Error:', e);
  }
}

run();
