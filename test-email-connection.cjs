/**
 * Email Connection Test Script
 * 
 * This script tests if your Gmail credentials are working correctly
 * with nodemailer. Run this before starting the email server.
 * 
 * Usage: node test-email-connection.js
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

const emailUser = process.env.EMAIL_USER;
const emailPassword = (process.env.EMAIL_PASSWORD || '').replace(/\s/g, '');

console.log('🔍 Testing Email Configuration...\n');
console.log('Email User:', emailUser);
console.log('Email Password Length:', emailPassword.length, 'characters');
console.log('Password has spaces:', process.env.EMAIL_PASSWORD?.includes(' '));

if (!emailUser || !emailPassword) {
  console.log('\n❌ ERROR: Missing EMAIL_USER or EMAIL_PASSWORD in .env file');
  console.log('Please create a .env file with these variables:');
  console.log('  EMAIL_USER=your-email@gmail.com');
  console.log('  EMAIL_PASSWORD=your-16-char-app-password');
  process.exit(1);
}

if (emailPassword.length !== 16) {
  console.log('\n⚠️  WARNING: App password should be exactly 16 characters (without spaces)');
  console.log('Current length:', emailPassword.length);
  console.log('Make sure you:');
  console.log('  1. Enabled 2-Factor Authentication on your Google Account');
  console.log('  2. Generated an App Password from https://myaccount.google.com/apppasswords');
  console.log('  3. Removed any spaces from the password');
}

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailUser,
    pass: emailPassword,
  },
});

// Test connection
console.log('\n🔄 Testing connection to Gmail SMTP...');

transporter.verify((error, success) => {
  if (error) {
    console.log('\n❌ CONNECTION FAILED!');
    console.log('Error:', error.message);
    console.log('\n🔧 Troubleshooting Steps:');
    console.log('  1. Check that 2-Factor Authentication is enabled on your Google Account');
    console.log('  2. Generate a new App Password from https://myaccount.google.com/apppasswords');
    console.log('  3. Make sure you\'re using the App Password, not your regular Gmail password');
    console.log('  4. Remove any spaces from the password in your .env file');
    console.log('  5. Check for typos in your email address');
    console.log('\n📧 Common Gmail Errors:');
    console.log('  - "Invalid login": Wrong app password or 2FA not enabled');
    console.log('  - "Connection timeout": Network issues or Gmail blocking');
    console.log('  - "Less secure app access": Enable at https://myaccount.google.com/lesssecureapps');
    process.exit(1);
  } else {
    console.log('\n✅ SUCCESS! Email server is ready to send emails.');
    console.log('✅ Gmail SMTP connection verified.');
    console.log('\n🚀 Next Steps:');
    console.log('  1. Start the email server: node email-server.cjs');
    console.log('  2. Start the frontend: npm run dev');
    console.log('  3. Test by booking an appointment');
    console.log('\n📧 Emails will be sent from:', emailUser);
    console.log('📧 Admin notifications will go to: ngw.designer@gmail.com');
    
    // Optional: Send a test email
    console.log('\n📧 Would you like to send a test email? (y/n)');
    
    // Note: For automated testing, uncomment below
    /*
    const testMailOptions = {
      from: emailUser,
      to: emailUser, // Send to yourself for testing
      subject: '✅ Email Test Successful - CardioVita',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">✅ Email Test Successful!</h2>
          <p>This is a test email from your CardioVita email server.</p>
          <p>If you received this email, your Gmail App Password is configured correctly.</p>
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <p><strong>✅ Status:</strong> Connected</p>
            <p><strong>📧 From:</strong> ${emailUser}</p>
            <p><strong>🕐 Time:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p style="margin-top: 20px;">Best regards,<br><strong>CardioVita Email System</strong></p>
        </div>
      `,
    };
    
    transporter.sendMail(testMailOptions, (err, info) => {
      if (err) {
        console.log('\n⚠️  Test email could not be sent:', err.message);
      } else {
        console.log('\n📧 Test email sent successfully to', emailUser);
        console.log('Check your inbox (and spam folder) for the test email.');
      }
      process.exit(0);
    });
    */
    
    process.exit(0);
  }
});