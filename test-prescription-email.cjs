/**
 * Test Prescription Email Endpoint
 * 
 * This script tests the prescription email endpoint to ensure
 * prescriptions are being sent successfully from the admin panel.
 * 
 * Usage: node test-prescription-email.cjs
 */

const fetch = globalThis.fetch;

async function testPrescriptionEmail() {
  console.log('🧪 Testing Prescription Email Endpoint...\n');
  
  const testData = {
    patientName: 'Test Patient',
    patientEmail: 'ngw.designer@gmail.com',
    patientPhone: '9876543210',
    gender: 'Male',
    age: '35',
    address: 'Test Address',
    suffering: 'Dental pain and sensitivity',
    prescription: 'Tab. Ibuprofen 400mg - SOS\nTab. Amoxicillin 500mg - TID x 5 days\nMouthwash - BID x 7 days\nAvoid hot and cold foods',
    prescriptionDate: '2026-01-07',
    visitDate: '2026-01-07',
    totalFees: '500',
    amountPaid: '500',
    paymentStatus: 'paid',
    nextAppointmentDate: '2026-01-14',
    notes: 'Follow up after 7 days',
  };

  try {
    console.log('📧 Sending test prescription email...');
    console.log('Endpoint: http://localhost:5000/api/send-prescription');
    console.log('Data:', JSON.stringify(testData, null, 2));
    console.log('');

    const response = await fetch('http://localhost:5000/api/send-prescription', {
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
      console.log('✅ SUCCESS! Test prescription email sent successfully!');
      console.log('✅ Check your inbox (and spam folder) for:');
      console.log('   - Patient prescription email with PDF attachment');
      console.log('   - Admin notification email');
      console.log('');
      console.log('📧 From: ngw.designer@gmail.com');
      console.log('📧 To: ngw.designer@gmail.com (patient) + ngw.designer@gmail.com (admin)');
    } else {
      console.log('❌ FAILED! Prescription email was not sent successfully.');
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

testPrescriptionEmail();