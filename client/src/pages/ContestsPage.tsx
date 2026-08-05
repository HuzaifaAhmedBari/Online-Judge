import Footer from '../components/Footer'
import TopNav from '../components/TopNav'

export default function ContestsPage() {
  return (
    <div className="min-h-screen bg-black text-on-surface">
      <TopNav />
      <main className="max-w-7xl mx-auto px-gutter py-8 min-h-screen">
        <section className="relative overflow-hidden rounded-lg bg-surface border border-outline-variant mb-8 p-6 md:p-10">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-surface-container-high text-on-surface-variant px-2 py-0.5 font-data-label text-data-label rounded-sm uppercase">Milestone 6</span>
            </div>
            <h1 className="font-headline-lg text-headline-lg mb-6">Contests</h1>
            <p className="text-on-surface-variant max-w-2xl">Contest listing and entry stay visible in navigation, but full contest behavior is scheduled for the next milestone.</p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
