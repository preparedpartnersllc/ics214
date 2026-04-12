export const metadata = { title: 'Privacy Policy — Command OS' }

export default function PrivacyPage() {
  const updated = 'April 11, 2026'

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#E5E7EB]">
      <div className="max-w-2xl mx-auto px-6 py-12">

        <div className="mb-10">
          <p className="text-xs font-mono text-[#FF5A1F] uppercase tracking-widest mb-2">Command OS</p>
          <h1 className="text-2xl font-bold text-white mb-1">Privacy Policy</h1>
          <p className="text-xs text-[#6B7280]">Last updated: {updated}</p>
        </div>

        <div className="space-y-8 text-sm text-[#9CA3AF] leading-relaxed">

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">1. Overview</h2>
            <p>
              This Privacy Policy describes how Prepared Partners LLC ("we", "us") collects, uses, and
              protects information in connection with Command OS, an incident management platform
              operated on behalf of the Detroit Fire Department. We are committed to protecting the
              privacy of all users.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">2. Information We Collect</h2>
            <p className="mb-3">We collect the following categories of information:</p>

            <p className="text-[#E5E7EB] font-medium mb-1">Account information</p>
            <ul className="list-disc list-inside space-y-1 text-[#6B7280] mb-4">
              <li>Full name and email address</li>
              <li>Phone number (if provided)</li>
              <li>Agency and unit affiliation</li>
              <li>Role and access level</li>
              <li>Account creation and activity timestamps</li>
            </ul>

            <p className="text-[#E5E7EB] font-medium mb-1">Operational data</p>
            <ul className="list-disc list-inside space-y-1 text-[#6B7280] mb-4">
              <li>ICS 214 activity log entries</li>
              <li>Personnel assignments and check-in records</li>
              <li>Incident and operational period data</li>
              <li>Demobilization requests and approvals</li>
            </ul>

            <p className="text-[#E5E7EB] font-medium mb-1">Technical data</p>
            <ul className="list-disc list-inside space-y-1 text-[#6B7280]">
              <li>Login activity and session information</li>
              <li>Browser type and device information (via standard web logs)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">3. How We Use Your Information</h2>
            <p className="mb-2">We use collected information to:</p>
            <ul className="list-disc list-inside space-y-1 text-[#6B7280]">
              <li>Authenticate users and manage access to the App</li>
              <li>Support incident management operations and ICS documentation</li>
              <li>Send SMS notifications and account invitations to registered phone numbers</li>
              <li>Generate official incident reports and activity logs</li>
              <li>Maintain platform security and investigate unauthorized access</li>
              <li>Improve the App's functionality and reliability</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">4. SMS Messaging</h2>
            <p className="mb-2">
              If you provide a phone number, you may receive SMS text messages from Command OS,
              including account invitations and operational notifications sent by authorized administrators.
            </p>
            <p className="mb-2">
              SMS messages are delivered via Twilio. Your phone number is transmitted to Twilio solely
              for message delivery. Twilio's privacy practices are described at
              <a href="https://www.twilio.com/legal/privacy" target="_blank" rel="noopener noreferrer"
                className="text-[#FF5A1F] hover:text-[#FF6A33] ml-1">twilio.com/legal/privacy</a>.
            </p>
            <p>
              To opt out of SMS messages, reply STOP to any message or contact your system
              administrator. Standard message and data rates may apply.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">5. Information Sharing</h2>
            <p className="mb-2">
              We do not sell your personal information. We may share information in the following
              limited circumstances:
            </p>
            <ul className="list-disc list-inside space-y-1 text-[#6B7280]">
              <li><span className="text-[#9CA3AF]">Service providers:</span> Supabase (database and authentication), Twilio (SMS delivery), and Vercel (hosting). Each is bound by data processing terms.</li>
              <li><span className="text-[#9CA3AF]">Authorized personnel:</span> Incident data is visible to other authorized users within the same incident or operation.</li>
              <li><span className="text-[#9CA3AF]">Legal requirements:</span> We may disclose information if required by law, court order, or to protect the safety of personnel.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">6. Data Security</h2>
            <p>
              We implement industry-standard security measures including encrypted connections (HTTPS),
              row-level security on the database, and role-based access controls. However, no system
              is completely secure. Users are responsible for keeping their credentials confidential.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">7. Data Retention</h2>
            <p>
              Account and operational data is retained for as long as it is needed for incident
              documentation and departmental record-keeping purposes, or as required by applicable law.
              Inactive accounts may be deactivated by administrators but records are preserved for
              audit and compliance purposes.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">8. Your Rights</h2>
            <p className="mb-2">
              You may request access to, correction of, or deletion of your personal information by
              contacting your system administrator. Note that certain operational records may be subject
              to retention requirements that limit our ability to delete them.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">9. Children's Privacy</h2>
            <p>
              Command OS is intended for use by adult emergency management professionals. We do not
              knowingly collect information from individuals under 18 years of age.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. The "Last updated" date at the top
              of this page reflects the most recent revision. Continued use of the App after changes
              are posted constitutes acceptance of the updated Policy.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[#E5E7EB] uppercase tracking-wide mb-3">11. Contact</h2>
            <p>
              For questions about this Privacy Policy or your data, contact your system administrator
              or reach Prepared Partners LLC through the contact information provided to your
              department.
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
