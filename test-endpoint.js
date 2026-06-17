import fetch from 'node-fetch'; // Wait, let's use global fetch (available natively in Node v20!)

async function testPost() {
  console.log('Sending test POST request to /api/assignments...');
  try {
    const res = await fetch('http://localhost:3000/api/assignments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'hr',
        'x-username': 'hr@company.com'
      },
      body: JSON.stringify({
        title: 'Network API Test Task',
        description: 'Verification of assignment endpoint'
      })
    });

    console.log('Response status:', res.status);
    const body = await res.json();
    console.log('Response body:', body);

    if (res.status === 201) {
      console.log('[SUCCESS] Endpoint works perfectly!');
      process.exit(0);
    } else {
      console.log('[FAIL] Endpoint failed with status:', res.status);
      process.exit(1);
    }
  } catch (err) {
    console.error('[FATAL] Request crashed:', err);
    process.exit(1);
  }
}

testPost();
