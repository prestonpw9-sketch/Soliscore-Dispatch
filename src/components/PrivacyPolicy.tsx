import React from 'react';

// Public Privacy Policy page (no login required). Required for Twilio A2P/10DLC
// SMS registration and linked from the SMS HELP auto-reply.
// Content is the company's own Privacy Policy document.

const COMPANY = 'Solidcore Plumbing, LLC';
const EFFECTIVE = 'May 26, 2026';

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-3">{children}</p>
);
const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-base font-bold text-slate-900 mt-6 mb-2">{children}</h2>
);

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-6">
          <img src="/itdg-logo.png" alt="ITDG Plumbing" className="h-12 w-auto" />
          <div>
            <h1 className="text-2xl font-black text-slate-900">Privacy Policy</h1>
            <p className="text-sm text-slate-500">{COMPANY}</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-6">Effective Date: {EFFECTIVE}</p>

        <div className="text-sm leading-relaxed">
          <P>{COMPANY} respects your privacy and is committed to protecting the personal
          information you share with us. This Privacy Policy explains how we collect, use, store,
          and protect information when you contact us, request services, visit our website, or
          communicate with us by phone, email, or text message.</P>

          <H>Information We Collect</H>
          <P>We may collect personal information that you voluntarily provide to us, including your
          name, phone number, email address, service address, billing information, and any details
          you provide about your plumbing issue or service request. We may also collect information
          related to appointments, invoices, communications, and customer service interactions.</P>

          <H>How We Use Your Information</H>
          <P>We use the information we collect to provide plumbing and related services, schedule
          and confirm appointments, coordinate dispatch, send service updates, respond to questions,
          process payments, maintain business records, improve our customer service, and comply with
          legal obligations.</P>

          <H>SMS Communications</H>
          <P>{COMPANY} uses SMS to coordinate dispatch and plumbing services. If you provide your
          mobile number, you consent to receive service-related text messages from us, such as
          appointment reminders, technician arrival updates, and responses to your inquiries. Message
          frequency may vary depending on your service needs. Standard message and data rates may
          apply based on your mobile carrier plan.</P>
          <P>You can opt out of receiving text messages at any time by replying STOP. For help, reply
          HELP or contact us directly.</P>

          <H>Sharing and Disclosure of Information</H>
          <P>We will never share, trade, or sell your personal information or phone number to any
          third party for marketing purposes. We may share information only as necessary to operate
          our business and provide services, such as with payment processors, software providers,
          communication platforms, or service providers that support our operations and are expected
          to protect your information. We may also disclose information when required by law,
          regulation, legal process, or to protect our rights, safety, and property.</P>

          <H>Data Security</H>
          <P>We use reasonable administrative, technical, and physical safeguards designed to protect
          your personal information from unauthorized access, use, or disclosure. However, no method
          of transmission over the internet or electronic storage is completely secure, so we cannot
          guarantee absolute security.</P>

          <H>Data Retention</H>
          <P>We retain personal information for as long as reasonably necessary to provide services,
          maintain records, resolve disputes, enforce agreements, and comply with legal, accounting,
          or tax obligations.</P>

          <H>Your Choices</H>
          <P>You may contact us to update your contact information or ask questions about how we
          handle your personal information. You may also opt out of SMS communications as described
          above. Depending on applicable law, you may have additional rights regarding access to,
          correction of, or deletion of your personal information.</P>

          <H>Children's Privacy</H>
          <P>Our services are not directed to children under 18, and we do not knowingly collect
          personal information from children.</P>

          <H>Changes to This Privacy Policy</H>
          <P>We may update this Privacy Policy from time to time. Any changes will be posted in the
          updated policy with a revised effective date.</P>

          <H>Contact Us</H>
          <P>If you have questions about this Privacy Policy or our privacy practices, please contact
          {' '}{COMPANY} using the contact information provided on our business materials.</P>

          <H>SMS Terms &amp; Conditions</H>
          <P>By providing your mobile number to {COMPANY}, you agree to receive SMS text messages
          from us related to your service requests and customer support. These messages may include
          appointment confirmations, appointment reminders, dispatch updates, technician arrival
          notifications, service follow-up messages, and responses to your questions.</P>
          <P>Your consent to receive text messages is not a condition of purchase. Message frequency
          may vary depending on your service activity, appointment schedule, and communication
          needs.</P>
          <P>Message and data rates may apply according to your wireless carrier plan. {COMPANY} is
          not responsible for any messaging or data charges imposed by your carrier.</P>
          <P>You may opt out of receiving SMS messages at any time by replying STOP to any message.
          After you send STOP, you may receive one final message confirming that you have been
          unsubscribed. If you want to receive messages again, you may contact us directly to resume
          service-related text communications.</P>
          <P>For assistance, reply HELP to any message or contact {COMPANY} directly using the
          contact information provided in our business materials.</P>
          <P>Message delivery is subject to your mobile carrier's network availability. Carriers are
          not liable for delayed or undelivered messages.</P>
          <P>Your information will be handled in accordance with our Privacy Policy, including our
          commitment not to sell or share your phone number for third-party marketing purposes.</P>
          <P>We may update these SMS Terms &amp; Conditions from time to time. Any changes will become
          effective when the updated terms are made available in our business materials or on our
          website.</P>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200 text-xs text-slate-400">
          <a href="/" className="text-teal-700 font-semibold hover:underline">Return to app</a>
        </div>
      </div>
    </div>
  );
}
