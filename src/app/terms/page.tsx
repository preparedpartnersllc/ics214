export const metadata = { title: 'Terms of Service — Command OS' }

export default function TermsPage() {
  const updated = 'April 11, 2026'

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#E5E7EB]">
      <div className="max-w-2xl mx-auto px-6 py-12">

        <div className="mb-10">
          <p className="text-xs font-mono text-[#FF5A1F] uppercase tracking-widest mb-2">Command OS</p>
          <h1 className="text-2xl font-bold text-white mb-1">Terms of Service</h1>
          <p className="text-xs text-[#6B7280]">Last updated: {updated}</p>
        </div>

        <div className="space-y-8 text-sm text-[#9CA3AF] leading-relaxed">

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">1. Acceptance</h2>
            <p>
              By accessing or using Command OS ("the App"), operated by Prepared Partners LLC on behalf
              of the Detroit Fire Department, you agree to be bound by these Terms of Service. If you do
              not agree, do not use the App.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">2. Who May Use the App</h2>
            <p>
              Command OS is an internal incident management platform for authorized personnel of the
              Detroit Fire Department and partnering agencies. Access is granted by system administrators.
              You must not share your credentials or allow unauthorized persons to access your account.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">3. Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your login credentials. You must
              notify your administrator immediately if you suspect unauthorized access to your account.
              Administrators may deactivate accounts that are no longer in use or that violate these terms.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">4. Acceptable Use</h2>
            <p className="mb-2">You agree to use Command OS only for its intended purpose: coordinating incident management activities. You must not:</p>
            <ul className="list-disc list-inside space-y-1 text-[#6B7280]">
              <li>Use the App for any unlawful purpose</li>
              <li>Attempt to gain unauthorized access to any part of the system</li>
              <li>Input false, misleading, or harmful information into any record</li>
              <li>Interfere with the operation of the App or its infrastructure</li>
              <li>Share confidential incident data outside authorized channels</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">5. SMS Messaging</h2>
            <p className="mb-2">
              Command OS may send SMS text messages to phone numbers registered in the system, including
              account invitations, operational alerts, and notifications. By providing a phone number and
              using the App, you consent to receive such messages.
            </p>
            <p className="mb-2">
              Message and data rates may apply. Message frequency varies based on operational activity.
            </p>
            <p>
              To opt out of SMS messages, contact your system administrator or reply STOP to any message.
              For help, reply HELP or contact your administrator.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">6. Data and Records</h2>
            <p>
              ICS 214 activity logs, personnel assignments, and other records created in the App may
              constitute official incident documentation. You are responsible for the accuracy of
              information you enter. Records may be retained in accordance with applicable laws and
              departmental policies.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">7. Availability</h2>
            <p>
              We strive to keep Command OS available during active incidents. However, we do not
              guarantee uninterrupted availability. The App should not be relied upon as the sole means
              of incident coordination. Always have backup communication procedures in place.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">8. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, Prepared Partners LLC and the Detroit Fire
              Department shall not be liable for any indirect, incidental, or consequential damages
              arising from use of or inability to use the App. Use of Command OS during emergency
              operations is at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">9. Changes</h2>
            <p>
              We may update these Terms from time to time. Continued use of the App after changes are
              posted constitutes acceptance of the updated Terms. The "Last updated" date at the top of
              this page reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">10. Contact</h2>
            <p>
              Questions about these Terms may be directed to your system administrator or to
              Prepared Partners LLC via the contact information provided to your department.
            </p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-[#232B36]">
          <p className="text-xs text-[#4B5563]">© {new Date().getFullYear()} Prepared Partners LLC · Command OS</p>
        </div>
      </div>
    </div>
  )
}
