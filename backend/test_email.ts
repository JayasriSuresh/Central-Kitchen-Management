import { sendOnboardingInvitation } from './src/services/email.service';
import 'dotenv/config';

async function test() {
  try {
    console.log('Sending test email...');
    await sendOnboardingInvitation(
      'jayasri.suresh077@gmail.com', // Sending to the user's email
      'Jayasri Test',
      'Test Restaurant',
      'Central Kitchen Test',
      'http://localhost:5173/onboarding/register?token=test123'
    );
    console.log('Test email sent.');
  } catch (err) {
    console.error('Test email failed:', err);
  }
}
test();
