/**
 * Test Booking Email Endpoint
 * 
 * This script tests the actual booking email endpoint to ensure
 * emails are being sent successfully when a booking is made.
 * 
 * Usage: node test-booking-email.cjs
 */

// Use native fetch (Node.js 18+)
const fetch = globalThis.fetch;

async function testBookingEmail() {
  console.log('🧪 Testing Booking Email Endpoint...\n');
  
  const testData = {
    patientName: 'Test Patient',
    patientEmail: 'ngw.designer@gmail.com', // Send to yourself for testing
    patientPhone: '9876543210',
    appointmentDate: '2026-01-15',
    appointmentTime: '10:00 AM',
    reason: 'Test appointment - verifying email system'
  };

  try {
    console.log('📧 Sending test booking email...');
    console.log('Endpoint: http://localhost:5000/api/send-booking');
    console.log('Data:', JSON.stringify(testData, null, 2));
    console.log('');

    const response = await fetch('http://localhost:5000/api/send-booking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const result = await response.json();

    console.log('📊 Response Status:', response.status);
    console.log('📊 Response OK:', response.ok);
    console.log('📊 Response Data:', JSON.stringify(result, null, 2));
    console.log('');

    if (response.ok && result.success) {
      console.log('✅ SUCCESS! Test booking email sent successfully!');
      console.log('✅ Check your inbox (and spam folder) for:');
      console.log('   - Patient confirmation email');
      console.log('   - Admin notification email');
      console.log('');
      console.log('📧 From: ngw.designer@gmail.com');
      console.log('📧 To: ngw.designer@gmail.com (patient) + ngw.designer@gmail.com (admin)');
    } else {
      console.log('❌ FAILED! Email was not sent successfully.');
      console.log('❌ Error:', result.message || 'Unknown error');
      console.log('');
      console.log('🔧 Troubleshooting:');
      console.log('   1. Make sure email server is running: node email-server.cjs');
      console.log('   2. Check email server console for errors');
      console.log('   3. Verify .env file has correct credentials');
      console.log('   4. Run: node test-email-connection.cjs');
    }

  } catch (error) {
    console.log('❌ ERROR:', error.message);
    console.log('');
    console.log('🔧 Possible Issues:');
    console.log('   1. Email server is not running');
    console.log('   2. Wrong endpoint URL');
    console.log('   3. Network connectivity issues');
    console.log('');
    console.log('💡 Solution:');
    console.log('   Start the email server: node email-server.cjs');
  }
}

testBookingEmail();