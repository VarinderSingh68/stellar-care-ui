const http = require('http');

const bookingData = {
  patientName: 'API Test Patient',
  patientEmail: 'test.patient@example.com', // Use a real email to check delivery
  patientPhone: '555-0101',
  appointmentDate: 'Next Tuesday',
  appointmentTime: '3:00 PM',
  reason: 'Testing the booking API endpoint directly',
};

const postData = JSON.stringify(bookingData);

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/send-booking',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
};

console.log('🚀 Sending POST request to /api/send-booking...');

const req = http.request(options, (res) => {
  console.log(`\n✅ Server responded with status: ${res.statusCode}`);

  let responseBody = '';
  res.on('data', (chunk) => {
    responseBody += chunk;
  });

  res.on('end', () => {
    try {
      const parsedBody = JSON.parse(responseBody);
      console.log('📄 Server Response:');
      console.log(parsedBody);

      if (res.statusCode === 200 && parsedBody.success) {
        console.log('\n🎉 SUCCESS: The endpoint responded correctly.');
        console.log('Check the email server terminal for "✅ Emails sent successfully".');
      } else {
        console.error('\n❌ FAILED: The endpoint returned an error or unsuccessful status.');
        console.error('   Message:', parsedBody.message);
      }
    } catch (e) {
      console.error('\n❌ FAILED: Could not parse the server response as JSON.');
      console.error('   Raw Response:', responseBody);
    }
  });
});

req.on('error', (e) => {
  console.error(`\n❌ FAILED: Problem with request: ${e.message}`);
  if (e.code === 'ECONNREFUSED') {
    console.error('   Hint: Is the email server running? Try `node email-server.cjs`.');
  }
});

req.write(postData);
req.end();