export default function TermsPage() {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="card p-8 rounded-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-card-foreground mb-2">Terms of Service</h1>
          <p className="text-muted-foreground">Last Updated: October 19, 2025</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-card-foreground mb-4">1. Nature of the Service</h2>
            <p className="text-muted-foreground mb-4">
              This web application (&quot;the Service&quot;) is a personal, non-commercial project created by an individual developer for learning, experimentation, and demonstration purposes only. It is not a commercial product and is not intended for production or critical use.
            </p>
            <p className="text-muted-foreground">
              The Service may contain bugs, security flaws, or interruptions, and may be modified or discontinued at any time without notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-card-foreground mb-4">2. Acceptance of Terms</h2>
            <p className="text-muted-foreground">
              By accessing or using the Service, you acknowledge that you understand its experimental nature and agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-card-foreground mb-4">3. Use of the Service</h2>
            <p className="text-muted-foreground">
              You are solely responsible for your use of the Service, including any files, data, or information you send or receive. You must not use the Service for any illegal, harmful, or unauthorized purpose.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-card-foreground mb-4">4. No Warranty</h2>
            <p className="text-muted-foreground">
              The Service is provided &quot;as is&quot; and &quot;as available&quot;, without any warranties of any kind, express or implied. The developer makes no representations or guarantees about functionality, security, or availability.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-card-foreground mb-4">5. Limitation of Liability</h2>
            <p className="text-muted-foreground mb-4">
              To the fullest extent permitted by law, the developer shall not be liable for any loss, damage, or consequence of any kind—direct, indirect, incidental, consequential, or otherwise—arising from or related to the use or inability to use the Service.
            </p>
            <p className="text-muted-foreground">
              Use of the Service is entirely at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-card-foreground mb-4">6. Data and Privacy</h2>
            <p className="text-muted-foreground">
              The Service facilitates peer-to-peer connections via WebRTC. The developer does not monitor, store, or access any transferred data. You are solely responsible for ensuring that all files you share comply with applicable laws and regulations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-card-foreground mb-4">7. Indemnification</h2>
            <p className="text-muted-foreground">
              You agree to indemnify and hold harmless the developer from any claims, damages, losses, or liabilities resulting from your use of the Service or your violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-card-foreground mb-4">8. Modifications</h2>
            <p className="text-muted-foreground">
              The developer may modify or discontinue the Service or these Terms at any time without notice. Continued use after changes constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-card-foreground mb-4">9. Governing Law</h2>
            <p className="text-muted-foreground">
              These Terms are governed by the laws applicable in the developer&apos;s jurisdiction, without regard to conflict of law principles.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
