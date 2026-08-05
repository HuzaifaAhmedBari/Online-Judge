export default function Footer() {
  return (
    <footer className="bg-surface border-t border-outline-variant">
      <div className="flex flex-col md:flex-row justify-between items-center w-full px-gutter py-density-high max-w-7xl mx-auto min-h-[80px]">
        <div className="flex items-center gap-4 mb-4 md:mb-0">
          <span className="font-headline-md text-headline-md text-primary font-bold">CodeJudge</span>
        </div>
        <div className="flex gap-8">
          <span className="font-data-label text-data-label text-secondary">Built by Huzaifa Bari.</span>
        </div>
      </div>
    </footer>
  )
}
