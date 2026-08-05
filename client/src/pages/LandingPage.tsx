import Footer from '../components/Footer'
import Icon from '../components/Icon'
import TopNav from '../components/TopNav'
import { useAuth } from '../App'

const roleGuides = {
  participant: [
    ['Browse problems', 'Filter the library, open a statement, and keep the task visible while solving.'],
    ['Submit code', 'Use C, C++, Java, or Python through the unified Monaco editor submission flow.'],
    ['Contests', 'Join public contests, enter private ones when invited, and follow ICPC-style penalties.'],
    ['Author access', 'Want to create problems or contests? Request author access from your profile.'],
  ],
  author: [
    ['Browse problems', 'Filter the library, open a statement, and keep the task visible while solving.'],
    ['Submit code', 'Use C, C++, Java, or Python through the unified Monaco editor submission flow.'],
    ['Contests', 'Join public contests, enter private ones when invited, and follow ICPC-style penalties.'],
    ['Authoring', 'Create and edit your own problems, upload samples and hidden tests, and control visibility.'],
    ['Ownership', 'Public problems can be reused in contests, but editing stays with the creator or an admin.'],
  ],
  admin: [
    ['Browse problems', 'Filter the library, open a statement, and keep the task visible while solving.'],
    ['Submit code', 'Use C, C++, Java, or Python through the unified Monaco editor submission flow.'],
    ['Contests', 'Join public contests, enter private ones when invited, and follow ICPC-style penalties.'],
    ['Authoring', 'Create and edit your own problems, upload samples and hidden tests, and control visibility.'],
    ['Oversight', 'Review users, moderate bans, inspect submissions, and resolve contest integrity issues.'],
  ],
}

export default function LandingPage() {
  const { user } = useAuth()
  const role = user?.role || 'participant'
  const guides = roleGuides[role]

  return (
    <div className="min-h-screen bg-black text-on-surface">
      <TopNav />
      <main>
        <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden code-grid-bg border-b border-outline-variant">
          <div className="scanline absolute inset-0 pointer-events-none" />
          <div className="container mx-auto px-gutter relative z-10 grid lg:grid-cols-2 gap-12 items-center">
            <div className="max-w-2xl"> 
              <h1 className="font-headline-lg text-6xl md:text-7xl mb-6 tracking-tighter leading-[1.1] text-on-surface">
                The Self-Hosted <span className="text-primary">Competitive Programming</span> Judge.
              </h1>
              <p className="font-body-md text-xl md:text-2xl text-on-surface-variant mb-10 leading-relaxed max-w-xl">
                A precision-engineered platform for hosting contests, training teams, and mastering algorithms.
              </p>
              <a href="/problems" className="inline-flex bg-primary text-on-primary px-8 py-4 rounded-lg font-bold text-lg items-center gap-2 hover:scale-[1.02] transition-all">
                Browse Problems <Icon name="arrow_forward" />
              </a>
            </div>
            <div className="hidden lg:block relative">
              <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden shadow-2xl rotate-1">
                <div className="bg-surface-container-high px-4 py-2 border-b border-outline-variant flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-error-container" />
                    <div className="w-3 h-3 rounded-full bg-tertiary-container" />
                    <div className="w-3 h-3 rounded-full bg-secondary-container" />
                  </div>
                  <span className="font-data-label text-data-label text-on-surface-variant italic">solution.cpp</span>
                </div>
                <pre className="p-6 font-code-block text-code-block text-on-surface-variant bg-surface-container-lowest overflow-hidden"><code>{`#include <iostream>
#include <vector>

int main() {
    int n;
    std::cin >> n;
    std::cout << "AC" << std::endl;
    return 0;
}`}</code></pre>
                <div className="bg-surface-container px-6 py-4 border-t border-outline-variant flex justify-between items-center">
                  <div className="flex gap-4">
                    <Metric label="EXECUTION" value="12ms" />
                    <Metric label="MEMORY" value="4.2MB" />
                  </div>
                  <div className="font-code-block text-2xl font-bold text-secondary">AC</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 bg-[#0b0b0b] border-y border-outline-variant">
          <div className="container mx-auto px-gutter">
            <div className="text-center mb-16">
              <h2 className="font-headline-lg text-headline-lg text-on-surface mb-4">Precision Workflow</h2>
              <div className="w-24 h-1 bg-primary mx-auto mb-6" />
              <p className="font-body-md text-on-surface-variant max-w-2xl mx-auto">From exploration to mastery. Experience the industry standard in algorithmic validation.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              <Workflow icon="search" title="1. Browse" body="Explore self-hosted algorithmic challenges and find the next problem to solve." />
              <Workflow icon="terminal" title="2. Submit" body="Write or upload your solution in the editor, choose a language, and submit." />
              <Workflow icon="verified" title="3. Get Verdict" body="Receive queued, judging, and final verdict feedback from the judging pipeline." />
            </div>
          </div>
        </section>

        <section className="relative py-20 overflow-hidden code-grid-bg border-t border-outline-variant">
          <div className="scanline absolute inset-0 pointer-events-none" />
          <div className="container mx-auto px-gutter relative z-10">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-8">Guidelines</h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {guides.map(([title, body]) => (
                <div key={title} className="group p-8 rounded-xl bg-surface border border-outline-variant hover:border-primary/50 transition-all duration-300">
                  <h3 className="font-headline-md text-headline-md text-primary mb-3">{title}</h3>
                  <p className="text-on-surface-variant">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-data-label text-data-label text-outline mb-1">{label}</p>
      <p className="font-data-label text-primary font-bold">{value}</p>
    </div>
  )
}

function Workflow({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="group p-8 rounded-xl bg-gradient-to-br from-[#1b1b1b] to-[#090909] border border-outline-variant/80 hover:border-primary/50 hover:-translate-y-1 transition-all duration-300 shadow-2xl shadow-black/30">
      <div className="w-16 h-16 rounded-xl bg-surface-container-lowest border border-outline-variant flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
        <Icon name={icon} className="text-4xl text-primary" />
      </div>
      <h3 className="font-headline-md text-headline-md text-on-surface mb-4">{title}</h3>
      <p className="font-body-md text-on-surface-variant leading-relaxed">{body}</p>
    </div>
  )
}
